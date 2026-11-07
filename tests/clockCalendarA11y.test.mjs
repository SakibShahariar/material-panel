import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';

const source = await readFile(new URL('../modules/clock.js', import.meta.url), 'utf8');

test('calendar month navigation buttons expose descriptive accessible names', () => {
    assert.ok(source.includes("setChipA11y(prevBtn, 'Previous month')"));
    assert.ok(source.includes("setChipA11y(nextBtn, 'Next month')"));
});

test('calendar day buttons expose full dates and relevant states', () => {
    assert.ok(source.includes("date?.format('%A, %B %-d, %Y')"));
    assert.ok(source.includes("setChipA11y(cell, [dateLabel, ...state].join(', '))"));
    assert.ok(source.includes("eventCount ? `${eventCount} events` : null"));
});

test('calendar agenda event buttons expose event details and link action', () => {
    assert.ok(source.includes('setChipA11y(row, ['));
    assert.ok(source.includes("url ? 'Open event link' : null"));
});
