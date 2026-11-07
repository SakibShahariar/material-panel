/**
 * Lifecycle-aware callback bridge between media updates and the open
 * Quick Settings popup. The popup registers and unregisters its own callback.
 */
let activeRechrome = null;

export function registerQuickSettingsRechrome(callback) {
    if (typeof callback !== 'function')
        return () => {};
    activeRechrome = callback;
    return () => {
        if (activeRechrome === callback)
            activeRechrome = null;
    };
}

export function refreshQuickSettingsChrome() {
    try {
        activeRechrome?.();
    } catch (e) {}
}
