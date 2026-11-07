/**
 * Validation for user-configured Quick Settings launch entries.
 * Keep this module free of GNOME imports so persisted data can be tested in Node.
 */
export const QUICK_LAUNCH_LIMIT = 12;

export function normalizeQuickLaunchEntries(value) {
    if (!Array.isArray(value))
        return [];

    const entries = [];
    const seenIds = new Set();
    for (const item of value) {
        if (!item || typeof item !== 'object' || Array.isArray(item))
            continue;
        const id = typeof item.id === 'string' ? item.id.trim() : '';
        const type = item.type;
        const target = typeof item.target === 'string' ? item.target.trim() : '';
        const name = typeof item.name === 'string' ? item.name.trim() : '';
        if (!id || id.length > 64 || seenIds.has(id))
            continue;
        if (type !== 'app' && type !== 'command')
            continue;
        if (!target || target.length > 512 || /[\u0000-\u001f\u007f]/.test(target))
            continue;
        if (type === 'app' && !/^[A-Za-z0-9_.-]+\.desktop$/.test(target))
            continue;
        if (type === 'command' && !target.trim())
            continue;
        seenIds.add(id);
        entries.push({
            id,
            type,
            target,
            name: (name || target).slice(0, 80),
        });
        if (entries.length >= QUICK_LAUNCH_LIMIT)
            break;
    }
    return entries;
}
