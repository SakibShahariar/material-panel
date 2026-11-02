import assert from 'node:assert/strict';
import test from 'node:test';
import {
    clearMediaVisualizerState,
    isMediaVisualizerEnabled,
    setMediaVisualizerEnabled,
} from '../lib/mediaVisualizerState.js';

test('media visualizer is disabled by default and accepts only true', () => {
    clearMediaVisualizerState();
    assert.equal(isMediaVisualizerEnabled(), false);
    setMediaVisualizerEnabled(true);
    assert.equal(isMediaVisualizerEnabled(), true);
    setMediaVisualizerEnabled(1);
    assert.equal(isMediaVisualizerEnabled(), false);
});

test('media visualizer preference resets on extension teardown', () => {
    setMediaVisualizerEnabled(true);
    clearMediaVisualizerState();
    assert.equal(isMediaVisualizerEnabled(), false);
});
