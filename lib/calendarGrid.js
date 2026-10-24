/**
 * Pure calendar-grid helpers shared by the End-4 calendar and regression tests.
 * Intl.Locale week information uses ISO numbering: Monday=1 through Sunday=7.
 */

export function getCalendarWeekStart(locale = 'en-GB') {
    try {
        const resolved = new Intl.Locale(locale);
        const info = typeof resolved.getWeekInfo === 'function'
            ? resolved.getWeekInfo()
            : resolved.weekInfo;
        if (Number.isInteger(info?.firstDay) && info.firstDay >= 1 && info.firstDay <= 7)
            return info.firstDay;
    } catch (e) {}
    // Monday is a conservative fallback when neither week-info API is available.
    return 1;
}

export function getCalendarWeekdayLabels(locale = 'en-GB', weekStart = 1) {
    const formatter = new Intl.DateTimeFormat(locale, {weekday: 'short', timeZone: 'UTC'});
    // 2024-01-01 was a Monday; rotate labels to the locale's first weekday.
    const monday = Date.UTC(2024, 0, 1);
    const labels = [];
    for (let offset = 0; offset < 7; offset++) {
        const dayOffset = ((weekStart - 1 + offset) % 7);
        labels.push(formatter.format(new Date(monday + dayOffset * 86400000)));
    }
    return labels;
}

export function buildCalendarCells(year, month, daysInMonth, weekStart = 1) {
    if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12 ||
        !Number.isInteger(daysInMonth) || daysInMonth < 28 || daysInMonth > 31 ||
        !Number.isInteger(weekStart) || weekStart < 1 || weekStart > 7)
        throw new RangeError('Invalid calendar grid arguments');

    // JavaScript's UTC weekday numbering is Sunday=0; Intl uses Monday=1..Sunday=7.
    const firstDay = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
    const startOffset = (firstDay - (weekStart % 7) + 7) % 7;
    const cells = Array(startOffset).fill(null);
    for (let day = 1; day <= daysInMonth; day++)
        cells.push(day);
    while (cells.length % 7 !== 0)
        cells.push(null);
    return cells;
}
