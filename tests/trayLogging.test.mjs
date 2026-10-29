import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';

const extension = await readFile(new URL('../extension.js', import.meta.url), 'utf8');
const bridge = await readFile(new URL('../lib/statusAreaBridge.js', import.meta.url), 'utf8');

test('normal tray updates log a concise count and reserve placement JSON for debug mode', () => {
    assert.ok(extension.includes('tray placements updated'));
    assert.ok(extension.includes("GLib.getenv('MATERIAL_PANEL_DEBUG_TRAY') === '1'"));
    assert.ok(extension.includes('tray placement details'));
    assert.ok(!extension.includes('JSON.stringify(newConfig.foreignRoleZones'));
});

test('repetitive tray-role diagnostics are gated behind the explicit debug environment flag', () => {
    assert.ok(bridge.includes('function debugTray(message)'));
    assert.ok(bridge.includes("GLib.getenv('MATERIAL_PANEL_DEBUG_TRAY') === '1'"));
    assert.ok(bridge.includes('debugTray(`tray role'));
    assert.ok(bridge.includes('debugTray(`Off — returned'));
});
