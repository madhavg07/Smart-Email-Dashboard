"""
Live-campaign rescue / backfill
===============================
Safely moves an in-flight campaign (currently being driven by the old Celery +
Redis queue) into the new durable Postgres send_queue -- WITHOUT touching Redis
and WITHOUT re-sending anyone who already got the email.

How "remaining" is computed (no mail lost, no duplicates):
    target      = campaign owner's recipients, not suppressed, matching the
                  chosen group(s) (or ALL if you pass --all)
    already_done = recipients who already have a SendLog for this campaign
    already_q    = recipients already present in send_queue for this campaign
    TO ENQUEUE  = target - already_done - already_q

Typical use (always dry-run first!):

    # 1. See what campaigns/groups exist and their counts
    python backfill_campaign.py --discover

    # 2. Preview the rescue for your live campaign + its group (writes nothing)
    python backfill_campaign.py --campaign <CAMPAIGN_ID> --group <GROUP_ID> --dry-run

    # 3. Actually enqueue the remaining recipients
    python backfill_campaign.py --campaign <CAMPAIGN_ID> --group <GROUP_ID>

You can pass multiple --group flags, or --all to target every non-suppressed
recipient the campaign owner has.
"""

import sys
import argparse
from datetime import datetime

from app.models.database import (
    SessionLocal, Campaign, Recipient, SendLog, SendQueue, Group,
)


def discover(db):
    print("\n=== CAMPAIGNS ===")
    for c in db.query(Campaign).all():
        sent_logs = db.query(SendLog).filter(SendLog.campaign_id == c.id).count()
        q_total = db.query(SendQueue).filter(SendQueue.campaign_id == c.id).count()
        q_pending = db.query(SendQueue).filter(
            SendQueue.campaign_id == c.id, SendQueue.status == "pending"
        ).count()
        print(f"  id={c.id}")
        print(f"     name={c.name!r} status={c.status} owner={c.user_id}")
        print(f"     SendLogs={sent_logs}  send_queue(total={q_total}, pending={q_pending})")

    print("\n=== GROUPS ===")
    for g in db.query(Group).all():
        # A recipient is in a group if the group id is in its metadata_.group_ids
        members = 0
        for r in db.query(Recipient).filter(Recipient.user_id == g.user_id).all():
            meta = r.metadata_ or {}
            if g.id in (meta.get("group_ids") or []):
                members += 1
        print(f"  id={g.id}  name={g.name!r}  owner={g.user_id}  members={members}")
    print()


def target_recipients(db, campaign, group_ids, use_all):
    q = db.query(Recipient).filter(
        Recipient.user_id == campaign.user_id,
        Recipient.is_suppressed == False,  # noqa: E712
    )
    recipients = q.all()
    if use_all:
        return recipients
    selected = []
    for r in recipients:
        meta = r.metadata_ or {}
        r_groups = meta.get("group_ids") or []
        if any(gid in r_groups for gid in group_ids):
            selected.append(r)
    return selected


def rescue(db, campaign_id, group_ids, use_all, personalize, sender_name, dry_run):
    campaign = db.query(Campaign).filter(Campaign.id == campaign_id).first()
    if not campaign:
        print(f"ERROR: campaign {campaign_id} not found.")
        return

    targets = target_recipients(db, campaign, group_ids, use_all)
    target_ids = [r.id for r in targets]

    already_done = {
        r[0] for r in db.query(SendLog.recipient_id)
        .filter(SendLog.campaign_id == campaign_id).all()
    }
    already_q = {
        r[0] for r in db.query(SendQueue.recipient_id)
        .filter(SendQueue.campaign_id == campaign_id).all()
    }

    to_enqueue = [rid for rid in target_ids if rid not in already_done and rid not in already_q]

    print("\n--- RESCUE PLAN ---")
    print(f"Campaign        : {campaign.name!r}  ({campaign_id})")
    print(f"Audience        : {'ALL non-suppressed recipients' if use_all else 'groups ' + ','.join(group_ids)}")
    print(f"Target total    : {len(target_ids)}")
    print(f"Already sent     : {len(already_done)}  (have a SendLog -> will NOT re-send)")
    print(f"Already queued   : {len(already_q)}  (already in send_queue)")
    print(f"==> TO ENQUEUE   : {len(to_enqueue)}")

    if dry_run:
        print("\n[DRY-RUN] Nothing written. Re-run without --dry-run to enqueue.\n")
        return

    now = datetime.utcnow()
    rows = []
    for idx, rid in enumerate(to_enqueue):
        variant = "B" if (campaign.is_ab_test and idx % 2 != 0) else "A"
        rows.append(SendQueue(
            campaign_id=campaign_id,
            recipient_id=rid,
            user_id=campaign.user_id,
            status="pending",
            variant=variant,
            personalize=personalize,
            sender_name=sender_name,
            scheduled_for=now,
        ))
    if rows:
        db.bulk_save_objects(rows)
        campaign.status = "sending"
        db.commit()
    print(f"\nEnqueued {len(rows)} recipients into send_queue. The worker will resume sending them.\n")


def main():
    parser = argparse.ArgumentParser(description="Rescue an in-flight campaign into the durable send_queue.")
    parser.add_argument("--discover", action="store_true", help="List campaigns and groups with counts, then exit.")
    parser.add_argument("--campaign", help="Campaign id to rescue.")
    parser.add_argument("--group", action="append", default=[], help="Group id to target (repeatable).")
    parser.add_argument("--all", action="store_true", help="Target ALL non-suppressed recipients of the owner.")
    parser.add_argument("--no-personalize", action="store_true", help="Disable AI personalization for these sends.")
    parser.add_argument("--sender-name", default=None, help="Friendly From name.")
    parser.add_argument("--dry-run", action="store_true", help="Show counts without writing.")
    args = parser.parse_args()

    db = SessionLocal()
    try:
        if args.discover:
            discover(db)
            return
        if not args.campaign:
            print("Nothing to do. Use --discover, or --campaign <id> with --group/--all.")
            return
        if not args.group and not args.all:
            print("ERROR: specify --group <id> (repeatable) or --all for the audience.")
            return
        rescue(
            db,
            campaign_id=args.campaign,
            group_ids=args.group,
            use_all=args.all,
            personalize=not args.no_personalize,
            sender_name=args.sender_name,
            dry_run=args.dry_run,
        )
    finally:
        db.close()


if __name__ == "__main__":
    main()
