import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';

const debug = await readFile(new URL('../lib/debug.js', import.meta.url), 'utf8');
const extension = await readFile(new URL('../extension.js', import.meta.url), 'utf8');
const builder = await readFile(new URL('../lib/panelBuilder.js', import.meta.url), 'utf8');
const theme = await readFile(new URL('../lib/theme.js', import.meta.url), 'utf8');

test('detailed lifecycle logs require the explicit MATERIAL_PANEL_DEBUG flag', () => {
    assert.ok(debug.includes("GLib.getenv('MATERIAL_PANEL_DEBUG') === '1'"));
    assert.ok(debug.includes("log('material-panel: ' + message)"));
});

test('routine rebuild, layout and watcher diagnostics use debug logging', () => {
    assert.ok(extension.includes('debugLog(') && extension.includes('panel rebuild scheduled'));
    assert.ok(extension.includes('debugLog(') && extension.includes('config change classified'));
    assert.ok(builder.includes('debugLog(') && builder.includes('module verify zoneChildren='));
    assert.ok(builder.includes('debugLog(') && builder.includes('chipGap='));
    assert.ok(theme.includes('debugLog(') && theme.includes('raw dir-watch event'));
});

test('recovery and error paths remain logged outside debug mode', () => {
    assert.ok(theme.includes("log('material-panel: async Matugen CSS read failed: ' + e.message)"));
    assert.ok(builder.includes("log('material-panel: no right zone for tray drawer')"));
});
