import assert from 'node:assert/strict';
import test from 'node:test';
import {selectBatteryDevice} from '../lib/batteryDevice.js';

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
