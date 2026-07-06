# MailPulse — New Features Runbook

Covers three changes and exactly what you must do to deploy + test each.
**Nothing here was runnable in the assistant's sandbox (DB was unreachable, no
Linux env), so treat everything below as "review + test locally before you rely
on it."**

---

## 0. Dependencies & migrations (read first)

- **No new pip packages.** `dnspython` and `email-validator` (feature 2) are
  already in `requirements.txt`. If you deploy a fresh environment, just
  `pip install -r requirements.txt`.
- **One new DB table:** `campaign_content_revisions` (feature 1). It is created
  automatically by `Base.metadata.create_all(...)` on backend startup
  (`app/main.py`) — **no manual ALTER/migration needed.** It only needs Neon to
  be reachable when the backend boots. No existing tables are altered.
- Confirm it was created (after backend starts against a live Neon):
  ```sql
  SELECT to_regclass('public.campaign_content_revisions');  -- should not be NULL
  ```

---

## 1. Fix: campaign Report showed stale (days-old) data

**What changed**
- Backend `GET /api/campaigns/{id}/report` now sends `Cache-Control: no-store`.
- Frontend cache-busts the request (`?_t=<now>`), auto-refreshes every 15s while
  the report modal is open, and has a manual **↻ Refresh** button.

**Deploy:** redeploy backend + frontend. No DB or env changes.

**Test**
1. Open a campaign's **Report**. Note the opens/clicks.
2. Trigger a new open (open a tracked email, or hit a `.../pixel/<token>` URL for
   a `SendLog` of that campaign).
3. Click **↻ Refresh** (or wait 15s). Numbers should update — not stuck on the
   old snapshot.

---

## 2. Feature 1: automatic AI content rewrite for low-engagement campaigns

**Behavior:** ~2 days after a campaign starts sending, if the average recipient
engagement score (`seriousness_score`) across recipients actually sent is below
the threshold, the worker snapshots the old content, AI-rewrites the body
(without inventing any details not already in the email), and updates the live
campaign so the **rest of the queue sends the improved body**. Both versions show
in the campaign detail → **Content History**.

**Where it runs:** inside `worker.py`'s main loop (`auto_optimize_low_engagement_campaigns`).
**`worker.py` must be running** (it's your always-on sender).

**Env knobs (all optional; defaults shown):**
```
AUTO_OPT_DELAY_DAYS=2       # how long after sending before judging
AUTO_OPT_THRESHOLD=0.30     # avg engagement below this = rewrite
AUTO_OPT_MIN_SENT=20        # need at least this many sent for a signal
AUTO_OPT_CHECK_SECONDS=3600 # how often the worker scans
```

**Fast test (don't wait 2 days):** temporarily set, then restart the worker:
```
AUTO_OPT_DELAY_DAYS=0
AUTO_OPT_MIN_SENT=1
AUTO_OPT_THRESHOLD=1.0     # forces a rewrite on any sending campaign
AUTO_OPT_CHECK_SECONDS=30
```
Send a small campaign, watch the worker log for
`Auto-optimizing campaign <id> ...` then `content auto-optimized`. Open that
campaign's detail → **Content History** should list **Original** + **AI Rewrite**.
**Revert these env values afterward.**

**Notes/limits:** only the primary `body_html`/`subject` is rewritten (A/B variant
B is left as-is in v1). Idempotent: a campaign is optimized at most once (guarded
by the presence of an `auto_ai` revision).

---

## 3. Feature 2: deep email verification on CSV import

**Behavior:** when a CSV is imported, every address is checked *before* anyone is
added — syntax → domain MX → SMTP mailbox probe (catch-all aware). Only
**definitively invalid** addresses (bad syntax / no MX / hard 5xx reject) are
dropped. `valid` and `unknown` are kept (so real Gmail/Outlook users whose
servers refuse probing are never deleted).

**Where it runs:** inside the Celery task `process_bulk_import` (your CSV import
already used this task, so **the Celery worker must be running** — unchanged
requirement).

### ⚠️ Critical deployment caveat — outbound port 25
The SMTP mailbox probe needs **outbound port 25**, which **Render (and most cloud
hosts) BLOCK**. Where it's blocked, every probe times out → every address returns
`unknown` → nothing is dropped beyond syntax/MX, *and* a 33k import will crawl
through timeouts.

Two supported options:
- **On Render (port 25 blocked):** set `VERIFY_SMTP_PROBE=0`. This skips the probe
  and filters on **syntax + MX only** — fast, and still catches typos and
  dead/fake domains. (Recommended for the hosted deployment.)
- **True mailbox-level checks:** run the process that executes `process_bulk_import`
  on a machine with port 25 open (e.g. a VM), leave `VERIFY_SMTP_PROBE=1`.

**Env knobs (optional):**
```
VERIFY_SMTP_PROBE=1         # 0 = skip SMTP probe (syntax+MX only)
VERIFY_SMTP_TIMEOUT=10
VERIFY_DNS_TIMEOUT=5
VERIFY_MAX_WORKERS=20       # concurrency
VERIFY_FROM_EMAIL=...       # MAIL FROM used in the probe (defaults to FROM_EMAIL)
```

**Test**
1. Make a small CSV with: one real address, one bad syntax (`foo@@bar`), one fake
   domain (`x@nonexistent-abc123.zzz`).
2. Import it. Watch the Celery worker log:
   `Bulk import for user ...: added=1, dropped_invalid=2, total=3`.
3. Refresh the Recipients page — only the real one should be added.
4. (Only if port 25 is open) add a valid-domain-but-fake mailbox to confirm the
   SMTP-level drop.

**Scale note (33k):** with `VERIFY_SMTP_PROBE=1` on port-25-open infra this can be
slow and may approach Celery's `visibility_timeout` (3600s). For big lists prefer
`VERIFY_SMTP_PROBE=0`, or raise the timeout / split the file.

---

## Deploy order

1. Backend (new endpoint, model, worker logic, verifier). Ensure Neon reachable
   so the new table is created and the worker/Celery can connect.
2. Frontend (report refresh + Content History).
3. Set the env vars you want (especially `VERIFY_SMTP_PROBE=0` on Render).
4. Test each section above.
