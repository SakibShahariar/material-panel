import {normalizeQuickLaunchEntries} from './quickLaunch.js';

let entries = [];

export function setQuickLaunchEntries(value) {
    entries = normalizeQuickLaunchEntries(value);
}

export function getQuickLaunchEntries() {
    return entries.map(entry => ({...entry}));
}

export function clearQuickLaunchEntries() {
    entries = [];
}
