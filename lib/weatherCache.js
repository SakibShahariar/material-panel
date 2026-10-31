// Small process-local LRU cache so weather survives panel rebuilds without
// retaining forecasts indefinitely or mixing different locations/units.
const MAX_ENTRIES = 8;
const MAX_AGE_US = 60 * 60 * 1_000_000;
const entries = new Map();

export function getWeatherCache(key, now) {
    const entry = entries.get(String(key));
    if (!entry)
        return null;
    if (!Number.isFinite(now) || now < entry.savedAt || now - entry.savedAt > MAX_AGE_US) {
        entries.delete(String(key));
        return null;
    }
    entries.delete(String(key));
    entries.set(String(key), entry);
    return entry;
}

export function setWeatherCache(key, data, savedAt) {
    if (!key || !data || !Number.isFinite(savedAt))
        return;
    const normalizedKey = String(key);
    entries.delete(normalizedKey);
    entries.set(normalizedKey, {data, savedAt});
    while (entries.size > MAX_ENTRIES)
        entries.delete(entries.keys().next().value);
}

export function clearWeatherCache() {
    entries.clear();
}
