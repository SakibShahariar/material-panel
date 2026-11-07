import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';

const source = await readFile(new URL('../modules/bluetooth.js', import.meta.url), 'utf8');

test('Bluetooth popup uses the shared header before its existing power and adapter controls', () => {
    assert.match(source, /import \{createPopupHeader\} from '..\/lib\/popupHeader\.js';/);
    assert.match(source, /const btHeader = createPopupHeader\(\{titleActor: btTitle, statusActor: btStatus\}\)/);
    assert.match(source, /const btHeaderItem = wrapAsMenuItem\(btHeader\.actor\)/);
    assert.match(source, /menu\.addMenuItem\(btHeaderItem\);\s*menu\.addMenuItem\(btSwitch\);\s*menu\.addMenuItem\(adapterMenu\);/);
});

test('Bluetooth header status reflects powered, blocked, missing-adapter and unavailable states', () => {
    for (const status of ['On', 'Off', 'Blocked by system', 'No adapter detected', 'BlueZ service unavailable'])
        assert.ok(source.includes(`btStatus.text = '${status}'`), `missing status: ${status}`);
});
