import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';

const source = await readFile(new URL('../modules/bluetooth.js', import.meta.url), 'utf8');

test('Bluetooth rfkill retry timers are tracked and guarded after teardown', () => {
    for (const id of ['rfkillRetryId', 'rfkillResetId', 'contextRetryId']) {
        assert.match(source, new RegExp('let ' + id + ' = 0'));
        assert.match(source, new RegExp(id + ' = GLib\\.timeout_add'));
        assert.match(source, new RegExp(id + ' = 0;'));
    }
    assert.match(source, /button\.connect\('destroy',[\s\S]*?destroyed = true;[\s\S]*?GLib\.source_remove\(id\)/);
    assert.equal((source.match(/if \(!destroyed\)\s+discover\(\);/g) || []).length, 2);
});
