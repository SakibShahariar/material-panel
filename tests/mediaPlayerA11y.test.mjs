import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';

const source = await readFile(new URL('../modules/mediaPlayer.js', import.meta.url), 'utf8');

test('both MPRIS control rows expose names and playback-aware Play/Pause labels', () => {
    assert.equal((source.match(/setChipA11y\(prevBtn, 'Previous track'\)/g) || []).length, 2);
    assert.equal((source.match(/setChipA11y\(nextBtn, 'Next track'\)/g) || []).length, 2);
    const statusLabel = "setChipA11y(playBtn, playing ? 'Play or pause, playing' : 'Play or pause, paused')";
    assert.equal(source.split(statusLabel).length - 1, 2);
});

test('Media chip accessibility state tracks title and playback changes', () => {
    assert.ok(source.includes('const updateMediaChipA11y = () =>'));
    assert.ok(source.includes("currentTrackTitle = title || 'Unknown track'"));
    assert.ok(source.includes("currentPlaybackState = playing ? 'playing' : 'paused'"));
    assert.ok(source.includes('Media: ${track}, ${currentPlaybackState}'));
    assert.ok(!source.includes("setChipA11y(button, 'Media')"));
});

test('MPRIS media popup exposes elapsed progress and seeking only for seekable tracks', () => {
    assert.match(source, /mpris:length/);
    assert.match(source, /mpris:trackid/);
    assert.match(source, /PopupSliderMenuItem/);
    assert.match(source, /'CanSeek'/);
    assert.match(source, /'Position'/);
    assert.match(source, /'SetPosition'/);
    assert.match(source, /'Seek'/);
    assert.match(source, /formatMediaTime/);
});

test('media position polling is limited to the open popup and cleaned up on destroy', () => {
    assert.match(source, /menu\.connect\('open-state-changed'/);
    assert.match(source, /GLib\.timeout_add_seconds\(GLib\.PRIORITY_DEFAULT, 1/);
    assert.match(source, /GLib\.source_remove\(progressTimerId\)/);
});


test('MPRIS player selection preserves a user choice and falls back when it exits', () => {
    assert.match(source, /let preferredName = null/);
    assert.match(source, /callback\(preferredName, candidates\)/);
    assert.match(source, /stop\.select = name =>/);
    assert.match(source, /preferredName = names\.has\(name\) \? name : null/);
});

test('media popup exposes a player switcher only when multiple players are active', () => {
    assert.match(source, /PopupSubMenuMenuItem\('Player'/);
    assert.match(source, /playerMenuItem\.actor\.visible = players\.length > 1/);
    assert.match(source, /playerMenuItem\.menu\.addMenuItem\(choice\)/);
    assert.match(source, /selectPreferredPlayer\?\.\(name\)/);
    assert.match(source, /Player: ' \+ playerDisplayName\(selectedName\)/);
});

test('unified media card combines artwork, track metadata, seek progress, and transport controls', () => {
    assert.match(source, /const art = new St\.Bin\([\s\S]*?material-panel-media-popup-art/);
    assert.match(source, /const pTitle = new St\.Label\([\s\S]*?material-panel-media-popup-title/);
    assert.match(source, /const pArtist = new St\.Label\([\s\S]*?material-panel-media-popup-artist/);
    assert.match(source, /const progressSlider = new PopupMenu\.PopupSliderMenuItem/);
    assert.match(source, /prevBtn\.connect\('clicked', \(\) => ctl\?\.previous\(\)\)/);
    assert.match(source, /playBtn\.connect\('clicked', \(\) => ctl\?\.playPause\(\)\)/);
    assert.match(source, /nextBtn\.connect\('clicked', \(\) => ctl\?\.next\(\)\)/);
    assert.match(source, /onMeta: \(\{title, artist, artUrl,[\s\S]*?setArtFromUrl\(art, artUrl\)/);
});
