import assert from 'node:assert/strict';
import test from 'node:test';
import {filterLocalMounts} from '../lib/mountedFilesystems.js';

test('filesystem selector excludes pseudo filesystems and duplicate mount paths', () => {
    const mounts = filterLocalMounts([
        {path: '/home', name: 'Home'},
        {path: '/proc', name: 'proc'},
        {path: '/sys/fs/cgroup', name: 'cgroup'},
        {path: '/dev', name: 'dev'},
        {path: '/home/', name: 'Home duplicate'},
        {path: '/', name: 'Root'},
    ]);
    assert.deepEqual(mounts.map(mount => mount.path), ['/', '/home']);
});

test('filesystem selector keeps local data and removable mounts', () => {
    const mounts = filterLocalMounts([
        {path: '/run/media/user/USB', name: 'USB Drive', removable: true},
        {path: '/mnt/data', name: 'Data'},
        {path: '/run/user/1000', name: 'Runtime'},
        {path: '/var/lib/snapd/snap', name: 'Snap images'},
    ]);
    assert.deepEqual(mounts.map(mount => mount.path), ['/mnt/data', '/run/media/user/USB']);
    assert.equal(mounts[1].removable, true);
});

test('invalid and non-local mount paths are ignored', () => {
    assert.deepEqual(filterLocalMounts([
        null, {}, {path: 'smb://server/share'}, {path: ''},
    ]), []);
});
