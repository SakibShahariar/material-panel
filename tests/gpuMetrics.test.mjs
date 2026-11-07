import assert from 'node:assert/strict';
import test from 'node:test';
import {parseNvidiaSmiOutput, parseNvidiaSmiOutputs, selectGpuCandidate} from '../lib/gpuMetrics.js';

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

 
test('parses all NVIDIA rows while preserving commas in GPU names', () => {
    assert.deepEqual(parseNvidiaSmiOutputs(
        'NVIDIA, RTX 4090, 37, 4096, 16384, 52\nNVIDIA A10, 12, 1024, 24576, 41'
    ).map(gpu => ({name: gpu.name, util: gpu.util, card: gpu.card})), [
        {name: 'NVIDIA, RTX 4090', util: 37, card: 'nvidia-smi-0'},
        {name: 'NVIDIA A10', util: 12, card: 'nvidia-smi-1'},
    ]);
});

test('selects the DRM GPU with the strongest metric coverage, not card0 by default', () => {
    const selected = selectGpuCandidate([
        {card: 'card0', vendor: 'Intel', util: null, memUsed: null, memTotal: null, temp: 48},
        {card: 'card1', vendor: 'AMD', util: 63, memUsed: 2048, memTotal: 8192, temp: null},
    ]);
    assert.equal(selected.card, 'card1');
    assert.equal(selected.vendor, 'AMD');
});

test('keeps the previously selected device when metric coverage is tied', () => {
    const candidates = [
        {card: 'card0', util: 50, memUsed: null, memTotal: null, temp: 55},
        {card: 'card1', util: 40, memUsed: null, memTotal: null, temp: 60},
    ];
    assert.equal(selectGpuCandidate(candidates, 'card1').card, 'card1');
});

test('selects the NVIDIA device with more available metrics across rows', () => {
    const candidates = parseNvidiaSmiOutputs(
        'NVIDIA A, 20, N/A, N/A, 40\nNVIDIA B, 60, 2048, 8192, 55'
    );
    assert.equal(selectGpuCandidate(candidates).name, 'NVIDIA B');
});
