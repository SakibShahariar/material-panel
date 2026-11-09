import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';

const page = await readFile(new URL('../prefs/worldClockPage.js', import.meta.url), 'utf8');
const prefs = await readFile(new URL('../prefs.js', import.meta.url), 'utf8');

test('World Clock preferences are isolated in a focused page builder', () => {
    assert.match(page, /export function buildWorldClockPage/);
    assert.match(page, /parseWorldClockZoneTab/);
    assert.match(page, /\/usr\/share\/zoneinfo\/zone\.tab/);
    assert.match(page, /normalizeWorldClockEntries/);
    assert.match(page, /parseWorldClockEntries/);
    assert.match(page, /current\.length >= 12/);
    assert.match(page, /isSyncingExternal\(\)/);
    assert.match(page, /already saved/);
});

test('World Clock page remains composed by the existing General preferences page', () => {
    assert.match(prefs, /buildWorldClockPage\(\{Adw, Gtk, GLib, config, saveConfig, window, groupParent: generalPage\}\)/);
});
