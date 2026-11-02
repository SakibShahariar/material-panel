/**
 * Module-scoped media chip visibility preference.
 * The extension owns updates; the media module reads it during construction.
 */
let autoHide = false;

export function setMediaAutoHide(value) {
    autoHide = value === true;
}

export function isMediaAutoHideEnabled() {
    return autoHide;
}

export function clearMediaVisibilityState() {
    autoHide = false;
}
