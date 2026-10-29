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
