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

test('Preferences initial configuration load is asynchronous and cancellable', async () => {
    const prefs = await readFile(new URL('../prefs.js', import.meta.url), 'utf8');
    const fillStart = prefs.indexOf('    fillPreferencesWindow(window)');
    const buildStart = prefs.indexOf('    _buildPreferencesWindow(window, store, config)', fillStart);
    const fill = prefs.slice(fillStart, buildStart);
    assert.ok(fillStart >= 0 && buildStart > fillStart);
    assert.match(fill, /store\.loadAsync\(\)\.then/);
    assert.match(fill, /if \(cancelled\)/);
    assert.doesNotMatch(fill, /store\.load\(\)/);
});

test('extension startup loads config asynchronously and cancels stale loads on disable', async () => {
    const extension = await readFile(new URL('../extension.js', import.meta.url), 'utf8');
    const enableStart = extension.indexOf('    enable() {');
    const initializeStart = extension.indexOf('    _initialize(config)', enableStart);
    const enable = extension.slice(enableStart, initializeStart);
    const disableStart = extension.indexOf('    disable() {');
    const disable = extension.slice(disableStart);
    assert.ok(enableStart >= 0 && initializeStart > enableStart);
    assert.match(enable, /this\._configStore\.loadAsync\(\)\.then/);
    assert.match(enable, /generation !== this\._lifecycleGeneration/);
    assert.doesNotMatch(enable, /this\._configStore\.load\(\)/);
    assert.match(disable, /this\._lifecycleGeneration = .*\+ 1/);
    assert.match(disable, /this\._configStore\?\.unwatch\(\)/);
});

test('clock and CPU module config reads are asynchronous and ignore stale completions', async () => {
    const clock = await readFile(new URL('../modules/clock.js', import.meta.url), 'utf8');
    const cpu = await readFile(new URL('../modules/cpu.js', import.meta.url), 'utf8');
    assert.match(clock, /store\.loadAsync\(\)\.then/);
    assert.match(clock, /generation !== configLoadGeneration/);
    assert.doesNotMatch(clock, /store\.load\(\)/);
    assert.match(cpu, /await _cfgStore\.loadAsync\(\)/);
    assert.match(cpu, /generation !== activityConfigGeneration/);
    assert.doesNotMatch(cpu, /_cfgStore\.load\(\)/);
});
