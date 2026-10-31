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

test('End-4 toggle builders use the shared accessible state helper', () => {
    assert.ok(end4.includes('function bindToggleButton'));
    assert.ok(end4.includes("setChipA11y(btn, announceState ? `${label}, ${on ? 'on' : 'off'}` : label)"));
    assert.ok(end4.includes("announceState: false"));
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
    assert.ok(bluetooth.includes("setChipA11y(row, [state.displayName, ...parts].join(', '))"));
});

const defaultQs = source;

test('Default Quick Settings imports the shared accessible-name helper', () => {
    assert.ok(defaultQs.includes("import {setChipA11y} from '../lib/a11y.js'"));
});

test('Default Bluetooth and Wi-Fi controls expose state and expansion labels', () => {
    assert.ok(defaultQs.includes("setChipA11y(mainBtn, `Bluetooth, ${powered ? 'on' : 'off'}`)"));
    assert.ok(defaultQs.includes("setChipA11y(mainBtn, 'Bluetooth, no adapter')"));
    assert.ok(defaultQs.includes("setChipA11y(dropBtn, expanded ? 'Hide Bluetooth devices' : 'Show Bluetooth devices')"));
    assert.ok(defaultQs.includes("setChipA11y(mainBtn, `Wi-Fi, ${on ? 'on' : 'off'}`)"));
    assert.ok(defaultQs.includes("setChipA11y(dropBtn, expanded ? 'Hide saved Wi-Fi networks' : 'Show saved Wi-Fi networks')"));
    assert.ok(defaultQs.includes("setChipA11y(mainBtn, 'Bluetooth, checking status')"));
    assert.ok(defaultQs.includes("setChipA11y(mainBtn, 'Wi-Fi, checking status')"));
});

test('Default Quick Settings power, device, network, and preferences actions are named', () => {
    assert.ok(defaultQs.includes("const actionLabels = {lock: 'Lock screen', suspend: 'Suspend', restart: 'Restart', shutdown: 'Power off'}"));
    assert.ok(defaultQs.includes("setChipA11y(row, [displayName, statusText].join(', '))"));
    assert.ok(defaultQs.includes("setChipA11y(btn, `${conn.get_id()}, ${isActive ? 'connected' : 'saved network'}`)"));
    assert.ok(defaultQs.includes("setChipA11y(settingsBtn, 'Open Wi-Fi settings')"));
    assert.ok(defaultQs.includes("setChipA11y(button, 'Quick Settings')"));
});

const trayDrawer = await readFile(new URL('../lib/trayDrawer.js', import.meta.url), 'utf8');

test('system tray drawer chevron announces its expanded and collapsed action', () => {
    assert.ok(trayDrawer.includes("import {setChipA11y} from './a11y.js'"));
    assert.ok(trayDrawer.includes("setChipA11y(this.chevron, 'Show system tray')"));
    assert.ok(trayDrawer.includes("setChipA11y(this.chevron, 'Hide system tray')"));
});

const sliderHelper = await readFile(new URL('../lib/simpleSlider.js', import.meta.url), 'utf8');
const defaultQsModule = await readFile(new URL('../modules/quicksettings.js', import.meta.url), 'utf8');
const end4Module = await readFile(new URL('../modules/quicksettingsEnd4.js', import.meta.url), 'utf8');

test('shared slider helper accepts a meaningful accessible name', () => {
    assert.ok(sliderHelper.includes("accessibleName = 'Slider'"));
    assert.ok(sliderHelper.includes("container.accessible_name = String(accessibleName || 'Slider')"));
});

test('Default and End-4 Quick Settings name volume and brightness sliders', () => {
    for (const moduleSource of [defaultQsModule, end4Module]) {
        assert.ok(moduleSource.includes("accessibleName: 'Volume'"));
        assert.ok(moduleSource.includes("accessibleName: 'Brightness'"));
    }
});

test('Default Quick Settings builds tiles from a stable-ID registry', () => {
    assert.ok(defaultQsModule.includes('export const QUICK_SETTINGS_TILE_REGISTRY = Object.freeze(['));
    for (const id of ['dark-mode', 'do-not-disturb', 'night-light', 'bluetooth', 'wifi'])
        assert.ok(defaultQsModule.includes(`id: '${id}'`));
    assert.ok(defaultQsModule.includes('QUICK_SETTINGS_TILE_REGISTRY.map(({id, build}) => [id, build()])'));
    assert.ok(defaultQsModule.includes("tileActors.get('bluetooth')"));
    assert.ok(defaultQsModule.includes("tileActors.get('wifi')"));
    assert.ok(!defaultQsModule.includes('const tiles = [\n        darkModeTile()'));
});

test('End-4 round and wide toggles share accessible state and interaction wiring', () => {
    const bindStart = end4.indexOf('function bindToggleButton');
    const roundStart = end4.indexOf('function makeRoundToggle');
    const wideStart = end4.indexOf('function makeWideToggle');
    const gridStart = end4.indexOf('function buildToggleGrid', wideStart);
    const binder = end4.slice(bindStart, roundStart);
    const round = end4.slice(roundStart, wideStart);
    const wide = end4.slice(wideStart, gridStart);
    assert.ok(binder.includes("setChipA11y(btn, announceState ? `${label}, ${on ? 'on' : 'off'}` : label)"));
    assert.ok(binder.includes('toggleBackground(on, pressed, !!btn.hover)'));
    assert.ok(round.includes('bindToggleButton(btn, {label, announceState, icon: ic'));
    assert.ok(wide.includes('bindToggleButton(btn, {label, icon: ic'));
    assert.ok(!round.includes("btn.connect('notify::hover'"));
    assert.ok(!wide.includes("btn.connect('notify::hover'"));
});
