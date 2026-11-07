import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';

const source = await readFile(new URL('../modules/notifications.js', import.meta.url), 'utf8');
const start = source.indexOf('const makeCard = item => {');
const end = source.indexOf('\n    let filterText =', start);
const card = source.slice(start, end);

test('notification cards are focusable and expose an app/title accessible name', () => {
    assert.ok(card.includes('can_focus: true'));
    assert.ok(card.includes('setChipA11y(card, `Notification from ${accessibleApp}: ${accessibleTitle}`)'));
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
