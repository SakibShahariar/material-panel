/**
 * Module-scoped workspace presentation preferences shared by extension setup
 * and the workspace chip. Values are reset when the extension is disabled.
 */
import {normalizeWorkspaceDisplayMode} from './workspaceDisplay.js';
import {normalizeWorkspaceFilter} from './workspaceFilter.js';

let displayMode = 'auto';
let scrollSwitch = true;
let workspaceFilter = 'all';

export function setWorkspaceDisplayMode(value) {
    displayMode = normalizeWorkspaceDisplayMode(value);
}

export function getWorkspaceDisplayMode() {
    return displayMode;
}

export function setWorkspaceFilter(value) {
    workspaceFilter = normalizeWorkspaceFilter(value);
}

export function getWorkspaceFilter() {
    return workspaceFilter;
}

export function setWorkspaceScrollSwitch(value) {
    scrollSwitch = value !== false;
}

export function isWorkspaceScrollSwitchEnabled() {
    return scrollSwitch;
}

export function clearWorkspaceState() {
    displayMode = 'auto';
    scrollSwitch = true;
    workspaceFilter = 'all';
}
