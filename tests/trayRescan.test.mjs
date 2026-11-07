import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';

test('tray bridge attaches newly registered indicators through the addToStatusArea hook', async () => {
    const bridge = await readFile(new URL('../lib/statusAreaBridge.js', import.meta.url), 'utf8');
    assert.match(bridge, /Main\.panel\.addToStatusArea = this\._patchedAdd/);
    assert.match(bridge, /self\._onButtonAdded\(role, button \?\? indicator\)/);
    assert.match(bridge, /const area = Main\.panel\.statusArea \?\? \{\}/);
    assert.match(bridge, /this\._onButtonAdded\(role, area\[role\]\)/);
    assert.match(bridge, /this\._scanExistingIndicators\(\)/);
    const stripStart = bridge.indexOf('    setTrayIconStrip(strip) {');
    const stripEnd = bridge.indexOf('\n    setTrayHost(', stripStart);
    const stripSetup = bridge.slice(stripStart, stripEnd);
    assert.match(stripSetup, /this\._scanExistingIndicators\(\)/);
    assert.doesNotMatch(stripSetup, /this\._later\(/);

    const hostStart = bridge.indexOf('    setTrayHost(host, enabled = true) {');
    const hostEnd = bridge.indexOf('\n    _resolveZone(', hostStart);
    const hostSetup = bridge.slice(hostStart, hostEnd);
    assert.match(hostSetup, /this\._scanExistingIndicators\(\)/);
    assert.doesNotMatch(hostSetup, /this\._later\(/);
});

test('tray bridge disconnects its registration hook and clears retries on disable', async () => {
    const bridge = await readFile(new URL('../lib/statusAreaBridge.js', import.meta.url), 'utf8');
    const disableStart = bridge.indexOf('    disable() {');
    const disable = bridge.slice(disableStart);
    assert.match(disable, /this\._destroyed = true/);
    assert.match(disable, /this\._clearTimers\(\)/);
    assert.match(bridge, /Main\.panel\.addToStatusArea === this\._patchedAdd/);
    assert.match(bridge, /this\._patchedAdd = null/);
});

test('panel rebuild keeps only one bounded fallback tray rescan', async () => {
    const extension = await readFile(new URL('../extension.js', import.meta.url), 'utf8');
    const start = extension.indexOf('    _scheduleTrayRescan() {');
    const end = extension.indexOf('\n    disable()', start);
    const scheduler = extension.slice(start, end);

    assert.match(scheduler, /const ms = 900/);
    assert.equal((scheduler.match(/GLib\.timeout_add\(/g) || []).length, 1);
    assert.match(scheduler, /this\._trayRescanIds = \(this\._trayRescanIds \?\? \[\]\)\.filter/);
    assert.match(scheduler, /this\._bridge\?\.reattachAll\?\.\(\)/);
    assert.doesNotMatch(scheduler, /\[400, 1200, 2500\]/);
});

test('tray bridge handles existing, newly registered, destroyed, and recreated indicators', async () => {
    const bridge = await readFile(new URL('../lib/statusAreaBridge.js', import.meta.url), 'utf8');
    const enableStart = bridge.indexOf('    enable() {');
    const disableStart = bridge.indexOf('    disable() {', enableStart);
    const enable = bridge.slice(enableStart, disableStart);
    assert.match(enable, /self\._origAdd\.call\(this, role, indicator, position, box\)/);
    assert.match(enable, /self\._onButtonAdded\(role, button \?\? indicator\)/);
    assert.match(enable, /for \(const role of Object\.keys\(area\)\)/);
    assert.match(enable, /this\._onButtonAdded\(role, area\[role\]\)/);

    const scanStart = bridge.indexOf('    _scanExistingIndicators() {');
    const scanEnd = bridge.indexOf('\n    _wantedPlacement(', scanStart);
    const scan = bridge.slice(scanStart, scanEnd);
    assert.match(scan, /for \(const role of Object\.keys\(area\)\)/);
    assert.match(scan, /if \(!this\._known\.has\(role\)\)/);
    assert.match(scan, /this\._applyRole\(role, area\[role\]\)/);

    const signalStart = bridge.indexOf('    _bindActorSignals(role, actor, wrap) {');
    const signalEnd = bridge.indexOf('\n    _ensureWrapper(', signalStart);
    const signals = bridge.slice(signalStart, signalEnd);
    assert.match(signals, /actor\.connect\('destroy'/);
    assert.match(signals, /this\._known\.delete\(role\)/);
    assert.match(signals, /this\._unwrap\(role\)/);

    const reattachStart = bridge.indexOf('    reattachAll() {');
    const reattachEnd = bridge.indexOf('\n    /**', reattachStart);
    const reattach = bridge.slice(reattachStart, reattachEnd);
    assert.match(reattach, /this\._scanExistingIndicators\(\)/);
    assert.match(reattach, /for \(const \[role, actor\] of this\._known\.entries\(\)\)/);
    assert.match(reattach, /this\._applyRole\(role, actor\)/);
});
