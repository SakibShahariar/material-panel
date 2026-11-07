/**
 * Module-scoped network-speed chip visibility preference.
 * The extension owns updates; the network-speed module reads it during construction.
 */
let autoHide = false;

export function setNetworkSpeedAutoHide(value) {
    autoHide = value === true;
}

export function isNetworkSpeedAutoHideEnabled() {
    return autoHide;
}

export function clearNetworkSpeedVisibilityState() {
    autoHide = false;
}
