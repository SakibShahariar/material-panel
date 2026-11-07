import assert from 'node:assert/strict';
import test from 'node:test';

import {
    getNotificationActions,
    activateNotificationAction,
} from '../lib/notificationActions.js';

test('extracts native actions with their original labels and preserves order', () => {
    const first = {label: 'Reply', activate() {}};
    const second = {label: 'Archive', activate() {}};
    assert.deepEqual(getNotificationActions({actions: [first, second]}), [
        {action: first, label: 'Reply'},
        {action: second, label: 'Archive'},
    ]);
});

test('ignores missing, malformed, blank, and non-activatable actions', () => {
    const valid = {label: 'Open', activate() {}};
    assert.deepEqual(getNotificationActions({actions: [
        null,
        {},
        {label: '   ', activate() {}},
        {label: 'No callback'},
        valid,
    ]}), [{action: valid, label: 'Open'}]);
});

test('supports notifications with absent, non-array, or throwing action properties', () => {
    assert.deepEqual(getNotificationActions(null), []);
    assert.deepEqual(getNotificationActions({}), []);
    assert.deepEqual(getNotificationActions({actions: {length: 1}}), []);
    assert.deepEqual(getNotificationActions(Object.defineProperty({}, 'actions', {
        get() { throw new Error('unsupported'); },
    })), []);
});

test('limits inline actions and rejects invalid limits', () => {
    const actions = Array.from({length: 5}, (_, i) => ({
        label: 'Action ' + i,
        activate() {},
    }));
    assert.deepEqual(getNotificationActions({actions}, 3).map(x => x.label), [
        'Action 0', 'Action 1', 'Action 2',
    ]);
    assert.deepEqual(getNotificationActions({actions}, 0), []);
    assert.deepEqual(getNotificationActions({actions}, 1.5), []);
});

test('deduplicates the same native action object', () => {
    const action = {label: 'Open', activate() {}};
    assert.deepEqual(getNotificationActions({actions: [action, action]}), [
        {action, label: 'Open'},
    ]);
});

test('activates only a still-present action on a still-current notification', () => {
    let activations = 0;
    const action = {label: 'Reply', activate() { activations++; }};
    const notification = {actions: [action]};
    assert.equal(activateNotificationAction(notification, action, current => current === notification), true);
    assert.equal(activations, 1);
    assert.equal(activateNotificationAction(notification, action, () => false), false);
    assert.equal(activations, 1);
});

test('rejects removed actions and handles native activation failures', () => {
    const removed = {label: 'Removed', activate() { assert.fail('removed action must not run'); }};
    const notification = {actions: []};
    assert.equal(activateNotificationAction(notification, removed, () => true), false);

    const failure = new Error('native action failed');
    const broken = {label: 'Broken', activate() { throw failure; }};
    notification.actions = [broken];
    const errors = [];
    assert.equal(activateNotificationAction(
        notification, broken, () => true, error => errors.push(error)), false);
    assert.deepEqual(errors, [failure]);
});

test('rejects a missing notification-current predicate without invoking actions', () => {
    let activated = false;
    const action = {label: 'Run', activate() { activated = true; }};
    assert.equal(activateNotificationAction({actions: [action]}, action), false);
    assert.equal(activated, false);
});
