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

test('extension teardown clears transient toggle state', () => {
    clearQuickLaunchEntries();
    setQuickLaunchEntries([toggle]);
    setQuickLaunchEntryState('wifi', true);
    clearQuickLaunchEntries();
    setQuickLaunchEntries([toggle]);
    assert.equal(getQuickLaunchEntries()[0].active, false);
});
