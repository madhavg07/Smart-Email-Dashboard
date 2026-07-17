"""
Email verification service — decides whether an address is likely deliverable
WITHOUT sending a real email.

Upgraded with Heuristics, Multiple MX Fallback, and Retry Backoff.
"""

import os
import socket
import string
import random
import logging
import smtplib
import time
from concurrent.futures import ThreadPoolExecutor, as_completed

import dns.resolver
from email_validator import validate_email, EmailNotValidError

logger = logging.getLogger(__name__)

PROBE_FROM = os.getenv("VERIFY_FROM_EMAIL", os.getenv("FROM_EMAIL", "verify@example.com"))
SMTP_TIMEOUT = int(os.getenv("VERIFY_SMTP_TIMEOUT", "10"))
DNS_TIMEOUT = float(os.getenv("VERIFY_DNS_TIMEOUT", "5"))
MAX_WORKERS = int(os.getenv("VERIFY_MAX_WORKERS", "20"))
SMTP_PROBE_ENABLED = os.getenv("VERIFY_SMTP_PROBE", "1") != "0"

# --- NEW: Heuristics Configuration ---
ROLE_ACCOUNTS = {
    "admin", "billing", "contact", "customerservice", "enquiries", "help", 
    "hello", "info", "marketing", "newsletter", "noreply", "press", 
    "privacy", "sales", "support", "team"
}

DISPOSABLE_DOMAINS = {
    "mailinator.com", "10minutemail.com", "guerrillamail.com", "tempmail.com", 
    "trashmail.com", "yopmail.com", "dispostable.com", "getnada.com"
}

_resolver = dns.resolver.Resolver()
_resolver.timeout = DNS_TIMEOUT
_resolver.lifetime = DNS_TIMEOUT

_mx_cache = {}        # domain -> [mx hosts] 
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

        # Catch-all detection
        if domain not in _catchall_cache:
            rcode, _ = server.rcpt(f"{_random_local()}@{domain}")
            _catchall_cache[domain] = rcode in (250, 251)
        catch_all = _catchall_cache[domain]

        if code in (250, 251):
            if catch_all:
                return "unknown", "domain is catch-all (accepts all mailboxes)"
            return "valid", "mailbox accepted"
        if code in (550, 551, 553, 554, 501, 521): # Added 521 for hard fail
            return "invalid", f"mailbox rejected ({code})"
        
        # Soft fails (4xx) - Signal to retry loop
        if 400 <= code < 500:
            return "soft_fail", f"server busy/greylisting ({code})"
            
        return "unknown", f"inconclusive SMTP code {code}"
        
    except (socket.timeout, smtplib.SMTPServerDisconnected, smtplib.SMTPConnectError, OSError) as e:
        return "network_error", f"probe unavailable ({type(e).__name__})"
    except Exception as e:
        return "unknown", f"probe error ({e})"
    finally:
        if server is not None:
            try:
                server.quit()
            except Exception:
                pass

def verify_email(email: str) -> dict:
    email = (email or "").strip().lower()
    
    # 1. Syntax Check
    if not email or not _syntax_ok(email):
        return {"email": email, "status": "invalid", "reason": "bad syntax"}

    local_part, domain = email.rsplit("@", 1)

    # 2. Heuristics Check (Instant Fail/Flag)
    if domain in DISPOSABLE_DOMAINS:
        return {"email": email, "status": "invalid", "reason": "disposable domain blocked"}
    if local_part in ROLE_ACCOUNTS:
        return {"email": email, "status": "risky", "reason": "role-based account"}

    # 3. DNS Check
    mx_list = _get_mx(domain)
    if not mx_list:
        return {"email": email, "status": "invalid", "reason": "no MX / domain can't receive mail"}

    if not SMTP_PROBE_ENABLED:
        return {"email": email, "status": "unknown", "reason": "SMTP probe disabled; passed syntax+MX"}

    # 4. SMTP Probe with Retries & MX Fallback
    max_retries = 3
    backoff_base = 0.5
    
    # Try the top 2 MX servers
    for mx in mx_list[:2]:
        for attempt in range(1, max_retries + 1):
            status, reason = _smtp_probe(mx, domain, email)
            
            # If successful or definitely invalid, stop immediately
            if status in ["valid", "invalid", "unknown", "risky"]:
                return {"email": email, "status": status, "reason": reason}
            
            # If server is busy (greylisting), wait and retry
            if status == "soft_fail" and attempt < max_retries:
                delay = backoff_base * (2 ** (attempt - 1)) + random.uniform(0, backoff_base)
                time.sleep(delay)
                continue
                
            # If Port 25 is blocked, don't retry, just return unknown
            if status == "network_error":
                return {"email": email, "status": "unknown", "reason": reason}

    # If we exhaust all retries and servers without a hard answer
    return {"email": email, "status": "unknown", "reason": "exhausted retries on MX servers"}


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
