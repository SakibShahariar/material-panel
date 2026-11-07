/**
 * Module-scoped configured weather location shared by extension setup and
 * the Weather module. The extension owns updates and teardown reset.
 */
let location = {};
let locations = [];
let activeLocationIndex = 0;

export function setWeatherLocation(value) {
    location = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

export function getWeatherLocation() {
    return location;
}

export function clearWeatherLocation() {
    location = {};
}

export function setWeatherLocations(value) {
    const next = Array.isArray(value) ? value : [];
    const same = locations.length === next.length && locations.every((item, index) =>
        item?.name === next[index]?.name &&
        item?.latitude === next[index]?.latitude &&
        item?.longitude === next[index]?.longitude);
    locations = next;
    if (!same)
        activeLocationIndex = 0;
    else
        activeLocationIndex = Math.min(activeLocationIndex, Math.max(0, locations.length - 1));
}

export function getWeatherLocations() {
    return locations;
}

export function getWeatherLocationIndex() {
    return activeLocationIndex;
}

export function setWeatherLocationIndex(index) {
    if (!Number.isInteger(index) || index < 0 || index >= locations.length)
        return false;
    activeLocationIndex = index;
    return true;
}

export function clearWeatherLocations() {
    locations = [];
    activeLocationIndex = 0;
}
