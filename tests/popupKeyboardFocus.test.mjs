import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {getAdjacentFocusableIndex} from '../lib/popupFocus.js';

const [source, renderer, stylesheet] = await Promise.all([
    readFile(new URL('../lib/popupDismiss.js', import.meta.url), 'utf8'),
    readFile(new URL('../lib/themeRenderer.js', import.meta.url), 'utf8'),
    readFile(new URL('../stylesheet.css', import.meta.url), 'utf8'),
]);

test('popup focus navigation advances and wraps in both directions', () => {
    assert.equal(getAdjacentFocusableIndex(4, 0, 1), 1);
    assert.equal(getAdjacentFocusableIndex(4, 3, 1), 0);
    assert.equal(getAdjacentFocusableIndex(4, 0, -1), 3);
    assert.equal(getAdjacentFocusableIndex(4, 2, -1), 1);
});

test('popup focus navigation starts at the directional edge when focus is outside', () => {
    assert.equal(getAdjacentFocusableIndex(3, -1, 1), 0);
    assert.equal(getAdjacentFocusableIndex(3, -1, -1), 2);
    assert.equal(getAdjacentFocusableIndex(3, 9, 1), 0);
});

test('popup focus navigation safely defaults malformed directions to forward', () => {
    assert.equal(getAdjacentFocusableIndex(3, 1, Symbol('direction')), 2);
    assert.equal(getAdjacentFocusableIndex(3, 1, NaN), 2);
    assert.equal(getAdjacentFocusableIndex(3, 1, -Infinity), 2);
    assert.equal(getAdjacentFocusableIndex(3, 1, Infinity), 2);
    assert.equal(getAdjacentFocusableIndex(3, 1, -1), 0);
});

test('popup focus navigation safely handles an empty or invalid list size', () => {
    assert.equal(getAdjacentFocusableIndex(0, 0, 1), -1);
    assert.equal(getAdjacentFocusableIndex(-1, 0, 1), -1);
    assert.equal(getAdjacentFocusableIndex(1.5, 0, 1), -1);
});

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

test('popup arrow navigation skips insensitive and non-reactive controls', () => {
    assert.match(source, /canFocus && actor\.reactive !== false && actor\.sensitive !== false/);
});

test('popup arrow navigation cycles focusable controls without hijacking sliders or text entry', () => {
    assert.ok(source.includes('_collectFocusableActors(menu.actor)'));
    assert.ok(source.includes('getAdjacentFocusableIndex(actors.length, index, direction)'));
    assert.ok(source.includes('key === Clutter.KEY_Up || key === Clutter.KEY_Down') && source.includes('key === Clutter.KEY_Left || key === Clutter.KEY_Right'));
    assert.ok(source.includes('_focusAdjacentPopupActor(menu, stage, direction)'));
    assert.ok(source.includes('role === Atk.Role.SLIDER'));
    assert.ok(source.includes('role === Atk.Role.TEXT_ENTRY'));
    assert.ok(source.includes('actors[next].grab_key_focus()'));
});

test('shared popup keyboard handling is attached to the major module popups', async () => {
    const modules = [
        'powermenu', 'memory', 'networkSpeed', 'disk', 'gpu', 'battery',
        'network', 'clock', 'btConnected', 'cpu', 'weather', 'bluetooth',
        'mediaPlayer', 'notifications', 'quicksettingsEnd4', 'quicksettings',
    ];
    const sources = await Promise.all(modules.map(name =>
        readFile(new URL('../modules/' + name + '.js', import.meta.url), 'utf8')));
    assert.ok(sources.every(moduleSource => moduleSource.includes('attachPopupDismiss')));
});

test('focus traversal excludes unmapped and zero-allocation actors while preserving visual child order', () => {
    assert.match(source, /actor\.visible === false \|\| actor\.mapped === false/);
    assert.match(source, /get_allocation_box\?\.\(\)/);
    assert.match(source, /box\.x2 <= box\.x1 \|\| box\.y2 <= box\.y1/);
    assert.match(source, /actors\.push\(actor\)[\s\S]*?actor\.get_children/);
});

test('Return, keypad Enter, Space and keypad Space reach native activation handlers', () => {
    assert.match(source, /key === Clutter\\.KEY_Return \\|\\| key === Clutter\\.KEY_KP_Enter \\|\\|\\s*key === Clutter\\.KEY_space \\|\\| key === Clutter\\.KEY_KP_Space\\)\\s*return Clutter\\.EVENT_PROPAGATE/);
});;

test('keyboard focus has a visible theme-aware indicator and is scoped to Material Panel popups', () => {
    assert.match(source, /add_style_class_name\('material-panel-keyboard-nav'\)/);
    assert.match(source, /remove_style_class_name\('material-panel-keyboard-nav'\)/);
    assert.match(renderer, /\.material-panel-keyboard-nav :focus/);
    assert.match(stylesheet, /\.material-panel-keyboard-nav :focus/);
});
