import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';

const [config, change, extension, prefs, network] = await Promise.all([
    readFile(new URL('../lib/configStore.js', import.meta.url), 'utf8'),
    readFile(new URL('../lib/configChange.js', import.meta.url), 'utf8'),
    readFile(new URL('../extension.js', import.meta.url), 'utf8'),
    readFile(new URL('../prefs.js', import.meta.url), 'utf8'),
    readFile(new URL('../modules/networkSpeed.js', import.meta.url), 'utf8'),
]);

test('network speed unit setting is normalized and defaults to bytes per second', () => {
    assert.match(config, /networkSpeedUnit: 'bytes'/);
    assert.match(config, /merged\.networkSpeedUnit = merged\.networkSpeedUnit === 'bits' \? 'bits' : 'bytes'/);
});

test('network speed unit preference updates live without rebuilding the panel', () => {
    assert.match(prefs, /Transfer rate units/);
    assert.match(prefs, /config\.networkSpeedUnit = networkSpeedUnits/);
    assert.match(extension, /_materialPanelNetworkSpeedUnit = newConfig\.networkSpeedUnit/);
    assert.match(extension, /case 'moduleSetting'/);
    assert.match(change, /only\(\['networkSpeedUnit'\]\)/);
});

test('network speed popup and tooltip format raw rates using the selected unit', () => {
    assert.match(network, /function formatNetworkRate\(bytesPerSec, unit = 'bytes'\)/);
    assert.match(network, /bits \/ 1_000_000/);
    assert.match(network, /formatNetworkRate\(sample\.down, unit\)/);
    assert.match(network, /formatNetworkRate\(sample\.up, unit\)/);
});
