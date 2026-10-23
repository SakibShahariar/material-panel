import assert from 'node:assert/strict';
import test from 'node:test';
import {buildCalendarCells, getCalendarWeekStart, getCalendarWeekdayLabels} from '../lib/calendarGrid.js';

test('calendar grid starts in the configured locale weekday', () => {
    // January 2023 began on Sunday.
    assert.deepEqual(buildCalendarCells(2023, 1, 31, 7).slice(0, 7), [1, 2, 3, 4, 5, 6, 7]);
    assert.deepEqual(buildCalendarCells(2023, 1, 31, 1).slice(0, 7), [null, null, null, null, null, null, 1]);
});

test('calendar grid is padded to complete weeks and preserves every date', () => {
    const cells = buildCalendarCells(2024, 2, 29, 1);
    assert.equal(cells.length % 7, 0);
    assert.deepEqual(cells.filter(Number.isInteger), Array.from({length: 29}, (_, i) => i + 1));
});

test('weekday labels are localized and rotate to the selected first day', () => {
    const monday = getCalendarWeekdayLabels('en-GB', 1);
    const sunday = getCalendarWeekdayLabels('en-US', 7);
    assert.equal(monday.length, 7);
    assert.equal(sunday.length, 7);
    assert.equal(monday[0], 'Mon');
    assert.equal(sunday[0], 'Sun');
});

test('week start follows locale data where the runtime supports it', () => {
    const us = getCalendarWeekStart('en-US');
    const gb = getCalendarWeekStart('en-GB');
    assert.ok(us >= 1 && us <= 7);
    assert.ok(gb >= 1 && gb <= 7);
});
