import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';

const source = await readFile(new URL('../modules/quicksettings.js', import.meta.url), 'utf8');

test('Quick Settings toggle tiles announce their current on/off state', () => {
    assert.ok(source.includes("setChipA11y(tile, `${label}, ${on ? 'on' : 'off'}`)"));
    assert.ok(source.indexOf('setChipA11y(tile,') < source.indexOf('const sid = currentTileStyleId();'));
});

const end4 = await readFile(new URL('../modules/quicksettingsEnd4.js', import.meta.url), 'utf8');
const bluetooth = await readFile(new URL('../modules/bluetooth.js', import.meta.url), 'utf8');

test('End-4 round and wide toggles expose their labels and current states', () => {
    assert.ok(end4.includes("setChipA11y(btn, announceState ? `${label}, ${on ? 'on' : 'off'}` : label)"));
    assert.ok(end4.includes("setChipA11y(btn, `${label}, ${on ? 'on' : 'off'}`)"));
    assert.ok(end4.includes("label: 'Dark style'"));
    assert.ok(end4.includes("label: 'Night light'"));
    assert.ok(end4.includes("label: 'Do not disturb'"));
    assert.ok(end4.includes("label: 'Lock screen'"));
    assert.ok(end4.includes('announceState: false'));
});

test('End-4 power actions and popup trigger have accessible names', () => {
    assert.ok(end4.includes('setChipA11y(b, a.title)'));
    assert.ok(end4.includes("setChipA11y(button, 'Quick Settings')"));
});

test('Bluetooth chip announces changing adapter states', () => {
    assert.ok(bluetooth.includes("setChipA11y(button, 'Bluetooth, status unavailable')"));
    assert.ok(bluetooth.includes("setChipA11y(button, `Bluetooth, ${powered ? 'on' : 'off'}`)"));
    assert.ok(bluetooth.includes("setChipA11y(button, 'Bluetooth, blocked')"));
    assert.ok(bluetooth.includes("setChipA11y(button, 'Bluetooth, no adapter')"));
    assert.ok(bluetooth.includes("setChipA11y(button, 'Bluetooth, unavailable')"));
});

test('Bluetooth device and settings buttons expose descriptive names', () => {
    assert.ok(bluetooth.includes("setChipA11y(footerBtn, 'Open Bluetooth Settings')"));
    assert.ok(bluetooth.includes("setChipA11y(row, [displayName, ...parts].join(', '))"));
});
