import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';

const source = await readFile(new URL('../modules/btConnected.js', import.meta.url), 'utf8');
const start = source.indexOf('    const scan = (force = false) => {');
const end = source.indexOf('\n    const subscriptions = [];', start);
const scan = source.slice(start, end);
const lifecycleStart = source.indexOf('    const subscriptions = [];');
const lifecycleEnd = source.indexOf('\n    button.connect(\'clicked\'', lifecycleStart);
const lifecycle = source.slice(lifecycleStart, lifecycleEnd);

test('hidden headphones chip skips BlueZ polling and uses a slower visible fallback', () => {
    assert.match(scan, /if \(!force && !button\.is_mapped && !menu\.isOpen\)\s*return GLib\.SOURCE_CONTINUE/);
    assert.match(lifecycle, /timeout_add_seconds\(GLib\.PRIORITY_DEFAULT, 15, \(\) => scan\(false\)\)/);
    assert.match(lifecycle, /scan\(true\)/);
});

test('BlueZ object and property signals refresh device and battery state', () => {
    assert.match(lifecycle, /InterfacesAdded/);
    assert.match(lifecycle, /InterfacesRemoved/);
    assert.match(lifecycle, /PropertiesChanged/);
    assert.match(lifecycle, /changedInterface === DEVICE_IFACE \|\| changedInterface === 'org\.bluez\.Battery1'/);
    assert.match(lifecycle, /menu\.connect\('open-state-changed'/);
    assert.match(lifecycle, /button\.connect\('notify::mapped'/);
});

test('BlueZ subscriptions, timers and pending scans are cleaned up on destroy', () => {
    assert.match(lifecycle, /Gio\.DBus\.system\.signal_unsubscribe\(subscription\)/);
    assert.match(lifecycle, /GLib\.source_remove\(scanDebounceId\)/);
    assert.match(lifecycle, /GLib\.source_remove\(id\)/);
    assert.match(lifecycle, /destroyed = true/);
    assert.match(scan, /if \(scanInFlight\) \{\s*if \(force\)\s*scanAgain = true;/);
});
