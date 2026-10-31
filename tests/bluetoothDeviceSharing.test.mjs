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
    assert.match(bluetooth, /getBluetoothDeviceIcon\(props, state\.connected \|\| state\.connecting\)/);
});

test('Bluetooth surfaces do not retain separate device icon classifiers', () => {
    assert.doesNotMatch(quicksettings, /function getDeviceIcon\s*\(/);
    assert.doesNotMatch(bluetooth, /function deviceIconKey\s*\(/);
});

test('Bluetooth popup reuses device row actors by BlueZ object path', () => {
    assert.ok(bluetooth.includes('const deviceRows = new Map()'));
    assert.ok(bluetooth.includes('row._mpUpdate = update'));
    assert.ok(bluetooth.includes('deviceRows.get(device.path)'));
    assert.ok(bluetooth.includes('row._mpUpdate(device.props, device.batteryPct)'));
    assert.ok(bluetooth.includes('devicesBox.remove_child(child)'));
    assert.ok(bluetooth.includes('if (!retainedRows.has(child))'));
    assert.ok(bluetooth.includes('clearDeviceRows();'));
});


test('Quick Settings Bluetooth rows are retained by BlueZ object path across refreshes', () => {
    assert.ok(quicksettings.includes('const qsDeviceRows = new Map()'));
    assert.ok(quicksettings.includes('qsDeviceRows.get(path)'));
    assert.ok(quicksettings.includes('row._mpSnapshot !== snapshot'));
    assert.ok(quicksettings.includes('getOrCreateQsDeviceRow(path, props, true, batteryPct)'));
    assert.ok(quicksettings.includes('getOrCreateQsDeviceRow(path, props, false, batteryPct)'));
    assert.doesNotMatch(quicksettings, /deviceContainer\\.destroy_all_children\\(\\)/);
});
