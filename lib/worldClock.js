const MAX_WORLD_CLOCKS = 12;

function normalizeName(value) {
    const normalized = String(value ?? '')
        .replace(/[\u0000-\u001F\u007F-\u009F\u200E\u200F\u202A-\u202E\u2066-\u2069]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    return Array.from(normalized).slice(0, 64).join('');
}

function isValidTimeZone(value) {
    if (typeof value !== 'string' || !value || value.length > 128)
        return false;
    try {
        new Intl.DateTimeFormat('en', {timeZone: value});
        return true;
    } catch (e) {
        return false;
    }
}

export function normalizeWorldClockEntries(value) {
    if (!Array.isArray(value))
        return [];
    const result = [];
    const seenZones = new Set();
    for (const item of value) {
        if (!item || typeof item !== 'object' || Array.isArray(item))
            continue;
        const name = normalizeName(item.name);
        const timeZone = String(item.timeZone ?? '').trim();
        if (!name || !isValidTimeZone(timeZone) || seenZones.has(timeZone))
            continue;
        seenZones.add(timeZone);
        result.push({name, timeZone});
        if (result.length >= MAX_WORLD_CLOCKS)
            break;
    }
    return result;
}

/** Preferences format: City|Area/Time_Zone; Another City|Area/Time_Zone. */
export function parseWorldClockEntries(value) {
    const text = String(value ?? '').trim();
    if (!text)
        return [];
    const entries = [];
    for (const part of text.split(';')) {
        const fields = part.split('|');
        if (fields.length !== 2)
            return null;
        const [name, timeZone] = fields.map(field => field.trim());
        if (!name || !timeZone)
            return null;
        entries.push({name, timeZone});
    }
    const normalized = normalizeWorldClockEntries(entries);
    return normalized.length === entries.length ? normalized : null;
}

export function formatWorldClockEntries(value) {
    return normalizeWorldClockEntries(value)
        .map(entry => \`\${entry.name}|\${entry.timeZone}\`)
        .join('; ');
}

function dateParts(date, timeZone, locale) {
    const parts = new Intl.DateTimeFormat(locale, {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).formatToParts(date);
    const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
    return {
        year: Number(values.year),
        month: Number(values.month),
        day: Number(values.day),
    };
}

function dateOrdinal(parts) {
    return Math.floor(Date.UTC(parts.year, parts.month - 1, parts.day) / 86400000);
}

export function formatWorldClockEntry(entry, now = new Date(), options = {}) {
    const [clock] = normalizeWorldClockEntries([entry]);
    if (!clock)
        return null;
    const locale = options.locale || undefined;
    const localTimeZone = options.localTimeZone ||
        Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    const use12h = options.use12h === true;
    const time = new Intl.DateTimeFormat(locale, {
        timeZone: clock.timeZone,
        hour: 'numeric',
        minute: '2-digit',
        hour12: use12h,
    }).format(now);
    const date = new Intl.DateTimeFormat(locale, {
        timeZone: clock.timeZone,
        weekday: 'short',
        month: 'short',
        day: 'numeric',
    }).format(now);
    const offset = dateOrdinal(dateParts(now, clock.timeZone, locale)) -
        dateOrdinal(dateParts(now, localTimeZone, locale));
    const dayOffsetLabel = offset === 0 ? 'Today'
        : offset === 1 ? 'Tomorrow'
            : offset === -1 ? 'Yesterday'
                : offset > 0 ? \`+\${offset} days\` : \`\${offset} days\`;
    return {
        name: clock.name,
        timeZone: clock.timeZone,
        time,
        date,
        dayOffset: offset,
        dayOffsetLabel,
    };
}
