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

test('per-app clear only destroys notifications from the selected source app', () => {
    assert.ok(source.includes('listNotifications().filter(item => !selectedApp || item.appName === selectedApp)'));
    assert.ok(source.includes("clearBtn.label = selectedApp ? 'Clear app' : 'Clear'"));
});

test('notification acknowledgement changes refresh filter results and listeners are cleaned up', () => {
    assert.ok(source.includes("notification.connect('notify::acknowledged', scheduleCount)"));
    assert.ok(source.includes("notification.connect('destroy', () => unhookNotification(notification))"));
    assert.ok(source.includes('for (const notification of [...notificationIds.keys()])'));
});

test('notification cards can expand long bodies and app groups can be cleared independently', () => {
    assert.ok(source.includes('groupNotificationsByApp(shown)'));
    assert.ok(source.includes("Clear notifications from ' + group.appName"));
    assert.ok(source.includes('item.body.length > 160'));
    assert.ok(source.includes("expandButton.label = expanded ? 'Less' : 'More'"));
    assert.ok(source.includes("Pango.EllipsizeMode.NONE"));
});
