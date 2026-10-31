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
    assert.match(watcher, /let isCurrentGeneration = generation === this\._reloadGeneration/);
    assert.match(watcher, /if \(!isCurrentGeneration \|\| !this\._callback\)/);
    assert.match(source, /this\._reloadGeneration\+\+/);
    assert.match(source, /GLib\.timeout_add\(GLib\.PRIORITY_DEFAULT, 300/);
});

test('async self-writes do not discard the external change that triggered reload', () => {
    assert.match(source, /this\._selfWriteContent = legacyText;\s*await this\._replaceContentsAsync\(file, legacyText\)/);
    assert.match(watcher, /let isCurrentGeneration = generation === this\._reloadGeneration/);
    assert.match(watcher, /isCurrentGeneration = currentText === this\._selfWriteContent/);
    assert.match(watcher, /const config = await this\.loadAsync\(\)/);
});

test('Preferences writes configuration asynchronously and serializes rapid saves', async () => {
    const prefs = await readFile(new URL('../prefs.js', import.meta.url), 'utf8');
    assert.match(source, /async saveAsync\(config, \{suppressWatcher = false\} = \{\}\)/);
    assert.match(source, /await this\._replaceContentsAsync\(file, text\)/);
    assert.match(prefs, /let saveQueue = Promise\.resolve\(\)/);
    assert.match(prefs, /await store\.loadAsync\(\)/);
    assert.match(prefs, /await store\.saveAsync\(merged\)/);
    assert.doesNotMatch(prefs, /store\.save\(merged\)/);
});
