export const WORKSPACE_DISPLAY_MODES = Object.freeze([
    'auto',
    'numbers',
    'dots',
    'apps',
]);

export function normalizeWorkspaceDisplayMode(value) {
    return WORKSPACE_DISPLAY_MODES.includes(value) ? value : 'auto';
}

/** Resolve the selected mode while preserving each layout's current default. */
export function resolveWorkspaceDisplayMode(value, isEnd4Layout) {
    const mode = normalizeWorkspaceDisplayMode(value);
    if (mode !== 'auto')
        return mode;
    return isEnd4Layout ? 'apps' : 'numbers';
}
