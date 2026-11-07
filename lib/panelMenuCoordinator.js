/**
 * Module-scoped coordination for mutually exclusive Material Panel popups.
 * Avoids publishing an internal callback on GNOME Shell's global object.
 */
let closeOtherMenus = null;

export function registerPanelMenuCloser(callback) {
    closeOtherMenus = typeof callback === 'function' ? callback : null;
}

export function closeOtherPanelMenus(except = null) {
    if (!closeOtherMenus)
        return;
    try {
        closeOtherMenus(except);
    } catch (e) {}
}
