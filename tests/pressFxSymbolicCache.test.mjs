import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';

const source = await readFile(new URL('../lib/pressFx.js', import.meta.url), 'utf8');

test('chip pointer updates reuse a cached symbolic icon list', () => {
    assert.ok(source.includes('state.symbolicIcons = collectSymbolicIcons(actor)'));
    assert.ok(source.includes('tintSymbolicIcons(state.symbolicIcons, color)'));
    assert.ok(source.includes('if (state.symbolicColor !== color)'));
    assert.ok(!source.includes('tintSymbolicTree(actor, state.pressed'));
});

test('symbolic icon tinting skips unchanged colors and destroyed actors', () => {
    assert.ok(source.includes('if (icon.actor_destroyed || icon._materialPanelDisposed)'));
    assert.ok(source.includes('if (icon._materialPanelTintColor === color)'));
    assert.ok(source.includes('icon._materialPanelTintColor = color'));
});

test('FileIcon state swaps remain in the existing GIcon path', () => {
    assert.ok(source.includes('const g = giconForKey(entry.key, useOnAccent, resting)'));
    assert.ok(source.includes('entry.icon.gicon = g'));
});
