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
        clock: {hideWhenFullscreen: true, hideInOverview: false},
        volume: {hideWhenFullscreen: false, hideInOverview: true},
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
        ['clock', 'workspaces', 'volume']);
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
