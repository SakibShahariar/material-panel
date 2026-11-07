import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';

const source = await readFile(new URL('../prefs/quickLaunchPage.js', import.meta.url), 'utf8');

test('Quick Launch command validation rejects empty, oversized, and control-character input', () => {
    assert.match(source, /value\.length > 512/);
    assert.match(source, /\\\\u0000-\\\\u001f\\\\u007f/);
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
