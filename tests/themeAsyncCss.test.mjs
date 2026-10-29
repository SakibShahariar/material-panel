import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';

const source = await readFile(new URL('../lib/theme.js', import.meta.url), 'utf8');
const readStart = source.indexOf('    _loadMatugenCssAsync(');
const readEnd = source.indexOf('\n    // Maps matugen', readStart);
const readMethod = source.slice(readStart, readEnd);
const writeStart = source.indexOf('    _writeGeneratedAsync(');
const writeEnd = source.indexOf('\n    _reloadStylesheet(', writeStart);
const writeMethod = source.slice(writeStart, writeEnd);

test('Matugen CSS is read with GIO asynchronous APIs', () => {
    assert.match(readMethod, /load_contents_async\(/);
    assert.match(readMethod, /load_contents_finish\(result\)/);
    assert.doesNotMatch(readMethod, /load_contents\(/);
    assert.doesNotMatch(readMethod, /query_exists\(/);
});

test('generated stylesheet writes are asynchronous and serialize latest theme updates', () => {
    assert.match(writeMethod, /replace_contents_async\(/);
    assert.match(writeMethod, /replace_contents_finish\(result\)/);
    assert.match(writeMethod, /_writeInFlight/);
    assert.match(writeMethod, /_pendingWrite/);
    assert.match(writeMethod, /generation === this\._applyGeneration/);
    assert.doesNotMatch(writeMethod, /\.replace_contents\(/);
});

test('theme apply supersedes stale asynchronous palette reads', () => {
    assert.match(source, /const generation = \+\+this\._applyGeneration/);
    assert.match(source, /if \(generation !== this\._applyGeneration\)\s*return;/);
});
