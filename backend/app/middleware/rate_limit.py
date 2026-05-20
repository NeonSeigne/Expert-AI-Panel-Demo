from __future__ import annotations

import logging
import os
from collections import defaultdict
from datetime import date

from fastapi import Request

LOG = logging.getLogger(__name__)

ORG_NAME = os.getenv("HF_RATE_LIMIT_ORG", "neongeckocom")
DAILY_LIMIT = int(os.getenv("HF_RATE_LIMIT_DAILY", "20"))

_ip_counts: dict[str, dict] = defaultdict(lambda: {"date": "", "count": 0})


def _today() -> str:
    return date.today().isoformat()


def is_org_member(request: Request) -> bool:
    try:
        from huggingface_hub import parse_huggingface_oauth
        oauth_info = parse_huggingface_oauth(request)
        if oauth_info is None:
            return False
        orgs = oauth_info.user_info.orgs or []
        return any(o.preferred_username == ORG_NAME for o in orgs)
    except Exception:
        return False


def get_oauth_username(request: Request) -> str | None:
    try:
        from huggingface_hub import parse_huggingface_oauth
        oauth_info = parse_huggingface_oauth(request)
        if oauth_info is None:
            return None
        return oauth_info.user_info.preferred_username
    except Exception:
        return None


def get_client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def check_rate_limit(request: Request) -> tuple[bool, int]:
    """Returns (allowed, remaining). If org member, remaining is -1 (unlimited)."""
    if is_org_member(request):
        return True, -1

    ip = get_client_ip(request)
    today = _today()

    entry = _ip_counts[ip]
    if entry["date"] != today:
        entry["date"] = today
        entry["count"] = 0

    remaining = max(0, DAILY_LIMIT - entry["count"])
    if entry["count"] >= DAILY_LIMIT:
        return False, 0

    return True, remaining


def record_conversation(request: Request) -> None:
    """Increment the counter after a conversation is successfully started."""
    if is_org_member(request):
        return
    ip = get_client_ip(request)
    today = _today()
    entry = _ip_counts[ip]
    if entry["date"] != today:
        entry["date"] = today
        entry["count"] = 0
    entry["count"] += 1


def get_remaining(request: Request) -> int:
    """Get remaining conversations for a client. -1 means unlimited."""
    if is_org_member(request):
        return -1
    ip = get_client_ip(request)
    today = _today()
    entry = _ip_counts[ip]
    if entry["date"] != today:
        return DAILY_LIMIT
    return max(0, DAILY_LIMIT - entry["count"])
