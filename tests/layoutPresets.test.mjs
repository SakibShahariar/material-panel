import assert from 'node:assert/strict';
import test from 'node:test';

import {
    applyLayoutStyle,
    DEFAULT_ZONES,
    END4_ZONES,
    LAYOUT_DEFAULT,
    LAYOUT_END4,
} from '../lib/layoutPresets.js';

const clone = value => JSON.parse(JSON.stringify(value));

test('restores customized End-4 zones after switching away and back', () => {
    const customZones = {
        left: ['clock', 'cpu'],
        center: ['workspaces'],
        right: ['battery', 'quicksettings'],
    };
    const config = {
        layoutStyle: LAYOUT_END4,
        activePreset: 'end4',
        presets: {
            end4: {zones: clone(customZones)},
            default: {zones: clone(DEFAULT_ZONES)},
        },
        panelSize: {scale: 1, gapTop: 0, gapBottom: 0, gapSide: 0},
    };

    applyLayoutStyle(config, LAYOUT_DEFAULT);
    applyLayoutStyle(config, LAYOUT_END4);

    assert.deepEqual(config.presets.end4.zones, customZones);
});

test('restores the preset associated with a saved layout snapshot', () => {
    const customZones = {
        left: ['clock'],
        center: ['cpu'],
        right: ['battery'],
    };
    const config = {
        layoutStyle: LAYOUT_DEFAULT,
        activePreset: 'custom',
        presets: {
            default: {zones: clone(DEFAULT_ZONES)},
            custom: {zones: clone(customZones)},
        },
        panelSize: {scale: 1, gapTop: 5, gapBottom: 4, gapSide: 0},
    };

    applyLayoutStyle(config, LAYOUT_END4);
    config.activePreset = 'default';
    applyLayoutStyle(config, LAYOUT_DEFAULT);

    assert.equal(config.activePreset, 'custom');
    assert.deepEqual(config.presets.custom.zones, customZones);
    assert.deepEqual(config.presets.default.zones, END4_ZONES);
});
