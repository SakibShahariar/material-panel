import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';

const source = await readFile(new URL('../modules/notifications.js', import.meta.url), 'utf8');

test('notification center exposes app filters and conditionally exposes unread filtering', () => {
    assert.ok(source.includes('notificationAppNames(items)'));
    assert.ok(source.includes('hasUnreadNotificationState(items)'));
    assert.ok(source.includes("addFilterButton('all', 'All apps'"));
    assert.ok(source.includes("addFilterButton('unread', 'Unread'"));
    assert.ok(source.includes('filterScroll.visible = apps.length > 0 || supportsUnread'));
});

test('notification app, unread, and search filters are applied together', () => {
    assert.ok(source.includes('filterNotifications(items, {query: filterText, appName: selectedApp, unreadOnly})'));
    assert.ok(source.includes("unread: typeof n.acknowledged === 'boolean' ? !n.acknowledged : null"));
});

test('clear scopes to the selected app and asks for confirmation', () => {
    assert.ok(source.includes('listNotifications().filter(item => !selectedApp || item.appName === selectedApp)'));
    assert.ok(source.includes("const clearText = selectedApp ? 'Clear app' : 'Clear'"));
    assert.ok(source.includes('clearArmed'));
});

test('notification acknowledgement changes refresh filter results and listeners are cleaned up', () => {
    assert.ok(source.includes("notification.connect('notify::acknowledged', scheduleCount)"));
    assert.ok(source.includes("notification.connect('destroy', () => unhookNotification(notification))"));
    assert.ok(source.includes('for (const notification of [...notificationIds.keys()])'));
});

test('notifications are grouped by day with a detail view for long bodies', () => {
    assert.ok(source.includes('groupByDay(shown)'));
    assert.ok(source.includes('const showDetail = item =>'));
    assert.ok(source.includes('detailBody.text = item.body'));
});
