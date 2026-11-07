export const POPUP_SHORTCUT_TARGETS = Object.freeze([
    {id: 'volume', key: 'open-volume', label: 'Audio'},
    {id: 'network', key: 'open-network', label: 'Network'},
    {id: 'bluetooth', key: 'open-bluetooth', label: 'Bluetooth'},
    {id: 'clock', key: 'open-clock', label: 'Calendar'},
    {id: 'control-center', key: 'open-control-center', label: 'Control Center'},
]);

export const DEFAULT_POPUP_SHORTCUTS = Object.freeze(
    Object.fromEntries(POPUP_SHORTCUT_TARGETS.map(({id}) => [id, ''])));

export function normalizePopupShortcuts(value) {
    const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    return Object.fromEntries(POPUP_SHORTCUT_TARGETS.map(({id}) => {
        const shortcut = typeof source[id] === 'string' ? source[id].trim() : '';
        return [id, shortcut.slice(0, 80)];
    }));
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
