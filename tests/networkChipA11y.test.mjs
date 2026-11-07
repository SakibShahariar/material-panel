import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';

const source = await readFile(new URL('../modules/network.js', import.meta.url), 'utf8');

test('network chip exposes connected, offline and disabled Wi-Fi states', () => {
    assert.ok(source.includes("setChipA11y(button, 'Wi-Fi enabled, connected')"));
    assert.ok(source.includes("client.wireless_enabled ? 'Offline' : 'Wi-Fi disabled'"));
    assert.ok(source.includes("setChipA11y(button, client.wireless_enabled ? 'Offline' : 'Wi-Fi disabled')"));
    assert.ok(!source.includes("setChipA11y(button, 'Offline')"));
    assert.ok(source.includes("setChipA11y(button, 'Wired connection active')"));
});

test('primary connection and wireless setting changes refresh the accessible name', () => {
    assert.ok(source.includes("client.connect('notify::primary-connection', updateStatusIcon)"));
    assert.ok(source.includes("client.connect('notify::wireless-enabled'"));
    assert.ok(source.includes('updateStatusIcon();'));
    assert.ok(source.includes("setChipA11y(button, 'NetworkManager unavailable')"));
});
