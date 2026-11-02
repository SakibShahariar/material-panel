import assert from 'node:assert/strict';
import test from 'node:test';
import {clearMediaVisibilityState, isMediaAutoHideEnabled, setMediaAutoHide} from '../lib/mediaVisibilityState.js';

test('media auto-hide preference is strict and resets on teardown', () => {
    setMediaAutoHide(true);
    assert.equal(isMediaAutoHideEnabled(), true);
    setMediaAutoHide('true');
    assert.equal(isMediaAutoHideEnabled(), false);
    setMediaAutoHide(true);
    clearMediaVisibilityState();
    assert.equal(isMediaAutoHideEnabled(), false);
});
