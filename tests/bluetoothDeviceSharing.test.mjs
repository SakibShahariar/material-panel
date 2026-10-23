import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';

const [quicksettings, bluetooth] = await Promise.all([
    readFile(new URL('../modules/quicksettings.js', import.meta.url), 'utf8'),
    readFile(new URL('../modules/bluetooth.js', import.meta.url), 'utf8'),
]);

test('both Bluetooth surfaces use the shared device icon classifier', () => {
    assert.match(quicksettings, /import \{getBluetoothDeviceIcon\} from '\.\.\/lib\/bluetoothDevice\.js';/);
    assert.match(bluetooth, /import \{getBluetoothDeviceIcon\} from '\.\.\/lib\/bluetoothDevice\.js';/);
    assert.match(quicksettings, /getBluetoothDeviceIcon\(props, connected \|\| isConnecting\)/);
    assert.match(bluetooth, /getBluetoothDeviceIcon\(props, connected \|\| connecting\)/);
});

test('Bluetooth surfaces do not retain separate device icon classifiers', () => {
    assert.doesNotMatch(quicksettings, /function getDeviceIcon\s*\(/);
    assert.doesNotMatch(bluetooth, /function deviceIconKey\s*\(/);
});
