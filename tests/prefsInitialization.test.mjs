import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = path => readFile(new URL(path, root), 'utf8');

test('preferences load asynchronously and do not build pages after the window closes', async () => {
    const source = await read('prefs.js');
    assert.match(source, /const store = new ConfigStore\(\);[\s\S]*?let cancelled = false;/);
    assert.match(source, /store\.loadAsync\(\)\.then\(config => \{[\s\S]*?if \(cancelled\)\s*return;[\s\S]*?this\._buildPreferencesWindow/);
    assert.match(source, /window\.connect\('close-request',[\s\S]*?cancelled = true;/);
    assert.match(source, /\.catch\(error => \{[\s\S]*?title: 'Settings unavailable'/);
});
