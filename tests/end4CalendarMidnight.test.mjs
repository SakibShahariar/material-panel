import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';

const source = await readFile(new URL('../lib/end4QsExtras.js', import.meta.url), 'utf8');
const start = source.indexOf('export function buildEnd4CalendarSection()');
const end = source.indexOf('export ', start + 10);
const calendar = source.slice(start, end > start ? end : undefined);

test('End-4 calendar refreshes Today during every rebuild', () => {
    assert.match(calendar, /let todayKey = dateKeyToday\(\)/);
    assert.match(calendar, /const rebuild = \(\) => \{\s*const currentTodayKey = dateKeyToday\(\)/);
    assert.match(calendar, /if \(selectedKey === todayKey\)\s*selectedKey = currentTodayKey;\s*todayKey = currentTodayKey;/);
});


test('End-4 calendar schedules a mapped-only refresh at the next local midnight', () => {
    assert.match(calendar, /const scheduleMidnightRefresh = \(\) => \{/);
    assert.match(calendar, /const tomorrow = now\.add_days\(1\)/);
    assert.match(calendar, /GLib\.timeout_add_seconds\(/);
    assert.match(calendar, /if \(outer\.is_mapped\)\s*rebuild\(\)/);
    assert.match(calendar, /stopMidnightRefresh\(\);/);
    assert.match(calendar, /if \(outer\.is_mapped\) \{\s*refreshEvents\(\);\s*scheduleMidnightRefresh\(\);/);
});
