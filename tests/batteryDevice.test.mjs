import assert from 'node:assert/strict';
import test from 'node:test';
import {getSystemOnBatteryState, selectBatteryDevice} from '../lib/batteryDevice.js';

const batteryKind = 2;
const makeDevice = (name, kind = batteryKind, is_present = true) => ({
    name, kind, is_present, native_path: name,
});

test('single battery keeps the physical device rather than the display aggregate', () => {
    const battery = makeDevice('/sys/devices/BAT0');
    const display = makeDevice('DisplayDevice', 0);
    const selected = selectBatteryDevice([battery], display, batteryKind);
    assert.equal(selected.device, battery);
    assert.equal(selected.batteryCount, 1);
});

test('multiple batteries use UPower DisplayDevice for capacity-aware combined status', () => {
    const first = makeDevice('/sys/devices/BAT0');
    const second = makeDevice('/sys/devices/BAT1');
    const display = makeDevice('DisplayDevice', 0);
    const selected = selectBatteryDevice([first, second], display, batteryKind);
    assert.equal(selected.device, display);
    assert.equal(selected.batteryCount, 2);
    assert.equal(selected.isAggregate, true);
});

test('absent batteries are ignored and display device remains a safe fallback', () => {
    const absent = makeDevice('/sys/devices/BAT0', batteryKind, false);
    const display = makeDevice('DisplayDevice', 0);
    const selected = selectBatteryDevice([absent], display, batteryKind);
    assert.equal(selected.device, display);
    assert.equal(selected.batteryCount, 0);
});

test('missing display aggregate falls back deterministically to a present battery', () => {
    const first = makeDevice('/sys/devices/BAT0');
    const second = makeDevice('/sys/devices/BAT1');
    const selected = selectBatteryDevice([first, second], null, batteryKind);
    assert.equal(selected.device, first);
    assert.equal(selected.batteryCount, 2);
});


test('an absent UPower display aggregate is not treated as a battery', () => {
    const absentDisplay = makeDevice('DisplayDevice', 0, false);
    const selected = selectBatteryDevice([], absentDisplay, batteryKind);
    assert.equal(selected.device, null);
    assert.equal(selected.batteryCount, 0);
    assert.equal(selected.isAggregate, false);
});

test('multiple physical batteries fall back when the display aggregate is absent', () => {
    const first = makeDevice('/sys/devices/BAT0');
    const second = makeDevice('/sys/devices/BAT1');
    const absentDisplay = makeDevice('DisplayDevice', 0, false);
    const selected = selectBatteryDevice([first, second], absentDisplay, batteryKind);
    assert.equal(selected.device, first);
    assert.equal(selected.batteryCount, 2);
    assert.equal(selected.isAggregate, false);
});

test('a throwing display presence accessor is treated as unavailable', () => {
    const display = {};
    Object.defineProperty(display, 'is_present', {
        get() { throw new Error('UPower display state unavailable'); },
    });
    assert.equal(selectBatteryDevice([], display, batteryKind).device, null);
});


test('system on-battery state prefers UPower Client over an individual battery state', () => {
    const client = {get_on_battery: () => true};
    assert.equal(getSystemOnBatteryState(client, 1, {
        CHARGING: 1,
        DISCHARGING: 2,
    }), true);
    assert.equal(getSystemOnBatteryState({get_on_battery: () => false}, 2, {
        CHARGING: 1,
        DISCHARGING: 2,
    }), false);
});

test('system on-battery state supports the readable client property', () => {
    assert.equal(getSystemOnBatteryState({on_battery: true}, null), true);
    assert.equal(getSystemOnBatteryState({on_battery: false}, null), false);
});

test('system on-battery state falls back to device state when the client API is unavailable', () => {
    const states = {
        DISCHARGING: 2,
        PENDING_DISCHARGE: 6,
        EMPTY: 3,
        CHARGING: 1,
        PENDING_CHARGE: 5,
        FULLY_CHARGED: 4,
    };
    assert.equal(getSystemOnBatteryState({}, 2, states), true);
    assert.equal(getSystemOnBatteryState({}, 1, states), false);
    assert.equal(getSystemOnBatteryState({}, 0, states), null);
});

test('system on-battery state falls back safely when the UPower getter throws', () => {
    const client = {
        get_on_battery() { throw new Error('UPower unavailable'); },
    };
    assert.equal(getSystemOnBatteryState(client, 2, {
        DISCHARGING: 2,
    }), true);
    assert.equal(getSystemOnBatteryState(client, 0, {}), null);
});

test('device-state fallback ignores undefined enum members', () => {
    assert.equal(getSystemOnBatteryState({}, undefined, {}), null);
});
