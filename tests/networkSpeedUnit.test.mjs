import assert from 'node:assert/strict';
import test from 'node:test';
import {clearNetworkSpeedUnit, getNetworkSpeedUnit, setNetworkSpeedUnit} from '../lib/networkSpeedUnit.js';

test('network speed unit is normalized and resets to bytes on teardown', () => {
    assert.equal(getNetworkSpeedUnit(), 'bytes');
    setNetworkSpeedUnit('bits');
    assert.equal(getNetworkSpeedUnit(), 'bits');
    setNetworkSpeedUnit('invalid');
    assert.equal(getNetworkSpeedUnit(), 'bytes');
    setNetworkSpeedUnit('bits');
    clearNetworkSpeedUnit();
    assert.equal(getNetworkSpeedUnit(), 'bytes');
});
