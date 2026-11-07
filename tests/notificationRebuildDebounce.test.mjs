import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';

const source = await readFile(new URL('../modules/notifications.js', import.meta.url), 'utf8');
const start = source.indexOf('export function buildNotifications(');
const build = source.slice(start);

test('notification search rebuild is debounced rather than run for every keystroke', () => {
    assert.match(build, /const scheduleSearchRebuild = \(\) => \{[\s\S]*?GLib\.timeout_add\(GLib\.PRIORITY_DEFAULT, 120/);
    assert.match(build, /text-changed',[\s\S]*?scheduleSearchRebuild\(\)/);
});

test('dismiss and clear rebuild timers are tracked and cancelled at teardown', () => {
    assert.match(build, /const rebuildTimerIds = new Set\(\)/);
    assert.match(build, /const scheduleRebuild = \(delay = 40\)/);
    assert.match(build, /cancelRebuildTimers\(\)/);
    assert.match(build, /button\.connect\('destroy', \(\) => \{\s*destroyed = true;\s*cancelRebuildTimers\(\)/);
    assert.doesNotMatch(build, /GLib\.timeout_add\(GLib\.PRIORITY_DEFAULT, (40|60), \(\) => \{\s*rebuild\(\)/);
});

test('notification rebuild and count callbacks become no-ops after destruction', () => {
    assert.match(build, /const rebuild = \(\) => \{\s*if \(destroyed\)\s*return;/);
    assert.match(build, /if \(destroyed\)\s*return GLib\.SOURCE_REMOVE;/);
});
