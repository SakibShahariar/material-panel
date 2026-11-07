import {BUILTIN_MODULE_IDS} from './moduleIds.js';

export const DEFAULT_MODULE_VISIBILITY_RULE = Object.freeze({
    hideWhenFullscreen: false,
    hideInOverview: false,
    hideWhenDnd: false,
    hideWhenOffline: false,
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
        };
        if (normalized.hideWhenFullscreen || normalized.hideInOverview || normalized.hideWhenDnd || normalized.hideWhenOffline)
            result[id] = normalized;
    }
    return result;
}

/** Return module IDs hidden by the current, signal-derived desktop context. */
export function getContextHiddenModules(rules, {fullscreen = false, overview = false, dnd = false, offline = false} = {}) {
    const normalized = normalizeModuleVisibilityRules(rules);
    const hidden = new Set();
    for (const [id, rule] of Object.entries(normalized)) {
        if ((fullscreen && rule.hideWhenFullscreen) || (overview && rule.hideInOverview) || (dnd && rule.hideWhenDnd) || (offline && rule.hideWhenOffline))
            hidden.add(id);
    }
    return hidden;
}
