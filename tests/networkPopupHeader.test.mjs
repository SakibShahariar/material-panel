import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';

test('network popup places live connection status in the shared header before Wi-Fi controls', async () => {
    const source = await readFile(new URL('../modules/network.js', import.meta.url), 'utf8');
    assert.match(source, /import \{createPopupHeader\} from '..\/lib\/popupHeader\.js';/);
    assert.match(source, /titleActor: networkTitle/);
    assert.match(source, /statusActor: connectionStatus/);
    assert.match(source, /connectionStatus\.text = 'Offline'/);
    assert.match(source, /connectionStatus\.text = type\.includes\('wireless'\) \? 'Wi-Fi connected'/);
    assert.match(source, /menu\.addMenuItem\(networkHeaderItem\);\s*const primaryConnId/);
    assert.match(source, /menu\.addMenuItem\(wifiToggle\)/);
});
