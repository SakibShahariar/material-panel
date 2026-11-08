export const POPUP_SHORTCUT_TARGETS = Object.freeze([
    {id: 'volume', key: 'open-volume', label: 'Audio'},
    {id: 'network', key: 'open-network', label: 'Network'},
    {id: 'bluetooth', key: 'open-bluetooth', label: 'Bluetooth'},
    {id: 'clock', key: 'open-clock', label: 'Calendar'},
    {id: 'control-center', key: 'open-control-center', label: 'Control Center'},
]);

export const DEFAULT_POPUP_SHORTCUTS = Object.freeze(
    Object.fromEntries(POPUP_SHORTCUT_TARGETS.map(({id}) => [id, ''])));

function normalizeShortcut(value) {
    let shortcut = '';
    let pendingWhitespace = '';
    let pendingWhitespaceLength = 0;

    // Strip invisible controls and enforce the accelerator limit while
    // iterating; do not allocate a full sanitized copy of imported settings.
    for (const character of value) {
        if (/[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF]/u.test(character))
            continue;

        if (character.trim() === '') {
            if (shortcut.length > 0) {
                pendingWhitespaceLength += character.length;
                if (pendingWhitespaceLength <= 80)
                    pendingWhitespace += character;
            }
            continue;
        }

        if (pendingWhitespaceLength > 0) {
            if (shortcut.length + pendingWhitespaceLength + character.length > 80)
                return '';
            shortcut += pendingWhitespace;
            pendingWhitespace = '';
            pendingWhitespaceLength = 0;
        }

        shortcut += character;
        if (shortcut.length > 80)
            return '';
    }

    // Any buffered whitespace is trailing and therefore removed by trim().
    return shortcut;
}

export function normalizePopupShortcuts(value) {
    const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    return Object.fromEntries(POPUP_SHORTCUT_TARGETS.map(({id}) => [
        id,
        typeof source[id] === 'string' ? normalizeShortcut(source[id]) : '',
    ]));
}

/** Return duplicate accelerator groups so callers can reject every colliding assignment. */
export function findPopupShortcutConflicts(value) {
    const groups = new Map();
    for (const [id, accelerator] of Object.entries(normalizePopupShortcuts(value))) {
        if (!accelerator)
            continue;
        const ids = groups.get(accelerator) ?? [];
        ids.push(id);
        groups.set(accelerator, ids);
    }
    return [...groups.entries()]
        .filter(([, ids]) => ids.length > 1)
        .map(([accelerator, ids]) => ({accelerator, ids}));
}
