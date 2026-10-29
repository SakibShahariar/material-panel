import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';

const theme = await readFile(new URL('../lib/theme.js', import.meta.url), 'utf8');
const extension = await readFile(new URL('../extension.js', import.meta.url), 'utf8');
const watchStart = theme.indexOf('    watch(sourcePath, onChange) {');
const watchEnd = theme.indexOf('\n    unwatch() {', watchStart);
const watch = theme.slice(watchStart, watchEnd);

test('Matugen watcher is reused for the same source and replaced for a new source', () => {
    assert.match(watch, /if \(this\._watchedSource === sourcePath && this\._monitor\)\s*return;/);
    assert.match(watch, /this\.unwatch\(\);/);
    assert.match(watch, /this\._watchedSource = sourcePath;/);
    assert.match(watch, /this\._monitor\.connect\('changed'/);
});

test('theme teardown and switching to fixed colors cancel Matugen watching', () => {
    assert.match(theme, /destroy\(\) \{\s*this\.unwatch\(\)/);
    assert.match(extension, /Do not keep watching a palette file after switching to fixed colors\.[\s\S]*?this\._theme\.unwatch\(\)/);
});
