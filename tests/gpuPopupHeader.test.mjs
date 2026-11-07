import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';

test('GPU popup uses the shared header before its metric rows', async () => {
    const source = await readFile(new URL('../modules/gpu.js', import.meta.url), 'utf8');
    assert.match(source, /import \{createPopupHeader\} from '..\/lib\/popupHeader\.js';/);
    assert.match(source, /createPopupHeader\(\{\s*titleActor: title,/);
    assert.match(source, /styleClass: 'material-panel-gpu-popup-header'/);
    assert.match(source, /body\.add_child\(popupHeader\);\s*body\.add_child\(nameL\);/);
});
