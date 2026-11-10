import assert from 'node:assert/strict';
import test from 'node:test';

import {
    DEFAULT_MODULE_VISIBILITY_RULE,
    getContextHiddenModules,
    hasBatteryVisibilityChanged,
    normalizeModuleVisibilityRules,
} from '../lib/moduleVisibility.js';

test('context visibility is opt-in and ignores unknown module IDs', () => {
    assert.deepEqual(normalizeModuleVisibilityRules(null), {});
    assert.deepEqual(normalizeModuleVisibilityRules({
        clock: DEFAULT_MODULE_VISIBILITY_RULE,
        unknown: {hideInOverview: true},
    }), {});
});

test('normalizes only explicit boolean rules for known modules', () => {
    assert.deepEqual(normalizeModuleVisibilityRules({
        clock: {hideWhenFullscreen: true, hideInOverview: false},
        volume: {hideWhenFullscreen: 'yes', hideInOverview: true},
        network: 'invalid',
    }), {
        clock: {hideWhenFullscreen: true, hideInOverview: false, hideWhenDnd: false, hideWhenOffline: false, showOnlyOnBattery: false, showOnlyBelowBatteryPercent: 0},
        volume: {hideWhenFullscreen: false, hideInOverview: true, hideWhenDnd: false, hideWhenOffline: false, showOnlyOnBattery: false, showOnlyBelowBatteryPercent: 0},
    });
});

test('combines fullscreen and overview rules without mutating configuration', () => {
    const rules = {
        clock: {hideWhenFullscreen: true},
        workspaces: {hideInOverview: true},
        volume: {hideWhenFullscreen: true, hideInOverview: true},
    };
    assert.deepEqual([...getContextHiddenModules(rules, {fullscreen: true})], ['clock', 'volume']);
    assert.deepEqual([...getContextHiddenModules(rules, {overview: true})], ['workspaces', 'volume']);
    assert.deepEqual([...getContextHiddenModules(rules, {fullscreen: true, overview: true})],
        ['workspaces', 'clock', 'volume']);
    assert.deepEqual(rules, {
        clock: {hideWhenFullscreen: true},
        workspaces: {hideInOverview: true},
        volume: {hideWhenFullscreen: true, hideInOverview: true},
    });
});

test('inactive desktop context leaves all modules visible', () => {
    assert.deepEqual([...getContextHiddenModules({
        clock: {hideWhenFullscreen: true, hideInOverview: true},
    })], []);
});


test('hides only modules opting into Do Not Disturb context', () => {
    const rules = {
        clock: {hideWhenDnd: true},
        volume: {hideWhenDnd: false},
    };
    assert.deepEqual([...getContextHiddenModules(rules, {dnd: true})], ['clock']);
    assert.deepEqual([...getContextHiddenModules(rules, {dnd: false})], []);
});


test('hides only modules opting into offline context', () => {
    const rules = {
        clock: {hideWhenOffline: true},
        volume: {hideWhenOffline: false},
        network: {hideWhenOffline: true, hideWhenDnd: true},
    };
    assert.deepEqual([...getContextHiddenModules(rules, {offline: true})], ['clock', 'network']);
    assert.deepEqual([...getContextHiddenModules(rules, {offline: false})], []);
    assert.deepEqual([...getContextHiddenModules(rules, {offline: true, dnd: true})], ['clock', 'network']);
});


test('battery visibility rules combine only when battery context is known', () => {
    const rules = {
        clock: {showOnlyOnBattery: true},
        volume: {showOnlyBelowBatteryPercent: 20},
        network: {showOnlyOnBattery: true, showOnlyBelowBatteryPercent: 20},
    };
    assert.deepEqual([...getContextHiddenModules(rules, {onBattery: false, batteryPercent: 55})],
        ['clock', 'volume', 'network']);
    assert.deepEqual([...getContextHiddenModules(rules, {onBattery: true, batteryPercent: 20})], []);
    assert.deepEqual([...getContextHiddenModules(rules, {onBattery: null, batteryPercent: null})], []);
    assert.deepEqual([...getContextHiddenModules(rules, {onBattery: true, batteryPercent: 21})], ['volume', 'network']);
});

test('battery percentage notifications rebuild only when a visibility threshold is crossed', () => {
    const rules = {
        clock: {showOnlyOnBattery: true},
        volume: {showOnlyBelowBatteryPercent: 20},
    };
    assert.equal(hasBatteryVisibilityChanged(rules,
        {onBattery: true, percentage: 40},
        {onBattery: true, percentage: 39}), false);
    assert.equal(hasBatteryVisibilityChanged(rules,
        {onBattery: true, percentage: 21},
        {onBattery: true, percentage: 20}), true);
    assert.equal(hasBatteryVisibilityChanged(rules,
        {onBattery: false, percentage: 20},
        {onBattery: true, percentage: 20}), true);
    assert.equal(hasBatteryVisibilityChanged(rules,
        {onBattery: null, percentage: null},
        {onBattery: null, percentage: null}), false);
});

test('normalizes battery-only and percentage visibility options defensively', () => {
    assert.deepEqual(normalizeModuleVisibilityRules({
        clock: {showOnlyOnBattery: true, showOnlyBelowBatteryPercent: 25.9},
        volume: {showOnlyBelowBatteryPercent: 101},
    }), {
        clock: {hideWhenFullscreen: false, hideInOverview: false, hideWhenDnd: false, hideWhenOffline: false,
            showOnlyOnBattery: true, showOnlyBelowBatteryPercent: 25},
    });
});
