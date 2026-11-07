import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';

const service = await readFile(new URL('../lib/keepAwake.js', import.meta.url), 'utf8');
const menu = await readFile(new URL('../lib/keepAwakeMenu.js', import.meta.url), 'utf8');
const quicksettings = await readFile(new URL('../modules/quicksettings.js', import.meta.url), 'utf8');
const end4 = await readFile(new URL('../modules/quicksettingsEnd4.js', import.meta.url), 'utf8');
const extension = await readFile(new URL('../extension.js', import.meta.url), 'utf8');

test('keep-awake uses GNOME SessionManager suspend inhibition and releases its cookie', () => {
    assert.match(service, /org\.gnome\.SessionManager/);
    assert.match(service, /INHIBIT_SUSPEND = 4/);
    assert.match(service, /'Inhibit'/);
    assert.match(service, /'Uninhibit'/);
    assert.match(service, /new GLib\.Variant\('\(susu\)'/);
    assert.match(service, /new GLib\.Variant\('\(u\)'/);
});

test('keep-awake supports timed presets, indefinite mode, and automatic expiry', () => {
    assert.match(menu, /15 \* 60/);
    assert.match(menu, /30 \* 60/);
    assert.match(menu, /60 \* 60/);
    assert.match(menu, /2 \* 60 \* 60/);
    assert.match(menu, /Until disabled/);
    assert.match(service, /GLib\.timeout_add_seconds/);
    assert.match(service, /stopKeepAwake\(\)/);
});

test('all Quick Settings layouts expose keep-awake and extension disable releases it', () => {
    assert.equal((quicksettings.match(/buildKeepAwakeMenu\(\)/g) || []).length, 2);
    assert.match(end4, /buildKeepAwakeMenu\(\)/);
    assert.match(extension, /stopKeepAwake\(\)/);
});
