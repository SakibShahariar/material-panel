import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';

test('battery popup uses the shared title header before its hero card', async () => {
    const source = await readFile(new URL('../modules/battery.js', import.meta.url), 'utf8');
    assert.match(source, /import \{createPopupHeader\} from '..\/lib\/popupHeader\.js';/);
    assert.match(source, /titleActor: popupTitle/);
    assert.match(source, /styleClass: 'material-panel-battery-popup-header'/);
    assert.match(source, /wrap\.add_child\(popupHeader\);\s*\n\s*const hero/);
});
