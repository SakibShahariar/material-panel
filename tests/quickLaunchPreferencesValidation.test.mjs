import assert from 'node:assert/strict';
import test from 'node:test';
import {isQuickLaunchCommandValid} from '../prefs/quickLaunchPage.js';
import {readFile} from 'node:fs/promises';

const source = await readFile(new URL('../prefs/quickLaunchPage.js', import.meta.url), 'utf8');

test('Quick Launch command validation rejects empty, oversized, and control-character input', () => {
    assert.match(source, /value\.length > 512/);
    assert.match(source, /hasUnsafeQuickLaunchCommandCharacters/);
    assert.match(source, /GLib\.shell_parse_argv\(value\)/);
});

test('editing a command rejects duplicates without excluding the current entry', () => {
    assert.match(source, /item\.id !== entry\.id && item\.type === 'command' && item\.target === value/);
    assert.match(source, /That command is already in Quick Launch/);
});

test('adding and editing commands share the same bounded parser validation', () => {
    assert.match(source, /entry\.type === 'command' && !isQuickLaunchCommandValid\(GLib, value\)/);
    assert.match(source, /!target \|\| !isQuickLaunchCommandValid\(GLib, target\)/);
});


test('Quick Launch toggle off commands use the same bounded no-shell validator', () => {
    assert.match(source, /offTarget && !isQuickLaunchCommandValid\(GLib, offTarget\)/);
    assert.match(source, /offTarget\.length|isQuickLaunchCommandValid\(GLib, offTarget\)/);
    assert.match(source, /Use a different command for the off action/);
});


test('Preferences command validation accepts ordinary user commands and rejects invisible controls', () => {
    const GLib = {
        shell_parse_argv(value) {
            return [true, value.trim().split(/\s+/)];
        },
    };
    assert.equal(isQuickLaunchCommandValid(GLib, 'systemctl --user restart pipewire'), true);
    for (const value of ['echo safe\u0001', 'echo safe\u0085', 'echo safe\u202e'])
        assert.equal(isQuickLaunchCommandValid(GLib, value), false);
});
