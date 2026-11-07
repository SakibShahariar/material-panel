import assert from 'node:assert/strict';
import test from 'node:test';
import {
    CLIPBOARD_HISTORY_MAX_AGE_SECONDS,
    CLIPBOARD_HISTORY_MAX_ENTRIES,
    CLIPBOARD_HISTORY_MAX_TEXT_BYTES,
    addClipboardHistoryEntry,
    formatClipboardHistoryPreview,
    normalizeClipboardHistory,
    normalizeClipboardText,
    parseClipboardHistory,
    removeClipboardHistoryEntry,
    serializeClipboardHistory,
} from '../lib/clipboardHistoryState.js';

const now = 1_800_000_000;

test('clipboard text accepts plain non-empty text and enforces UTF-8 byte limit', () => {
    assert.equal(normalizeClipboardText(' hello\n'), ' hello\n');
    assert.equal(normalizeClipboardText('  \n'), null);
    assert.equal(normalizeClipboardText('bad\0text'), null);
    assert.equal(normalizeClipboardText('x'.repeat(CLIPBOARD_HISTORY_MAX_TEXT_BYTES + 1)), null);
    assert.equal(normalizeClipboardText('x'.repeat(CLIPBOARD_HISTORY_MAX_TEXT_BYTES))?.length,
        CLIPBOARD_HISTORY_MAX_TEXT_BYTES);
});

test('history normalization removes malformed, expired, future, duplicate and excess entries', () => {
    const entries = [
        {id: 'new', text: 'newest', createdAt: now},
        {id: 'duplicate', text: 'newest', createdAt: now - 1},
        {id: 'expired', text: 'expired', createdAt: now - CLIPBOARD_HISTORY_MAX_AGE_SECONDS - 1},
        {id: 'future', text: 'future', createdAt: now + 301},
        {id: 'bad', text: '', createdAt: now},
        ...Array.from({length: CLIPBOARD_HISTORY_MAX_ENTRIES + 5}, (_, i) => ({
            id: String(i), text: `item-${i}`, createdAt: now - i - 1,
        })),
    ];
    const result = normalizeClipboardHistory(entries, now);
    assert.equal(result.length, CLIPBOARD_HISTORY_MAX_ENTRIES);
    assert.equal(result[0].text, 'newest');
    assert.equal(result.some(entry => entry.text === 'expired'), false);
    assert.equal(result.some(entry => entry.text === 'future'), false);
    assert.equal(new Set(result.map(entry => entry.text)).size, result.length);
});

test('adding a new entry deduplicates existing text and caps history', () => {
    const base = Array.from({length: CLIPBOARD_HISTORY_MAX_ENTRIES}, (_, i) => ({
        id: String(i), text: `item-${i}`, createdAt: now - i,
    }));
    const duplicate = addClipboardHistoryEntry(base, 'item-3', {now, id: 'duplicate'});
    assert.equal(duplicate.added, false);
    assert.equal(duplicate.entries.length, CLIPBOARD_HISTORY_MAX_ENTRIES);

    const added = addClipboardHistoryEntry(base, 'fresh', {now, id: 'fresh-id'});
    assert.equal(added.added, true);
    assert.equal(added.entries.length, CLIPBOARD_HISTORY_MAX_ENTRIES);
    assert.equal(added.entries[0].text, 'fresh');
    assert.equal(added.entries.some(entry => entry.text === 'item-49'), false);
});

test('removing an entry does not mutate the caller array', () => {
    const entries = [{id: 'one', text: 'one', createdAt: now}];
    const result = removeClipboardHistoryEntry(entries, 'one', now);
    assert.deepEqual(result, []);
    assert.equal(entries.length, 1);
});

test('versioned history round-trips and rejects unsupported or malformed formats', () => {
    const entries = [{id: 'one', text: 'synthetic sample', createdAt: now}];
    const serialized = serializeClipboardHistory(entries, now);
    assert.deepEqual(parseClipboardHistory(serialized, now), entries);
    assert.throws(() => parseClipboardHistory('{"version":2,"entries":[]}'), /unsupported format/);
    assert.throws(() => parseClipboardHistory('[]'), /unsupported format/);
    assert.throws(() => parseClipboardHistory('not json'), SyntaxError);
});

test('normalization keeps the newest entries even when stored oldest-first', () => {
    const entries = Array.from({length: CLIPBOARD_HISTORY_MAX_ENTRIES + 5}, (_, i) => ({
        id: String(i), text: `ordered-${i}`, createdAt: now - (CLIPBOARD_HISTORY_MAX_ENTRIES + 5 - i),
    }));
    const result = normalizeClipboardHistory(entries, now);
    assert.equal(result.length, CLIPBOARD_HISTORY_MAX_ENTRIES);
    assert.equal(result[0].text, 'ordered-54');
    assert.equal(result.at(-1).text, 'ordered-5');
});

test('user retention limits can only reduce the built-in safety bounds', () => {
    const entries = Array.from({length: 12}, (_, i) => ({
        id: String(i), text: `limited-${i}`, createdAt: now - i * 86400,
    }));
    const result = normalizeClipboardHistory(entries, now, {maxEntries: 4, maxAgeSeconds: 3 * 86400});
    assert.equal(result.length, 4);
    assert.equal(result[0].text, 'limited-0');
    assert.equal(result.at(-1).text, 'limited-3');
});

test('retention age limit is applied independently from entry count', () => {
    const entries = Array.from({length: 12}, (_, i) => ({
        id: String(i), text: `age-${i}`, createdAt: now - i * 86400,
    }));
    const result = normalizeClipboardHistory(entries, now, {maxEntries: 50, maxAgeSeconds: 3 * 86400});
    assert.equal(result.length, 4);
    assert.equal(result.at(-1).text, 'age-3');
});


test('clipboard history previews truncate by Unicode code point without splitting emoji', () => {
    const value = 'a'.repeat(68) + '😀' + 'b'.repeat(8);
    const preview = formatClipboardHistoryPreview(value);
    assert.equal(Array.from(preview).length, 72);
    assert.equal(preview, 'a'.repeat(68) + '😀' + 'b'.repeat(2) + '…');
    assert.equal(formatClipboardHistoryPreview('  hello\nworld  '), 'hello world');
    assert.equal(formatClipboardHistoryPreview('short 😀 text'), 'short 😀 text');
});


test('clipboard history preview handles empty text and one-code-point limits', () => {
    assert.equal(formatClipboardHistoryPreview(' \n\t '), '');
    assert.equal(formatClipboardHistoryPreview('😀x', 1), '…');
    assert.equal(formatClipboardHistoryPreview('😀x', 2), '😀x');
});
