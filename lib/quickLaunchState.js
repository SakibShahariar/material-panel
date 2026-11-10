import {normalizeQuickLaunchEntries} from './quickLaunch.js';

let entries = [];
const activeStates = new Map();

export function setQuickLaunchEntries(value) {
    const normalized = normalizeQuickLaunchEntries(value);
    const previousEntries = new Map(entries.map(entry => [entry.id, entry]));
    const nextIds = new Set();
    entries = normalized.map(entry => {
        nextIds.add(entry.id);
        if (!entry.offTarget) {
            activeStates.delete(entry.id);
            return entry;
        }
        const previous = previousEntries.get(entry.id);
        const sameCommandPair = previous?.type === entry.type &&
            previous?.target === entry.target && previous?.offTarget === entry.offTarget;
        const active = sameCommandPair
            ? activeStates.get(entry.id) === true
            : false;
        activeStates.set(entry.id, active);
        return {...entry, active};
    });
    for (const id of activeStates.keys()) {
        if (!nextIds.has(id))
            activeStates.delete(id);
    }
}

export function setQuickLaunchEntryState(id, active, expected = null) {
    const entry = entries.find(item => item.id === id && item.offTarget);
    if (!entry || (expected &&
        (entry.target !== expected.target || entry.offTarget !== expected.offTarget)))
        return false;
    const next = active === true;
    activeStates.set(id, next);
    entry.active = next;
    return true;
}

export function getQuickLaunchEntries() {
    return entries.map(entry => ({...entry}));
}

export function clearQuickLaunchEntries() {
    entries = [];
    activeStates.clear();
}
