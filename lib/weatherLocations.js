const MAX_WEATHER_LOCATIONS = 8;

export function normalizeWeatherLocations(value) {
    if (!Array.isArray(value))
        return [];
    const locations = [];
    const seen = new Set();
    for (const item of value) {
        if (!item || typeof item !== 'object' || Array.isArray(item))
            continue;
        const latitudeText = String(item.latitude ?? item.lat ?? '').trim();
        const longitudeText = String(item.longitude ?? item.lon ?? '').trim();
        const latitude = Number(latitudeText);
        const longitude = Number(longitudeText);
        if (!latitudeText || !longitudeText ||
            !Number.isFinite(latitude) || !Number.isFinite(longitude) ||
            latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180)
            continue;
        const key = `${latitude.toFixed(5)},${longitude.toFixed(5)}`;
        if (seen.has(key))
            continue;
        seen.add(key);
        const name = String(item.name ?? '').trim().slice(0, 64) ||
            `${latitude.toFixed(2)}, ${longitude.toFixed(2)}`;
        locations.push({name, latitude, longitude});
        if (locations.length >= MAX_WEATHER_LOCATIONS)
            break;
    }
    return locations;
}

/** Preferences format: Name|latitude|longitude; Another place|lat|lon. */
export function parseWeatherLocations(value) {
    const text = String(value ?? '').trim();
    if (!text)
        return [];
    const entries = text.split(';').map(entry => entry.trim());
    if (entries.length < 2 || entries.length > MAX_WEATHER_LOCATIONS)
        return null;
    const parsed = [];
    for (const entry of entries) {
        const parts = entry.split('|').map(part => part.trim());
        if (parts.length !== 3 || !parts[0] || parts[0].length > 64)
            return null;
        parsed.push({name: parts[0], latitude: parts[1], longitude: parts[2]});
    }
    const normalized = normalizeWeatherLocations(parsed);
    return normalized.length === entries.length ? normalized : null;
}

export function formatWeatherLocations(value) {
    return normalizeWeatherLocations(value)
        .map(location => `${location.name}|${location.latitude}|${location.longitude}`)
        .join('; ');
}
