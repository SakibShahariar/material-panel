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
    assert.ok(config.includes('merged.workspaceDisplay = normalizeWorkspaceDisplayMode(merged.workspaceDisplay)'));
    assert.ok(extension.includes("globalThis._materialPanelWorkspaceDisplay = newConfig.workspaceDisplay ?? 'auto'"));
    assert.ok(extension.includes("globalThis._materialPanelWorkspaceDisplay = this._config.workspaceDisplay ?? 'auto'"));
    assert.ok(prefs.includes("const workspaceDisplayModes = ['auto', 'numbers', 'dots', 'apps']"));
    assert.ok(prefs.includes("config.workspaceDisplay = workspaceDisplayModes[workspaceDisplayRow.get_selected()] ?? 'auto'"));
    assert.ok(prefs.includes('workspaceDisplayRow.set_selected'));
    assert.ok(builder.includes('resolveWorkspaceDisplayMode('));
    assert.ok(builder.includes("if (displayMode === 'numbers')"));
    assert.ok(builder.includes("if (displayMode === 'dots')"));
});
