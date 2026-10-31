import assert from 'node:assert/strict';
import test from 'node:test';
import {
    filterNotifications,
    hasUnreadNotificationState,
    notificationAppNames,
} from '../lib/notificationFilters.js';

const items = [
    {appName: 'Mail', title: 'New message', body: 'Build finished', unread: true},
    {appName: 'Browser', title: 'Download complete', body: 'Report.pdf', unread: false},
    {appName: 'Mail', title: 'Calendar invite', body: 'Tomorrow', unread: null},
];

test('notification app filters are unique, trimmed, and consistently sorted', () => {
    assert.deepEqual(notificationAppNames(items), ['Browser', 'Mail']);
});

test('unread filter is only available when notifications expose acknowledgement state', () => {
    assert.equal(hasUnreadNotificationState(items), true);
    assert.equal(hasUnreadNotificationState([{unread: null}]), false);
    assert.equal(hasUnreadNotificationState([]), false);
});

test('app, unread, and text filters combine without overriding one another', () => {
    assert.deepEqual(
        filterNotifications(items, {appName: 'Mail', unreadOnly: true, query: 'build'}),
        [items[0]],
    );
    assert.deepEqual(
        filterNotifications(items, {appName: 'Mail', query: 'calendar'}),
        [items[2]],
    );
    assert.deepEqual(
        filterNotifications(items, {unreadOnly: true}),
        [items[0]],
    );
    assert.deepEqual(
        filterNotifications(items, {query: 'pdf'}),
        [items[1]],
    );
});
