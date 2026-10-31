import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';

const source = await readFile(new URL('../lib/popupDismiss.js', import.meta.url), 'utf8');

test('Escape closes a popup and restores keyboard focus to its opener', () => {
    assert.match(source, /event\.get_key_symbol\(\) === Clutter\.KEY_Escape/);
    assert.match(source, /_forceClose\(menu\);[\s\S]*?GLib\.idle_add\(GLib\.PRIORITY_DEFAULT_IDLE/);
    assert.match(source, /button\.get_stage\(\) === stage && button\.visible && button\.reactive/);
    assert.match(source, /button\.grab_key_focus\(\)/);
});

test('popup teardown cancels a pending focus-restoration callback', () => {
    assert.match(source, /if \(restoreFocusId\) \{[\s\S]*?GLib\.source_remove\(restoreFocusId\)/);
    assert.match(source, /const dispose = \(\) => \{[\s\S]*?restoreFocusId = 0;/);
});
