import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';

const source = await readFile(new URL('../lib/theme.js', import.meta.url), 'utf8');
const start = source.indexOf('    apply(sourcePath,');
const end = source.indexOf('\n    watch(sourcePath', start);
const apply = source.slice(start, end);

test('theme apply key includes normalized Matugen/fallback variables and render inputs', () => {
    assert.ok(apply.includes('vars: Object.keys(vars).sort().map(key => [key, vars[key]])'));
    assert.ok(apply.includes('panelSize: Object.keys(panelSize ?? {}).sort().map(key => [key, panelSize[key]])'));
    assert.ok(apply.includes('layoutStyle,'));
    assert.ok(apply.includes('...fallback'));
});

test('unchanged theme inputs skip render and icon/stylesheet work only after a successful apply', () => {
    assert.match(apply, /if \(applyKey === this\._lastApplyKey && this\._loadedFile &&\s*!this\._writeInFlight && !this\._pendingWrite\)/);
    assert.match(apply, /const finishApply = success => \{\s*if \(success && generation === this\._applyGeneration\)\s*this\._lastApplyKey = applyKey/);
    assert.match(apply, /this\._writeGeneratedAsync\(css, generation, finishApply\)/);
    assert.match(source, /this\._lastApplyKey = null;/);
});

test('generated CSS cache remains as a second-level write deduplication guard', () => {
    assert.match(apply, /if \(css === this\._lastCss && this\._loadedFile && !this\._writeInFlight && !this\._pendingWrite\)/);
});
