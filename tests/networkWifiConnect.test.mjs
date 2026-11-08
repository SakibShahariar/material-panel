import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {addAndActivateWifiConnection} from '../lib/wifiConnection.js';

const source = await readFile(new URL('../modules/network.js', import.meta.url), 'utf8');

test('network module documentation describes both saved and unsaved Wi-Fi paths', () => {
    assert.match(source, /Saved profiles are reactivated directly/);
    assert.match(source, /unsaved access points are[\\s\\S]*session secret-agent flow/);
    assert.doesNotMatch(source, /not attempted here/);
});

test('unsaved Wi-Fi access points are connected through the shared NetworkManager adapter', () => {
    assert.match(source, /import \{addAndActivateWifiConnection\} from '..\/lib\/wifiConnection\.js'/);
    assert.match(source, /addAndActivateWifiConnection\(client, wifiDevice, accessPoint/);
    assert.match(source, /onStarted: activeConnection => watchActivation\(activeConnection, ssid\)/);
    const entryStart = source.indexOf('const label = connection');
    const entryEnd = source.indexOf('networksSection.addMenuItem(item)', entryStart);
    const entry = source.slice(entryStart, entryEnd);
    assert.match(entry, /item\.connect\('activate', \(\) => activate\(connection, entry\.ap, info\.ssid\)\)/);
    assert.ok(entry.indexOf('item.connect') > entry.indexOf('if (connection && connection.get_uuid() === activeId)'));
});

test('new Wi-Fi connection state and authentication failures are reported', () => {
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

test('NetworkManager adapter passes no credential-bearing partial profile and the selected AP path', async () => {
    const calls = [];
    const active = {id: 'active'};
    const client = {
        add_and_activate_connection_async(...args) { calls.push(args); },
        add_and_activate_connection_finish() { return active; },
    };
    const device = {id: 'wifi-device'};
    const accessPoint = {get_path: () => '/org/freedesktop/NetworkManager/AccessPoint/7'};
    let started = null;
    let failed = null;
    assert.equal(addAndActivateWifiConnection(client, device, accessPoint, {
        onStarted: value => { started = value; },
        onError: error => { failed = error; },
    }), true);
    assert.equal(calls.length, 1);
    assert.equal(calls[0][0], null);
    assert.equal(calls[0][1], device);
    assert.equal(calls[0][2], '/org/freedesktop/NetworkManager/AccessPoint/7');
    assert.equal(calls[0][3], null);
    calls[0][4](client, {});
    assert.equal(started, active);
    assert.equal(failed, null);
});

test('NetworkManager adapter reports finish errors and missing access-point paths', () => {
    const client = {
        add_and_activate_connection_async(_partial, _device, _path, _cancellable, callback) {
            callback(this, {});
        },
        add_and_activate_connection_finish() { throw new Error('authentication failed'); },
    };
    const errors = [];
    assert.equal(addAndActivateWifiConnection(client, {}, {get_path: () => '/ap/1'}, {
        onError: error => errors.push(error.message),
    }), true);
    assert.deepEqual(errors, ['authentication failed']);
    assert.equal(addAndActivateWifiConnection(client, {}, {}, {
        onError: error => errors.push(error.message),
    }), false);
    assert.match(errors[1], /access point path/i);
});

test('NetworkManager adapter reports synchronous dispatch failures', () => {
    const client = {
        add_and_activate_connection_async() {
            throw new Error('D-Bus unavailable');
        },
    };
    let failure = null;
    assert.equal(addAndActivateWifiConnection(client, {}, {
        get_path: () => '/org/freedesktop/NetworkManager/AccessPoint/9',
    }, {
        onError: error => { failure = error; },
    }), false);
    assert.equal(failure?.message, 'D-Bus unavailable');
});
