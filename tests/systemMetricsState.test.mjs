import assert from 'node:assert/strict';
import test from 'node:test';
import {
    clearGpuMetrics,
    clearNetworkMetrics,
    getGpuMetrics,
    getNetworkMetrics,
    setGpuMetrics,
    setNetworkMetrics,
} from '../lib/systemMetricsState.js';

test('GPU and network samples are shared as independent copied snapshots', () => {
    clearGpuMetrics();
    clearNetworkMetrics();
    const gpu = {util: 42, updatedAt: 100};
    const network = {down: 1200, up: 300, updatedAt: 200};
    setGpuMetrics(gpu);
    setNetworkMetrics(network);
    gpu.util = 99;
    network.down = 0;
    assert.deepEqual(getGpuMetrics(), {util: 42, updatedAt: 100});
    assert.deepEqual(getNetworkMetrics(), {down: 1200, up: 300, updatedAt: 200});
    const read = getGpuMetrics();
    read.util = 1;
    assert.deepEqual(getGpuMetrics(), {util: 42, updatedAt: 100});
});

test('GPU and network producers can clear their own sample independently', () => {
    setGpuMetrics({util: 80, updatedAt: 300});
    setNetworkMetrics({down: 500, up: 100, updatedAt: 400});
    clearGpuMetrics();
    assert.equal(getGpuMetrics(), null);
    assert.deepEqual(getNetworkMetrics(), {down: 500, up: 100, updatedAt: 400});
    clearNetworkMetrics();
    assert.equal(getNetworkMetrics(), null);
});
