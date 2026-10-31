import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';

const source = await readFile(new URL('../lib/configStore.js', import.meta.url), 'utf8');
const start = source.indexOf('    async _reloadFromWatcher(');
const end = source.indexOf('\n    resetDefaults()', start);
const watcher = source.slice(start, end);

test('watcher reload uses asynchronous reads, migration writes, and config loading', () => {
    assert.ok(start >= 0 && end > start);
    assert.match(watcher, /await this\._readContentsAsync\(homeFile\)/);
    assert.match(watcher, /await this\._readContentsAsync\(legacyFile\)/);
    assert.match(watcher, /await this\._replaceContentsAsync\(homeFile, legacyText\)/);
    assert.match(watcher, /await this\.loadAsync\(\)/);
    assert.doesNotMatch(watcher, /load_contents\(null\)/);
    assert.doesNotMatch(watcher, /replace_contents\(/);
});

test('async config loader preserves malformed-config backup and orphan cleanup', () => {
    assert.match(source, /async loadAsync\(\)/);
    assert.match(source, /await this\._copyFileAsync\(file, backup\)/);
    assert.match(source, /this\._pendingCleanupText = JSON\.stringify\(merged, null, 2\)/);
    assert.match(source, /await this\._replaceContentsAsync\(file, cleanupText\)/);
});

test('new watcher events supersede stale in-flight reloads and unwatch invalidates them', () => {
    assert.match(source, /const generation = \+\+this\._reloadGeneration/);
    assert.match(watcher, /generation !== this\._reloadGeneration/);
    assert.match(source, /this\._reloadGeneration\+\+/);
    assert.match(source, /GLib\.timeout_add\(GLib\.PRIORITY_DEFAULT, 300/);
});
