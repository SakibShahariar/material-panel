"""Regression tests for the pure-Python ICS parsing helpers.

Run from the repository root with:
    python3 -m unittest discover -s tests
"""
import contextlib
import importlib.util
import io
import sys
import unittest
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "calendar-sync-ics.py"
SPEC = importlib.util.spec_from_file_location("calendar_sync_ics", SCRIPT)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError(f"Could not load calendar sync script at {SCRIPT}")
calendar_sync_ics = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = calendar_sync_ics
SPEC.loader.exec_module(calendar_sync_ics)


class ParseIcsTimeTests(unittest.TestCase):
    def test_utc_timestamp_remains_utc(self):
        value, all_day = calendar_sync_ics.parse_ics_time("20261021T090000Z", "")
        self.assertFalse(all_day)
        self.assertEqual(value, datetime(2026, 10, 21, 9, tzinfo=timezone.utc))

    def test_date_only_value_is_a_date(self):
        value, all_day = calendar_sync_ics.parse_ics_time("20261021", "VALUE=DATE")
        self.assertTrue(all_day)
        self.assertEqual(value, date(2026, 10, 21))

    def test_tzid_is_preserved_and_date_time_is_not_misclassified(self):
        value, all_day = calendar_sync_ics.parse_ics_time(
            "20261021T090000", "VALUE=DATE-TIME;TZID=Asia/Dhaka"
        )
        self.assertFalse(all_day)
        self.assertEqual(value, datetime(2026, 10, 21, 9, tzinfo=ZoneInfo("Asia/Dhaka")))

    def test_quoted_tzid_is_supported(self):
        value, all_day = calendar_sync_ics.parse_ics_time(
            "20261021T090000", 'TZID="America/New_York"'
        )
        self.assertFalse(all_day)
        self.assertEqual(value, datetime(2026, 10, 21, 9, tzinfo=ZoneInfo("America/New_York")))

    def test_unknown_tzid_warns_and_keeps_floating_time(self):
        stderr = io.StringIO()
        with contextlib.redirect_stderr(stderr):
            value, all_day = calendar_sync_ics.parse_ics_time(
                "20261021T090000", "TZID=Not/AReal_Zone"
            )
        self.assertFalse(all_day)
        self.assertIsNone(value.tzinfo)
        self.assertIn("unknown TZID", stderr.getvalue())


class AllDayEventTests(unittest.TestCase):
    def test_multiday_event_is_indexed_on_each_date_and_end_is_exclusive(self):
        start = date.today() + timedelta(days=2)
        end_exclusive = start + timedelta(days=3)
        ics = (
            "BEGIN:VCALENDAR\n"
            "BEGIN:VEVENT\n"
            "UID:multi-day-regression\n"
            f"DTSTART;VALUE=DATE:{start:%Y%m%d}\n"
            f"DTEND;VALUE=DATE:{end_exclusive:%Y%m%d}\n"
            "SUMMARY:Three day event\n"
            "END:VEVENT\n"
            "END:VCALENDAR\n"
        )

        events = calendar_sync_ics.parse_events(ics)
        expected_dates = [
            (start + timedelta(days=offset)).isoformat()
            for offset in range(3)
        ]
        self.assertEqual([event["dateKey"] for event in events], expected_dates)
        self.assertTrue(all(event["allDay"] for event in events))
        self.assertEqual(len({event["id"] for event in events}), 3)
        self.assertNotIn(end_exclusive.isoformat(), [event["dateKey"] for event in events])

    def test_single_day_event_without_dtend_stays_single_day(self):
        start = date.today() + timedelta(days=2)
        ics = (
            "BEGIN:VCALENDAR\n"
            "BEGIN:VEVENT\n"
            "UID:single-day-regression\n"
            f"DTSTART;VALUE=DATE:{start:%Y%m%d}\n"
            "SUMMARY:Single day event\n"
            "END:VEVENT\n"
            "END:VCALENDAR\n"
        )
        events = calendar_sync_ics.parse_events(ics)
        self.assertEqual(len(events), 1)
        self.assertEqual(events[0]["dateKey"], start.isoformat())


if __name__ == "__main__":
    unittest.main()


class LoadUrlTests(unittest.TestCase):
    def test_environment_url_is_accepted(self):
        from unittest.mock import patch
        with patch.dict("os.environ", {"MATERIAL_PANEL_ICS_URL": "https://example.com/calendar.ics"}):
            self.assertEqual(
                calendar_sync_ics.load_url(),
                "https://example.com/calendar.ics",
            )

    def test_non_http_url_is_rejected(self):
        from unittest.mock import patch
        with patch.dict("os.environ", {"MATERIAL_PANEL_ICS_URL": "file:///tmp/calendar.ics"}):
            with self.assertRaises(SystemExit) as error:
                calendar_sync_ics.load_url()
        self.assertIn("expected an http(s) URL", str(error.exception))

    def test_empty_environment_url_is_rejected_without_config_file(self):
        from unittest.mock import patch
        with patch.dict("os.environ", {"MATERIAL_PANEL_ICS_URL": ""}), \
             patch.object(calendar_sync_ics, "URL_FILE", Path("/nonexistent/material-panel-test-url")):
            with self.assertRaises(SystemExit) as error:
                calendar_sync_ics.load_url()
        self.assertIn("No ICS URL configured", str(error.exception))
