#!/usr/bin/env python3
"""
Sync Google Calendar (or any ICS feed) into material-panel events JSON.

No Omarchy required.

Setup (Google Calendar):
  1. calendar.google.com → Settings → your calendar → Integrate calendar
  2. Copy "Secret address in iCal format" (https://calendar.google.com/calendar/ical/…/basic.ics)
  3. Save URL:
       mkdir -p ~/.config/material-panel
       echo 'YOUR_ICS_URL' > ~/.config/material-panel/calendar-ics.url
  4. Run:
       python3 ~/.local/share/gnome-shell/extensions/material-panel@SakibShahariar/scripts/calendar-sync-ics.py
     or from the project:
       python3 scripts/calendar-sync-ics.py

  Optional systemd user timer (every 15 min) — see script --install-timer

Output:
  ~/.config/material-panel/calendar-events.json
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import ssl
import sys
import urllib.request
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

HOME = Path.home()
CFG = HOME / ".config" / "material-panel"
OUT = CFG / "calendar-events.json"
URL_FILE = CFG / "calendar-ics.url"
URL_ENV = "MATERIAL_PANEL_ICS_URL"


def load_url() -> str:
    env = os.environ.get(URL_ENV, "").strip()
    if env:
        return env
    if URL_FILE.is_file():
        return URL_FILE.read_text(encoding="utf-8").strip().splitlines()[0].strip()
    raise SystemExit(
        f"No ICS URL.\n"
        f"  echo 'https://calendar.google.com/calendar/ical/…/basic.ics' > {URL_FILE}\n"
        f"  or: export {URL_ENV}=…"
    )


def fetch(url: str) -> str:
    req = urllib.request.Request(
        url,
        headers={"User-Agent": "material-panel-calendar-sync/1.0"},
    )
    ctx = ssl.create_default_context()
    with urllib.request.urlopen(req, context=ctx, timeout=45) as resp:
        return resp.read().decode("utf-8", errors="replace")


def unfold(ics: str) -> str:
    # RFC 5545 line folding
    return re.sub(r"\r?\n[ \t]", "", ics.replace("\r\n", "\n"))


def parse_ics_time(value: str, params: str) -> tuple[datetime | date, bool]:
    """Return (datetime|date, all_day)."""
    value = value.strip()
    is_date = "VALUE=DATE" in params.upper() or (
        len(value) == 8 and value.isdigit()
    )
    if is_date:
        d = datetime.strptime(value[:8], "%Y%m%d").date()
        return d, True
    # 20260914T100000Z or 20260914T100000
    z = value.endswith("Z")
    raw = value[:-1] if z else value
    if "T" in raw:
        body, _, frac = raw.partition("T")
        raw = body + "T" + frac[:6]
    dt = datetime.strptime(raw[:15], "%Y%m%dT%H%M%S")
    if z:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt, False


def unescape(text: str) -> str:
    return (
        text.replace("\\n", "\n")
        .replace("\\,", ",")
        .replace("\\;", ";")
        .replace("\\\\", "\\")
    )


def parse_events(ics: str, horizon_days: int = 90) -> list[dict]:
    text = unfold(ics)
    blocks = re.split(r"\nBEGIN:VEVENT\n", text)
    events: list[dict] = []
    today = date.today()
    end_horizon = today + timedelta(days=horizon_days)
    start_horizon = today - timedelta(days=7)

    for block in blocks[1:]:
        if "END:VEVENT" not in block:
            continue
        body = block.split("END:VEVENT", 1)[0]
        fields: dict[str, tuple[str, str]] = {}
        for line in body.split("\n"):
            if not line or ":" not in line:
                continue
            left, right = line.split(":", 1)
            name, *param_parts = left.split(";")
            name = name.upper()
            params = ";".join(param_parts)
            fields[name] = (right, params)

        if "DTSTART" not in fields:
            continue
        summary = unescape(fields.get("SUMMARY", ("(no title)", ""))[0])
        location = unescape(fields.get("LOCATION", ("", ""))[0])
        uid = fields.get("UID", ("", ""))[0] or hashlib.sha1(
            (summary + fields["DTSTART"][0]).encode()
        ).hexdigest()[:16]
        url = fields.get("URL", ("", ""))[0]
        # Google sometimes puts hangout in DESCRIPTION
        desc = unescape(fields.get("DESCRIPTION", ("", ""))[0])
        meet = None
        for m in re.finditer(r"https://meet\.google\.com/[a-z0-9\-]+", desc, re.I):
            meet = m.group(0)
            break
        if not meet:
            for m in re.finditer(r"https://[^\s\\]+zoom\.us/[^\s\\]+", desc, re.I):
                meet = m.group(0)
                break

        try:
            start, all_day = parse_ics_time(*fields["DTSTART"])
        except Exception:
            continue
        end = None
        if "DTEND" in fields:
            try:
                end, _ = parse_ics_time(*fields["DTEND"])
            except Exception:
                end = None

        # Filter horizon by start date
        start_d = start if isinstance(start, date) and not isinstance(start, datetime) else start.date()
        if start_d < start_horizon or start_d > end_horizon:
            continue

        def iso(x):
            if isinstance(x, datetime):
                if x.tzinfo is None:
                    # treat as local — attach local offset roughly via isoformat
                    return x.isoformat()
                return x.isoformat()
            return f"{x.isoformat()}T00:00:00"

        date_key = start_d.isoformat()
        ev = {
            "id": uid,
            "calendarId": "ics",
            "calendarName": "ICS",
            "color": "#4285f4",
            "dateKey": date_key,
            "start": iso(start),
            "end": iso(end) if end else iso(start),
            "allDay": all_day,
            "title": summary,
            "location": location,
        }
        if url:
            ev["htmlLink"] = url
        if meet:
            ev["meetingUrl"] = meet
        events.append(ev)

    events.sort(key=lambda e: e["start"])
    return events


def write_json(events: list[dict], source: str) -> None:
    CFG.mkdir(parents=True, exist_ok=True)
    doc = {
        "version": 1,
        "syncedAt": datetime.now(timezone.utc).isoformat(),
        "source": source,
        "events": events,
    }
    tmp = OUT.with_suffix(".tmp")
    tmp.write_text(json.dumps(doc, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    tmp.replace(OUT)


def install_timer() -> None:
    unit_dir = HOME / ".config" / "systemd" / "user"
    unit_dir.mkdir(parents=True, exist_ok=True)
    script = Path(__file__).resolve()
    service = unit_dir / "material-panel-calendar-sync.service"
    timer = unit_dir / "material-panel-calendar-sync.timer"
    service.write_text(
        f"""[Unit]
