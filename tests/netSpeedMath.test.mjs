import assert from 'node:assert/strict';
import test from 'node:test';

import {calculateRates, hasInterfaceChanged} from '../lib/netSpeedMath.js';

test('calculates receive and transmit byte deltas independently', () => {
    assert.deepEqual(
        calculateRates({rx: 1000, tx: 500}, {rx: 1450, tx: 725}),
        {down: 450, up: 225},
    );
});

test('clamps reset or decreasing counters instead of producing negative rates', () => {
    assert.deepEqual(
        calculateRates({rx: 900, tx: 700}, {rx: 25, tx: 12}),
        {down: 0, up: 0},
    );
});

test('returns zero rates when samples are missing or invalid', () => {
    assert.deepEqual(calculateRates(null, {rx: 1, tx: 1}), {down: 0, up: 0});
    assert.deepEqual(
        calculateRates({rx: 1, tx: 2}, {rx: 'invalid', tx: 3}),
        {down: 0, up: 0},
    );
});


test('detects interface changes but ignores a missing current interface', () => {
    assert.equal(hasInterfaceChanged('wlan0', 'eth0'), true);
    assert.equal(hasInterfaceChanged('wlan0', 'wlan0'), false);
    assert.equal(hasInterfaceChanged('wlan0', null), false);
    assert.equal(hasInterfaceChanged(null, 'wlan0'), true);
});
