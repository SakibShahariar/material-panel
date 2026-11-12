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
        /fullscreen,/,
        /overview,/,
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
