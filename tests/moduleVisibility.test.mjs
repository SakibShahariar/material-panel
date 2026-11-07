import assert from 'node:assert/strict';
import test from 'node:test';

import {
    DEFAULT_MODULE_VISIBILITY_RULE,
    getContextHiddenModules,
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
        clock: {hideWhenFullscreen: true, hideInOverview: false, hideWhenDnd: false, hideWhenOffline: false},
        volume: {hideWhenFullscreen: false, hideInOverview: true, hideWhenDnd: false, hideWhenOffline: false},
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
