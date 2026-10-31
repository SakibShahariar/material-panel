import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';

const helper = await readFile(new URL('../lib/powerProfileSelector.js', import.meta.url), 'utf8');
const quicksettings = await readFile(new URL('../modules/quicksettings.js', import.meta.url), 'utf8');
const end4 = await readFile(new URL('../modules/quicksettingsEnd4.js', import.meta.url), 'utf8');

test('power profile selector uses the system power-profiles-daemon D-Bus API', () => {
    assert.match(helper, /org\.freedesktop\.UPower\.PowerProfiles/);
    assert.match(helper, /ActiveProfile/);
    assert.match(helper, /Profiles/);
    assert.match(helper, /org\.freedesktop\.DBus\.Properties\.Set/);
    assert.match(helper, /new GLib\.Variant\('\(ssv\)'/);
});

test('power profile selector follows external changes and hides unsupported systems', () => {
    assert.match(helper, /g-properties-changed/);
    assert.match(helper, /profiles\.length < 2/);
    assert.match(helper, /section\.actor\.hide\(\)/);
    assert.match(helper, /new_for_bus_finish/);
});

test('all Quick Settings layouts attach and clean up the shared selector', () => {
    assert.equal((quicksettings.match(/buildPowerProfileSelector\(\)/g) || []).length, 2);
    assert.match(end4, /buildPowerProfileSelector\(\)/);
    assert.match(quicksettings, /powerProfiles\.destroy\(\)/);
    assert.match(end4, /powerProfiles\.destroy\(\)/);
});
