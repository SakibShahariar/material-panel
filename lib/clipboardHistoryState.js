export const CLIPBOARD_HISTORY_VERSION = 1;
export const CLIPBOARD_HISTORY_MAX_ENTRIES = 50;
export const CLIPBOARD_HISTORY_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;
export const CLIPBOARD_HISTORY_MAX_TEXT_BYTES = 256 * 1024;
export const CLIPBOARD_HISTORY_MAX_FILE_BYTES = 14 * 1024 * 1024;

const encoder = new TextEncoder();

export function clipboardTextByteLength(value) {
    return encoder.encode(String(value)).byteLength;
}

/** Format a bounded, single-line preview without splitting Unicode code points. */
export function formatClipboardHistoryPreview(value, maxCodePoints = 72) {
    const limit = Number.isSafeInteger(maxCodePoints) ? Math.max(1, maxCodePoints) : 72;
    const preview = String(value).replace(/[\u061C\u200E\u200F\u202A-\u202E\u2066-\u2069]/g, ' ').replace(/\s+/g, ' ').trim();
    const characters = Array.from(preview);
    return characters.length > limit
        ? `${characters.slice(0, Math.max(0, limit - 1)).join('')}…`
        : preview;
}

export function normalizeClipboardText(value) {
    if (typeof value !== 'string' || value.trim().length === 0 || value.includes('\0'))
        return null;
    if (clipboardTextByteLength(value) > CLIPBOARD_HISTORY_MAX_TEXT_BYTES)
        return null;
    return value;
}

function validTimestamp(value, now, maxAgeSeconds = CLIPBOARD_HISTORY_MAX_AGE_SECONDS) {
    return Number.isSafeInteger(value) && value > 0 &&
        value <= now + 300 &&
        now - value <= maxAgeSeconds;
}

export function normalizeClipboardHistory(entries, now = Math.floor(Date.now() / 1000), {maxEntries = CLIPBOARD_HISTORY_MAX_ENTRIES, maxAgeSeconds = CLIPBOARD_HISTORY_MAX_AGE_SECONDS} = {}) {
    if (!Array.isArray(entries))
        return [];

    const limit = Math.max(1, Math.min(CLIPBOARD_HISTORY_MAX_ENTRIES, Math.floor(Number(maxEntries) || CLIPBOARD_HISTORY_MAX_ENTRIES)));
    const seen = new Set();
    const normalized = [];
    for (const entry of entries) {
        if (!entry || typeof entry !== 'object' || Array.isArray(entry))
            continue;
        const text = normalizeClipboardText(entry.text);
        if (text === null || typeof entry.id !== 'string' || !entry.id ||
            !validTimestamp(entry.createdAt, now, maxAgeSeconds) || seen.has(text))
            continue;

        seen.add(text);
        normalized.push({
            id: entry.id.slice(0, 128),
            text,
            createdAt: entry.createdAt,
        });
    }

    return normalized.sort((a, b) => b.createdAt - a.createdAt).slice(0, limit);
}

export function addClipboardHistoryEntry(entries, text, {
    now = Math.floor(Date.now() / 1000),
    id,
    maxEntries = CLIPBOARD_HISTORY_MAX_ENTRIES,
    maxAgeSeconds = CLIPBOARD_HISTORY_MAX_AGE_SECONDS,
} = {}) {
    const cleanText = normalizeClipboardText(text);
    const current = normalizeClipboardHistory(entries, now, {maxEntries, maxAgeSeconds});
    if (cleanText === null || current.some(entry => entry.text === cleanText))
        return {entries: current, added: false};

    if (typeof id !== 'string' || !id)
        throw new TypeError('A non-empty entry ID is required');

    const next = normalizeClipboardHistory([
        {id, text: cleanText, createdAt: now},
        ...current,
    ], now, {maxEntries, maxAgeSeconds});
    return {entries: next, added: next.some(entry => entry.id === id)};
}

export function removeClipboardHistoryEntry(entries, id, now = Math.floor(Date.now() / 1000)) {
    return normalizeClipboardHistory(entries, now).filter(entry => entry.id !== id);
}

export function parseClipboardHistory(serialized, now = Math.floor(Date.now() / 1000), limits = {}) {
    if (typeof serialized !== 'string' ||
        clipboardTextByteLength(serialized) > CLIPBOARD_HISTORY_MAX_FILE_BYTES)
        throw new Error('Clipboard history file exceeds the allowed size');

    const parsed = JSON.parse(serialized);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) ||
        parsed.version !== CLIPBOARD_HISTORY_VERSION || !Array.isArray(parsed.entries))
        throw new Error('Clipboard history file has an unsupported format');

    return normalizeClipboardHistory(parsed.entries, now, limits);
}

export function serializeClipboardHistory(entries, now = Math.floor(Date.now() / 1000), limits = {}) {
    const payload = {
        version: CLIPBOARD_HISTORY_VERSION,
        entries: normalizeClipboardHistory(entries, now, limits),
    };
    const serialized = JSON.stringify(payload);
    if (clipboardTextByteLength(serialized) > CLIPBOARD_HISTORY_MAX_FILE_BYTES)
        throw new Error('Clipboard history exceeds the allowed storage size');
    return serialized + '\n';
}
