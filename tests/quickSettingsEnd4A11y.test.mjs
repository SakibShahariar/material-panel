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
