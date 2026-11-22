import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';

const source = await readFile(new URL('../modules/notifications.js', import.meta.url), 'utf8');

test('notification view data reads native action objects defensively', () => {
    assert.ok(source.includes("import {getNotificationActions, activateNotificationAction} from '../lib/notificationActions.js'"));
    assert.ok(source.includes('actions: getNotificationActions(n)'));
});

test('detail view renders extracted native action labels as buttons', () => {
    assert.ok(source.includes('if (item.actions?.length)'));
    assert.ok(source.includes('for (const entry of item.actions)'));
    assert.ok(source.includes("label: entry.label"));
    assert.ok(source.includes("style_class: 'material-panel-nc-detail-action'"));
});

test('native action clicks are checked against current tray state', () => {
    assert.ok(source.includes('c => c.notification === n'));
    assert.ok(source.includes('activateNotificationAction('));
    assert.ok(source.includes('closeDetail();'));
});

test('notification cards retain activation, dismissal and keyboard paths', () => {
    assert.ok(source.includes('detailItem.notification?.activate?.()'));
    assert.ok(source.includes('destroyNotification(item.notification)'));
    assert.ok(source.includes('key === Clutter.KEY_Delete || key === Clutter.KEY_BackSpace'));
    assert.ok(source.includes("card.connect('key-press-event'"));
});

test('notification popup has a custom header with DND and Clear actions', () => {
    assert.match(source, /material-panel-nc-surface/);
    assert.match(source, /headerTitle/);
    assert.match(source, /dndBtn/);
    assert.match(source, /clearBtn/);
});

test('focused card keyboard events do not bubble and open the detail view', () => {
    assert.match(source, /card\.connect\('key-press-event',[\s\S]*?if \(!card\.has_key_focus\(\)\)[\s\S]*?return Clutter\.EVENT_PROPAGATE;[\s\S]*?showDetail\(item\)/);
});
