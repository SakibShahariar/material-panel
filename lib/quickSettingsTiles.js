export const QUICK_SETTINGS_TILES = Object.freeze([
    Object.freeze({id: 'dark-mode', label: 'Dark mode'}),
    Object.freeze({id: 'do-not-disturb', label: 'Do not disturb'}),
    Object.freeze({id: 'night-light', label: 'Night light'}),
    Object.freeze({id: 'bluetooth', label: 'Bluetooth'}),
    Object.freeze({id: 'wifi', label: 'Wi-Fi'}),
]);

export const DEFAULT_QUICK_SETTINGS_TILE_IDS = Object.freeze(
    QUICK_SETTINGS_TILES.map(tile => tile.id),
);

const tileByName = new Map(QUICK_SETTINGS_TILES.flatMap(tile => [
    [tile.id, tile.id],
    [tile.label.toLowerCase(), tile.id],
]));

export function normalizeQuickSettingsTiles(value) {
    if (!Array.isArray(value))
        return [...DEFAULT_QUICK_SETTINGS_TILE_IDS];
    const allowed = new Set(DEFAULT_QUICK_SETTINGS_TILE_IDS);
    const seen = new Set();
    const result = [];
    for (const item of value) {
        if (typeof item !== 'string' || !allowed.has(item) || seen.has(item))
            continue;
        seen.add(item);
        result.push(item);
    }
    return result;
}

/** Parse a comma-separated list of tile names/IDs. Empty input restores defaults. */
export function parseQuickSettingsTileOrder(value) {
    if (typeof value !== 'string')
        return null;
    const input = value.trim();
    if (!input)
        return [...DEFAULT_QUICK_SETTINGS_TILE_IDS];
    const result = [];
    const seen = new Set();
    for (const part of input.split(',')) {
        const key = part.trim().toLowerCase();
        const id = tileByName.get(key);
        if (!id)
            return null;
        if (!seen.has(id)) {
            seen.add(id);
            result.push(id);
        }
    }
    return result;
}

export function formatQuickSettingsTileOrder(value) {
    const ids = normalizeQuickSettingsTiles(value);
    return ids.map(id => QUICK_SETTINGS_TILES.find(tile => tile.id === id)?.label ?? id).join(', ');
}


/** Favorites are an optional subset; malformed or missing values mean none. */
export function normalizeQuickSettingsFavorites(value) {
    if (!Array.isArray(value))
        return [];
    return normalizeQuickSettingsTiles(value);
}

/** Parse comma-separated favorite names/IDs. Empty input clears favorites. */
export function parseQuickSettingsFavorites(value) {
    if (typeof value !== 'string')
        return null;
    const input = value.trim();
    if (!input)
        return [];
    const result = [];
    const seen = new Set();
    for (const part of input.split(',')) {
        const id = tileByName.get(part.trim().toLowerCase());
        if (!id)
            return null;
        if (!seen.has(id)) {
            seen.add(id);
            result.push(id);
        }
    }
    return result;
}

export function formatQuickSettingsFavorites(value) {
    return normalizeQuickSettingsFavorites(value)
        .map(id => QUICK_SETTINGS_TILES.find(tile => tile.id === id)?.label ?? id)
        .join(', ');
}

/** Stable ordering: favorites first in their saved order, other tiles keep their order. */
export function orderQuickSettingsTiles(value, favorites) {
    const ids = normalizeQuickSettingsTiles(value);
    const rank = new Map(normalizeQuickSettingsFavorites(favorites).map((id, index) => [id, index]));
    return ids.map((id, index) => ({id, index})).sort((a, b) =>
        (rank.get(a.id) ?? Number.MAX_SAFE_INTEGER) -
        (rank.get(b.id) ?? Number.MAX_SAFE_INTEGER) || a.index - b.index)
        .map(entry => entry.id);
}
