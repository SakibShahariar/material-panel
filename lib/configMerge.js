function clone(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}
function equal(a, b) {
    return JSON.stringify(a) === JSON.stringify(b);
}
function isRecord(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Three-way merge: unchanged local values accept disk updates, unchanged disk
 * values accept local edits, and conflicting edits prefer the local value.
 */
export function mergeConfigChanges(base, local, remote) {
    if (equal(local, base))
        return clone(remote);
    if (equal(remote, base))
        return clone(local);
    if (isRecord(base) && isRecord(local) && isRecord(remote)) {
        const result = {};
        const keys = new Set([...Object.keys(base), ...Object.keys(local), ...Object.keys(remote)]);
        for (const key of keys) {
            const value = mergeConfigChanges(base[key], local[key], remote[key]);
            if (value !== undefined)
                result[key] = value;
        }
        return result;
    }
    return clone(local);
}

/** Sync objects recursively while preserving references held by preference widgets. */
export function syncObjectInPlace(target, source) {
    for (const key of Object.keys(target)) {
        if (!Object.prototype.hasOwnProperty.call(source, key))
            delete target[key];
    }
    for (const [key, value] of Object.entries(source)) {
        if (isRecord(target[key]) && isRecord(value))
            syncObjectInPlace(target[key], value);
        else
            target[key] = clone(value);
    }
    return target;
}
