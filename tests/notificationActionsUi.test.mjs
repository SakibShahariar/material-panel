import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';

const source = await readFile(new URL('../modules/notifications.js', import.meta.url), 'utf8');

test('notification view data reads native action objects defensively', () => {
    assert.ok(source.includes("import {getNotificationActions, activateNotificationAction} from '../lib/notificationActions.js'"));
    assert.ok(source.includes('actions: getNotificationActions(n)'));
});

test('notification cards render only extracted native action labels as focusable buttons', () => {
    assert.ok(source.includes('if (item.actions?.length)'));
    assert.ok(source.includes('for (const actionEntry of item.actions)'));
    assert.ok(source.includes('label: actionEntry.label'));
    assert.ok(source.includes("style_class: 'material-panel-nc-action'"));
    assert.ok(source.includes('can_focus: true'));
    assert.ok(source.includes('setChipA11y(actionButton, actionEntry.label)'));
});

test('native action clicks are isolated from the parent card and checked against current tray state', () => {
    assert.ok(source.includes("actionButton.connect('button-press-event', () => Clutter.EVENT_STOP)"));
    assert.ok(source.includes('activateNotificationAction('));
    assert.ok(source.includes('current => current.notification === notification'));
    assert.ok(source.includes('scheduleRebuild(activated ? 40 : 0)'));
});

test('notification cards retain their existing primary activation and dismissal paths', () => {
    assert.ok(source.includes('item.notification?.activate?.()'));
    assert.ok(source.includes('destroyNotification(item.notification)'));
    assert.ok(source.includes('key === Clutter.KEY_Delete || key === Clutter.KEY_BackSpace'));
});
