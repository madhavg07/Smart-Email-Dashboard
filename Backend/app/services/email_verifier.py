"""
Email verification service — decides whether an address is likely deliverable
WITHOUT sending a real email.

Three layers, cheapest first:
  1. Syntax        -> email_validator (format / RFC checks)
  2. Domain MX     -> dnspython: does the domain actually have mail servers?
  3. SMTP mailbox  -> connect to the MX and RCPT TO:<address>, read the reply
                      code. Catch-all aware (also probes a random mailbox on the
                      same domain so we don't trust "accept-all" servers).

IMPORTANT (deployment reality): step 3 needs OUTBOUND PORT 25, which most cloud
hosts (Render, Heroku, many PaaS) BLOCK. Where port 25 is blocked the probe just
times out and the address comes back as 'unknown' (kept, never dropped) — so on
Render this effectively degrades to syntax + MX filtering. Run whatever process
imports the CSV on a machine with port 25 open (e.g. a VM) to get true
mailbox-level results.

Statuses returned:
  valid    -> deliverable (MX ok, mailbox accepted, non-catch-all)
  invalid  -> definitely undeliverable (bad syntax / no MX / hard 5xx reject)
  unknown  -> couldn't determine (port 25 blocked, greylisted, timeout, catch-all)

Only 'invalid' addresses should be dropped on import. 'unknown' is kept so we
never delete real Gmail/Outlook users whose servers refuse verification.
"""

import os
import socket
import string
import random
import logging
import smtplib
from concurrent.futures import ThreadPoolExecutor, as_completed

import dns.resolver
from email_validator import validate_email, EmailNotValidError

logger = logging.getLogger(__name__)

PROBE_FROM = os.getenv("VERIFY_FROM_EMAIL", os.getenv("FROM_EMAIL", "verify@example.com"))
SMTP_TIMEOUT = int(os.getenv("VERIFY_SMTP_TIMEOUT", "10"))
DNS_TIMEOUT = float(os.getenv("VERIFY_DNS_TIMEOUT", "5"))
MAX_WORKERS = int(os.getenv("VERIFY_MAX_WORKERS", "20"))
# Optional kill-switch: set VERIFY_SMTP_PROBE=0 to skip step 3 entirely
# (recommended on hosts where port 25 is blocked — saves the timeout wait).
SMTP_PROBE_ENABLED = os.getenv("VERIFY_SMTP_PROBE", "1") != "0"

_resolver = dns.resolver.Resolver()
_resolver.timeout = DNS_TIMEOUT
_resolver.lifetime = DNS_TIMEOUT

_mx_cache = {}        # domain -> [mx hosts]  (empty list = no mail server)
_catchall_cache = {}  # domain -> bool


def _syntax_ok(email: str) -> bool:
    try:
        validate_email(email, check_deliverability=False)
        return True
    except EmailNotValidError:
        return False


def _get_mx(domain: str):
    if domain in _mx_cache:
        return _mx_cache[domain]
    hosts = []
    try:
        answers = _resolver.resolve(domain, "MX")
        hosts = [str(r.exchange).rstrip(".") for r in sorted(answers, key=lambda a: a.preference)]
    except Exception:
        # Some domains receive mail on their A record with no explicit MX.
        try:
            _resolver.resolve(domain, "A")
            hosts = [domain]
        except Exception:
            hosts = []
    _mx_cache[domain] = hosts
    return hosts


def _random_local() -> str:
    return "".join(random.choices(string.ascii_lowercase + string.digits, k=16))


def _smtp_probe(mx_host: str, domain: str, email: str):
    """Return (status, reason). Detects and caches catch-all domains."""
    server = None
    try:
        server = smtplib.SMTP(timeout=SMTP_TIMEOUT)
        server.connect(mx_host, 25)
        server.helo()
        server.mail(PROBE_FROM)
        code, _ = server.rcpt(email)

        # Catch-all detection (once per domain): if a random mailbox is also
        # accepted, the server accepts everything and we can't trust a 250.
        if domain not in _catchall_cache:
            rcode, _ = server.rcpt(f"{_random_local()}@{domain}")
            _catchall_cache[domain] = rcode in (250, 251)
        catch_all = _catchall_cache[domain]

        if code in (250, 251):
            if catch_all:
                return "unknown", "domain is catch-all (accepts all mailboxes)"
            return "valid", "mailbox accepted"
        if code in (550, 551, 553, 554, 501):
            return "invalid", f"mailbox rejected ({code})"
        return "unknown", f"inconclusive SMTP code {code}"
    except (socket.timeout, smtplib.SMTPServerDisconnected, smtplib.SMTPConnectError, OSError) as e:
        # Overwhelmingly this is outbound port 25 being blocked by the host.
        return "unknown", f"probe unavailable ({type(e).__name__})"
    except Exception as e:
        return "unknown", f"probe error ({e})"
    finally:
        if server is not None:
            try:
                server.quit()
            except Exception:
                pass


def verify_email(email: str) -> dict:
    email = (email or "").strip()
    if not email or not _syntax_ok(email):
        return {"email": email, "status": "invalid", "reason": "bad syntax"}

    domain = email.rsplit("@", 1)[-1].lower()
    mx = _get_mx(domain)
    if not mx:
        return {"email": email, "status": "invalid", "reason": "no MX / domain can't receive mail"}

    if not SMTP_PROBE_ENABLED:
        return {"email": email, "status": "unknown", "reason": "SMTP probe disabled; passed syntax+MX"}

    status, reason = _smtp_probe(mx[0], domain, email)
    return {"email": email, "status": status, "reason": reason}


def verify_bulk(emails, max_workers: int = MAX_WORKERS) -> list:
    """Verify many addresses concurrently. De-dupes first. Returns result dicts."""
    unique = list(dict.fromkeys(e.strip() for e in emails if e and e.strip()))
    results = []
    if not unique:
        return results
    with ThreadPoolExecutor(max_workers=max_workers) as pool:
        futures = {pool.submit(verify_email, e): e for e in unique}
        for fut in as_completed(futures):
            try:
                results.append(fut.result())
            except Exception as e:
                results.append({"email": futures[fut], "status": "unknown", "reason": str(e)})
    return results
