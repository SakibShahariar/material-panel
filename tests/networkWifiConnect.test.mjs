import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';

const source = await readFile(new URL('../modules/network.js', import.meta.url), 'utf8');

test('unsaved Wi-Fi access points can be activated through NetworkManager', () => {
    assert.match(source, /client\.add_and_activate_connection_async\(/);
    assert.match(source, /null, wifiDevice, accessPointPath, null/);
    assert.match(source, /accessPoint\?\.get_path\?\.\(\)/);
    assert.match(source, /new PopupMenu\.PopupMenuItem\(label, \{reactive: true\}\)/);
    const entryStart = source.indexOf('const label = connection');
    const entryEnd = source.indexOf('networksSection.addMenuItem(item)', entryStart);
    const entry = source.slice(entryStart, entryEnd);
    assert.match(entry, /item\.connect\('activate', \(\) => activate\(connection, entry\.ap, info\.ssid\)\)/);
    assert.ok(entry.indexOf('item.connect') > entry.indexOf('if (connection && connection.get_uuid() === activeId)'));
});

test('new Wi-Fi connection state and authentication failures are reported', () => {
    assert.match(source, /add_and_activate_connection_finish\(res\)/);
    assert.match(source, /NM\.ActiveConnectionState\.ACTIVATED/);
    assert.match(source, /NM\.ActiveConnectionState\.DEACTIVATED/);
    assert.match(source, /Check the password or network security/);
});

test('Wi-Fi credentials are delegated to NetworkManager and never handled by panel config', () => {
    assert.match(source, /registered secret agent/);
    assert.match(source, /never reads or persists Wi-Fi credentials itself/);
    assert.doesNotMatch(source, /new St\.PasswordEntry/);
    assert.doesNotMatch(source, /SettingWirelessSecurity/);
});
