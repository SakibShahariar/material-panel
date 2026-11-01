import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';

const source = await readFile(new URL('../modules/gpu.js', import.meta.url), 'utf8');
const start = source.indexOf('function readGpuInfoFallback()');
const end = source.indexOf('\nfunction readGpuInfoAsync(', start);
const fallback = source.slice(start, end);
const cardStart = source.indexOf('function readGpuCard(');
const cardEnd = source.indexOf('\nfunction readGpuInfoFallback(', cardStart);
const cardReader = source.slice(cardStart, cardEnd);

test('GPU fallback reuses a successful DRM device and cached hwmon temperature path', () => {
    assert.match(fallback, /if \(cachedGpuBasePath\)/);
    assert.match(fallback, /readGpuCard\(cachedGpuBasePath, cachedGpuCard, cachedGpuName\)/);
    assert.match(cardReader, /readGpuTemperature\(base\)/);
    assert.match(source, /cachedHwmonTempPath/);
});

test('GPU fallback retries discovery after sensor failure and negative-caches unsupported systems', () => {
    assert.match(fallback, /cachedGpuBasePath = null/);
    assert.match(fallback, /lastGpuDiscoveryAt = 0/);
    assert.match(fallback, /SENSOR_RETRY_INTERVAL_US/);
    assert.match(source, /cachedHwmonTempPath = null;\s*lastHwmonDiscoveryAt = 0;/);
});

test('NVIDIA and DRM candidates are compared using available metric coverage', () => {
    assert.match(source, /parseNvidiaSmiOutputs\(stdout\)/);
    assert.match(source, /const drmCandidate = readGpuInfoFallback\(\)/);
    assert.match(source, /selectGpuCandidate\(/);
    assert.match(source, /\[\.\.\.nvidiaCandidates, \.\.\.\(drmCandidate \? \[drmCandidate\] : \[\]\)\]/);
});

test('DRM fallback evaluates all detected cards before caching the selected device', () => {
    assert.match(fallback, /const candidates = \[\]/);
    assert.match(fallback, /candidates\.push\(result\)/);
    assert.match(fallback, /selectGpuCandidate\(candidates, cachedGpuCard\)/);
    assert.match(fallback, /cachedGpuBasePath = selected\.base/);
});
