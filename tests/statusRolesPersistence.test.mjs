import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';

const source = await readFile(new URL('../lib/statusAreaBridge.js', import.meta.url), 'utf8');
const start = source.indexOf('    _persistRolesFile()');
const end = source.indexOf('\n    getUnclaimedRoles()', start);
const persistence = source.slice(start, end);

test('status role persistence is debounced instead of writing synchronously per event', () => {
    assert.match(persistence, /this\._later\(250, \(\) => \{/);
    assert.doesNotMatch(persistence, /\.replace_contents\(/);
    assert.doesNotMatch(persistence, /\.query_exists\(/);
});

test('status role writes are asynchronous and serialized to preserve the latest snapshot', () => {
    assert.match(persistence, /replace_contents_async\(/);
    assert.match(persistence, /replace_contents_finish\(result\)/);
    assert.match(persistence, /_rolesWriteInFlight/);
    assert.match(persistence, /_rolesWritePending/);
    assert.match(persistence, /this\._writeRolesFileAsync\(\)/);
});
