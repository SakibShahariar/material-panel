import assert from 'node:assert/strict';
import test from 'node:test';
import {getBluetoothDeviceIcon} from '../lib/bluetoothDevice.js';

test('Bluetooth icon classification handles BlueZ icon and device-name hints', () => {
    assert.equal(getBluetoothDeviceIcon({Icon: 'audio-headphones'}), 'headphones');
    assert.equal(getBluetoothDeviceIcon({Alias: 'Keychron K2'}), 'keyboard');
    assert.equal(getBluetoothDeviceIcon({Name: 'Xbox Wireless Controller'}), 'gamepad');
    assert.equal(getBluetoothDeviceIcon({Name: 'Laptop'}), 'computer');
});

test('Bluetooth icon classification handles unpacked BlueZ variants and class codes', () => {
    const variant = value => ({deep_unpack: () => value});
    assert.equal(getBluetoothDeviceIcon({Class: variant(0x0200)}), 'phone');
    assert.equal(getBluetoothDeviceIcon({Class: variant(0x0100)}), 'computer');
    assert.equal(getBluetoothDeviceIcon({Class: variant(0x0500)}), 'keyboard');
});

test('Bluetooth icon classification preserves connected-state fallback', () => {
    assert.equal(getBluetoothDeviceIcon({}), 'bluetooth-off');
    assert.equal(getBluetoothDeviceIcon({}, true), 'bluetooth-on');
});
