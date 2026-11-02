/**
 * Module-scoped configured weather location shared by extension setup and
 * the Weather module. The extension owns updates and teardown reset.
 */
let location = {};

export function setWeatherLocation(value) {
    location = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

export function getWeatherLocation() {
    return location;
}

export function clearWeatherLocation() {
    location = {};
}
