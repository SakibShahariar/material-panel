import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';

test('Quick Settings media row does not reference controls owned by the full media popup', async () => {
    const source = await readFile(new URL('../modules/mediaPlayer.js', import.meta.url), 'utf8');
    const start = source.indexOf('export function buildMediaPlayerRow()');
    const end = source.indexOf('/** Panel chip + popup controls */', start);
    assert.ok(start >= 0 && end > start);
    const row = source.slice(start, end);

    for (const popupOnlyName of [
        'progressSlider', 'timeLabel', 'progressTimerId', 'menu.isOpen',
        'playerMenuItem', 'playerChoices', 'playerNamesSignature',
    ]) {
        assert.ok(!row.includes(popupOnlyName), `unexpected popup-only reference: ${popupOnlyName}`);
    }
    assert.match(row, /watchPreferredPlayer\(name =>/);
    assert.match(row, /attach\(name\)/);
    assert.match(row, /row\.connect\('destroy'/);
    assert.match(row, /stopWatching\(\)/);
});

test('Quick Settings media row keeps player controls connected to the active MPRIS player', async () => {
    const source = await readFile(new URL('../modules/mediaPlayer.js', import.meta.url), 'utf8');
    const start = source.indexOf('export function buildMediaPlayerRow()');
    const end = source.indexOf('/** Panel chip + popup controls */', start);
    const row = source.slice(start, end);
    assert.match(row, /prevBtn\.connect\('clicked', \(\) => ctl\?\.previous\(\)\)/);
    assert.match(row, /playBtn\.connect\('clicked', \(\) => ctl\?\.playPause\(\)\)/);
    assert.match(row, /nextBtn\.connect\('clicked', \(\) => ctl\?\.next\(\)\)/);
    assert.match(row, /onGone: \(\) =>/);
});
