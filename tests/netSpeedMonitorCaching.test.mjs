import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';

const source = await readFile(new URL('../lib/netSpeedMonitor.js', import.meta.url), 'utf8');
const tickStart = source.indexOf('export function startNetSpeedMonitor(');
const tickEnd = source.indexOf('\n    tick();', tickStart);
const monitor = source.slice(tickStart, tickEnd);

test('each monitor tick shares one proc net dev snapshot with interface discovery and stats', () => {
    assert.equal((monitor.match(/readProcNetDevText\(\)/g) || []).length, 1);
    assert.match(source, /findActiveInterface\(netDevText = null\)/);
    assert.match(monitor, /findActiveInterface\(sampledText\)/);
    assert.match(monitor, /readIfaceStatsFromText\(sampledText, iface\)/);
    assert.doesNotMatch(monitor, /findActiveInterface\(\)/);
});

test('route discovery is rate-limited while missing interfaces are re-resolved immediately', () => {
    assert.match(monitor, /ROUTE_RECHECK_INTERVAL_US = 5 \* 1_000_000/);
    assert.match(monitor, /!iface \|\| !stats \|\| now - lastRouteCheckAt >= ROUTE_RECHECK_INTERVAL_US/);
    assert.match(monitor, /hasInterfaceChanged\(iface, activeIface\)/);
});

const procSnapshot = await readFile(new URL('../lib/procNetDev.js', import.meta.url), 'utf8');
const cpuSource = await readFile(new URL('../modules/cpu.js', import.meta.url), 'utf8');

test('CPU and network speed consumers share a short-lived proc net dev snapshot', () => {
    assert.ok(procSnapshot.includes('const CACHE_WINDOW_US = 200_000'));
    assert.ok(procSnapshot.includes('now - cachedAt < CACHE_WINDOW_US'));
    assert.equal((procSnapshot.match(/load_contents\(null\)/g) || []).length, 1);
    assert.ok(cpuSource.includes("import {readProcNetDevText} from '../lib/procNetDev.js'"));
    assert.ok(source.includes("import {readProcNetDevText} from './procNetDev.js'"));
});
