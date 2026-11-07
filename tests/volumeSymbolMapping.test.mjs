import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';

const source = await readFile(new URL('../lib/materialSymbol.js', import.meta.url), 'utf8');

test('low volume uses a low-volume glyph while muted volume remains distinct', () => {
    assert.match(source, /'volume-low': 'volume_down'/);
    assert.match(source, /'volume-muted': 'volume_off'/);
    assert.doesNotMatch(source, /'volume-low': 'volume_mute'/);
});
