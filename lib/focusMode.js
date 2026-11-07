/** Pure Focus Mode helpers. Focus Mode is an independent temporary visibility layer. */
export function normalizeFocusModeModules(value, allowedIds = []) {
    if (!Array.isArray(value))
        return [];
    const allowed = new Set(allowedIds);
    const seen = new Set();
    return value.filter(id => {
        if (typeof id !== 'string' || !allowed.has(id) || seen.has(id))
            return false;
        seen.add(id);
        return true;
    });
}

/** Return the effective hidden set without mutating normal hidden-module settings. */
export function getEffectiveHiddenModules(normalHidden, focusEnabled, focusModules) {
    const result = new Set(Array.isArray(normalHidden) ? normalHidden : []);
    if (focusEnabled && Array.isArray(focusModules)) {
        for (const id of focusModules) {
            if (typeof id === 'string' && id)
                result.add(id);
        }
    }
    return result;
}
