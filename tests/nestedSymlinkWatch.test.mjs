import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';

const helper = await readFile(new URL('../lib/realPath.js', import.meta.url), 'utf8');
const config = await readFile(new URL('../lib/configStore.js', import.meta.url), 'utf8');
const theme = await readFile(new URL('../lib/theme.js', import.meta.url), 'utf8');

test('shared resolver walks each path component and restarts after every symlink', () => {
    assert.match(helper, /for \(let hop = 0; hop < maxHops; hop\+\+\)/);
    assert.match(helper, /for \(let i = 0; i < parts\.length; i\+\+\)/);
    assert.match(helper, /GLib\.file_read_link\(prefix\)/);
    assert.match(helper, /current = GLib\.canonicalize_filename\(/);
    assert.match(helper, /seen\.has\(current\)/);
});

test('both config and Matugen watchers use the shared nested-symlink resolver', () => {
    assert.match(config, /import \{resolveSymlinkPath\} from '\.\/realPath\.js';/);
    assert.match(config, /const realDir = resolveSymlinkPath\(dirPath\)/);
    assert.match(theme, /import \{resolveSymlinkPath\} from '\.\/realPath\.js';/);
    assert.match(theme, /function resolveRealDir\(dirPath\) \{\s*return resolveSymlinkPath\(dirPath\);/);
});
