import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {
    normalizeWorkspaceDisplayMode,
    resolveWorkspaceDisplayMode,
} from '../lib/workspaceDisplay.js';

test('workspace display mode accepts the supported choices and falls back safely', () => {
    for (const mode of ['auto', 'numbers', 'dots', 'apps'])
        assert.equal(normalizeWorkspaceDisplayMode(mode), mode);
    assert.equal(normalizeWorkspaceDisplayMode('invalid'), 'auto');
    assert.equal(normalizeWorkspaceDisplayMode(null), 'auto');
});

test('automatic mode preserves the existing layout-specific workspace presentation', () => {
    assert.equal(resolveWorkspaceDisplayMode('auto', false), 'numbers');
    assert.equal(resolveWorkspaceDisplayMode('auto', true), 'apps');
});

test('explicit workspace display modes are consistent across layouts', () => {
    for (const mode of ['numbers', 'dots', 'apps']) {
        assert.equal(resolveWorkspaceDisplayMode(mode, false), mode);
        assert.equal(resolveWorkspaceDisplayMode(mode, true), mode);
    }
});

test('workspace display preference reaches the shell builder and is synchronized in Preferences', async () => {
    const [config, extension, prefs, builder] = await Promise.all([
        readFile(new URL('../lib/configStore.js', import.meta.url), 'utf8'),
        readFile(new URL('../extension.js', import.meta.url), 'utf8'),
        readFile(new URL('../prefs.js', import.meta.url), 'utf8'),
        readFile(new URL('../modules/workspaces.js', import.meta.url), 'utf8'),
    ]);
    assert.ok(config.includes("workspaceDisplay: 'auto'"));
    assert.ok(config.includes('workspaceScrollSwitch: true'));
    assert.ok(config.includes("workspaceFilter: 'all'"));
    assert.ok(config.includes('normalizeWorkspaceFilter(merged.workspaceFilter)'));
    assert.ok(config.includes('merged.workspaceScrollSwitch = merged.workspaceScrollSwitch !== false'));
    assert.ok(config.includes('merged.workspaceDisplay = normalizeWorkspaceDisplayMode(merged.workspaceDisplay)'));
    assert.ok(extension.includes('setWorkspaceDisplayMode(newConfig.workspaceDisplay)'));
    assert.ok(extension.includes('setWorkspaceDisplayMode(this._config.workspaceDisplay)'));
    assert.ok(extension.includes('setWorkspaceScrollSwitch(newConfig.workspaceScrollSwitch)'));
    assert.ok(extension.includes('setWorkspaceFilter(newConfig.workspaceFilter)'));
    assert.ok(extension.includes('setWorkspaceScrollSwitch(this._config.workspaceScrollSwitch)'));
    assert.ok(extension.includes('setWorkspaceFilter(this._config.workspaceFilter)'));
    assert.ok(extension.includes('clearWorkspaceState()'));
    assert.ok(!extension.includes('_materialPanelWorkspaceDisplay'));
    assert.ok(!extension.includes('_materialPanelWorkspaceScrollSwitch'));
    assert.ok(prefs.includes("const workspaceDisplayModes = ['auto', 'numbers', 'dots', 'apps']"));
    assert.ok(prefs.includes("const workspaceFilterModes = ['all', 'active', 'urgent', 'occupied']"));
    assert.ok(prefs.includes('config.workspaceFilter = workspaceFilterModes[workspaceFilterRow.get_selected()] ?? \'all\''));
    assert.ok(prefs.includes("config.workspaceDisplay = workspaceDisplayModes[workspaceDisplayRow.get_selected()] ?? 'auto'"));
    assert.ok(prefs.includes('workspaceDisplayRow.set_selected'));
    assert.ok(prefs.includes("title: 'Scroll to switch workspaces'"));
    assert.ok(prefs.includes('config.workspaceScrollSwitch = workspaceScrollSwitch.active'));
    assert.ok(prefs.includes('workspaceScrollSwitch.active = config.workspaceScrollSwitch !== false'));
    assert.ok(builder.includes('resolveWorkspaceDisplayMode('));
    assert.ok(builder.includes('filterWorkspaceIndices('));
    assert.ok(builder.includes('getWorkspaceFilter()'));
    assert.ok(builder.includes("'notify::demands-attention'"));
    assert.ok(builder.includes("'unmanaged'"));
    assert.ok(builder.includes("if (displayMode === 'numbers')"));
    assert.ok(builder.includes("if (displayMode === 'dots')"));
    assert.ok(builder.includes('if (isWorkspaceScrollSwitchEnabled())'));
    assert.ok(builder.includes('getWorkspaceDisplayMode()'));
    assert.ok(!builder.includes('_materialPanelWorkspaceDisplay'));
    assert.ok(!builder.includes('_materialPanelWorkspaceScrollSwitch'));
    assert.ok(builder.includes('scrollSignalId = box.connect(\'scroll-event\''));
    assert.ok(builder.includes('box.disconnect(scrollSignalId)'));
});
