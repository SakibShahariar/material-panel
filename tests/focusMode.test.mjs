import assert from 'node:assert/strict';
import test from 'node:test';
import {
    getEffectiveHiddenModules,
    normalizeFocusModeModules,
} from '../lib/focusMode.js';

test('Focus Mode selection starts empty and normalizes only known unique module IDs', () => {
    assert.deepEqual(normalizeFocusModeModules(undefined, ['clock', 'weather']), []);
    assert.deepEqual(
        normalizeFocusModeModules(['clock', 'unknown', 'clock', 3, 'weather'], ['clock', 'weather']),
        ['clock', 'weather'],
    );
});

test('Focus Mode adds a temporary visibility layer without mutating normal settings', () => {
    const normal = ['battery'];
    const focus = ['clock', 'weather'];
    const hidden = getEffectiveHiddenModules(normal, true, focus);

    assert.deepEqual([...hidden], ['battery', 'clock', 'weather']);
    assert.deepEqual(normal, ['battery']);
    assert.deepEqual(focus, ['clock', 'weather']);
});

test('Focus Mode disabled restores normal visibility and empty selection hides nothing extra', () => {
    assert.deepEqual(
        [...getEffectiveHiddenModules(['battery'], false, ['clock'])],
        ['battery'],
    );
    assert.deepEqual(
        [...getEffectiveHiddenModules([], true, [])],
        [],
    );
});

test('malformed normal and Focus Mode settings fail closed to an empty hidden set', () => {
    assert.deepEqual([...getEffectiveHiddenModules(null, true, 'clock')], []);
});
