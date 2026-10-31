import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';

const source = await readFile(new URL('../lib/popupDismiss.js', import.meta.url), 'utf8');

test('Escape closes a popup and restores keyboard focus to its opener', () => {
    assert.ok(source.includes('if (key === Clutter.KEY_Escape'));
    assert.match(source, /_forceClose\(menu\);[\s\S]*?GLib\.idle_add\(GLib\.PRIORITY_DEFAULT_IDLE/);
    assert.match(source, /button\.get_stage\(\) === stage && button\.visible && button\.reactive/);
    assert.match(source, /button\.grab_key_focus\(\)/);
});

test('popup teardown cancels a pending focus-restoration callback', () => {
    assert.match(source, /if \(restoreFocusId\) \{[\s\S]*?GLib\.source_remove\(restoreFocusId\)/);
    assert.match(source, /const dispose = \(\) => \{[\s\S]*?restoreFocusId = 0;/);
});

test('popup arrow navigation cycles focusable controls without hijacking sliders or text entry', () => {
    assert.ok(source.includes('_collectFocusableActors(menu.actor)'));
    assert.ok(source.includes('key === Clutter.KEY_Up || key === Clutter.KEY_Down') && source.includes('key === Clutter.KEY_Left || key === Clutter.KEY_Right'));
    assert.ok(source.includes('_focusAdjacentPopupActor(menu, stage, direction)'));
    assert.ok(source.includes('role === Atk.Role.SLIDER'));
    assert.ok(source.includes('role === Atk.Role.TEXT_ENTRY'));
    assert.ok(source.includes('actors[next].grab_key_focus()'));
    assert.ok(source.includes('Enter/Space remain native St.Button activations'));
});
