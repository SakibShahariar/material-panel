import {BUILTIN_MODULE_IDS} from './moduleIds.js';

export const DEFAULT_MODULE_VISIBILITY_RULE = Object.freeze({
    hideWhenFullscreen: false,
    hideInOverview: false,
    hideWhenDnd: false,
    hideWhenOffline: false,
    showOnlyOnBattery: false,
    showOnlyBelowBatteryPercent: 0,
});

/** Keep only known built-in modules and explicit boolean visibility rules. */
export function normalizeModuleVisibilityRules(value) {
    const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    const result = {};
    for (const id of BUILTIN_MODULE_IDS) {
        const rule = source[id];
        if (!rule || typeof rule !== 'object' || Array.isArray(rule))
            continue;
        const normalized = {
            hideWhenFullscreen: rule.hideWhenFullscreen === true,
            hideInOverview: rule.hideInOverview === true,
            hideWhenDnd: rule.hideWhenDnd === true,
            hideWhenOffline: rule.hideWhenOffline === true,
            showOnlyOnBattery: rule.showOnlyOnBattery === true,
            showOnlyBelowBatteryPercent: (() => {
                const value = Number(rule.showOnlyBelowBatteryPercent);
                return Number.isFinite(value) && value >= 1 && value <= 100
                    ? Math.trunc(value)
                    : 0;
            })(),
        };
        if (normalized.hideWhenFullscreen || normalized.hideInOverview || normalized.hideWhenDnd ||
            normalized.hideWhenOffline || normalized.showOnlyOnBattery || normalized.showOnlyBelowBatteryPercent > 0)
            result[id] = normalized;
    }
    return result;
}

/** Return module IDs hidden by the current, signal-derived desktop context. */
export function getContextHiddenModules(rules, {
    fullscreen = false,
    overview = false,
    dnd = false,
    offline = false,
    onBattery = null,
    batteryPercent = null,
} = {}) {
    const normalized = normalizeModuleVisibilityRules(rules);
    const hidden = new Set();
    for (const [id, rule] of Object.entries(normalized)) {
        if ((fullscreen && rule.hideWhenFullscreen) || (overview && rule.hideInOverview) ||
            (dnd && rule.hideWhenDnd) || (offline && rule.hideWhenOffline) ||
            (rule.showOnlyOnBattery && onBattery === false) ||
            (rule.showOnlyBelowBatteryPercent > 0 && Number.isFinite(batteryPercent) &&
                batteryPercent > rule.showOnlyBelowBatteryPercent))
            hidden.add(id);
    }
    return hidden;
}
