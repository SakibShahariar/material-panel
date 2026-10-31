import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';

const source = await readFile(new URL('../modules/quicksettingsEnd4.js', import.meta.url), 'utf8');

test('End-4 Quick Settings header icon buttons have accessible names', () => {
    assert.ok(source.includes("mkBtn('document-edit-symbolic', openPrefs, 'Edit panel preferences')"));
    assert.ok(source.includes("mkBtn('emblem-system-symbolic', openPrefs, 'Open panel preferences')"));
    assert.ok(source.includes("'Power off'));"));
    assert.ok(source.includes('setChipA11y(b, accessibleName)'));
});

test('hidden End-4 Dark Mode tile is not constructed or connected to settings', () => {
    assert.match(source, /const darkRound = showDarkMode \? makeRoundToggle\(/);
    assert.match(source, /if \(darkRound\) row0\.add_child\(darkRound\)/);
});

test('End-4 only opens settings backends for enabled toggle tiles', () => {
    assert.match(source, /const iface = showDarkMode \? new Gio\.Settings/);
    assert.match(source, /if \(showDnd\) \{\s*try \{ dndSettings = new Gio\.Settings/);
    assert.match(source, /if \(showNightLight\) \{\s*try \{ nlSettings = new Gio\.Settings/);
});
