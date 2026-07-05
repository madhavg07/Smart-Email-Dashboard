"""
One-time, idempotent migration for the durable send-queue + warmup feature.

SQLAlchemy's Base.metadata.create_all() creates NEW tables (so it will create
send_queue on its own), but it does NOT ALTER existing tables. This script adds
the new SenderAccount.created_at column to the *existing* live table and backdates
current accounts so they keep their full sending limit instead of being throttled
back to the 30/day warmup floor.

Safe to run multiple times. Run a dry run first:

    python migrate.py --dry-run
    python migrate.py            # actually apply

It uses your existing DATABASE_URL from .env, exactly like the app does.
"""

import sys
from sqlalchemy import inspect, text
from app.models.database import engine, Base
import app.models.database as models  # noqa: F401  (ensures all models are registered)

DRY_RUN = "--dry-run" in sys.argv
# Backdate existing sender accounts this many days so warmup treats them as fully warmed.
BACKDATE_DAYS = 60


def log(msg):
    prefix = "[DRY-RUN] " if DRY_RUN else "[MIGRATE] "
    print(prefix + msg)


def main():
    insp = inspect(engine)
    existing_tables = set(insp.get_table_names())

    # 1) Create any missing tables (send_queue in particular).
    if "send_queue" in existing_tables:
        log("Table 'send_queue' already exists. Skipping create.")
    else:
        log("Will create table 'send_queue' (and any other missing tables).")
        if not DRY_RUN:
            Base.metadata.create_all(bind=engine)
            log("Created missing tables.")

    # 2) Add SenderAccount.created_at if it's missing.
    sender_cols = {c["name"] for c in insp.get_columns("sender_accounts")} if "sender_accounts" in existing_tables else set()

    if "created_at" in sender_cols:
        log("Column sender_accounts.created_at already exists. Skipping add.")
    else:
        log("Will add column sender_accounts.created_at (timestamp).")
        if not DRY_RUN:
            with engine.begin() as conn:
                conn.execute(text("ALTER TABLE sender_accounts ADD COLUMN created_at TIMESTAMP"))
            log("Added sender_accounts.created_at.")

    # 3) Backdate existing sender accounts so they are treated as already-warmed.
    #    Only touch rows where created_at is NULL (i.e. pre-existing accounts).
    if "sender_accounts" in existing_tables:
        with engine.connect() as conn:
            null_count = conn.execute(
                text("SELECT COUNT(*) FROM sender_accounts WHERE created_at IS NULL")
            ).scalar() or 0
        log(f"{null_count} existing sender account(s) have no created_at; will backdate them {BACKDATE_DAYS} days.")
        if not DRY_RUN and null_count:
            with engine.begin() as conn:
                conn.execute(text(
                    "UPDATE sender_accounts "
                    "SET created_at = NOW() - INTERVAL '%d days' "
                    "WHERE created_at IS NULL" % BACKDATE_DAYS
                ))
            log("Backdated existing sender accounts.")

    log("Done." + ("  (nothing was written)" if DRY_RUN else ""))


if __name__ == "__main__":
    main()
