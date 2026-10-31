import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {
    CLOCK_DISPLAY_MODES,
    formatClockDisplay,
    nextClockDisplayMode,
    normalizeClockDisplayMode,
} from '../lib/clockDisplay.js';

const dateTime = {
    format(pattern) {
        const formats = {
            '%H:%M': '14:05',
            '%-I:%M %p': '2:05 PM',
            '%a, %d %b': 'Sat, 31 Oct',
            '%A, %d %B': 'Saturday, 31 October',
        };
        return formats[pattern] ?? '';
    },
};

test('clock display mode cycles through the three requested formats', () => {
    assert.deepEqual(CLOCK_DISPLAY_MODES, ['time', 'date-time', 'weekday-date-time']);
    assert.equal(nextClockDisplayMode('date-time'), 'weekday-date-time');
    assert.equal(nextClockDisplayMode('weekday-date-time'), 'time');
    assert.equal(nextClockDisplayMode('time'), 'date-time');
    assert.equal(nextClockDisplayMode('invalid'), 'weekday-date-time');
});

test('clock formatter respects 12/24-hour preference and End-4 ordering', () => {
    assert.equal(formatClockDisplay(dateTime, false, 'time'), '14:05');
    assert.equal(formatClockDisplay(dateTime, true, 'time'), '2:05 PM');
    assert.equal(formatClockDisplay(dateTime, false, 'date-time'), 'Sat, 31 Oct  14:05');
    assert.equal(formatClockDisplay(dateTime, false, 'date-time', true), '14:05 · Sat, 31 Oct');
    assert.equal(formatClockDisplay(dateTime, false, 'weekday-date-time'), 'Saturday, 31 October  14:05');
});

test('invalid display mode falls back to the existing date-and-time format', () => {
    assert.equal(normalizeClockDisplayMode('invalid'), 'date-time');
});

test('clock cycling is opt-in and retains a calendar access path', async () => {
    const [config, prefs, clock] = await Promise.all([
        readFile(new URL('../lib/configStore.js', import.meta.url), 'utf8'),
        readFile(new URL('../prefs.js', import.meta.url), 'utf8'),
        readFile(new URL('../modules/clock.js', import.meta.url), 'utf8'),
    ]);
    assert.ok(config.includes('clockClickCyclesFormat: false'));
    assert.ok(prefs.includes("title: 'Click to cycle display format'"));
    assert.ok(prefs.includes('config.clockClickCyclesFormat = clockClickSwitch.active'));
    assert.ok(clock.includes('displayMode = nextClockDisplayMode(displayMode)'));
    assert.ok(clock.includes('event.get_button() !== 3'));
    assert.ok(clock.includes('formatClockDisplay('));
});
