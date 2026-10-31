import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';

test('media auto-hide is opt-in and normalized to a strict boolean', async () => {
    const config = await readFile(new URL('../lib/configStore.js', import.meta.url), 'utf8');
    assert.match(config, /autoHideMedia: false/);
    assert.match(config, /merged\.autoHideMedia = merged\.autoHideMedia === true/);
    assert.match(config, /autoHideBluetooth: false/);
    assert.match(config, /merged\.autoHideBluetooth = merged\.autoHideBluetooth === true/);
});

test('Preferences exposes the inactive-player visibility option and syncs external changes', async () => {
    const prefs = await readFile(new URL('../prefs.js', import.meta.url), 'utf8');
    assert.match(prefs, /Hide Media when no player is active/);
    assert.match(prefs, /config\.autoHideMedia = mediaVisibilitySwitch\.active/);
    assert.match(prefs, /mediaVisibilitySwitch\.active = config\.autoHideMedia === true/);
    assert.match(prefs, /Hide Bluetooth when no adapter is detected/);
    assert.match(prefs, /config\.autoHideBluetooth = bluetoothVisibilitySwitch\.active/);
    assert.match(prefs, /bluetoothVisibilitySwitch\.active = config\.autoHideBluetooth === true/);
});

test('media chip hides only when configured and reappears when an MPRIS player is available', async () => {
    const [extension, media] = await Promise.all([
        readFile(new URL('../extension.js', import.meta.url), 'utf8'),
        readFile(new URL('../modules/mediaPlayer.js', import.meta.url), 'utf8'),
    ]);
    assert.match(extension, /globalThis\._materialPanelAutoHideMedia = this\._config\.autoHideMedia === true/);
    assert.match(extension, /globalThis\._materialPanelAutoHideMedia = newConfig\.autoHideMedia === true/);
    assert.match(media, /const autoHideWhenInactive = globalThis\._materialPanelAutoHideMedia === true/);
    assert.match(media, /button\.visible = !autoHideWhenInactive/);
    assert.match(media, /button\.visible = true;\s*bindPlayer\(busName/);
    assert.match(media, /button\.visible = !autoHideWhenInactive;\s*durationUs = 0/);
});


test('Bluetooth auto-hide applies only to the no-adapter state', async () => {
    const [extension, bluetooth] = await Promise.all([
        readFile(new URL('../extension.js', import.meta.url), 'utf8'),
        readFile(new URL('../modules/bluetooth.js', import.meta.url), 'utf8'),
    ]);
    assert.match(extension, /globalThis\._materialPanelAutoHideBluetooth = this\._config\.autoHideBluetooth === true/);
    assert.match(extension, /globalThis\._materialPanelAutoHideBluetooth = newConfig\.autoHideBluetooth === true/);
    assert.match(bluetooth, /const autoHideWhenUnavailable = globalThis\._materialPanelAutoHideBluetooth === true/);
    assert.match(bluetooth, /const setNoAdapterState = \(\) => \{\s*button\.visible = !autoHideWhenUnavailable/);
    assert.match(bluetooth, /const setPowered = powered => \{\s*currentlyPowered = powered;\s*button\.visible = true/);
    assert.match(bluetooth, /const setBlockedState = \(\) => \{\s*isBlocked = true;\s*currentlyPowered = false;\s*button\.visible = true/);
    assert.match(bluetooth, /const setBluezUnavailableState = \(\) => \{\s*button\.visible = true/);
    const bindStart = bluetooth.indexOf('const bindAdapter = path => {');
    const discoverStart = bluetooth.indexOf('const discover = () => {', bindStart);
    const bindBlock = bluetooth.slice(bindStart, discoverStart);
    assert.equal((bindBlock.match(/setBluezUnavailableState\(\);/g) || []).length, 2);
    assert.doesNotMatch(bindBlock, /setNoAdapterState\(\)/);
    assert.match(bluetooth, /if \(!adapters\.length\) \{[\s\S]*?else setNoAdapterState\(\)/);
});
