import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {
    DEFAULT_QUICK_SETTINGS_TILE_IDS,
    formatQuickSettingsTileOrder,
    normalizeQuickSettingsTiles,
    parseQuickSettingsTileOrder,
} from '../lib/quickSettingsTiles.js';

test('missing or malformed Quick Settings tile order restores the defaults', () => {
    assert.deepEqual(normalizeQuickSettingsTiles(undefined), [...DEFAULT_QUICK_SETTINGS_TILE_IDS]);
    assert.deepEqual(normalizeQuickSettingsTiles('wifi'), [...DEFAULT_QUICK_SETTINGS_TILE_IDS]);
});

test('configured tile order is preserved while unknown and duplicate IDs are removed', () => {
    assert.deepEqual(normalizeQuickSettingsTiles(['wifi', 'bluetooth', 'wifi', 'unknown']),
        ['wifi', 'bluetooth']);
    assert.deepEqual(normalizeQuickSettingsTiles([]), []);
});

test('preference input accepts display names and IDs, and empty input restores defaults', () => {
    assert.deepEqual(parseQuickSettingsTileOrder('Wi-Fi, Bluetooth, dark-mode'),
        ['wifi', 'bluetooth', 'dark-mode']);
    assert.deepEqual(parseQuickSettingsTileOrder(''), [...DEFAULT_QUICK_SETTINGS_TILE_IDS]);
    assert.equal(parseQuickSettingsTileOrder('Wi-Fi, unknown'), null);
    assert.equal(formatQuickSettingsTileOrder(['wifi', 'bluetooth']), 'Wi-Fi, Bluetooth');
});

test('config store, preferences, and default Quick Settings consume the same tile order', async () => {
    const [config, prefs, extension, quickSettings] = await Promise.all([
        readFile(new URL('../lib/configStore.js', import.meta.url), 'utf8'),
        readFile(new URL('../prefs.js', import.meta.url), 'utf8'),
        readFile(new URL('../extension.js', import.meta.url), 'utf8'),
        readFile(new URL('../modules/quicksettings.js', import.meta.url), 'utf8'),
    ]);
    assert.ok(config.includes('qsTiles: [...DEFAULT_QUICK_SETTINGS_TILE_IDS]'));
    assert.ok(config.includes('merged.qsTiles = normalizeQuickSettingsTiles(merged.qsTiles)'));
    assert.ok(prefs.includes('parseQuickSettingsTileOrder(tileOrderRow.get_text())'));
    assert.ok(prefs.includes('config.qsTiles = parsed'));
    assert.ok(extension.includes('globalThis._materialPanelQsTiles = newConfig.qsTiles ?? null'));
    assert.ok(extension.includes('globalThis._materialPanelQsTiles = this._config.qsTiles ?? null'));
    assert.ok(quickSettings.includes('normalizeQuickSettingsTiles(globalThis._materialPanelQsTiles)'));
    assert.ok(quickSettings.includes('const configuredRegistry = configuredIds'));
    assert.ok(quickSettings.includes('if (btTile?.devicePanel)'));
    assert.ok(quickSettings.includes('if (wifiRow?.listPanel)'));
});

test('Preferences keeps the tile-order editor synchronized with config watcher updates', async () => {
    const prefs = await readFile(new URL('../prefs.js', import.meta.url), 'utf8');
    assert.match(prefs, /tileOrderRow\.set_text\(formatQuickSettingsTileOrder\(config\.qsTiles\)\)/);
    const watcherStart = prefs.indexOf('store.watch(newConfig => {');
    const watcher = prefs.slice(watcherStart);
    assert.ok(watcher.indexOf('syncObjectInPlace(config, merged)') <
        watcher.indexOf('tileOrderRow.set_text(formatQuickSettingsTileOrder(config.qsTiles))'));
});

test('End-4 and Ryoku Quick Settings honor the shared configured tile visibility', async () => {
    const [end4, ryoku] = await Promise.all([
        readFile(new URL('../modules/quicksettingsEnd4.js', import.meta.url), 'utf8'),
        readFile(new URL('../modules/quicksettingsRyoku.js', import.meta.url), 'utf8'),
    ]);
    for (const source of [end4, ryoku]) {
        assert.match(source, /normalizeQuickSettingsTiles\(globalThis\._materialPanelQsTiles\)/);
        assert.match(source, /enabledTiles\.has\('wifi'\)/);
        assert.match(source, /enabledTiles\.has\('bluetooth'\)/);
        assert.match(source, /enabledTiles\.has\('dark-mode'\)/);
        assert.match(source, /enabledTiles\.has\('do-not-disturb'\)/);
        assert.match(source, /enabledTiles\.has\('night-light'\)/);
    }
    assert.match(end4, /if \(wifi\) netCol\.add_child\(wifi\)/);
    assert.match(end4, /if \(bt\) netCol\.add_child\(bt\)/);
    assert.match(ryoku, /activeRoutes/);
});
