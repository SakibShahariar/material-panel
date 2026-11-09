import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';

const source = await readFile(new URL('../prefs/quickLaunchPage.js', import.meta.url), 'utf8');

test('Quick Launch command validation rejects empty, oversized, and control-character input', () => {
    assert.match(source, /value\.length > 512/);
    assert.ok(source.includes('u0000'), 'command input must reject control characters');
    assert.match(source, /GLib\.shell_parse_argv\(value\)/);
});

test('editing a command rejects duplicates without excluding the current entry', () => {
    assert.match(source, /item\.id !== entry\.id && item\.type === 'command' && item\.target === value/);
    assert.match(source, /That command is already in Quick Launch/);
});

test('adding and editing commands share the same bounded parser validation', () => {
    assert.match(source, /entry\.type === 'command' && !commandIsValid\(GLib, value\)/);
    assert.match(source, /!target \|\| !commandIsValid\(GLib, target\)/);
});


test('Quick Launch toggle off commands use the same bounded no-shell validator', () => {
    assert.match(source, /offTarget && !commandIsValid\(GLib, offTarget\)/);
    assert.match(source, /offTarget\.length|commandIsValid\(GLib, offTarget\)/);
    assert.match(source, /Use a different command for the off action/);
});
