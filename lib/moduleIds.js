// Pure module-id catalog with zero Shell / St / Clutter imports.
// Safe to load from prefs.js (GTK process) and from the shell extension.
// Keep this list in sync with the factories registered in moduleRegistry.js.

export const BUILTIN_MODULE_IDS = [
    'activities',
    'workspaces',
    'cpu',
    'clock',
    'weather',
    'notifications',
    'battery',
    'volume',
    'network',
    'networkSpeed',
    'darkmode',
    'nightlight',
    'dnd',
    'powermenu',
    'bluetooth',
    'quicksettings',
];

const BUILTIN_SET = new Set(BUILTIN_MODULE_IDS);

/**
 * True if `id` is a built-in panel module.
 * Does not treat extension: roles as built-in.
 */
export function hasBuiltin(id) {
    return BUILTIN_SET.has(id);
}
