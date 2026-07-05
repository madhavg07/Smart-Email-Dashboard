"""
Gmail warmup + sender selection
--------------------------------
Brand-new Gmail accounts must not blast at full volume or they get flagged/banned.
We ramp each account's *effective* daily limit up based on how old the account is,
starting at 30/day and climbing toward the account's ceiling (daily_limit, kept
under Gmail's ~500/day hard cap).

    effective_limit = min( warmup_schedule(account_age_days), sender.daily_limit )

Existing already-warmed accounts are backdated by the migration (created_at ~60
days ago) so they immediately get their full ceiling instead of being throttled
back down to 30.
"""

from datetime import datetime, timedelta
from sqlalchemy.orm import Session

# (min_age_in_days, emails_per_day). Conservative, Gmail-safe ramp.
WARMUP_SCHEDULE = [
    (0, 30),     # days 0-2:   brand new, go gentle
    (3, 50),     # days 3-6
    (7, 75),     # week 2
    (14, 100),   # week 3
    (21, 150),   # week 4
    (30, 250),   # month 2
    (45, 400),   # fully warmed (still under Gmail's 500 hard cap)
]

HARD_CAP = 450  # never exceed this regardless of ceiling, to stay safely under Gmail's 500


def warmup_allowance(age_days: int) -> int:
    """How many emails this account may send today based purely on its age."""
    allowance = WARMUP_SCHEDULE[0][1]
    for min_age, limit in WARMUP_SCHEDULE:
        if age_days >= min_age:
            allowance = limit
        else:
            break
    return allowance


def account_age_days(sender) -> int:
    created = getattr(sender, "created_at", None)
    if not created:
        # Unknown age -> treat as brand new (safest).
        return 0
    return max((datetime.utcnow() - created).days, 0)


def effective_daily_limit(sender) -> int:
    """The real cap for today = min(age-based warmup, account ceiling, hard cap)."""
    ceiling = sender.daily_limit if sender.daily_limit else HARD_CAP
    return min(warmup_allowance(account_age_days(sender)), ceiling, HARD_CAP)


def reset_daily_counters(db: Session, senders) -> None:
    """Reset sent_today for any account whose 24h window has rolled over."""
    cutoff = datetime.utcnow() - timedelta(days=1)
    changed = False
    for acc in senders:
        if acc.last_reset is None or acc.last_reset < cutoff:
            acc.sent_today = 0
            acc.last_reset = datetime.utcnow()
            changed = True
    if changed:
        db.commit()


def get_available_sender(db: Session, user_id, SenderAccount):
    """
    Warmup-aware version of the sender picker. Resets rolled-over counters, then
    returns the active account with the most remaining quota today (load-balanced),
    or None if every account has hit its effective limit (-> emails stay queued).
    """
    senders = db.query(SenderAccount).filter(
        SenderAccount.user_id == user_id,
        SenderAccount.is_active == True,  # noqa: E712
    ).all()

    reset_daily_counters(db, senders)

    best = None
    best_remaining = 0
    for acc in senders:
        remaining = effective_daily_limit(acc) - (acc.sent_today or 0)
        if remaining > 0 and remaining > best_remaining:
            best = acc
            best_remaining = remaining
    return best


def sender_status(db, user_id, SenderAccount) -> list:
    """Human-friendly snapshot of every sender's warmup + quota, for the dashboard."""
    senders = db.query(SenderAccount).filter(SenderAccount.user_id == user_id).all()
    out = []
    for acc in senders:
        eff = effective_daily_limit(acc)
        out.append({
            "id": acc.id,
            "email_address": acc.email_address,
            "is_active": acc.is_active,
            "age_days": account_age_days(acc),
            "effective_limit": eff,
            "sent_today": acc.sent_today or 0,
            "remaining_today": max(eff - (acc.sent_today or 0), 0),
            "ceiling": acc.daily_limit,
        })
    return out
