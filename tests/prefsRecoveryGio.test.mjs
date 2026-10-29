import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';

const source = await readFile(new URL('../prefs.js', import.meta.url), 'utf8');

test('configuration recovery Open folder has the Gio import it uses', () => {
    assert.match(source, /import Gio from 'gi:\/\/Gio';/);
    assert.match(source, /Gio\.AppInfo\.launch_default_for_uri\(/);
    assert.match(source, /Gio\.File\.new_for_path\(folder\)\.get_uri\(\)/);
});
