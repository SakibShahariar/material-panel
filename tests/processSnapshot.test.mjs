import assert from 'node:assert/strict';
import test from 'node:test';
import {filterAndSortProcesses, parseProcessSnapshot} from '../lib/processSnapshot.js';

test('parses valid process rows and ignores malformed lines and ps itself', () => {
    assert.deepEqual(parseProcessSnapshot(
        '  101  4.5  2.0 firefox\ninvalid row\n  202 0.2 0.4 ps\n  303 1.0 3.2 gnome-shell\n'),
    [
        {pid: '101', pcpu: '4.5', pmem: '2', comm: 'firefox'},
        {pid: '303', pcpu: '1', pmem: '3.2', comm: 'gnome-shell'},
    ]);
});

test('filters a cached snapshot case-insensitively by command or PID', () => {
    const snapshot = parseProcessSnapshot('101 4.5 2.0 firefox\n202 0.2 0.4 terminal\n');
    assert.deepEqual(filterAndSortProcesses(snapshot, 'FIRE'), [snapshot[0]]);
    assert.deepEqual(filterAndSortProcesses(snapshot, '202'), [snapshot[1]]);
    assert.deepEqual(filterAndSortProcesses(snapshot, 'missing'), []);
});

test('sorts the cached snapshot by CPU or memory and applies the limit', () => {
    const snapshot = parseProcessSnapshot('101 4.5 2.0 firefox\n202 0.2 7.4 terminal\n303 1.0 3.2 gnome-shell\n');
    assert.equal(filterAndSortProcesses(snapshot, '', 'cpu', 1)[0].pid, '101');
    assert.equal(filterAndSortProcesses(snapshot, '', 'mem', 1)[0].pid, '202');
    assert.equal(filterAndSortProcesses(snapshot, '', 'cpu', 0).length, 0);
});
