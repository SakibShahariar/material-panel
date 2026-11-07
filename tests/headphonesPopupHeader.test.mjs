import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';

test('headphones popup uses the shared header before its connected-device list', async () => {
    const source = await readFile(new URL('../modules/btConnected.js', import.meta.url), 'utf8');
    assert.match(source, /import \{createPopupHeader\} from '..\/lib\/popupHeader\.js';/);
    assert.match(source, /createPopupHeader\(\{\s*titleActor: title,/);
    assert.match(source, /styleClass: 'material-panel-headphones-popup-header'/);
    assert.match(source, /body\.add_child\(popupHeader\);\s*\n\s*const listBox/);
    assert.match(source, /menu\.addMenuItem\(settingsItem\)/);
});
