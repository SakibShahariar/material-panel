import assert from 'node:assert/strict';
import test from 'node:test';
import {safeEventUrl} from '../lib/calendarEvents.js';

test('calendar event links accept valid HTTPS URLs', () => {
    assert.equal(safeEventUrl('https://meet.example.com/room?id=42'), 'https://meet.example.com/room?id=42');
    assert.equal(safeEventUrl(' https://example.com/event '), 'https://example.com/event');
});

test('calendar event links reject non-HTTPS and malformed URLs', () => {
    for (const value of ['http://example.com', 'javascript:alert(1)', 'file:///etc/passwd', 'data:text/html,hello', 'not a url', '', null, undefined])
        assert.equal(safeEventUrl(value), null);
});

test('calendar event links reject shell metacharacters before launch', () => {
    for (const value of ['https://example.com/;touch-pwned', 'https://example.com/$(id)', 'https://example.com/'+String.fromCharCode(96)+'id'+String.fromCharCode(96), 'https://example.com/a|b', "https://example.com/a'b", 'https://example.com/a\\\\b'])
        assert.equal(safeEventUrl(value), null);
});
