import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';

const source = await readFile(new URL('../modules/dnd.js', import.meta.url), 'utf8');

test('DND popup uses the shared title and focus-session status header', () => {
    assert.match(source, /import \{createPopupHeader\} from '\.\.\/lib\/popupHeader\.js';/);
    assert.match(source, /text: 'Do Not Disturb'/);
    assert.match(source, /createPopupHeader\(\{titleActor: headerTitle, statusActor: headerStatus\}\)/);
    assert.match(source, /headerStatus\.text = active \? 'Focus session active' : 'No active focus session'/);
    assert.match(source, /headerItem\.add_child\(header\.actor\)/);
});

test('DND focus duration and cancellation actions remain in the popup', () => {
    assert.match(source, /for \(const minutes of \[25, 50, 90\]\)/);
    assert.match(source, /Focus for \$\{minutes\} minutes/);
    assert.match(source, /End focus session/);
    assert.match(source, /cancelItem\.connect\('activate'/);
});
