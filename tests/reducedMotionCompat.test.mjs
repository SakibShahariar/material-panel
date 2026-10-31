import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';

const source = await readFile(new URL('../lib/shellCompat.js', import.meta.url), 'utf8');

test('pre-Shell-51 reduced motion follows GNOME animation preference', () => {
    assert.ok(source.includes("if (SHELL_MAJOR < 51) {"));
    assert.ok(source.includes("Gio.Settings.new('org.gnome.desktop.interface')"));
    assert.ok(source.includes("_interfaceSettings.get_boolean('enable-animations')"));
    assert.ok(source.includes('return !_interfaceSettings.get_boolean'));
});

test('Shell 51+ reduced motion keeps the St.Settings path', () => {
    assert.ok(source.includes('const {reducedMotion} = St.Settings.get()'));
    assert.ok(source.includes('St.ReducedMotion.REDUCE'));
});

test('menu open and close transitions honor reduced-motion preference', () => {
    const guardedFlags = source.match(/const a = !!animate && !prefersReducedMotion\(\);/g) || [];
    assert.equal(guardedFlags.length, 2);
});
