import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';

const source = await readFile(new URL('../modules/notifications.js', import.meta.url), 'utf8');
const start = source.indexOf('const makeCard = item => {');
const card = source.slice(start, start + 6000);

test('notification cards are focusable and expose an app/title accessible name', () => {
    assert.ok(card.includes('can_focus: true'));
    assert.ok(card.includes('setChipA11y(card, `Notification from ${item.appName'));
});

test('notification cards support keyboard activation and dismissal without removing pointer support', () => {
    assert.ok(card.includes("card.connect('key-press-event'"));
    assert.ok(card.includes('Clutter.KEY_Return'));
    assert.ok(card.includes('Clutter.KEY_KP_Enter'));
    assert.ok(card.includes('Clutter.KEY_space'));
    assert.ok(card.includes('Clutter.KEY_Delete'));
    assert.ok(card.includes('Clutter.KEY_BackSpace'));
    assert.ok(card.includes("card.connect('button-press-event'"));
    assert.ok(card.includes('event.get_button() === 3'));
});

test('dismiss control is labelled with the sending app', () => {
    assert.ok(card.includes('material-panel-nc-dismiss'));
    assert.ok(card.includes('setChipA11y(dismiss, `Dismiss notification from ${item.appName'));
});
