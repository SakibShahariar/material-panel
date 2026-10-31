import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';

const source = await readFile(new URL('../lib/end4QsExtras.js', import.meta.url), 'utf8');
const notificationStart = source.indexOf('export function buildEnd4NotiSection()');
const calendarStart = source.indexOf('export function buildEnd4CalendarSection()');
const notifications = source.slice(notificationStart, calendarStart);
const calendar = source.slice(calendarStart);

test('End-4 notification cards are focusable buttons with app/title accessible names', () => {
    assert.match(notifications, /new St\.Button\(\{[\s\S]*?can_focus: true/);
    assert.match(notifications, /setChipA11y\(card, `Notification from \$\{appName\}: \$\{notificationTitle\}`\)/);
    assert.match(notifications, /card\.connect\('clicked'/);
    assert.ok(!notifications.includes("row.connect('button-press-event'"));
});

test('End-4 calendar navigation buttons have accessible names', () => {
    assert.ok(calendar.includes("setChipA11y(prev, 'Previous month')"));
    assert.ok(calendar.includes("setChipA11y(next, 'Next month')"));
});

test('End-4 calendar day buttons announce the date and contextual state', () => {
    assert.ok(calendar.includes('new Intl.DateTimeFormat(locale,'));
    assert.ok(calendar.includes("weekday: 'long'"));
    assert.ok(calendar.includes("setChipA11y(dayBtn, [dateLabel, ...dayState].join(', '))"));
    assert.ok(calendar.includes("isToday ? 'today' : ''"));
    assert.ok(calendar.includes("isSelected ? 'selected' : ''"));
    assert.ok(calendar.includes("hasEvents ? 'has events' : ''"));
});
