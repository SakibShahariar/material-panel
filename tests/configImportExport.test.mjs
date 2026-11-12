import assert from 'node:assert/strict';
import test from 'node:test';
import {
    createSafeModeConfig,
    parsePanelConfig,
    serializePanelConfig,
} from '../lib/configImportExport.js';

const config = {
    configVersion: 3,
    activePreset: 'default',
    colorSource: '/home/test/.config/matugen/matugen-colors.css',
    presets: {
        default: {zones: {left: ['cpu'], center: ['clock'], right: ['powermenu']}},
    },
};

test('full config export preserves theme paths and preset zone ordering', () => {
    const exported = serializePanelConfig(config);
    const imported = parsePanelConfig(exported);
    assert.equal(imported.colorSource, config.colorSource);
    assert.deepEqual(imported.presets, config.presets);
});

test('config import rejects malformed roots, preset zones, and missing active presets', () => {
    assert.throws(() => parsePanelConfig('[]'), /JSON object/);
    assert.throws(() => parsePanelConfig('{"presets":[]}'), /presets must be an object/);
    assert.throws(() => parsePanelConfig('{"presets":{"default":{"zones":{"left":[]}}}}'), /invalid center zone/);
    assert.throws(() => parsePanelConfig('{"activePreset":"missing","presets":{"default":{"zones":{"left":[],"center":[],"right":[]}}}}'), /active preset does not exist/);
});

test('safe mode retains theme settings but exposes only clock and power modules', () => {
    const safe = createSafeModeConfig(config);
    assert.equal(safe.colorSource, config.colorSource);
    assert.deepEqual(safe.presets.safe.zones, {
        left: [],
        center: ['clock'],
        right: ['powermenu'],
    });
    assert.equal(safe.activePreset, 'safe');
    assert.equal(safe.layoutStyle, 'default');
    assert.deepEqual(safe.hiddenForeignRoles, []);
});

test('Preferences exposes validated full-config import/export and safe-mode recovery actions', async () => {
    const {readFile} = await import('node:fs/promises');
    const [prefs, backup] = await Promise.all([
        readFile(new URL('../prefs.js', import.meta.url), 'utf8'),
        readFile(new URL('../prefs/configBackupGroup.js', import.meta.url), 'utf8'),
    ]);
    const helper = await readFile(new URL('../lib/configImportExport.js', import.meta.url), 'utf8');
    assert.ok(backup.includes('serializePanelConfig(await store.loadAsync())'));
    assert.ok(backup.includes('parsePanelConfig(new TextDecoder'));
    assert.ok(backup.includes('store._normalizeParsedConfig(parsed, {persistCleanup: false})'));
    assert.ok(prefs.includes('buildConfigurationBackupGroup({'));
    assert.ok(prefs.includes('createSafeModeConfig(current)'));
    assert.ok(helper.includes("center: ['clock']"));
    assert.ok(helper.includes("right: ['powermenu']"));
});
