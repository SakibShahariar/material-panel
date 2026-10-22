import assert from 'node:assert/strict';
import test from 'node:test';
import {parseNvidiaSmiOutput} from '../lib/gpuMetrics.js';

test('parses NVIDIA names containing commas and numeric metrics', () => {
    assert.deepEqual(parseNvidiaSmiOutput('NVIDIA, RTX 4090, 37, 4096, 16384, 52'), {
        vendor: 'NVIDIA', name: 'NVIDIA, RTX 4090', util: 37, memUsed: 4096, memTotal: 16384, temp: 52,
    });
});

test('keeps unavailable individual metrics null', () => {
    assert.deepEqual(parseNvidiaSmiOutput('NVIDIA GeForce, 8, N/A, N/A, 45'), {
        vendor: 'NVIDIA', name: 'NVIDIA GeForce', util: 8, memUsed: null, memTotal: null, temp: 45,
    });
});

test('rejects empty, malformed and driver-error output', () => {
    assert.equal(parseNvidiaSmiOutput(''), null);
    assert.equal(parseNvidiaSmiOutput('NVIDIA-SMI has failed because no driver'), null);
    assert.equal(parseNvidiaSmiOutput('not a CSV row'), null);
});
