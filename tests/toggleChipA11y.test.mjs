import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';

const modules = await Promise.all([
    readFile(new URL('../modules/darkmode.js', import.meta.url), 'utf8'),
    readFile(new URL('../modules/dnd.js', import.meta.url), 'utf8'),
    readFile(new URL('../modules/nightlight.js', import.meta.url), 'utf8'),
]);
const [dark, dnd, night] = modules;

test('Dark Mode, DND and Night Light expose stateful accessible names', () => {
    assert.match(dark, /setChipA11y\(button, `Dark mode, \$\{on \? 'on' : 'off'\}`\)/);
    assert.match(dnd, /setChipA11y\(button, `Do not disturb, \$\{on \? 'on' : 'off'\}`\)/);
    assert.match(night, /setChipA11y\(button, `Night light, \$\{on \? 'on' : 'off'\}`\)/);
});

test('toggle chips use safe bundled-icon lookup, themed fallbacks, and shared press feedback', () => {
    for (const source of modules) {
        assert.match(source, /giconForKey\(/);
        assert.match(source, /wireFileIconPress\(/);
        assert.match(source, /press\.applyIcons\?\.\(\)/);
        assert.match(source, /icon_name = fileIcon \? '' :/);
    }
});

test('external GSettings changes refresh icon and accessible state', () => {
    assert.match(dark, /changed::color-scheme', update/);
    assert.match(dnd, /changed::show-banners', update/);
    assert.match(night, /changed::night-light-enabled', update/);
});
