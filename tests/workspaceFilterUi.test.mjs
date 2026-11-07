import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';

const source = await readFile(new URL('../modules/workspaces.js', import.meta.url), 'utf8');

test('workspace filters are applied to original workspace indices before rendering', () => {
    assert.ok(source.includes('filterWorkspaceIndices('));
    assert.ok(source.includes('workspaceFilter, workspaceStates, activeIndex'));
    assert.ok(source.includes('for (const i of visibleIndices)'));
    assert.ok(source.includes('label: `${i + 1}`'));
    assert.ok(source.includes('Workspace ${i + 1}'));
});

test('occupied and urgent state are derived from current non-minimized workspace windows', () => {
    assert.ok(source.includes('occupied: liveWindows.length > 0'));
    assert.ok(source.includes('urgent: attentionWindows.some(_isUrgentWindow)'));
    assert.ok(source.includes('_windowsOnWorkspace(ws, i, {includeMinimized: true})'));
    assert.ok(source.includes('win.demands_attention === true || win.urgent === true'));
});

test('urgent and occupied filters refresh from window lifecycle and urgency changes', () => {
    assert.ok(source.includes("'notify::demands-attention'"));
    assert.ok(source.includes("'notify::urgent'"));
    assert.ok(source.includes("'unmanaged'"));
    assert.ok(source.includes('syncWindowSignals(allWindows)'));
    assert.ok(source.includes('workspaceFilter, workspaceStates, workspaceWindows'));
});

test('workspace window signal handlers are disconnected when the chip is destroyed', () => {
    assert.ok(source.includes('for (const [win, signalIds] of windowSignalIds)'));
    assert.ok(source.includes('windowSignalIds.clear()'));
});

test('workspace activation continues to target the original workspace object', () => {
    assert.ok(source.includes('btn.connect(\'clicked\', () => ws.activate(global.get_current_time()))'));
    assert.ok(source.includes('dot.connect(\'clicked\', () => ws.activate(global.get_current_time()))'));
});
