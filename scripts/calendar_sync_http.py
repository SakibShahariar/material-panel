#!/usr/bin/env python3
"""Small, testable helpers for conditional HTTP fetching of ICS feeds."""
from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
from pathlib import Path


def fetch_conditional(url: str, state_path: Path, opener=urllib.request.urlopen) -> tuple[str | None, dict[str, str]]:
    """Return (ICS body, updated validators); body is None for HTTP 304."""
    headers = {"User-Agent": "material-panel-calendar-sync/1.0"}
    try:
        previous = json.loads(state_path.read_text(encoding="utf-8"))
    except (OSError, ValueError, TypeError):
        previous = {}
    if isinstance(previous, dict):
        if previous.get("etag"):
            headers["If-None-Match"] = str(previous["etag"])
        if previous.get("last_modified"):
            headers["If-Modified-Since"] = str(previous["last_modified"])

    request = urllib.request.Request(url, headers=headers)
    try:
        with opener(request, timeout=45) as response:
            body = response.read().decode("utf-8", errors="replace")
            updated = {
                key: str(value)
                for key, value in (
                    ("etag", response.headers.get("ETag")),
                    ("last_modified", response.headers.get("Last-Modified")),
                )
                if value
            }
            return body, updated
    except urllib.error.HTTPError as exc:
        if exc.code == 304:
            return None, {
                key: str(value)
                for key, value in (
                    ("etag", exc.headers.get("ETag")),
                    ("last_modified", exc.headers.get("Last-Modified")),
                )
                if value
            } or (previous if isinstance(previous, dict) else {})
        raise


def save_validators(state_path: Path, validators: dict[str, str]) -> None:
    """Persist only cache validators; keep permissions private and writes atomic."""
    state_path.parent.mkdir(parents=True, exist_ok=True)
    temporary = state_path.with_suffix(state_path.suffix + ".tmp")
    payload = json.dumps(validators, sort_keys=True) + "\n"
    fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    try:
        os.fchmod(fd, 0o600)
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            fd = -1
            handle.write(payload)
        temporary.replace(state_path)
    finally:
        if fd >= 0:
            os.close(fd)
        try:
            temporary.unlink(missing_ok=True)
        except OSError:
            pass
