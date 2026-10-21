import json
import tempfile
import unittest
import urllib.error
from pathlib import Path
from email.message import Message

from scripts.calendar_sync_http import fetch_conditional, save_validators


class FakeResponse:
    def __init__(self, body=b"BEGIN:VCALENDAR\nEND:VCALENDAR\n", headers=None):
        self._body = body
        self.headers = Message()
        for key, value in (headers or {}).items():
            self.headers[key] = value

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def read(self):
        return self._body


class ConditionalFetchTests(unittest.TestCase):
    def test_sends_saved_validators_and_updates_them(self):
        with tempfile.TemporaryDirectory() as directory:
            state = Path(directory) / "validators.json"
            save_validators(state, {"etag": '"abc"', "last_modified": "Wed, 21 Oct 2015 07:28:00 GMT"})
            captured = {}

            def opener(request, timeout):
                captured.update(request.header_items())
                self.assertEqual(timeout, 45)
                return FakeResponse(headers={"ETag": '"def"', "Last-Modified": "Thu, 22 Oct 2015 07:28:00 GMT"})

            body, validators = fetch_conditional("https://example.test/calendar.ics", state, opener)
            self.assertIn("If-none-match", captured)
            self.assertEqual(captured["If-none-match"], '"abc"')
            self.assertEqual(captured["If-modified-since"], "Wed, 21 Oct 2015 07:28:00 GMT")
            self.assertIn("BEGIN:VCALENDAR", body)
            self.assertEqual(validators["etag"], '"def"')

    def test_304_means_unchanged_without_replacing_cached_events(self):
        with tempfile.TemporaryDirectory() as directory:
            state = Path(directory) / "validators.json"
            save_validators(state, {"etag": '"abc"'})

            def opener(_request, **_kwargs):
                headers = Message()
                raise urllib.error.HTTPError("https://example.test/calendar.ics", 304, "Not Modified", headers, None)

            body, validators = fetch_conditional("https://example.test/calendar.ics", state, opener)
            self.assertIsNone(body)
            self.assertEqual(validators, {"etag": '"abc"'})

    def test_invalid_saved_state_is_ignored(self):
        with tempfile.TemporaryDirectory() as directory:
            state = Path(directory) / "validators.json"
            state.write_text("{broken", encoding="utf-8")
            captured = {}

            def opener(request, **_kwargs):
                captured.update(request.header_items())
                return FakeResponse()

            body, validators = fetch_conditional("https://example.test/calendar.ics", state, opener)
            self.assertIn("BEGIN:VCALENDAR", body)
            self.assertNotIn("If-none-match", captured)
            self.assertEqual(validators, {})


if __name__ == "__main__":
    unittest.main()
