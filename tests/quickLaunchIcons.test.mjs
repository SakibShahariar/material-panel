import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');

test('Quick Launch Preferences can add and edit optional symbolic icon names', async () => {
    const source = await read('../prefs/quickLaunchPage.js');
    assert.match(source, /title: 'Symbolic icon name \\(optional\\)'/);
    assert.match(source, /const iconEditor = new Gtk\\.Entry/);
    assert.match(source, /current\\.icon = icon/);
    assert.match(source, /delete current\\.icon/);
    assert.match(source, /iconIsValid\\(icon\\)/);
});

test('Quick Launch buttons render configured icons alongside the shortcut label', async () => {
    const source = await read('../modules/quickLaunch.js');
    assert.match(source, /if \\(entry\\.icon\\)/);
    assert.match(source, /new St\\.Icon\\(\\{[\\s\\S]*?icon_name: entry\\.icon/);
    assert.match(source, /content\\.add_child\\(new St\\.Label\\(\\{[\\s\\S]*?text: entry\\.name/);
    assert.match(source, /setChipA11y\\(button, available/);
});
