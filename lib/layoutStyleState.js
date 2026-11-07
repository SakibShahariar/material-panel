/**
 * Module-scoped panel layout selection shared by Shell-side builders and
 * integration helpers. The extension owns config updates and teardown reset.
 */
import {normalizeLayoutStyle} from './layoutPresets.js';

let layoutStyle = 'default';

export function setLayoutStyle(value) {
    layoutStyle = normalizeLayoutStyle(value);
}

export function getLayoutStyle() {
    return layoutStyle;
}

export function clearLayoutStyle() {
    layoutStyle = 'default';
}
