import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';

const source = await readFile(new URL('../lib/simpleSlider.js', import.meta.url), 'utf8');
const start = source.indexOf('function styleCursor(');
const end = source.indexOf('\n//  Builder:', start + 10);
const cursor = source.slice(start, end > start ? end : undefined);

test('cursor slider repaints the resting right cap before applying near-full highlight', () => {
    assert.match(cursor, /update\(v\)\s*\{\s*v = clamp01\(v\);\s*paint\(\);[\s\S]*?if \(v > 0\.98\)[\s\S]*?css\(capR/);
    assert.match(cursor, /background-color: \$\{surfaceSolid\(\)\};[\s\S]*?border: 2px solid \$\{outlineSoft\(0\.4\)\}/);
});
