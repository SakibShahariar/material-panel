import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';

test('media auto-hide is opt-in and normalized to a strict boolean', async () => {
    const config = await readFile(new URL('../lib/configStore.js', import.meta.url), 'utf8');
    assert.match(config, /autoHideMedia: false/);
    assert.match(config, /merged\.autoHideMedia = merged\.autoHideMedia === true/);
    assert.match(config, /autoHideBluetooth: false/);
    assert.match(config, /merged\.autoHideBluetooth = merged\.autoHideBluetooth === true/);
    assert.match(config, /autoHideNetworkSpeed: false/);
    assert.match(config, /merged\.autoHideNetworkSpeed = merged\.autoHideNetworkSpeed === true/);
});

test('Preferences exposes the inactive-player visibility option and syncs external changes', async () => {
    const [prefs, appearance] = await Promise.all([
        readFile(new URL('../prefs.js', import.meta.url), 'utf8'),
        readFile(new URL('../prefs/appearancePage.js', import.meta.url), 'utf8'),
    ]);
    const pageSource = prefs + appearance;
    assert.match(pageSource, /Hide Media when no player is active/);
    assert.match(pageSource, /config\.autoHideMedia = mediaVisibilitySwitch\.active/);
    assert.match(pageSource, /mediaVisibilitySwitch\.active = config\.autoHideMedia === true/);
    assert.match(pageSource, /Hide Bluetooth when no adapter is detected/);
    assert.match(pageSource, /config\.autoHideBluetooth = bluetoothVisibilitySwitch\.active/);
    assert.match(pageSource, /bluetoothVisibilitySwitch\.active = config\.autoHideBluetooth === true/);
    assert.match(pageSource, /Hide Network Speed while idle/);
    assert.match(pageSource, /config\.autoHideNetworkSpeed = networkSpeedVisibilitySwitch\.active/);
    assert.match(pageSource, /networkSpeedVisibilitySwitch\.active = config\.autoHideNetworkSpeed === true/);
});

test('media chip hides only when configured and reappears when an MPRIS player is available', async () => {
    const [extension, media] = await Promise.all([
        readFile(new URL('../extension.js', import.meta.url), 'utf8'),
        readFile(new URL('../modules/mediaPlayer.js', import.meta.url), 'utf8'),
    ]);
    assert.match(extension, /setMediaAutoHide\(this\._config\.autoHideMedia === true\)/);
    assert.match(extension, /setMediaAutoHide\(newConfig\.autoHideMedia === true\)/);
    assert.match(media, /const autoHideWhenInactive = isMediaAutoHideEnabled\(\)/);
    assert.match(media, /button\.visible = !autoHideWhenInactive/);
    assert.match(media, /button\.visible = true;\s*bindPlayer\(busName/);
    assert.match(media, /noMediaState\.setMessage\('No media player is active[\s\S]*?controls\.visible = false;\s*progressRow\.visible = false/);
    assert.match(media, /noMediaState\.setMessage\(''\);\s*controls\.visible = true;\s*progressRow\.visible = true/);
    assert.match(media, /button\.visible = !autoHideWhenInactive;\s*durationUs = 0/);
});


test('Bluetooth auto-hide applies only to the no-adapter state', async () => {
    const [extension, bluetooth] = await Promise.all([
        readFile(new URL('../extension.js', import.meta.url), 'utf8'),
        readFile(new URL('../modules/bluetooth.js', import.meta.url), 'utf8'),
    ]);
    assert.match(extension, /setBluetoothAutoHide\(this\._config\.autoHideBluetooth === true\)/);
    assert.match(extension, /setBluetoothAutoHide\(newConfig\.autoHideBluetooth === true\)/);
    assert.match(bluetooth, /const autoHideWhenUnavailable = isBluetoothAutoHideEnabled\(\)/);
    assert.match(bluetooth, /const setNoAdapterState = \(\) => \{\s*button\.visible = !autoHideWhenUnavailable/);
    assert.match(bluetooth, /const setPowered = powered => \{\s*currentlyPowered = powered;\s*showAdapterState\(''\);\s*button\.visible = true/);
    assert.match(bluetooth, /showAdapterState\('No Bluetooth adapter was detected/);
    assert.match(bluetooth, /showAdapterState\('The Bluetooth service \(BlueZ\) is not responding/);
    assert.match(bluetooth, /showAdapterState\('Bluetooth is blocked by the system/);
    assert.match(bluetooth, /const setBlockedState = \(\) => \{\s*isBlocked = true;\s*currentlyPowered = false;\s*button\.visible = true/);
    assert.match(bluetooth, /const setBluezUnavailableState = \(\) => \{\s*button\.visible = true/);
    const bindStart = bluetooth.indexOf('const bindAdapter = path => {');
    const discoverStart = bluetooth.indexOf('const discover = () => {', bindStart);
    const bindBlock = bluetooth.slice(bindStart, discoverStart);
    assert.equal((bindBlock.match(/setBluezUnavailableState\(\);/g) || []).length, 2);
    assert.doesNotMatch(bindBlock, /setNoAdapterState\(\)/);
    assert.match(bluetooth, /if \(!adapters\.length\) \{[\s\S]*?else setNoAdapterState\(\)/);
});


test('Network Speed auto-hide waits for idle and keeps sampling while the chip is hidden', async () => {
    const [extension, network] = await Promise.all([
        readFile(new URL('../extension.js', import.meta.url), 'utf8'),
        readFile(new URL('../modules/networkSpeed.js', import.meta.url), 'utf8'),
    ]);
    assert.match(extension, /setNetworkSpeedAutoHide\(this\._config\.autoHideNetworkSpeed === true\)/);
    assert.match(extension, /setNetworkSpeedAutoHide\(newConfig\.autoHideNetworkSpeed === true\)/);
    assert.match(network, /const autoHideWhenIdle = isNetworkSpeedAutoHideEnabled\(\)/);
    assert.match(network, /const IDLE_HIDE_AFTER_US = 30 \* 1000 \* 1000/);
    assert.match(network, /if \(!autoHideWhenIdle \|\| !sample\.iface \|\| down > 0 \|\| up > 0\)/);
    assert.match(network, /button\.visible = now - idleSince < IDLE_HIDE_AFTER_US/);
    assert.match(network, /!autoHideWhenIdle && !button\.mapped && !menu\.isOpen/);
});
