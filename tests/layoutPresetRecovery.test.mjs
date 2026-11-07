import assert from 'node:assert/strict';
import test from 'node:test';
import {applyLayoutStyle, DEFAULT_ZONES, LAYOUT_DEFAULT, LAYOUT_END4} from '../lib/layoutPresets.js';

const clone = value => JSON.parse(JSON.stringify(value));

test('missing active preset selects and preserves an existing default preset', () => {
    const zones = {left: ['media'], center: ['clock'], right: ['battery']};
    const existing = {zones: clone(zones)};
    const config = {layoutStyle: LAYOUT_END4, activePreset: 'removed', presets: {default: existing}};
    applyLayoutStyle(config, LAYOUT_DEFAULT);
    assert.equal(config.activePreset, 'default');
    assert.equal(config.presets.default, existing);
    assert.deepEqual(config.presets.default.zones, zones);
});

test('missing active preset creates a selected default when no default exists', () => {
    const config = {layoutStyle: LAYOUT_END4, activePreset: 'removed', presets: {}};
    applyLayoutStyle(config, LAYOUT_DEFAULT);
    assert.equal(config.activePreset, 'default');
    assert.deepEqual(config.presets.default.zones, DEFAULT_ZONES);
});

test('missing presets collection is recovered without throwing', () => {
    const config = {layoutStyle: LAYOUT_END4};
    assert.doesNotThrow(() => applyLayoutStyle(config, LAYOUT_DEFAULT));
    assert.equal(config.activePreset, 'default');
    assert.deepEqual(config.presets.default.zones, DEFAULT_ZONES);
});

test('valid active preset is retained', () => {
    const zones = {left: ['media'], center: ['clock'], right: ['battery']};
    const existing = {zones: clone(zones)};
    const config = {layoutStyle: LAYOUT_END4, activePreset: 'custom', presets: {custom: existing}};
    applyLayoutStyle(config, LAYOUT_DEFAULT);
    assert.equal(config.activePreset, 'custom');
    assert.equal(config.presets.custom, existing);
    assert.deepEqual(config.presets.custom.zones, zones);
});
