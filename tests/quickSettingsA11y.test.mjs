import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';

const source = await readFile(new URL('../modules/quicksettings.js', import.meta.url), 'utf8');

test('Quick Settings toggle tiles announce their current on/off state', () => {
    assert.ok(source.includes("setChipA11y(tile, `${label}, ${on ? 'on' : 'off'}`)"));
    assert.ok(source.indexOf('setChipA11y(tile,') < source.indexOf('const sid = currentTileStyleId();'));
});
