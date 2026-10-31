import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';

const source = await readFile(new URL('../modules/notifications.js', import.meta.url), 'utf8');

test('notification center exposes app filters and conditionally exposes unread filtering', () => {
    assert.match(source, /notificationAppNames\\(items\\)/);
    assert.match(source, /hasUnreadNotificationState\\(items\\)/);
    assert.match(source, /addFilterButton\\('all', 'All apps'/);
    assert.match(source, /addFilterButton\\('unread', 'Unread'/);
    assert.match(source, /filterScroll\\.visible = apps\\.length > 0 \\|\\| supportsUnread/);
});

test('notification app, unread, and search filters are applied together', () => {
    assert.match(source, /filterNotifications\\(items, \\{query: filterText, appName: selectedApp, unreadOnly\\}\\)/);
    assert.match(source, /unread: typeof n\\.acknowledged === 'boolean' \\? !n\\.acknowledged : null/);
});

test('per-app clear only destroys notifications from the selected source app', () => {
    assert.match(source, /listNotifications\\(\\)\\.filter\\(item => !selectedApp \\|\\| item\\.appName === selectedApp\\)/);
    assert.match(source, /selectedApp \\? 'Clear app' : 'Clear'/);
});

test('notification acknowledgement changes refresh the open filter results and listeners are cleaned up', () => {
    assert.match(source, /notification\\.connect\\('notify::acknowledged', scheduleCount\\)/);
    assert.match(source, /notification\\.connect\\('destroy', \\(\\) => unhookNotification\\(notification\\)\\)/);
    assert.match(source, /for \\(const notification of \\[\\.\\.\\.notificationIds\\.keys\\(\\)\\]\\)/);
});
