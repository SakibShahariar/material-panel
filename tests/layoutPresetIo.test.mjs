import assert from 'node:assert/strict';
import test from 'node:test';
import {parseLayoutPreset, serializeLayoutPreset} from '../lib/layoutPresetIo.js';

const preset = {
    zones: {
        left: ['cpu', 'workspaces'],
        center: ['clock'],
        right: ['networkSpeed', 'volume'],
    },
};

test('layout preset export round-trips a named preset and its zone order', () => {
    const json = serializeLayoutPreset('my-layout', preset);
    const imported = parseLayoutPreset(json);
    assert.equal(imported.name, 'my-layout');
    assert.deepEqual(imported.preset, preset);
});

test('layout preset import rejects unknown formats and malformed zones', () => {
    assert.throws(() => parseLayoutPreset('{"format":"other","version":1}'), /Unsupported/);
    assert.throws(() => serializeLayoutPreset('bad', {zones:{left:[],center:[]}}), /right/);
});

test('layout preset import sanitizes names and drops invalid or duplicate module IDs', () => {
    const json = JSON.stringify({
        format: 'material-panel-layout-preset',
        version: 1,
        name: 'Imported Layout!',
        preset: {zones:{
            left: ['cpu', '../unsafe', 'clock'],
            center: ['clock', 'workspaces'],
            right: ['networkSpeed'],
        }},
    });
    const imported = parseLayoutPreset(json);
    assert.equal(imported.name, 'Imported-Layout');
    assert.deepEqual(imported.preset.zones, {
        left: ['cpu', 'clock'],
        center: ['workspaces'],
        right: ['networkSpeed'],
    });
});
