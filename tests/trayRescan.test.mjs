import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';

test('tray bridge attaches newly registered indicators through the addToStatusArea hook', async () => {
    const bridge = await readFile(new URL('../lib/statusAreaBridge.js', import.meta.url), 'utf8');
    assert.match(bridge, /Main\.panel\.addToStatusArea = this\._patchedAdd/);
    assert.match(bridge, /self\._onButtonAdded\(role, button \?\? indicator\)/);
});

test('panel rebuild keeps only one bounded fallback tray rescan', async () => {
    const extension = await readFile(new URL('../extension.js', import.meta.url), 'utf8');
    const start = extension.indexOf('_scheduleTrayRescan()');
    const end = extension.indexOf('\n    disable()', start);
    const scheduler = extension.slice(start, end);

    assert.match(scheduler, /const ms = 900/);
    assert.equal((scheduler.match(/GLib\.timeout_add\(/g) || []).length, 1);
    assert.match(scheduler, /this\._trayRescanIds = \(this\._trayRescanIds \?\? \[\]\)\.filter/);
    assert.match(scheduler, /this\._bridge\?\.reattachAll\?\.\(\)/);
    assert.doesNotMatch(scheduler, /\[400, 1200, 2500\]/);
});
