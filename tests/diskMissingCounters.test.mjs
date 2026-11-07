import assert from 'node:assert/strict';
import test from 'node:test';
import {calculateDiskUsage} from '../lib/diskUsage.js';

test('missing used counter is derived from free space rather than treated as zero', () => {
    for (const used of [null, undefined, '', '  ']) {
        const result = calculateDiskUsage({size: 100, used, free: 40});
        assert.equal(result.used, 60);
        assert.equal(result.pct, 60);
    }
});

test('missing free counter is derived from used space rather than treated as zero', () => {
    for (const free of [null, undefined, '', '  '])
        assert.equal(calculateDiskUsage({size: 100, used: 60, free}).avail, 40);
});

test('genuine zero and numeric string counters remain supported', () => {
    assert.equal(calculateDiskUsage({size: 100, used: 0, free: 100}).used, 0);
    assert.equal(calculateDiskUsage({size: 100, used: 100, free: 0}).avail, 0);
    assert.equal(calculateDiskUsage({size: '100', used: '60', free: '40'}).pct, 60);
});
