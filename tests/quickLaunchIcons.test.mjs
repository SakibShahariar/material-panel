import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');

test('Quick Launch Preferences can add and edit optional symbolic icon names', async () => {
    const source = await read('../prefs/quickLaunchPage.js');
    assert.ok(source.includes("title: 'Symbolic icon name (optional)'"));
    assert.ok(source.includes('const iconEditor = new Gtk.Entry'));
    assert.ok(source.includes('current.icon = icon'));
    assert.ok(source.includes('delete current.icon'));
    assert.ok(source.includes('iconIsValid(icon)'));
});

test('Quick Launch buttons render configured icons alongside the shortcut label', async () => {
    const source = await read('../modules/quickLaunch.js');
    assert.ok(source.includes('const iconActor = entry.icon || isToggle ? new St.Icon({'));
    assert.ok(source.includes('new St.Icon({'));
    assert.ok(source.includes('icon_name: entry.icon || (active ?'));
    assert.ok(source.includes('text: entry.name'));
    assert.ok(source.includes('setChipA11y(button'));
});


test('Quick Launch toggles reflect only successful command completion and expose state accessibly', async () => {
    const [module, state] = await Promise.all([
        read('../modules/quickLaunch.js'), read('../lib/quickLaunchState.js'),
    ]);
    assert.match(module, /const isToggle = entry\.type === 'command' && Boolean\(entry\.offTarget\)/);
    assert.match(module, /const nextActive = !active/);
    assert.match(module, /if \(success && setQuickLaunchEntryState\(entry\.id, nextActive, \{/);
    assert.match(module, /target: entry\.target,[\s\S]*?offTarget: entry\.offTarget/);
    assert.match(module, /emblem-ok-symbolic/);
    assert.match(module, /system-run-symbolic/);
    assert.match(module, /\$\{active \? 'on' : 'off'\}/);
    assert.match(state, /activeStates/);
});
