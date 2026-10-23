/**
 * Classify config changes without cloning and comparing the full config four
 * times. Config objects are plain JSON-like data from ConfigStore.
 */
function deepEqual(a, b) {
    if (a === b)
        return true;
    if (a == null || b == null)
        return a === b;
    if (typeof a !== typeof b)
        return false;
    if (typeof a !== 'object')
        return a === b;
    if (Array.isArray(a) !== Array.isArray(b))
        return false;
    if (Array.isArray(a)) {
        if (a.length !== b.length)
            return false;
        for (let i = 0; i < a.length; i++) {
            if (!deepEqual(a[i], b[i]))
                return false;
        }
        return true;
    }
    const ka = Object.keys(a).sort();
    const kb = Object.keys(b).sort();
    if (ka.length !== kb.length)
        return false;
    for (let i = 0; i < ka.length; i++) {
        if (ka[i] !== kb[i] || !deepEqual(a[ka[i]], b[kb[i]]))
            return false;
    }
    return true;
}

function changedTopLevelKeys(prev, next) {
    const keys = new Set([...Object.keys(prev), ...Object.keys(next)]);
    const changed = [];
    for (const key of keys) {
        const prevHas = Object.prototype.hasOwnProperty.call(prev, key);
        const nextHas = Object.prototype.hasOwnProperty.call(next, key);
        if (prevHas !== nextHas || !deepEqual(prev[key], next[key]))
            changed.push(key);
    }
    return changed;
}

export function classifyConfigChange(prev, next) {
    if (!prev || !next || typeof prev !== 'object' || typeof next !== 'object')
        return 'full';

    const changed = changedTopLevelKeys(prev, next);
    const only = allowed => changed.every(key => allowed.includes(key));

    if (only([
        'trayAllHidden', 'foreignRoleZones', 'hiddenForeignRoles', 'foreignRoleZonesBackup',
    ]))
        return 'tray';
    if (only(['panelSize']))
        return 'panelSize';
    if (only(['clockFormat']))
        return 'clock';
    if (only(['colorSource']))
        return 'color';
    return 'full';
}
