import assert from 'node:assert/strict';
import test from 'node:test';
import {
    clearWorkspaceState,
    getWorkspaceDisplayMode,
    getWorkspaceFilter,
    isWorkspaceScrollSwitchEnabled,
    setWorkspaceDisplayMode,
    setWorkspaceFilter,
    setWorkspaceScrollSwitch,
} from '../lib/workspaceState.js';

test('workspace display mode is normalized and shared through module state', () => {
    setWorkspaceDisplayMode('dots');
    assert.equal(getWorkspaceDisplayMode(), 'dots');
    setWorkspaceDisplayMode('invalid');
    assert.equal(getWorkspaceDisplayMode(), 'auto');
});

test('workspace scroll switching defaults to enabled and accepts only explicit false as disabled', () => {
    clearWorkspaceState();
    assert.equal(isWorkspaceScrollSwitchEnabled(), true);
    setWorkspaceScrollSwitch(false);
    assert.equal(isWorkspaceScrollSwitchEnabled(), false);
    setWorkspaceScrollSwitch(0);
    assert.equal(isWorkspaceScrollSwitchEnabled(), true);
});

test('workspace preferences reset to defaults on extension teardown', () => {
    setWorkspaceDisplayMode('apps');
    setWorkspaceScrollSwitch(false);
    clearWorkspaceState();
    assert.equal(getWorkspaceDisplayMode(), 'auto');
    assert.equal(isWorkspaceScrollSwitchEnabled(), true);
});


test('workspace filter is normalized, shared, and reset on extension teardown', () => {
    setWorkspaceFilter('urgent');
    assert.equal(getWorkspaceFilter(), 'urgent');
    setWorkspaceFilter('invalid');
    assert.equal(getWorkspaceFilter(), 'all');
    setWorkspaceFilter('occupied');
    clearWorkspaceState();
    assert.equal(getWorkspaceFilter(), 'all');
});
