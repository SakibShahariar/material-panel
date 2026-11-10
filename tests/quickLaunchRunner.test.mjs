import assert from 'node:assert/strict';
import test from 'node:test';

import {launchQuickLaunchEntry} from '../lib/quickLaunchRunner.js';

const command = {id: 'cmd-1', type: 'command', target: 'btop --utf-force', name: 'btop'};
const appEntry = {id: 'app-1', type: 'app', target: 'org.gnome.Terminal.desktop', name: 'Terminal'};

test('launches an installed application with the native desktop-app API', () => {
    const calls = [];
    const result = launchQuickLaunchEntry(appEntry, {
        getDesktopAppInfo: id => { calls.push(['lookup', id]); return {launch: (...args) => { calls.push(['launch', ...args]); return true; }}; },
        parseCommand: () => assert.fail('application entries must not be parsed as commands'),
        spawnCommand: () => assert.fail('application entries must not spawn commands'),
    });
    assert.equal(result, true);
    assert.deepEqual(calls, [['lookup', appEntry.target], ['launch', [], null]]);
});

test('reports an application that disappeared after configuration', () => {
    const errors = [];
    const result = launchQuickLaunchEntry(appEntry, {
        getDesktopAppInfo: () => null,
        parseCommand: () => [],
        spawnCommand: () => {},
        onError: (entry, error) => errors.push({entry, message: error.message}),
    });
    assert.equal(result, false);
    assert.deepEqual(errors, [{entry: appEntry, message: 'This application is no longer installed.'}]);
});

test('reports a native application launch failure', () => {
    const errors = [];
    const result = launchQuickLaunchEntry(appEntry, {
        getDesktopAppInfo: () => ({launch: () => false}),
        onError: (_entry, error) => errors.push(error.message),
    });
    assert.equal(result, false);
    assert.deepEqual(errors, ['GNOME could not start this application.']);
});

test('parses commands to argv and dispatches them directly to the spawn adapter', () => {
    const calls = [];
    const argv = ['btop', '--utf-force'];
    const result = launchQuickLaunchEntry(command, {
        getDesktopAppInfo: () => assert.fail('command entries must not use desktop-app lookup'),
        parseCommand: value => { calls.push(['parse', value]); return argv; },
        spawnCommand: value => calls.push(['spawn', value]),
    });
    assert.equal(result, true);
    assert.deepEqual(calls, [['parse', command.target], ['spawn', argv]]);
});

test('rejects an empty parsed command without spawning', () => {
    const errors = [];
    let spawned = false;
    const result = launchQuickLaunchEntry(command, {
        parseCommand: () => [],
        spawnCommand: () => { spawned = true; },
        onError: (_entry, error) => errors.push(error.message),
    });
    assert.equal(result, false);
    assert.equal(spawned, false);
    assert.deepEqual(errors, ['Enter an executable followed by optional arguments.']);
});

test('reports parser and process-start errors without throwing into the UI callback', () => {
    const errors = [];
    const parseResult = launchQuickLaunchEntry(command, {
        parseCommand: () => { throw new Error('invalid quoting'); },
        spawnCommand: () => assert.fail('must not spawn after parse failure'),
        onError: (_entry, error) => errors.push(error.message),
    });
    const spawnResult = launchQuickLaunchEntry(command, {
        parseCommand: () => ['missing-command'],
        spawnCommand: () => { throw new Error('not found'); },
        onError: (_entry, error) => errors.push(error.message),
    });
    assert.equal(parseResult, false);
    assert.equal(spawnResult, false);
    assert.deepEqual(errors, ['invalid quoting', 'not found']);
});

test('rejects unknown entry types safely', () => {
    const errors = [];
    const result = launchQuickLaunchEntry({...command, type: 'script'}, {
        onError: (_entry, error) => errors.push(error.message),
    });
    assert.equal(result, false);
    assert.deepEqual(errors, ['Unsupported quick-launch entry type.']);
});


test('dispatches the selected off command and forwards asynchronous completion', () => {
    const calls = [];
    let finish = null;
    const completed = [];
    const offCommand = 'nmcli radio wifi off';
    const result = launchQuickLaunchEntry({...command, offTarget: offCommand}, {
        commandTarget: offCommand,
        parseCommand: value => { calls.push(['parse', value]); return ['nmcli', 'radio', 'wifi', 'off']; },
        spawnCommand: (argv, callback) => { calls.push(['spawn', argv]); finish = callback; },
        onComplete: (success, error) => completed.push([success, error?.message ?? null]),
    });
    assert.equal(result, true);
    assert.deepEqual(calls, [
        ['parse', offCommand],
        ['spawn', ['nmcli', 'radio', 'wifi', 'off']],
    ]);
    assert.deepEqual(completed, []);
    finish(true);
    assert.deepEqual(completed, [[true, null]]);
});

test('forwards asynchronous completion only once when the spawn adapter repeats its callback', () => {
    let finish = null;
    const completed = [];
    const result = launchQuickLaunchEntry(command, {
        parseCommand: () => ['btop'],
        spawnCommand: (_argv, callback) => { finish = callback; },
        onComplete: (success, error) => completed.push([success, error?.message ?? null]),
    });
    assert.equal(result, true);
    finish(true);
    finish(false, new Error('duplicate completion'));
    assert.deepEqual(completed, [[true, null]]);
});

test('does not report a contradictory spawn error after completion was already delivered', () => {
    const completed = [];
    const errors = [];
    const result = launchQuickLaunchEntry(command, {
        parseCommand: () => ['btop'],
        spawnCommand: (_argv, callback) => {
            callback(true);
            throw new Error('late adapter error');
        },
        onComplete: (success, error) => completed.push([success, error?.message ?? null]),
        onError: (_entry, error) => errors.push(error.message),
    });
    assert.equal(result, true);
    assert.deepEqual(completed, [[true, null]]);
    assert.deepEqual(errors, []);
});

test('reports an unsuccessful asynchronous toggle command without changing success state', () => {
    const errors = [];
    let finish = null;
    const result = launchQuickLaunchEntry({...command, offTarget: 'nmcli radio wifi off'}, {
        commandTarget: 'nmcli radio wifi off',
        parseCommand: () => ['nmcli', 'radio', 'wifi', 'off'],
        spawnCommand: (_argv, callback) => { finish = callback; },
        onComplete: (success, error) => errors.push([success, error.message]),
    });
    assert.equal(result, true);
    finish(false, new Error('non-zero exit'));
    assert.deepEqual(errors, [[false, 'non-zero exit']]);
});
