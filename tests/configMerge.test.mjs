import assert from 'node:assert/strict';
import test from 'node:test';
import {mergeConfigChanges, syncObjectInPlace} from '../lib/configMerge.js';

test('keeps external changes to keys untouched in Preferences', () => {
    const base = {clockFormat: '24h', hideProfileIdentity: false, hiddenModules: ['weather']};
    const local = {...base, clockFormat: '12h'};
    const remote = {...base, hideProfileIdentity: true};
    assert.deepEqual(mergeConfigChanges(base, local, remote), {
        clockFormat: '12h', hideProfileIdentity: true, hiddenModules: ['weather'],
    });
});

test('merges independent nested panel-size changes', () => {
    const base = {panelSize: {scale: 1, gapTop: 5, gapBottom: 4}};
    const local = {panelSize: {scale: 1.2, gapTop: 5, gapBottom: 4}};
    const remote = {panelSize: {scale: 1, gapTop: 9, gapBottom: 4}};
    assert.deepEqual(mergeConfigChanges(base, local, remote), {
        panelSize: {scale: 1.2, gapTop: 9, gapBottom: 4},
    });
});

test('prefers the local value when the same setting changes on both sides', () => {
    assert.deepEqual(
        mergeConfigChanges({clockFormat: '24h'}, {clockFormat: '12h'}, {clockFormat: '12h'}),
        {clockFormat: '12h'},
    );
});

test('preserves nested object identities while syncing external configuration', () => {
    const target = {panelSize: {scale: 1}, presets: {default: {zones: {left: ['cpu']}}}};
    const panelSize = target.panelSize;
    const preset = target.presets.default;
    syncObjectInPlace(target, {panelSize: {scale: 1.3}, presets: {default: {zones: {left: ['memory']}}}});
    assert.equal(target.panelSize, panelSize);
    assert.equal(target.presets.default, preset);
    assert.deepEqual(target, {panelSize: {scale: 1.3}, presets: {default: {zones: {left: ['memory']}}}});
});
