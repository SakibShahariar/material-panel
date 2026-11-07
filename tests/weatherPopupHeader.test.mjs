import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';

test('weather popup places its current location and source in the shared header', async () => {
    const source = await readFile(new URL('../modules/weather.js', import.meta.url), 'utf8');
    assert.match(source, /createPopupHeader\(/);
    assert.match(source, /titleActor: placeLbl/);
    assert.match(source, /statusActor: sourceLbl/);
    assert.match(source, /body\.add_child\(header\)/);
    assert.doesNotMatch(source, /body\.add_child\(sourceLbl\)/);
});
