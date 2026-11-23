import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';

const source = await readFile(new URL('../modules/network.js', import.meta.url), 'utf8');

test('Wi-Fi toggle lives in the hero and uses NetworkManager without spawning nmcli', () => {
    const toggleStart = source.indexOf('const wifiToggle = new St.Button');
    const toggleEnd = source.indexOf('const wirelessEnabledId', toggleStart);
    assert.ok(toggleStart >= 0 && toggleEnd > toggleStart);
    const toggle = source.slice(toggleStart, toggleEnd);
    assert.ok(toggle.includes('client.wireless_enabled = !client.wireless_enabled'));
    assert.ok(source.includes('heroActions.add_child(wifiToggle)'));
    assert.ok(toggle.includes("on ? 'ON' : 'OFF'"));
    assert.equal((toggle.match(/spawn_command_line_async/g) || []).length, 0);
});

test('the hero toggle follows the live palette for on and off states', () => {
    const sync = source.slice(source.indexOf('const syncWifiToggle = () => {'),
        source.indexOf("wifiToggle.connect('clicked'"));
    assert.match(sync, /getThemeColor\('primary'/);
    assert.match(sync, /getThemeColor\('onPrimary'/);
    assert.match(sync, /getThemeColor\('onSurface'/);
    assert.match(source, /client\.connect\('notify::wireless-enabled', \(\) => \{[\s\S]*?syncWifiToggle\(\)/);
});
