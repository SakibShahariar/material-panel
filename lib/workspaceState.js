/**
 * Module-scoped workspace presentation preferences shared by extension setup
 * and the workspace chip. Values are reset when the extension is disabled.
 */
import {normalizeWorkspaceDisplayMode} from './workspaceDisplay.js';

let displayMode = 'auto';
let scrollSwitch = true;

export function setWorkspaceDisplayMode(value) {
    displayMode = normalizeWorkspaceDisplayMode(value);
}

export function getWorkspaceDisplayMode() {
    return displayMode;
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
}
