import assert from 'node:assert/strict';
import test from 'node:test';
import {clearBluetoothVisibilityState, isBluetoothAutoHideEnabled, setBluetoothAutoHide} from '../lib/bluetoothVisibilityState.js';

test('Bluetooth auto-hide preference is strict and resets on teardown', () => {
    setBluetoothAutoHide(true);
    assert.equal(isBluetoothAutoHideEnabled(), true);
    setBluetoothAutoHide('true');
    assert.equal(isBluetoothAutoHideEnabled(), false);
    setBluetoothAutoHide(true);
    clearBluetoothVisibilityState();
    assert.equal(isBluetoothAutoHideEnabled(), false);
});
