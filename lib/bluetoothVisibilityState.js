/**
 * Module-scoped Bluetooth chip visibility preference.
 * The extension owns updates; the Bluetooth module reads it during construction.
 */
let autoHide = false;

export function setBluetoothAutoHide(value) {
    autoHide = value === true;
}

export function isBluetoothAutoHideEnabled() {
    return autoHide;
}

export function clearBluetoothVisibilityState() {
    autoHide = false;
}
