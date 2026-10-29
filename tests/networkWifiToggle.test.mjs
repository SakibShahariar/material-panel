import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';

const source = await readFile(new URL('../modules/network.js', import.meta.url), 'utf8');

test('Wi-Fi toggle uses NetworkManager without spawning nmcli', () => {
    const toggleStart = source.indexOf("const wifiToggle = new PopupMenu.PopupSwitchMenuItem");
    const toggleEnd = source.indexOf("const wirelessEnabledId", toggleStart);
    assert.ok(toggleStart >= 0 && toggleEnd > toggleStart);
    const toggle = source.slice(toggleStart, toggleEnd);
    assert.ok(toggle.includes('client.wireless_enabled = want'));
    assert.ok(toggle.includes('notify::wireless-enabled'));
    assert.ok(!toggle.includes('nmcli'));
});
