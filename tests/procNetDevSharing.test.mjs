import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';

test('CPU module does not retain the unused /proc/net/dev reader', async () => {
    const cpu = await readFile(new URL('../modules/cpu.js', import.meta.url), 'utf8');
    assert.doesNotMatch(cpu, /readNetRates|readProcNetDevText/);
});

test('network-speed monitor shares one /proc/net/dev sample within each tick', async () => {
    const monitor = await readFile(new URL('../lib/netSpeedMonitor.js', import.meta.url), 'utf8');
    assert.match(monitor, /const sampledText = readProcNetDevText\(\)/);
    assert.match(monitor, /findActiveInterface\(sampledText\)/);
    assert.match(monitor, /readIfaceStatsFromText\(sampledText, iface\)/);
});
