import assert from 'node:assert/strict';
import test from 'node:test';
import {calculateDiskUsage, sameFilesystem} from '../lib/diskUsage.js';

test('calculates usage and preserves filesystem identity', () => {
    assert.deepEqual(calculateDiskUsage({
        size: 1000, used: 720, free: 280, filesystemId: 'rootfs', mount: '/',
    }), {size: 1000, used: 720, avail: 280, pct: 72, filesystemId: 'rootfs', mount: '/'});
});

test('derives missing used bytes from free space and bounds percentages', () => {
    assert.equal(calculateDiskUsage({size: 100, used: NaN, free: 40}).used, 60);
    assert.equal(calculateDiskUsage({size: 100, used: 140, free: -40}).pct, 100);
    assert.equal(calculateDiskUsage({size: 0, used: 0, free: 0}), null);
});

test('detects shared filesystems only when both IDs are known', () => {
    assert.equal(sameFilesystem({filesystemId: 'dev-1'}, {filesystemId: 'dev-1'}), true);
    assert.equal(sameFilesystem({filesystemId: 'dev-1'}, {filesystemId: 'dev-2'}), false);
    assert.equal(sameFilesystem({filesystemId: null}, {filesystemId: 'dev-2'}), null);
});
