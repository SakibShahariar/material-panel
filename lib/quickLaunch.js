/**
 * Validation for user-configured Quick Settings launch entries.
 * Keep this module free of GNOME imports so persisted data can be tested in Node.
 */
export const QUICK_LAUNCH_LIMIT = 12;

// Commands are actions, not background services; stop them if they hang.
export const QUICK_LAUNCH_TIMEOUT_SECONDS = 30;

function normalizeQuickLaunchLabel(value, limit = 80) {
    let label = '';
    let pendingSpace = false;
    let length = 0;

    // Stop once the rendered label is full; do not sanitize/copy a huge suffix.
    for (const character of value) {
        const cleanCharacter = /[\\u0000-\\u001f\\u007f\\u061c\\u200e\\u200f\\u202a-\\u202e\\u2066-\\u206f]/u.test(character)
            ? ' '
            : character;
        if (/\\s/u.test(cleanCharacter)) {
            if (length > 0)
                pendingSpace = true;
            continue;
        }

        if (pendingSpace) {
            if (length >= limit)
                break;
            label += ' ';
            length++;
            pendingSpace = false;
        }
        if (length >= limit)
            break;
        label += cleanCharacter;
        length++;
        if (length >= limit)
            break;
    }

    return label;
}

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
        // Labels are rendered directly in Shell actors; collapse control characters
        // so imported settings cannot inject line breaks or invisible controls.
        const name = normalizeQuickLaunchLabel(
            typeof item.name === 'string' ? item.name : target,
        );
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
        const icon = typeof item.icon === 'string' ? item.icon.trim() : '';
        const normalized = {
            id,
            type,
            target,
            name: name || normalizeQuickLaunchLabel(target),
        };
        // Store only a symbolic icon name, never a path or arbitrary resource URI.
        if (/^[A-Za-z0-9][A-Za-z0-9-]{0,79}$/.test(icon))
            normalized.icon = icon;
        entries.push(normalized);
        if (entries.length >= QUICK_LAUNCH_LIMIT)
            break;
    }
    return entries;
}
