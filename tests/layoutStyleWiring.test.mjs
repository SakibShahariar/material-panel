import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';

test('layout style is owned by the extension state service and consumed by every layout-dependent module', async () => {
    const paths = [
        '../extension.js',
        '../lib/moduleRegistry.js',
        '../lib/popupDismiss.js',
        '../lib/statusAreaBridge.js',
        '../modules/clock.js',
        '../modules/quicksettings.js',
        '../modules/workspaces.js',
    ];
    const sources = await Promise.all(paths.map(path =>
        readFile(new URL(path, import.meta.url), 'utf8')));
    const [extension, ...consumers] = sources;
    assert.match(extension, /setLayoutStyle\(this\._config\.layoutStyle\)/);
    assert.match(extension, /clearLayoutStyle\(\)/);
    assert.doesNotMatch(extension, /_materialPanelLayoutStyle/);
    for (const source of consumers) {
        assert.match(source, /getLayoutStyle\(\)/);
        assert.doesNotMatch(source, /_materialPanelLayoutStyle/);
    }
});
