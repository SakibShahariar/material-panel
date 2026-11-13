/**
 * Validation for user-configured Quick Settings launch entries.
 * Keep this module free of GNOME imports so persisted data can be tested in Node.
 */
export const QUICK_LAUNCH_LIMIT = 12;
export const QUICK_LAUNCH_SCAN_LIMIT = QUICK_LAUNCH_LIMIT * 64;

const QUICK_LAUNCH_LABEL_SCAN_LIMIT = 80 * 8;

// Commands are actions, not background services; stop them if they hang.
export const QUICK_LAUNCH_TIMEOUT_SECONDS = 30;

const UNSAFE_COMMAND_CHARACTERS = /[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u206f]/;

export function hasUnsafeQuickLaunchCommandCharacters(value) {
    return typeof value !== 'string' || UNSAFE_COMMAND_CHARACTERS.test(value);
}

function normalizeQuickLaunchLabel(value, limit = 80) {
    let label = '';
    let pendingSpace = false;
    let length = 0;

    // Bound both output and input traversal. A huge whitespace/control-only label
    // otherwise never fills the output limit and can stall config loading.
    let scanned = 0;
    for (const character of value) {
        if (scanned >= QUICK_LAUNCH_LABEL_SCAN_LIMIT)
            break;
        scanned++;
        const codePoint = character.codePointAt(0);
        const isInvisibleControl = codePoint <= 0x1f || codePoint === 0x7f ||
            codePoint === 0x061c || codePoint === 0x200e || codePoint === 0x200f ||
            (codePoint >= 0x202a && codePoint <= 0x202e) ||
            (codePoint >= 0x2066 && codePoint <= 0x206f);
        const cleanCharacter = isInvisibleControl ? ' ' : character;
        if (cleanCharacter.trim() === '') {
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
    const candidateCount = Math.min(value.length, QUICK_LAUNCH_SCAN_LIMIT);
    for (let index = 0; index < candidateCount; index++) {
        const item = value[index];
        if (!item || typeof item !== 'object' || Array.isArray(item))
            continue;
        const rawId = typeof item.id === 'string' ? item.id : '';
        if (!rawId || rawId.length > 64)
            continue;
        const id = rawId.trim();
        const type = item.type;
        const rawTarget = typeof item.target === 'string' ? item.target : '';
        if (!id || seenIds.has(id) || (type !== 'app' && type !== 'command') ||
            !rawTarget || rawTarget.length > 512)
            continue;
        const target = rawTarget.trim();
        if (!target || hasUnsafeQuickLaunchCommandCharacters(target))
            continue;
        if (type === 'app' && !/^[A-Za-z0-9_.-]+\.desktop$/.test(target))
            continue;

        // Labels are rendered directly in Shell actors; collapse control characters
        // so imported settings cannot inject line breaks or invisible controls.
        const name = normalizeQuickLaunchLabel(
            typeof item.name === 'string' ? item.name : target,
        );
        seenIds.add(id);
        const rawIcon = typeof item.icon === 'string' ? item.icon : '';
        const icon = rawIcon.length <= 80 ? rawIcon.trim() : '';
        const normalized = {
            id,
            type,
            target,
            name: name || normalizeQuickLaunchLabel(target),
        };
        // Store only a symbolic icon name, never a path or arbitrary resource URI.
        if (/^[A-Za-z0-9][A-Za-z0-9-]{0,79}$/.test(icon))
            normalized.icon = icon;
        if (type === 'command') {
            const rawOffTarget = typeof item.offTarget === 'string' ? item.offTarget : '';
            const offTarget = rawOffTarget.length <= 512 ? rawOffTarget.trim() : '';
            if (offTarget && offTarget !== target &&
                !hasUnsafeQuickLaunchCommandCharacters(offTarget))
                normalized.offTarget = offTarget;
        }
        entries.push(normalized);
        if (entries.length >= QUICK_LAUNCH_LIMIT)
            break;
    }
    return entries;
}
