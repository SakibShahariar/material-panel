import assert from 'node:assert/strict';
import test from 'node:test';

import {normalizeQuickLaunchEntries, QUICK_LAUNCH_LIMIT} from '../lib/quickLaunch.js';

test('keeps valid application and command entries in display order', () => {
    const entries = normalizeQuickLaunchEntries([
        {id: 'one', type: 'app', target: 'org.gnome.Terminal.desktop', name: 'Terminal'},
        {id: 'two', type: 'command', target: 'btop --utf-force', name: 'btop'},
    ]);
    assert.deepEqual(entries, [
        {id: 'one', type: 'app', target: 'org.gnome.Terminal.desktop', name: 'Terminal'},
        {id: 'two', type: 'command', target: 'btop --utf-force', name: 'btop'},
    ]);
});

test('preserves valid symbolic icon names and drops paths or malformed icon values', () => {
    assert.deepEqual(normalizeQuickLaunchEntries([
        {id: 'valid', type: 'app', target: 'org.gnome.Terminal.desktop', icon: 'utilities-terminal-symbolic'},
        {id: 'path', type: 'app', target: 'org.gnome.Terminal.desktop', icon: '/tmp/icon.svg'},
        {id: 'uri', type: 'app', target: 'org.gnome.Terminal.desktop', icon: 'file:///tmp/icon.svg'},
        {id: 'control', type: 'app', target: 'org.gnome.Terminal.desktop', icon: 'bad\\nicon'},
    ]), [
        {id: 'valid', type: 'app', target: 'org.gnome.Terminal.desktop', name: 'org.gnome.Terminal.desktop', icon: 'utilities-terminal-symbolic'},
        {id: 'path', type: 'app', target: 'org.gnome.Terminal.desktop', name: 'org.gnome.Terminal.desktop'},
        {id: 'uri', type: 'app', target: 'org.gnome.Terminal.desktop', name: 'org.gnome.Terminal.desktop'},
        {id: 'control', type: 'app', target: 'org.gnome.Terminal.desktop', name: 'org.gnome.Terminal.desktop'},
    ]);
});

test('drops malformed entries, duplicate IDs, invalid app IDs, and control characters', () => {
    assert.deepEqual(normalizeQuickLaunchEntries([
        null,
        {id: 'same', type: 'app', target: 'org.gnome.Terminal.desktop', name: 'Terminal'},
        {id: 'same', type: 'command', target: 'echo duplicate'},
        {id: 'bad-app', type: 'app', target: 'not-an-app'},
        {id: 'bad-command', type: 'command', target: 'echo ok\nshutdown'},
        {id: 'unknown', type: 'script', target: 'echo ok'},
        {id: '', type: 'command', target: 'echo ok'},
    ]), [
        {id: 'same', type: 'app', target: 'org.gnome.Terminal.desktop', name: 'Terminal'},
    ]);
});

test('uses safe fallback labels and caps the list', () => {
    const entries = Array.from({length: QUICK_LAUNCH_LIMIT + 3}, (_, i) => ({
        id: `id-${i}`,
        type: 'command',
        target: `echo ${i}`,
    }));
    const normalized = normalizeQuickLaunchEntries(entries);
    assert.equal(normalized.length, QUICK_LAUNCH_LIMIT);
    assert.equal(normalized[0].name, 'echo 0');
    assert.equal(normalized[0].target, 'echo 0');
});

test('sanitizes control characters and collapses whitespace in configured labels', () => {
    const entries = normalizeQuickLaunchEntries([
        {id: 'label-1', type: 'command', target: 'echo safe', name: '  Daily\n  task\t runner  '},
        {id: 'label-2', type: 'command', target: 'echo safe', name: 'Line\rbreak\u007f hidden'},
    ]);
    assert.equal(entries[0].name, 'Daily task runner');
    assert.equal(entries[1].name, 'Line break hidden');
    assert.ok(entries.every(entry => !/[\u0000-\u001f\u007f]/.test(entry.name)));
});

test('does not mutate the caller-owned configuration array', () => {
    const source = [{id: 'one', type: 'command', target: 'echo ok'}];
    normalizeQuickLaunchEntries(source);
    assert.deepEqual(source, [{id: 'one', type: 'command', target: 'echo ok'}]);
});

test('exports a bounded timeout for configured command actions', async () => {
    const {QUICK_LAUNCH_TIMEOUT_SECONDS: timeout} = await import('../lib/quickLaunch.js');
    assert.equal(timeout, 30);
    assert.ok(timeout > 0 && timeout <= 60);
});
