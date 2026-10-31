export const CLOCK_DISPLAY_MODES = Object.freeze([
    'time',
    'date-time',
    'weekday-date-time',
]);

export function normalizeClockDisplayMode(value) {
    return CLOCK_DISPLAY_MODES.includes(value) ? value : 'date-time';
}

export function nextClockDisplayMode(value) {
    const current = normalizeClockDisplayMode(value);
    return CLOCK_DISPLAY_MODES[(CLOCK_DISPLAY_MODES.indexOf(current) + 1) % CLOCK_DISPLAY_MODES.length];
}

/** Format a GLib.DateTime-like value using the selected compact clock layout. */
export function formatClockDisplay(now, use12h, mode, end4Layout = false) {
    const displayMode = normalizeClockDisplayMode(mode);
    const time = (now.format(use12h ? '%-I:%M %p' : '%H:%M') ?? '').replace(/\s+/g, ' ').trim();
    if (displayMode === 'time')
        return time;
    const dateFormat = displayMode === 'weekday-date-time' ? '%A, %d %B' : '%a, %d %b';
    const date = (now.format(dateFormat) ?? '').replace(/\s+/g, ' ').trim();
    return end4Layout ? `${time} · ${date}` : `${date}  ${time}`;
}
