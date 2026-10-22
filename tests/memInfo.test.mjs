import test from 'node:test';
import assert from 'node:assert/strict';
import {parseMemInfoText} from '../lib/memInfo.js';

test('parses memory and swap values from proc meminfo', () => {
    const result = parseMemInfoText([
        'MemTotal:       1000 kB',
        'MemFree:         100 kB',
        'MemAvailable:   250 kB',
        'Buffers:         20 kB',
        'Cached:         200 kB',
        'SReclaimable:    30 kB',
        'SwapTotal:      500 kB',
        'SwapFree:       125 kB',
    ].join('\n'));
    assert.equal(result.totalKb, 1000);
    assert.equal(result.availableKb, 250);
    assert.equal(result.usedKb, 750);
    assert.equal(result.freeKb, 100);
    assert.equal(result.cachedKb, 230);
    assert.equal(result.buffersKb, 20);
    assert.equal(result.usedPct, 75);
    assert.equal(result.swapUsedKb, 375);
    assert.equal(result.swapPct, 75);
});

test('handles missing fields and empty input safely', () => {
    const result = parseMemInfoText('MemFree: 12 kB');
    assert.equal(result.totalKb, 0);
    assert.equal(result.availableKb, 12);
    assert.equal(result.usedKb, 0);
    assert.equal(result.usedPct, 0);
    assert.equal(result.swapPct, 0);
});

test('does not produce negative used memory when available exceeds total', () => {
    const result = parseMemInfoText('MemTotal: 100 kB\nMemAvailable: 150 kB');
    assert.equal(result.usedKb, 0);
    assert.equal(result.usedPct, 0);
});
