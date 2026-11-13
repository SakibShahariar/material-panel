import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {addAndActivateWifiConnection, createWifiActivationGate, reportWifiActivationStatus} from '../lib/wifiConnection.js';

const source = await readFile(new URL('../modules/network.js', import.meta.url), 'utf8');

test('network module documentation describes both saved and unsaved Wi-Fi paths', () => {
    assert.match(source, /Saved profiles are reactivated directly/);
    assert.match(source, /unsaved access points are[\s\S]*session secret-agent flow/);
    assert.doesNotMatch(source, /not attempted here/);
});

test('unsaved Wi-Fi access points are connected through the shared NetworkManager adapter', () => {
    assert.match(source, /import \{addAndActivateWifiConnection, createWifiActivationGate\} from '..\/lib\/wifiConnection\.js'/);
    assert.match(source, /addAndActivateWifiConnection\(client, wifiDevice, accessPoint/);
    assert.match(source, /onStarted: activeConnection => \{\s+activationCancellables\.delete\(cancellable\);\s+watchActivation\(activeConnection, ssid, finishActivation\);/);
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

test('NetworkManager adapter rejects malformed D-Bus object paths before dispatch', () => {
    const calls = [];
    const client = {
        add_and_activate_connection_async(...args) { calls.push(args); },
    };
    const errors = [];
    for (const path of ['', '/', 'not/an/object/path', '/org//NetworkManager/AP/1',
        '/org/freedesktop/NetworkManager/AP/invalid-name', '/org/freedesktop/NetworkManager/AP/']) {
        assert.equal(addAndActivateWifiConnection(client, {}, {get_path: () => path}, {
            onError: error => errors.push(error.message),
        }), false);
    }
    assert.equal(calls.length, 0);
    assert.equal(errors.length, 6);
    assert.ok(errors.every(message => /access point path is invalid or unavailable/i.test(message)));
});

test('NetworkManager adapter treats a throwing access-point path accessor as unavailable', () => {
    const errors = [];
    const accessPoint = Object.defineProperty({}, 'get_path', {
        get() { throw new Error('proxy is unavailable'); },
    });
    const client = {add_and_activate_connection_async() {
        assert.fail('invalid access point must not be dispatched');
    }};
    assert.equal(addAndActivateWifiConnection(client, {}, accessPoint, {
        onError: error => errors.push(error.message),
    }), false);
    assert.match(errors[0], /access point path is invalid or unavailable/i);
});

test('NetworkManager adapter routes a consumer start-callback failure to its error handler', () => {
    const active = {id: 'active'};
    const client = {
        add_and_activate_connection_async(_profile, _device, _path, _cancellable, callback) {
            callback(this, {});
        },
        add_and_activate_connection_finish() { return active; },
    };
    let failure = null;
    assert.equal(addAndActivateWifiConnection(client, {}, {
        get_path: () => '/org/freedesktop/NetworkManager/AccessPoint/11',
    }, {
        onStarted() { throw new Error('consumer callback failed'); },
        onError(error) { failure = error; },
    }), true);
    assert.equal(failure?.message, 'consumer callback failed');
});

test('Wi-Fi activation watcher disconnects before touching a destroyed popup', () => {
    const watcherStart = source.indexOf('const watchActivation = (activeConnection, ssid, onSettled = () => {}) => {');
    const start = source.indexOf('const updateActivation = () => {', watcherStart);
    const end = source.indexOf('            };', start);
    assert.ok(watcherStart >= 0 && start > watcherStart && end > start);
    const watcher = source.slice(watcherStart, start);
    const callback = source.slice(start, end);
    assert.match(watcher, /const finish = \(\) => \{[\s\S]*?disconnect\(\);/);
    assert.ok(callback.includes('if (destroyed) {'));
    assert.ok(callback.includes('finish();'));
    assert.ok(callback.indexOf('finish();') < callback.indexOf('let state;'));
    assert.ok(source.includes('for (const disconnect of activationSignals)'));
});

test('NetworkManager adapter isolates exceptions thrown by consumer error callbacks', () => {
    const invalidResult = () => addAndActivateWifiConnection({}, {}, {}, {
        onError() { throw new Error('UI callback failed'); },
    });
    assert.doesNotThrow(() => assert.equal(invalidResult(), false));

    const client = {
        add_and_activate_connection_async(_profile, _device, _path, _cancellable, callback) {
            callback(this, {});
        },
        add_and_activate_connection_finish() { return {id: 'active'}; },
    };
    assert.doesNotThrow(() => addAndActivateWifiConnection(client, {}, {
        get_path: () => '/org/freedesktop/NetworkManager/AccessPoint/12',
    }, {
        onStarted() { throw new Error('consumer start callback failed'); },
        onError() { throw new Error('consumer error callback failed'); },
    }));
});

test('NetworkManager adapter delivers activation completion only once', () => {
    const active = {id: 'active'};
    let finishCalls = 0;
    let startedCalls = 0;
    const errors = [];
    const client = {
        add_and_activate_connection_async(_profile, _device, _path, _cancellable, callback) {
            callback(this, {attempt: 1});
            callback(this, {attempt: 2});
        },
        add_and_activate_connection_finish() {
            finishCalls++;
            return active;
        },
    };

    assert.equal(addAndActivateWifiConnection(client, {}, {
        get_path: () => '/org/freedesktop/NetworkManager/AccessPoint/21',
    }, {
        onStarted(value) {
            assert.equal(value, active);
            startedCalls++;
        },
        onError(error) { errors.push(error.message); },
    }), true);
    assert.equal(finishCalls, 1);
    assert.equal(startedCalls, 1);
    assert.deepEqual(errors, []);
});

test('NetworkManager adapter ignores a late dispatch exception after successful completion', () => {
    const active = {id: 'active'};
    const errors = [];
    const client = {
        add_and_activate_connection_async(_profile, _device, _path, _cancellable, callback) {
            callback(this, {});
            throw new Error('late dispatch exception');
        },
        add_and_activate_connection_finish() { return active; },
    };

    assert.equal(addAndActivateWifiConnection(client, {}, {
        get_path: () => '/org/freedesktop/NetworkManager/AccessPoint/22',
    }, {
        onStarted(value) { assert.equal(value, active); },
        onError(error) { errors.push(error.message); },
    }), true);
    assert.deepEqual(errors, []);
});


test('NetworkManager adapter forwards a cancellable for unsaved access-point activation', () => {
    const calls = [];
    const cancellable = {cancel() {}};
    const client = {
        add_and_activate_connection_async(...args) { calls.push(args); },
    };
    assert.equal(addAndActivateWifiConnection(client, {}, {
        get_path: () => '/org/freedesktop/NetworkManager/AccessPoint/23',
    }, {cancellable}), true);
    assert.equal(calls.length, 1);
    assert.equal(calls[0][3], cancellable);
});

test('saved and unsaved Wi-Fi activation are cancellable and stop on chip teardown', () => {
    assert.ok(source.includes('const activationCancellables = new Set();'));
    assert.ok(source.includes('activate_connection_async(connection, wifiDevice, null, cancellable'));
    assert.match(source, /if \(connection\) \{\s+setScanStatus\(`Connecting to \$\{ssid\}…`\);/);
    assert.ok(source.includes('const activeConnection = c.activate_connection_finish(res)'));
    assert.ok(source.includes('watchActivation(activeConnection, ssid, finishActivation)'));
    assert.ok(source.includes('addAndActivateWifiConnection(client, wifiDevice, accessPoint, {\n                cancellable,'));

    const destroyStart = source.indexOf("button.connect('destroy', () => {");
    const destroyEnd = source.indexOf('\n    });', destroyStart);
    assert.ok(destroyStart >= 0 && destroyEnd > destroyStart);
    const destroy = source.slice(destroyStart, destroyEnd);
    assert.ok(destroy.includes('for (const cancellable of activationCancellables)'));
    assert.ok(destroy.includes('cancellable.cancel()'));
    assert.ok(destroy.includes('activationCancellables.clear()'));
});


test('Wi-Fi activation gate suppresses duplicate requests until completion or teardown', () => {
    const gate = createWifiActivationGate();
    assert.equal(gate.begin('access-point:/org/freedesktop/NetworkManager/AccessPoint/23'), true);
    assert.equal(gate.begin('access-point:/org/freedesktop/NetworkManager/AccessPoint/23'), false);
    assert.equal(gate.begin('connection:profile-1'), true);
    assert.equal(gate.finish('access-point:/org/freedesktop/NetworkManager/AccessPoint/23'), true);
    assert.equal(gate.begin('access-point:/org/freedesktop/NetworkManager/AccessPoint/23'), true);
    assert.equal(gate.clear(), 2);
    assert.equal(gate.finish('connection:profile-1'), false);
});

test('network popup gates duplicate saved and unsaved activations and releases pending keys on terminal states', () => {
    assert.match(source, /const activationGate = createWifiActivationGate\(\)/);
    assert.match(source, /const activationKey = getActivationKey\(connection, accessPoint, ssid\)/);
    assert.match(source, /if \(!activationGate\.begin\(activationKey\)\)\s+return/);
    assert.match(source, /watchActivation\(activeConnection, ssid, finishActivation\)/);
    assert.match(source, /finishActivation\(\);/);
    assert.match(source, /activationGate\.clear\(\)/);
});


test('Wi-Fi activation status failures cannot interrupt the connection lifecycle', () => {
    const errors = [];
    let completed = false;
    assert.equal(reportWifiActivationStatus(
        () => { throw new Error('popup was destroyed'); },
        'Connecting to network',
        error => errors.push(error.message),
    ), false);
    completed = true;
    assert.equal(completed, true);
    assert.deepEqual(errors, ['popup was destroyed']);
});

test('Wi-Fi activation status error reporting is itself isolated', () => {
    let updated = null;
    assert.equal(reportWifiActivationStatus(value => { updated = value; }, 'Connected'), true);
    assert.equal(updated, 'Connected');
    assert.doesNotThrow(() => reportWifiActivationStatus(
        () => { throw new Error('popup unavailable'); },
        'Failed',
        () => { throw new Error('logging unavailable'); },
    ));
});
