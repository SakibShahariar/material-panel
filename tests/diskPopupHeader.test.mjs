import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';

test('storage popup uses the shared header before its filesystem metrics', async () => {
    const source = await readFile(new URL('../modules/disk.js', import.meta.url), 'utf8');
    assert.match(source, /import \{createPopupHeader\} from '..\/lib\/popupHeader\.js';/);
    assert.match(source, /createPopupHeader\(\{\s*titleActor: title,/);
    assert.match(source, /styleClass: 'material-panel-disk-popup-header'/);
    assert.match(source, /body\.add_child\(popupHeader\);\s*body\.add_child\(rootL\);/);
});
