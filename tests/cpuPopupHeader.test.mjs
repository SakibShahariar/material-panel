import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';

test('CPU activity popup uses the shared title and metric-status hierarchy', async () => {
    const source = await readFile(new URL('../modules/cpu.js', import.meta.url), 'utf8');
    assert.match(source, /createPopupHeader\(/);
    assert.match(source, /titleActor: headerTitle/);
    assert.match(source, /statusActor: headerStatus/);
    assert.match(source, /headerStatus\.add_child\(summary\)/);
    assert.match(source, /headerStatus\.add_child\(tempUnavailableState\.actor\)/);
});
