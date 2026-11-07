export const STATUS_INDICATOR_IDS = ['dnd', 'nightlight'];

export const DEFAULT_STATUS_INDICATOR_PREFERENCES = {
    dnd: {enabled: true, showInactive: false},
    nightlight: {enabled: true, showInactive: false},
};

/** Keep the status-indicator settings small, explicit, and safe for old configs. */
export function normalizeStatusIndicatorPreferences(value) {
    const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    return Object.fromEntries(STATUS_INDICATOR_IDS.map(id => {
        const item = source[id] && typeof source[id] === 'object' && !Array.isArray(source[id])
            ? source[id] : {};
        return [id, {
            enabled: item.enabled !== false,
            showInactive: item.showInactive === true,
        }];
    }));
}
