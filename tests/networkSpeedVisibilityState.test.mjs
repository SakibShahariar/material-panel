import assert from 'node:assert/strict';
import test from 'node:test';
import {clearNetworkSpeedVisibilityState, isNetworkSpeedAutoHideEnabled, setNetworkSpeedAutoHide} from '../lib/networkSpeedVisibilityState.js';

test('network-speed auto-hide preference is strict and resets on teardown', () => {
    setNetworkSpeedAutoHide(true);
    assert.equal(isNetworkSpeedAutoHideEnabled(), true);
    setNetworkSpeedAutoHide('true');
    assert.equal(isNetworkSpeedAutoHideEnabled(), false);
    setNetworkSpeedAutoHide(true);
    clearNetworkSpeedVisibilityState();
    assert.equal(isNetworkSpeedAutoHideEnabled(), false);
});
