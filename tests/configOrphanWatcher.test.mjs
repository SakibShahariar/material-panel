import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';

const source = await readFile(new URL('../lib/configStore.js', import.meta.url), 'utf8');

test('orphan cleanup marks its own serialized config write for watcher suppression', () => {
    assert.match(source, /this\.save\(merged, \{suppressWatcher: true\}\)/);
    assert.match(source, /save\(config, \{suppressWatcher = false\} = \{\}\)/);
    assert.match(source, /if \(suppressWatcher\)\s*this\._selfWriteContent = text;/);
});

test('config watcher ignores only an unchanged self-written snapshot', () => {
    assert.match(source, /if \(!isLegacyDir && this\._selfWriteContent !== null\)/);
    assert.match(source, /if \(currentText === this\._selfWriteContent\)\s*return;/);
    assert.match(source, /this\._selfWriteContent = null;/);
    assert.match(source, /await this\._readContentsAsync\(homeFile\)/);
    assert.match(source, /const config = await this\.loadAsync\(\)/);
    assert.match(source, /this\._callback\(config\)/);
});