Description=Sync ICS calendar into material-panel

[Service]
Type=oneshot
ExecStart={sys.executable} {script}
"""
    )
    timer.write_text(
        """[Unit]
Description=Run material-panel calendar ICS sync every 15 minutes

[Timer]
OnBootSec=2min
OnUnitActiveSec=15min
Persistent=true

[Install]
WantedBy=timers.target
"""
    )
    os.system("systemctl --user daemon-reload")
    os.system("systemctl --user enable --now material-panel-calendar-sync.timer")
    print("Timer installed: material-panel-calendar-sync.timer (every 15 min)")
    print("  systemctl --user status material-panel-calendar-sync.timer")


def main() -> None:
    ap = argparse.ArgumentParser(description="ICS → material-panel calendar-events.json")
    ap.add_argument("--url", help="ICS URL (else file/env)")
    ap.add_argument("--days", type=int, default=90, help="Days ahead to keep (default 90)")
    ap.add_argument("--install-timer", action="store_true", help="Install systemd user timer")
    args = ap.parse_args()

    if args.install_timer:
        install_timer()
        return

    url = (args.url or "").strip() or load_url()
    print(f"Fetching ICS…", file=sys.stderr)
    ics = fetch(url)
    events = parse_events(ics, horizon_days=args.days)
    write_json(events, source="ics")
    print(f"Wrote {len(events)} events → {OUT}")


if __name__ == "__main__":
    main()
