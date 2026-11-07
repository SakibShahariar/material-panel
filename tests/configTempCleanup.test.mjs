import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';

const source = await readFile(new URL('../lib/configStore.js', import.meta.url), 'utf8');
const start = source.indexOf('    save(config,');
const end = source.indexOf('\n    // Live-reload', start);
const save = source.slice(start, end);

test('failed atomic config replacement deletes the temporary file and rethrows', () => {
    assert.match(save, /try \{\s*tmp\.move\(file, Gio\.FileCopyFlags\.OVERWRITE, null, null\);\s*\} catch \(e\)/);
    assert.match(save, /try \{ tmp\.delete\(null\); \} catch \(cleanupError\)/);
    assert.match(save, /logError\(e, 'material-panel: atomic config replacement failed'\)/);
    assert.match(save, /throw e;/);
});

test('successful config saves retain the temp-then-move atomic replacement', () => {
    assert.match(save, /tmp\.replace_contents\(/);
    assert.match(save, /tmp\.move\(file, Gio\.FileCopyFlags\.OVERWRITE, null, null\)/);
    assert.match(save, /if \(suppressWatcher\)\s*this\._selfWriteContent = text;/);
});
