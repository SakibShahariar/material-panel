import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';

const extension = await readFile(new URL('../extension.js', import.meta.url), 'utf8');
const configChange = await readFile(new URL('../lib/configChange.js', import.meta.url), 'utf8');

test('panel rebuild requests are coalesced into one delayed render', () => {
    const start = extension.indexOf('    _schedulePanelRebuild(reason = \'\') {');
    const end = extension.indexOf('\n    /** AppIndicator / foreign icons', start);
    const scheduler = extension.slice(start, end);

    assert.ok(start >= 0 && end > start);
    assert.match(scheduler, /if \(this\._rebuildDebounceId\)[\s\S]*?GLib\.source_remove/);
    assert.match(scheduler, /GLib\.timeout_add\(GLib\.PRIORITY_DEFAULT, 180/);
    assert.equal((scheduler.match(/this\._builder\.render\(this\._config\)/g) || []).length, 1);
    assert.match(scheduler, /this\._rebuildDebounceId = 0/);
});

test('presentation-only config changes avoid full panel reconstruction', () => {
    assert.match(configChange, /if \(only\(\['panelSize'\]\)\)\s*return 'panelSize'/);
    assert.match(configChange, /if \(only\(\['clockFormat'\]\)\)\s*return 'clock'/);
    assert.match(configChange, /if \(only\(\['networkSpeedUnit'\]\)\)\s*return 'moduleSetting'/);
    assert.match(extension, /case 'clock':[\s\S]*?no rebuild/);
    assert.match(extension, /case 'moduleSetting':[\s\S]*?do not rebuild the panel/);
    assert.match(extension, /case 'panelSize':[\s\S]*?rebuild=false/);
});

test('theme and color changes use the same coalesced rebuild scheduler', () => {
    assert.match(extension, /this\._schedulePanelRebuild\('theme'\)/);
    assert.match(extension, /this\._schedulePanelRebuild\('matugen'\)/);
    assert.match(extension, /this\._schedulePanelRebuild\('panelSize'\)/);
});
