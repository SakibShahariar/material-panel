import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';

const source = await readFile(new URL('../modules/quicksettings.js', import.meta.url), 'utf8');
const start = source.indexOf('export function volumeSliderRow()');
const end = source.indexOf('// Read the backlight device', start);
assert.ok(start >= 0 && end > start, 'volume slider implementation should be present');
const volumeRow = source.slice(start, end);

test('volume slider destroy cleanup never references brightness-only state', () => {
    assert.doesNotMatch(volumeRow, /brightnessWriteId|pendingBrightnessPct/);
});

test('volume slider disconnects its own Gvc signals on destroy', () => {
    for (const id of ['sinkVolumeId', 'sinkMuteId', 'controlStateId', 'controlDefaultSinkId'])
        assert.match(volumeRow, new RegExp('if \\(' + id + '\\)[\\s\\S]*?disconnect\\(' + id + '\\)'));
    assert.match(volumeRow, /row\.connect\('destroy', \(\) => row\._materialPanelDestroy\?\.\(\)\)/);
});
