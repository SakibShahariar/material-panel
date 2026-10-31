import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {getBluetoothDevices, getBluetoothDeviceActionSteps} from '../lib/bluetoothDevices.js';

const variant = value => ({deep_unpack: () => value});

test('normalizes paired, connected, nearby, and battery data from BlueZ objects', () => {
    const objects = {
        '/org/bluez/hci0/dev_A': {
            'org.bluez.Device1': {
                Alias: variant('Headphones'),
                Name: variant('Headphones'),
                Paired: variant(true),
                Connected: variant(false),
            },
            'org.bluez.Battery1': {Percentage: variant(62)},
        },
        '/org/bluez/hci0/dev_B': {
            'org.bluez.Device1': {
                Name: variant('Keyboard'),
                Paired: variant(true),
                Connected: variant(true),
            },
        },
        '/org/bluez/hci0/dev_C': {
            'org.bluez.Device1': {
                Name: variant('Nearby speaker'),
                Paired: variant(false),
                Connected: variant(false),
            },
        },
        '/org/bluez/hci0/dev_D': {
            'org.bluez.Device1': {
                Paired: variant(false),
                Connected: variant(false),
            },
        },
    };

    const {pairedDevices, nearbyDevices} = getBluetoothDevices(objects);
    assert.deepEqual(pairedDevices.map(device => device.path), [
        '/org/bluez/hci0/dev_B',
        '/org/bluez/hci0/dev_A',
    ]);
    assert.equal(pairedDevices[1].name, 'Headphones');
    assert.equal(pairedDevices[1].batteryPct, 62);
    assert.equal(nearbyDevices.length, 1);
    assert.equal(nearbyDevices[0].path, '/org/bluez/hci0/dev_C');
    assert.equal(nearbyDevices[0].batteryPct, null);
});

test('handles empty or malformed ObjectManager data without throwing', () => {
    assert.deepEqual(getBluetoothDevices(), {pairedDevices: [], nearbyDevices: []});
    assert.deepEqual(getBluetoothDevices({broken: null}), {pairedDevices: [], nearbyDevices: []});
});

test('Bluetooth popup and Quick Settings consume the same device normalization', async () => {
    const [popup, quickSettings] = await Promise.all([
        readFile(new URL('../modules/bluetooth.js', import.meta.url), 'utf8'),
        readFile(new URL('../modules/quicksettings.js', import.meta.url), 'utf8'),
    ]);
    for (const source of [popup, quickSettings]) {
        assert.ok(source.includes("import {getBluetoothDevices} from '../lib/bluetoothDevices.js'"));
        assert.ok(source.includes('getBluetoothDevices(objects)'));
    }
    assert.ok(!popup.includes("Object.entries(objects)\n                            .filter(([, ifaces]) => DEVICE_IFACE in ifaces)"));
    assert.ok(!quickSettings.includes("Object.entries(objects)\n                                .filter(([, ifaces]) => DEVICE_IFACE in ifaces)"));
});

test('Bluetooth action planner pairs unpaired devices before connecting', () => {
    assert.deepEqual(getBluetoothDeviceActionSteps({paired: false, connected: false}), ['Pair', 'Connect']);
    assert.deepEqual(getBluetoothDeviceActionSteps({paired: true, connected: false}), ['Connect']);
    assert.deepEqual(getBluetoothDeviceActionSteps({paired: true, connected: true}), ['Disconnect']);
    assert.deepEqual(getBluetoothDeviceActionSteps({paired: false, connected: true}), ['Disconnect']);
});

test('shared Bluetooth action runner delegates to the tested pure action planner', async () => {
    const runner = await readFile(new URL('../lib/bluetoothActions.js', import.meta.url), 'utf8');
    assert.ok(runner.includes("import {getBluetoothDeviceActionSteps} from './bluetoothDevices.js'"));
    assert.ok(runner.includes('proxy.call('));
});

test('both Bluetooth surfaces use the shared asynchronous device action runner', async () => {
    const [popup, quickSettings, runner] = await Promise.all([
        readFile(new URL('../modules/bluetooth.js', import.meta.url), 'utf8'),
        readFile(new URL('../modules/quicksettings.js', import.meta.url), 'utf8'),
        readFile(new URL('../lib/bluetoothActions.js', import.meta.url), 'utf8'),
    ]);
    for (const source of [popup, quickSettings]) {
        assert.ok(source.includes("import {runBluetoothDeviceAction} from '../lib/bluetoothActions.js'"));
        assert.ok(source.includes('runBluetoothDeviceAction({'));
    }
    assert.ok(runner.includes("import {getBluetoothDeviceActionSteps} from './bluetoothDevices.js'"));
    assert.ok(runner.includes('proxy.call('));
});
