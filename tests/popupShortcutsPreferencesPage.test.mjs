import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';

const page = await readFile(new URL('../prefs/popupShortcutsPage.js', import.meta.url), 'utf8');
const prefs = await readFile(new URL('../prefs.js', import.meta.url), 'utf8');

test('popup shortcut preferences are isolated in a focused page builder', () => {
    assert.match(page, /export function buildPopupShortcutsPage/);
    assert.match(page, /Gtk\.accelerator_parse/);
    assert.match(page, /Gtk\.accelerator_valid/);
    assert.match(page, /findPopupShortcutConflicts\(next\)/);
    assert.match(page, /Reset popup shortcuts/);
    assert.match(page, /DEFAULT_POPUP_SHORTCUTS/);
    assert.match(page, /from '..\/lib\/popupShortcuts\.js'/);
});

test('external config edits refresh popup shortcut accelerator rows without saving them back', () => {
    assert.match(page, /const refresh = \(\) =>/);
    assert.match(page, /setSyncingExternal\(true\)/);
    assert.match(page, /row\.set_text\(config\.popupShortcuts\[target\.id\] \|\| ''\)/);
    assert.match(prefs, /refreshPopupShortcutsPage\(\)/);
    assert.match(prefs, /buildPopupShortcutsPage\(/);
});
