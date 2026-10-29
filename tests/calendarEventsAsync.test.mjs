import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';

const calendar = await readFile(new URL('../lib/calendarEvents.js', import.meta.url), 'utf8');
const extras = await readFile(new URL('../lib/end4QsExtras.js', import.meta.url), 'utf8');

test('calendar cache uses asynchronous reads and memoizes the parsed document', () => {
    assert.ok(calendar.includes('export function loadCalendarDocumentAsync(callback)'));
    assert.ok(calendar.includes('file.load_contents_async(null'));
    assert.ok(calendar.includes('source.load_contents_finish(result)'));
    assert.ok(calendar.includes('cachedCalendarDocument !== undefined'));
    assert.ok(calendar.includes('calendarLoadInFlight'));
});

test('calendar cache invalidates on primary or legacy file changes and supports watchers', () => {
    assert.ok(calendar.includes('export function watchCalendarDocument(callback)'));
    assert.ok(calendar.includes('dir.monitor_directory('));
    assert.ok(calendar.includes('invalidateCalendarCache()'));
    assert.ok(calendar.includes('legacyEventsFilePath()'));
});

test('End-4 calendar updates only after asynchronous loading and disconnects on destroy', () => {
    assert.ok(extras.includes('loadCalendarDocumentAsync(document =>'));
    assert.ok(extras.includes('eventIndex = indexEventsByDate(document?.events || [])'));
    assert.ok(extras.includes('const stopWatchingCalendar = watchCalendarDocument('));
    assert.ok(extras.includes("outer.connect('destroy', () => {"));
    assert.ok(extras.includes('stopWatchingCalendar();'));
});
