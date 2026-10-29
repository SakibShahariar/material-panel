import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';

const source = await readFile(new URL('../modules/battery.js', import.meta.url), 'utf8');

test('battery chip uses its imported shared icon press helper', () => {
    assert.match(source, /import \{wireFileIconPress\} from '\.\.\/lib\/pressFx\.js'/);
    assert.match(source, /wireFileIconPress\(button, \(\) => \[\{icon, key: currentKey\}\]\)/);
    assert.doesNotMatch(source, /wireChipPress\(/);
});

test('battery chip keeps its accessible name', () => {
    assert.match(source, /setChipA11y\(button, 'Battery'\)/);
});
