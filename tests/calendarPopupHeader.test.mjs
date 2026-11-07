import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';

const source = await readFile(new URL('../modules/clock.js', import.meta.url), 'utf8');

test('calendar popup places its title and live source status in the shared header', () => {
    assert.match(source, /import \{createPopupHeader\} from '\.\.\/lib\/popupHeader\.js';/);
    assert.match(source, /text: 'Calendar'/);
    assert.match(source, /createPopupHeader\(\{titleActor: headerTitle, statusActor: hint\}\)/);
    assert.match(source, /headerItem\.add_child\(header\.actor\)/);
    assert.match(source, /menu\.addMenuItem\(headerItem\)/);
    assert.doesNotMatch(source, /body\.add_child\(hint\)/);
});

test('calendar source and sync-age information continue to update the header status', () => {
    assert.match(source, /hint\.text = \[syncAge, doc\.source\]/);
    assert.match(source, /Sync: scripts\/calendar-sync-ics\.py/);
    assert.match(source, /synced just now/);
});
