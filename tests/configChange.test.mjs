import assert from 'node:assert/strict';
import test from 'node:test';

import {classifyConfigChange, getChangedConfigKeys} from '../lib/configChange.js';

const base = {
    trayAllHidden: false,
    foreignRoleZones: {},
    hiddenForeignRoles: [],
    foreignRoleZonesBackup: {},
    panelSize: {scale: 1, gapTop: 5},
    clockFormat: '24h',
    colorSource: null,
    layoutStyle: 'default',
};

test('classifies tray-only changes', () => {
    assert.equal(classifyConfigChange(base, {...base, trayAllHidden: true}), 'tray');
    assert.equal(classifyConfigChange(base, {
        ...base, foreignRoleZones: {network: 'left'},
    }), 'tray');
});

test('classifies panel size, clock, and color changes', () => {
    assert.equal(classifyConfigChange(base, {
        ...base, panelSize: {...base.panelSize, gapTop: 8},
    }), 'panelSize');
    assert.equal(classifyConfigChange(base, {...base, clockFormat: '12h'}), 'clock');
    assert.equal(classifyConfigChange(base, {...base, colorSource: '/tmp/palette.css'}), 'color');
});

test('requires a full rebuild for mixed or unsupported changes', () => {
    assert.equal(classifyConfigChange(base, {...base, clockFormat: '12h', colorSource: '/tmp/palette.css'}), 'full');
    assert.equal(classifyConfigChange(base, {...base, layoutStyle: 'end4'}), 'full');
    assert.equal(classifyConfigChange(null, base), 'full');
});

test('treats equivalent nested config values as unchanged regardless of key order', () => {
    const equivalent = {
        ...base,
        panelSize: {gapTop: 5, scale: 1},
        foreignRoleZones: {},
    };
    assert.equal(classifyConfigChange(base, equivalent), 'tray');
    assert.deepEqual(getChangedConfigKeys(
        {nested: {first: 1, second: {left: true, right: false}}},
        {nested: {second: {right: false, left: true}, first: 1}},
    ), []);
    assert.deepEqual(getChangedConfigKeys(
        {nested: {first: 1, second: 2}},
        {nested: {first: 1, third: 2}},
    ), ['nested']);
});

test('reports changed top-level keys once for consumers to reuse', () => {
    assert.deepEqual(getChangedConfigKeys(base, {
        ...base,
        trayAllHidden: true,
        panelSize: {...base.panelSize, gapTop: 9},
    }), ['trayAllHidden', 'panelSize']);
    assert.deepEqual(getChangedConfigKeys(base, {...base}), []);
    assert.equal(getChangedConfigKeys(null, base), null);
    assert.equal(classifyConfigChange(base, {...base, clockFormat: '12h'},
        getChangedConfigKeys(base, {...base, clockFormat: '12h'})), 'clock');
});
