const VALID_ID = /^[a-z][a-z0-9-]{0,63}$/;
const MAX_RAW_ID_LENGTH = 128;

export const CONTROL_CENTER_HOME_SHORTCUT_DEFINITIONS = Object.freeze([
    Object.freeze({id: 'dark-mode', label: 'Dark mode'}),
    Object.freeze({id: 'night-light', label: 'Night Light'}),
    Object.freeze({id: 'dnd', label: 'Do Not Disturb'}),
]);

export const DEFAULT_CONTROL_CENTER_HOME_SHORTCUTS = Object.freeze([
    'dark-mode',
    'night-light',
    'dnd',
]);

/**
 * Keep shortcut ordering independent from the full Quick Settings tile list.
 * Unknown IDs are retained so a temporarily unavailable backend can return
 * without losing the user's saved position.
 */
export function normalizeControlCenterHomeShortcuts(value) {
    const source = Array.isArray(value) ? value : DEFAULT_CONTROL_CENTER_HOME_SHORTCUTS;
    const seen = new Set();
    const shortcuts = [];
    for (const item of source.slice(0, 12)) {
        if (typeof item !== 'string' || item.length > MAX_RAW_ID_LENGTH)
            continue;
        const id = item.trim();
        if (!VALID_ID.test(id) || seen.has(id))
            continue;
        seen.add(id);
        shortcuts.push(id);
    }
    return shortcuts;
}

export function setControlCenterHomeShortcut(shortcuts, id, enabled) {
    const normalized = normalizeControlCenterHomeShortcuts(shortcuts);
    if (typeof id !== 'string' || id.length > 64 || !VALID_ID.test(id))
        return normalized;
    const index = normalized.indexOf(id);
    if (enabled === true && index < 0 && normalized.length < 12)
        normalized.push(id);
    else if (enabled === false && index >= 0)
        normalized.splice(index, 1);
    return normalized;
}

/**
 * Build only the available Home shortcut actors. A broken optional builder is
 * isolated so the remaining shortcuts can still be used.
 */
export function buildControlCenterHomeShortcutActors(shortcuts, builders, onError = null) {
    const actors = [];
    for (const id of Array.isArray(shortcuts) ? shortcuts : []) {
        const builder = builders?.get?.(id);
        if (typeof builder !== 'function')
            continue;
        try {
            const actor = builder();
            if (actor && (typeof actor === 'object' || typeof actor === 'function'))
                actors.push(actor);
        } catch (error) {
            try { onError?.(id, error); } catch (ignored) {}
        }
    }
    return actors;
}

export function moveControlCenterHomeShortcut(shortcuts, id, offset) {
    const normalized = normalizeControlCenterHomeShortcuts(shortcuts);
    if (typeof id !== 'string' || id.length > 64 || !VALID_ID.test(id))
        return normalized;
    const from = normalized.indexOf(id);
    const delta = Number.isFinite(offset) ? Math.trunc(offset) : 0;
    const to = from + delta;
    if (from < 0 || delta === 0 || to < 0 || to >= normalized.length)
        return normalized;
    const [moved] = normalized.splice(from, 1);
    normalized.splice(to, 0, moved);
    return normalized;
}
