import assert from 'node:assert/strict';
import test from 'node:test';

import {
    clearQuickLaunchEntries,
    getQuickLaunchEntries,
    setQuickLaunchEntries,
    setQuickLaunchEntryState,
} from '../lib/quickLaunchState.js';

const toggle = {id: 'wifi', type: 'command', target: 'nmcli radio wifi on', offTarget: 'nmcli radio wifi off', name: 'Wi-Fi'};

test('toggle state starts off, changes in memory, and survives unchanged config refreshes', () => {
    clearQuickLaunchEntries();
    setQuickLaunchEntries([toggle]);
    assert.equal(getQuickLaunchEntries()[0].active, false);
    assert.equal(setQuickLaunchEntryState('wifi', true), true);
    assert.equal(getQuickLaunchEntries()[0].active, true);
    setQuickLaunchEntries([{...toggle, name: 'Wireless'}]);
    assert.equal(getQuickLaunchEntries()[0].active, true);
});

test('changing or removing a toggle action resets its transient state', () => {
    clearQuickLaunchEntries();
    setQuickLaunchEntries([toggle]);
    setQuickLaunchEntryState('wifi', true);
    setQuickLaunchEntries([{...toggle, offTarget: 'nmcli radio wifi connect'}]);
    assert.equal(getQuickLaunchEntries()[0].active, false);
    assert.equal(setQuickLaunchEntryState('missing', true), false);
    setQuickLaunchEntries([{id: 'wifi', type: 'command', target: 'nmcli radio wifi on'}]);
    assert.equal(getQuickLaunchEntries()[0].active, undefined);
});

test('changing the on command resets transient toggle state', () => {
    clearQuickLaunchEntries();
    setQuickLaunchEntries([toggle]);
    setQuickLaunchEntryState('wifi', true);
    setQuickLaunchEntries([{...toggle, target: 'nmcli radio wifi'}]);
    assert.equal(getQuickLaunchEntries()[0].active, false);
});

test('stale async completion cannot update a replacement toggle with the same ID', () => {
    clearQuickLaunchEntries();
    setQuickLaunchEntries([toggle]);
    const pendingEntry = {target: toggle.target, offTarget: toggle.offTarget};
    setQuickLaunchEntries([{...toggle, target: 'nmcli radio wifi'}]);
    assert.equal(setQuickLaunchEntryState('wifi', true, pendingEntry), false);
    assert.equal(getQuickLaunchEntries()[0].active, false);
});

test('extension teardown clears transient toggle state', () => {
    clearQuickLaunchEntries();
    setQuickLaunchEntries([toggle]);
    setQuickLaunchEntryState('wifi', true);
    clearQuickLaunchEntries();
    setQuickLaunchEntries([toggle]);
    assert.equal(getQuickLaunchEntries()[0].active, false);
});
