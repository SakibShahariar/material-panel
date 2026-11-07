import assert from 'node:assert/strict';
import test from 'node:test';

import {
    WORKSPACE_FILTERS,
    normalizeWorkspaceFilter,
    filterWorkspaceIndices,
} from '../lib/workspaceFilter.js';

test('workspace filters accept only the supported values', () => {
    assert.deepEqual(WORKSPACE_FILTERS, ['all', 'active', 'urgent', 'occupied']);
    for (const value of WORKSPACE_FILTERS)
        assert.equal(normalizeWorkspaceFilter(value), value);
    assert.equal(normalizeWorkspaceFilter('unknown'), 'all');
    assert.equal(normalizeWorkspaceFilter(null), 'all');
});

test('all mode preserves every workspace in its original order', () => {
    assert.deepEqual(filterWorkspaceIndices('all', [{}, {}, {}], 1), [0, 1, 2]);
});

test('active mode shows only the active workspace', () => {
    assert.deepEqual(filterWorkspaceIndices('active', [{}, {}, {}], 2), [2]);
});

test('occupied mode includes workspaces with windows and retains an empty active workspace', () => {
    assert.deepEqual(filterWorkspaceIndices('occupied', [
        {occupied: false},
        {occupied: true},
        {occupied: false},
        {occupied: true},
    ], 2), [1, 2, 3]);
});

test('urgent mode includes urgent workspaces and retains the active workspace', () => {
    assert.deepEqual(filterWorkspaceIndices('urgent', [
        {urgent: true},
        {urgent: false},
        {urgent: true},
    ], 1), [0, 1, 2]);
});

test('filtered modes handle an invalid active index safely', () => {
    assert.deepEqual(filterWorkspaceIndices('occupied', [
        {occupied: false},
        {occupied: true},
    ], 20), [0, 1]);
});

test('empty and invalid workspace snapshots return a safe empty result', () => {
    assert.deepEqual(filterWorkspaceIndices('all', [], 0), []);
    assert.deepEqual(filterWorkspaceIndices('all', null, 0), []);
});
