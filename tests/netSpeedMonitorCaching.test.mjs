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
