# MailPulse — Cutover Runbook (Celery/Redis → durable Postgres queue)

This migrates sending from the fragile Celery + Redis pipeline to the new
zero-loss, crash-proof Postgres worker **without losing your in-flight 33k
campaign**. Do the steps in order. Every destructive step has a dry-run first.

> You need: SSH access to the Azure **B1s VM**, and the same `.env`
> (DATABASE_URL, ENCRYPTION_KEY, ANTHROPIC/OPENAI keys, SMTP_* etc.) the app
> already uses. **ENCRYPTION_KEY must be identical** to the one used when sender
> passwords were saved, or decryption fails.

---

## 0. Back up first (30 seconds, saves you from everything)

Take a Neon branch/snapshot (Neon dashboard → Branches → create branch) **or**:

```bash
pg_dump "$DATABASE_URL" > mailpulse_backup_$(date +%F).sql
```

---

## 1. Pull the new code onto the VM

```bash
cd ~/Smart-Email-Dashboard/Backend      # your path may differ
git pull
source venv/bin/activate
pip install -r requirements.txt          # no new deps, but safe to run
```

New files added: `worker.py`, `migrate.py`, `backfill_campaign.py`,
`app/services/warmup.py`. Changed: `app/models/database.py`,
`app/api/campaigns.py`, `app/api/senders.py`, `celery_tasks/tasks.py` (bug fixes).

---

## 2. Run the migration (creates send_queue, adds warmup column)

```bash
python migrate.py --dry-run     # shows exactly what it will do, writes nothing
python migrate.py               # apply
```

This creates the `send_queue` table, adds `sender_accounts.created_at`, and
**backdates your 13 existing senders 60 days** so warmup does NOT throttle them
back to 30/day. (Only brand-new accounts you add later start at 30/day.)

---

## 3. STOP the old Celery pipeline (this is the safety-critical ordering)

Stop the Celery worker and beat on the VM so the old Redis queue stops sending.
It's fine that this "abandons" the delayed Redis task — the next step rebuilds
the remaining list from Postgres, which is now the source of truth.

```bash
# however you run them today, e.g.:
sudo systemctl stop mailpulse-celery       # or: pkill -f 'celery'
sudo systemctl stop mailpulse-celerybeat
```

Sending pauses here. That's expected and safe — you have no hard deadline.

---

## 4. Rescue the live campaign into the durable queue

Find the campaign and its group:

```bash
python backfill_campaign.py --discover
```

Note the live campaign's `id`, and the `id` of the group it was sent to. Then
preview (writes nothing):

```bash
python backfill_campaign.py --campaign <CAMPAIGN_ID> --group <GROUP_ID> --dry-run
```

Sanity-check the numbers it prints:
`Target total` ≈ 33k, `Already sent` ≈ how many went out so far, and
`TO ENQUEUE` ≈ the remainder. When it looks right, run for real:

```bash
python backfill_campaign.py --campaign <CAMPAIGN_ID> --group <GROUP_ID>
```

Anyone who already received the email (has a SendLog) is skipped — **no
duplicates**. Everyone still owed the email is now safely in Postgres — **no loss**.

---

## 5. Start the new worker (as a service, so it self-heals)

Create `/etc/systemd/system/mailpulse-worker.service`:

```ini
[Unit]
Description=MailPulse send worker
After=network-online.target

[Service]
Type=simple
User=azureuser
WorkingDirectory=/home/azureuser/Smart-Email-Dashboard/Backend
EnvironmentFile=/home/azureuser/Smart-Email-Dashboard/Backend/.env
ExecStart=/home/azureuser/Smart-Email-Dashboard/Backend/venv/bin/python worker.py
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

(Adjust `User` and paths to match your VM.) Then:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now mailpulse-worker
sudo systemctl status mailpulse-worker
journalctl -u mailpulse-worker -f          # watch it send
```

`Restart=always` means if it ever crashes, systemd brings it right back — and
because the queue is in Postgres, it resumes exactly where it left off.

---

## 6. Verify

- `journalctl -u mailpulse-worker -f` shows `Sent campaign=… -> …` lines.
- In the app (or via API) check `GET /api/campaigns/<id>/queue-status` — `sent`
  climbs, `pending` falls, `failed` stays 0.
- `GET /api/senders/status` shows each account's `sent_today` and
  `remaining_today` under warmup.

Expected throughput at first: ~13 senders × ~their warmed limit per day. Overflow
just waits as `pending` and resumes automatically after each account's 24h reset.

---

## 7. Decommission Redis/Celery (once you're happy — a day or two later)

The API no longer enqueues to Celery, so nothing new uses Redis. When confident:

- Disable the Celery services permanently:
  `sudo systemctl disable mailpulse-celery mailpulse-celerybeat`
- Remove the Upstash/Redis add-on (frees you from the 10k-commands/day limit).
- Optionally drop `celery`, `redis`, `kombu`, `amqp`, `billiard`, `vine` from
  `requirements.txt`.

You're now on 2 moving parts (FastAPI web + worker) + Neon. Simpler, cheaper,
and durable.

---

## Rollback

If anything looks wrong before step 7, you can fall back to Celery: stop the
worker (`sudo systemctl stop mailpulse-worker`), revert `app/api/campaigns.py`
to the previous commit, and restart Celery. The `send_queue` rows are harmless
if unused. Because you backed up in step 0, you can also restore Neon.

---

## Free-tier notes

- **Neon compute hours:** the worker sleeps `WORKER_IDLE_SLEEP` (default 300s)
  when there's nothing to send, letting Neon autosuspend so you stay in budget.
  Raise it if you want to be even more frugal.
- **Gmail:** stay under ~500/day/account. Warmup keeps new accounts at 30/day
  and ramps up over ~6 weeks. Make sure SPF/DKIM/DMARC are set on your sending
  domain for inbox placement.
- **Neon connection drops:** already handled in `database.py`
  (`pool_pre_ping`, `pool_recycle=300`).
