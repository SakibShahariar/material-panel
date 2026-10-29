import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';

const source = await readFile(new URL('../lib/trayDrawer.js', import.meta.url), 'utf8');

test('empty tray drawer cannot open and hides the chevron and count', () => {
    assert.match(source, /open\(\)\s*\{\s*if \(this\.host\.get_n_children\(\) === 0\)\s*return;/);
    assert.match(source, /this\._countLabel\.visible = n > 0;/);
    assert.match(source, /this\.chevron\.visible = n > 0;/);
    assert.match(source, /this\.root\.visible = n > 0;/);
});

test('tray drawer restores visibility when the first child is added', () => {
    assert.match(source, /this\.host\.connect\('actor-added', \(\) => this\._updateCount\(\)\)/);
    assert.match(source, /this\.root\.visible = n > 0;/);
    assert.match(source, /this\._countLabel\.text = String\(n\);/);
});
