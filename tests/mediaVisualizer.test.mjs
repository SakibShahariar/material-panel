import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';

test('media visualizer is disabled by default and normalized as a boolean', async () => {
    const config = await readFile(new URL('../lib/configStore.js', import.meta.url), 'utf8');
    assert.match(config, /mediaVisualizer: false/);
    assert.match(config, /merged\.mediaVisualizer = merged\.mediaVisualizer === true/);
});

test('Preferences exposes the visualizer toggle and synchronizes external changes', async () => {
    const prefs = await readFile(new URL('../prefs.js', import.meta.url), 'utf8');
    assert.match(prefs, /Show playback visualizer/);
    assert.match(prefs, /config\.mediaVisualizer = mediaVisualizerSwitch\.active/);
    assert.match(prefs, /mediaVisualizerSwitch\.active = config\.mediaVisualizer === true/);
});

test('visualizer animation is opt-in, playback-aware, reduced-motion-aware, and cleaned up', async () => {
    const [extension, media] = await Promise.all([
        readFile(new URL('../extension.js', import.meta.url), 'utf8'),
        readFile(new URL('../modules/mediaPlayer.js', import.meta.url), 'utf8'),
    ]);
    assert.match(extension, /setMediaVisualizerEnabled\(this\._config\.mediaVisualizer\)/);
    assert.match(extension, /setMediaVisualizerEnabled\(newConfig\.mediaVisualizer\)/);
    assert.match(extension, /clearMediaVisualizerState\(\)/);
    assert.doesNotMatch(extension, /_materialPanelMediaVisualizer/);
    assert.match(media, /const visualizerEnabled = isMediaVisualizerEnabled\(\)/);
    assert.doesNotMatch(media, /_materialPanelMediaVisualizer/);
    assert.match(media, /if \(!visualizer \|\| !visualizerPlaying \|\| !button\.mapped\)/);
    assert.match(media, /if \(prefersReducedMotion\(\)\)/);
    assert.match(media, /GLib\.timeout_add\(GLib\.PRIORITY_DEFAULT, 180/);
    assert.match(media, /button\.connect\('notify::mapped'/);
    assert.match(media, /button\.connect\('destroy',[\s\S]*?stopVisualizer\(\)/);
});
