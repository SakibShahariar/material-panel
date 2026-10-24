import assert from 'node:assert/strict';
import test from 'node:test';
import {calculateRates} from '../lib/netSpeedMath.js';

const before = {rx: 1000, tx: 500};
const after = {rx: 3000, tx: 1500};

test('network rates use elapsed seconds rather than bytes per tick', () => {
    assert.deepEqual(calculateRates(before, after, 2), {down: 1000, up: 500});
    assert.deepEqual(calculateRates(before, after, 0.5), {down: 4000, up: 2000});
});

test('default one-second samples remain compatible', () => {
    assert.deepEqual(calculateRates(before, after), {down: 2000, up: 1000});
});

test('invalid elapsed times cannot produce infinite or negative rates', () => {
    for (const seconds of [0, -1, NaN, Infinity])
        assert.deepEqual(calculateRates(before, after, seconds), {down: 0, up: 0});
});

test('counter resets remain clamped when elapsed time is supplied', () => {
    assert.deepEqual(calculateRates(after, before, 2), {down: 0, up: 0});
});
