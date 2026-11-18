import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';

async function source(path) {
    return readFile(new URL(path, import.meta.url), 'utf8');
}

test('PanelBuilder reports whether network and DND changes alter module visibility', async () => {
    const builder = await source('../lib/panelBuilder.js');
    assert.match(builder, /setDoNotDisturbActive\(active\)[\s\S]*?const previous = this\._getContextVisibilityState\(\)[\s\S]*?return hasContextVisibilityChanged\([^;]*previous, this\._getContextVisibilityState\(\)\)/);
    assert.match(builder, /setNetworkOffline\(offline\)[\s\S]*?const previous = this\._getContextVisibilityState\(\)[\s\S]*?return hasContextVisibilityChanged\([^;]*previous, this\._getContextVisibilityState\(\)\)/);
});

test('battery visibility uses the system UPower power-source property and watches its changes', async () => {
    const [extension, battery] = await Promise.all([
        source('../extension.js'),
        source('../lib/batteryDevice.js'),
    ]);
    assert.match(extension, /getSystemOnBatteryState\(client, deviceState, UPowerGlib\.DeviceState\)/);
    assert.match(extension, /'notify::on-battery'/);
    assert.match(battery, /client\?\.get_on_battery/);
});

test('network and DND watchers schedule rebuilds only when visibility actually changes', async () => {
    const extension = await source('../extension.js');
    assert.match(extension, /const syncNetwork = \(\) => \{\s+if \(this\._builder\?\.setNetworkOffline\(!monitor\.network_available\)\)\s+refresh\(\);\s+\};/);
    assert.match(extension, /const syncDnd = \(\) => \{\s+const active = !this\._visibilityDndSettings\.get_boolean\('show-banners'\);\s+if \(this\._builder\?\.setDoNotDisturbActive\(active\)\)\s+refresh\(\);\s+\};/);
});

test('PanelBuilder compares complete desktop context before scheduling a visibility rebuild', async () => {
    const builder = await source('../lib/panelBuilder.js');
    assert.match(builder, /_getContextVisibilityState\(\)/);
    for (const pattern of [
        /fullscreen: this\._fullscreenActive,/,
        /overview: this\._overviewVisible,/,
        /dnd: this\._dndActive,/,
        /offline: this\._offline,/,
        /onBattery: this\._batteryContext\.onBattery,/,
        /batteryPercent: this\._batteryContext\.percentage,/,
    ])
        assert.match(builder, pattern);
    assert.match(builder, /setBatteryContext\(context\)[\s\S]*?return hasContextVisibilityChanged\(/);
    assert.match(builder, /setDoNotDisturbActive\(active\)[\s\S]*?previous, this\._getContextVisibilityState\(\)/);
    assert.match(builder, /setNetworkOffline\(offline\)[\s\S]*?previous, this\._getContextVisibilityState\(\)/);
});

test('fullscreen watcher reads Meta.Window state and rendering uses the tracked snapshot', async () => {
    const [builder, extension] = await Promise.all([
        source('../lib/panelBuilder.js'),
        source('../extension.js'),
    ]);
    assert.ok(builder.includes('const focusedWindowFullscreen = this._fullscreenActive;'));
    assert.ok(extension.includes('global.display.focus_window?.is_fullscreen?.() === true;'));
    assert.ok(extension.includes("window.connect('notify::fullscreen', syncFullscreen)"));
    assert.ok(!builder.includes('focus_window?.fullscreen'));
});

test('battery device signal handlers are disconnected on replacement and teardown', async () => {
    const extension = await source('../extension.js');
    const watcher = extension.match(/_watchContextVisibility\(\) \{([\s\S]*?)\n    \}\n\n    _unwatchContextVisibility/);
    const teardown = extension.match(/_unwatchContextVisibility\(\) \{([\s\S]*?)\n    \}\n/);
    assert.ok(watcher, 'context watcher should be present');
    assert.ok(teardown, 'context watcher teardown should be present');
    assert.match(watcher[1],
        /if \(device !== this\._visibilityBatteryDevice\) \{[\s\S]*?for \(const signalId of this\._visibilityBatteryDeviceSignalIds\) \{[\s\S]*?this\._visibilityBatteryDevice\.disconnect\(signalId\)/);
    assert.match(teardown[1],
        /for \(const signalId of this\._visibilityBatteryDeviceSignalIds \?\? \[\]\) \{[\s\S]*?this\._visibilityBatteryDevice\.disconnect\(signalId\)/);
    assert.ok(teardown[1].indexOf('disconnect(signalId)') <
        teardown[1].indexOf('this._visibilityBatteryDevice = null'));
});


test('Overview and focused-window watchers rebuild only when effective visibility changes', async () => {
    const [builder, extension] = await Promise.all([
        source('../lib/panelBuilder.js'),
        source('../extension.js'),
    ]);
    assert.ok(builder.includes('setFullscreenActive(active)'));
    assert.ok(builder.includes('setOverviewVisible(visible)'));
    assert.ok(builder.includes('hasContextVisibilityChanged(this._configRef?.moduleVisibilityRules'));
    assert.ok(extension.includes("Main.overview.connect(signal, syncOverview)"));
    assert.ok(extension.includes("window.connect('notify::fullscreen', syncFullscreen)"));
    assert.ok(extension.includes("global.display.connect('notify::focus-window', connectFocusedWindow)"));
    assert.ok(!extension.includes('Main.overview.connect(signal, refresh)'));
    assert.ok(!extension.includes('connectFocusedWindow();\n                refresh();'));
});


test('visibility watcher teardown resets tracked fullscreen and Overview state', async () => {
    const extension = await source('../extension.js');
    const start = extension.indexOf('_unwatchContextVisibility() {');
    const end = extension.indexOf('    _removePopupKeybindings', start);
    assert.ok(start >= 0 && end > start);
    const teardown = extension.slice(start, end);
    assert.ok(teardown.includes('setFullscreenActive(false)'));
    assert.ok(teardown.includes('setOverviewVisible(false)'));
});
