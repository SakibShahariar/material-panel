import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';

const source = await readFile(new URL('../modules/powermenu.js', import.meta.url), 'utf8');

test('power menu uses the shared popup title header', () => {
    assert.match(source, /import \{createPopupHeader\} from '\.\.\/lib\/popupHeader\.js';/);
    assert.match(source, /text: 'Power'/);
    assert.match(source, /createPopupHeader\(\{titleActor: headerTitle\}\)/);
    assert.match(source, /headerItem\.add_child\(header\.actor\)/);
    assert.match(source, /menu\.addMenuItem\(headerItem\)/);
});

test('power actions and destructive-action confirmation remain unchanged', () => {
    for (const label of ['Lock', 'Suspend', 'Restart', 'Shut Down'])
        assert.ok(source.includes("label: '" + label + "'"));
    assert.match(source, /confirmAndRun\(/);
    assert.match(source, /runPowerAction\(label, argv\)/);
});
