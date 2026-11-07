import assert from 'node:assert/strict';
import test from 'node:test';
import {clearControlCenterSummary, getControlCenterSummary, setControlCenterDiskSummary,
    setControlCenterMetrics, watchControlCenterSummary} from '../lib/controlCenterSummaryState.js';

test('Control Center summary shares existing System and Disk samples', () => {
    clearControlCenterSummary();
    const seen = [];
    const stop = watchControlCenterSummary(snapshot => seen.push(snapshot));
    setControlCenterMetrics({cpu: 18.4, memory: 52, temperature: 48, sampledAt: 1000, sampledAtLabel: '16:30'});
    setControlCenterDiskSummary({pct: 72, used: 720, size: 1000, sampledAt: 1100, sampledAtLabel: '16:31'});
    assert.equal(seen.length, 3);
    assert.deepEqual(getControlCenterSummary(), {
        system: {cpu: 18.4, memory: 52, temperature: 48, sampledAt: 1000, sampledAtLabel: '16:30'},
        disk: {pct: 72, used: 720, size: 1000, sampledAt: 1100, sampledAtLabel: '16:31'},
    });
    stop();
    setControlCenterMetrics({cpu: 20});
    assert.equal(seen.length, 3);
});

test('Control Center summary clears unavailable samples without inventing zero readings', () => {
    setControlCenterMetrics({cpu: null, memory: NaN, temperature: null});
    assert.deepEqual(getControlCenterSummary().system, {cpu: null, memory: null, temperature: null, sampledAt: 0, sampledAtLabel: ''});
    clearControlCenterSummary();
    assert.deepEqual(getControlCenterSummary(), {system: null, disk: null});
});
