import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';

const source = await readFile(new URL('../modules/mediaPlayer.js', import.meta.url), 'utf8');

test('both MPRIS control rows expose names and playback-aware Play/Pause labels', () => {
    assert.equal((source.match(/setChipA11y\(prevBtn, 'Previous track'\)/g) || []).length, 2);
    assert.equal((source.match(/setChipA11y\(nextBtn, 'Next track'\)/g) || []).length, 2);
    assert.ok(source.includes("setChipA11y(playBtn, 'Play or pause, playing')"));
    assert.ok(source.includes("setChipA11y(playBtn, 'Play or pause, paused')"));
});

test('Media chip accessibility state tracks title and playback changes', () => {
    assert.ok(source.includes('const updateMediaChipA11y = () =>'));
    assert.ok(source.includes('currentTrackTitle = title || \'Unknown track\''));
    assert.ok(source.includes("currentPlaybackState = playing ? 'playing' : 'paused'"));
    assert.ok(source.includes('Media: ${track}, ${currentPlaybackState}'));
    assert.ok(!source.includes("setChipA11y(button, 'Media')"));
});
