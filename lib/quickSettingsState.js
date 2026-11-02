/**
 * Module-scoped Quick Settings preferences shared by all panel layouts.
 * The extension owns configuration updates and teardown cleanup.
 */
let sliderStyle = 'classic';
let tileStyle = 'classic';
let tiles = null;
let favorites = [];

export function setQuickSettingsSliderStyle(value) {
    sliderStyle = typeof value === 'string' && value ? value : 'classic';
}

export function getQuickSettingsSliderStyle() {
    return sliderStyle;
}

export function setQuickSettingsTileStyle(value) {
    tileStyle = typeof value === 'string' && value ? value : 'classic';
}

export function getQuickSettingsTileStyle() {
    return tileStyle;
}

export function setQuickSettingsTiles(value) {
    tiles = Array.isArray(value) ? [...value] : null;
}

export function getQuickSettingsTiles() {
    return tiles ? [...tiles] : null;
}

export function setQuickSettingsFavorites(value) {
    favorites = Array.isArray(value) ? [...value] : [];
}

export function getQuickSettingsFavorites() {
    return [...favorites];
}

export function clearQuickSettingsState() {
    sliderStyle = 'classic';
    tileStyle = 'classic';
    tiles = null;
    favorites = [];
}
