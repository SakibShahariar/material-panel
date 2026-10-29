import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';

const source = await readFile(new URL('../modules/clock.js', import.meta.url), 'utf8');

test('calendar month navigation buttons expose descriptive accessible names', () => {
    assert.ok(source.includes("setChipA11y(prevBtn, 'Previous month')"));
    assert.ok(source.includes("setChipA11y(nextBtn, 'Next month')"));
});
