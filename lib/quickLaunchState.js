import {normalizeQuickLaunchEntries} from './quickLaunch.js';

let entries = [];
let nextEntryRevision = 1;
const activeStates = new Map();
const entryRevisions = new Map();

export function getQuickLaunchEntryRevision(id) {
    return entryRevisions.get(id) ?? null;
}

export function setQuickLaunchEntries(value) {
    const normalized = normalizeQuickLaunchEntries(value);
    const previousEntries = new Map(entries.map(entry => [entry.id, entry]));
    const nextIds = new Set();
    entries = normalized.map(entry => {
        nextIds.add(entry.id);
        const previous = previousEntries.get(entry.id);
        const sameAction = previous?.type === entry.type &&
            previous?.target === entry.target && previous?.offTarget === entry.offTarget;
        const revision = sameAction && entryRevisions.has(entry.id)
            ? entryRevisions.get(entry.id)
            : nextEntryRevision++;
        entryRevisions.set(entry.id, revision);

        if (!entry.offTarget) {
            activeStates.delete(entry.id);
            return entry;
        }

        const active = sameAction ? activeStates.get(entry.id) === true : false;
        activeStates.set(entry.id, active);
        return {...entry, active};
    });
    for (const id of activeStates.keys()) {
        if (!nextIds.has(id))
            activeStates.delete(id);
    }
    for (const id of entryRevisions.keys()) {
        if (!nextIds.has(id))
            entryRevisions.delete(id);
    }
}

export function setQuickLaunchEntryState(id, active, expected = null) {
    const entry = entries.find(item => item.id === id && item.offTarget);
    if (!entry || (expected && (
        (expected.revision !== undefined && expected.revision !== entryRevisions.get(id)) ||
        entry.target !== expected.target ||
        entry.offTarget !== expected.offTarget
    )))
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
