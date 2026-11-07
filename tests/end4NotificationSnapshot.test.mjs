import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';

const source = await readFile(new URL('../lib/end4QsExtras.js', import.meta.url), 'utf8');
const start = source.indexOf('export function buildEnd4NotiSection()');
const end = source.indexOf('\nexport function buildEnd4CalendarSection()', start);
const section = source.slice(start, end);

test('End-4 notification cards are not destroyed when the visible snapshot is unchanged', () => {
    assert.match(section, /const sameItems = \(items, previous\) =>/);
    assert.match(section, /item\.notification === old\.notification/);
    assert.match(section, /item\.title === old\.title && item\.body === old\.body/);
    assert.match(section, /iconFingerprint\(item\.gicon\) === old\.giconKey/);
    assert.match(section, /if \(!force && sameItems\(items, lastItems\)\)\s*return;/);
    assert.ok(section.indexOf('if (!force && sameItems(items, lastItems))') < section.indexOf('list.destroy_all_children()'));
});

test('End-4 notification refresh stops when unmapped or destroyed', () => {
    assert.match(section, /if \(refreshId \|\| !outer\.is_mapped\)/);
    assert.match(section, /if \(!outer\.is_mapped\)\s*\{\s*refreshId = 0;/);
    assert.match(section, /outer\.connect\('notify::mapped'/);
    assert.match(section, /outer\.connect\('destroy', stopRefresh\)/);
});
