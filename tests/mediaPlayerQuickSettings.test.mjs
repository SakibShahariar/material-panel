import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';

test('Quick Settings media row keeps detailed-only controls separate from the full media popup', async () => {
    const source = await readFile(new URL('../modules/mediaPlayer.js', import.meta.url), 'utf8');
    const start = source.indexOf('export function buildMediaPlayerRow(');
    const end = source.indexOf('/** Panel chip + popup controls */', start);
    assert.ok(start >= 0 && end > start);
    const row = source.slice(start, end);

    for (const popupOnlyName of [
        'progressSlider', 'timeLabel', 'progressTimerId', 'menu.isOpen',
        'playerMenuItem',
    ]) {
        assert.ok(!row.includes(popupOnlyName), `unexpected popup-only reference: ${popupOnlyName}`);
    }
    assert.match(row, /watchPreferredPlayer\(\(name, players\) =>/);
    assert.match(row, /attach\(name\)/);
    assert.match(row, /row\.connect\('destroy'/);
    assert.match(row, /stopWatching\(\)/);
    assert.match(row, /const playerButton = detailed \?/);
    assert.match(row, /const visualizerEnabled = detailed && isMediaVisualizerEnabled\(\)/);
    assert.match(row, /updatePlayerChoices\(name, players\)/);
});

test('Quick Settings media row keeps player controls connected to the active MPRIS player', async () => {
    const source = await readFile(new URL('../modules/mediaPlayer.js', import.meta.url), 'utf8');
    const start = source.indexOf('export function buildMediaPlayerRow(');
    const end = source.indexOf('/** Panel chip + popup controls */', start);
    const row = source.slice(start, end);
    assert.match(row, /prevBtn\.connect\('clicked', \(\) => ctl\?\.previous\(\)\)/);
    assert.match(row, /playBtn\.connect\('clicked', \(\) => ctl\?\.playPause\(\)\)/);
    assert.match(row, /nextBtn\.connect\('clicked', \(\) => ctl\?\.next\(\)\)/);
    assert.match(row, /onGone: \(\) =>/);
});

test('the full media popup owns and populates the player switcher', async () => {
    const source = await readFile(new URL('../modules/mediaPlayer.js', import.meta.url), 'utf8');
    const start = source.indexOf('export function buildMedia(');
    const popup = source.slice(start);
    assert.match(popup, /PopupSubMenuMenuItem\('Player'/);
    assert.match(popup, /playerMenuItem\.actor\.visible = players\.length > 1/);
    assert.match(popup, /playerMenuItem\.menu\.addMenuItem\(choice\)/);
    assert.match(popup, /selectPreferredPlayer\?\.\(name\)/);
    assert.match(popup, /updatePlayerChoices\(name, players\)/);
});
