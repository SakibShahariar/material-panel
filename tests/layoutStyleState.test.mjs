import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {clearLayoutStyle, getLayoutStyle, setLayoutStyle} from '../lib/layoutStyleState.js';

test('layout style defaults to the default layout and tracks configuration updates', () => {
    clearLayoutStyle();
    assert.equal(getLayoutStyle(), 'default');
    setLayoutStyle('end4');
    assert.equal(getLayoutStyle(), 'end4');
    setLayoutStyle('ryoku');
    assert.equal(getLayoutStyle(), 'ryoku');
});

test('layout style rejects malformed values and resets on extension teardown', () => {
    setLayoutStyle(null);
    assert.equal(getLayoutStyle(), 'default');
    setLayoutStyle('end4');
    clearLayoutStyle();
    assert.equal(getLayoutStyle(), 'default');
});


test('layout style normalization accepts supported modes and falls back safely', async () => {
    const {normalizeLayoutStyle} = await import('../lib/layoutPresets.js');
    assert.equal(normalizeLayoutStyle('default'), 'default');
    assert.equal(normalizeLayoutStyle('end4'), 'end4');
    assert.equal(normalizeLayoutStyle('ryoku'), 'ryoku');
    for (const invalid of [null, undefined, '', 'compact', 'END4', 1, {}, []])
        assert.equal(normalizeLayoutStyle(invalid), 'default');
});

test('ConfigStore normalizes layout style on load and both save paths', async () => {
    const source = await readFile(new URL('../lib/configStore.js', import.meta.url), 'utf8');
    assert.match(source, /merged\.layoutStyle = normalizeLayoutStyle\(merged\.layoutStyle\)/);
    assert.equal((source.match(/out\.layoutStyle = normalizeLayoutStyle\(out\.layoutStyle\)/g) || []).length, 2);
});
