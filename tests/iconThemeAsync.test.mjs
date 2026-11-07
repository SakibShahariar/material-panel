import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';

const source = await readFile(new URL('../lib/iconTheme.js', import.meta.url), 'utf8');
const start = source.indexOf('export function applyIcons(');
const apply = source.slice(start);
const writeStart = source.indexOf('function writeRecoloredAsync(');
const writeEnd = source.indexOf('\n/** Path for key', writeStart);
const write = source.slice(writeStart, writeEnd);

test('icon generation uses asynchronous source reads and atomic asynchronous writes', () => {
    assert.match(apply, /load_contents_async\(/);
    assert.match(apply, /load_contents_finish\(result\)/);
    assert.match(write, /replace_contents_async\(/);
    assert.match(write, /replace_contents_finish\(result\)/);
    assert.doesNotMatch(apply, /\.load_contents\(/);
    assert.doesNotMatch(write, /\.replace_contents\(/);
});

test('icon generation waits for all three variants before notifying theme application', () => {
    assert.match(apply, /\['plain'|plain/);
    assert.match(apply, /\['on-accent'|on-accent/);
    assert.match(apply, /\['primary'|primary/);
    assert.match(apply, /pendingWrites/);
    assert.match(apply, /callback\?\.\(\)/);
});

test('old icon generations are cleaned up asynchronously', () => {
    assert.match(source, /cleanupOldGenerationsAsync\(\)/);
    assert.match(source, /enumerate_children_async\(/);
    assert.match(source, /delete_async\(/);
});
