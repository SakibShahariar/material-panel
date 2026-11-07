import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';

const source = await readFile(new URL('../modules/bluetooth.js', import.meta.url), 'utf8');
const start = source.indexOf('function clearSharedBluetoothPopup(');
const end = source.indexOf('\nexport function buildBluetooth(', start);
const helpers = source.slice(start, end);
const buildStart = source.indexOf('export function buildBluetooth(');
const build = source.slice(buildStart);

test('destroying a Bluetooth menu or button clears only its own shared references', () => {
    assert.match(helpers, /if \(_btPopupMenu === menu\)\s*_btPopupMenu = null;/);
    assert.match(helpers, /if \(_btPopupButton === button\)\s*_btPopupButton = null;/);
    assert.match(build, /menu\.actor\.connect\('destroy', clearThisPopup\)/);
    assert.match(build, /button\.connect\('destroy', clearThisPopup\)/);
});

test('popup readiness and toggle reject destroyed actors', () => {
    assert.match(helpers, /function sharedBluetoothPopupIsAlive\(\)/);
    assert.match(helpers, /menu\.actor\?\.actor_destroyed \|\| _btPopupButton\?\.actor_destroyed/);
    assert.match(helpers, /export function isBluetoothPopupReady\(\) \{\s*return sharedBluetoothPopupIsAlive\(\);/);
    assert.match(helpers, /if \(!sharedBluetoothPopupIsAlive\(\)\)/);
});
