/**
 * Module-scoped profile identity preference shared by extension setup and QS.
 * This avoids publishing a single-use setting on GNOME Shell's global object.
 */
let hidden = false;

export function setProfileIdentityHidden(value) {
    hidden = value === true;
}

export function isProfileIdentityHidden() {
    return hidden;
}

export function clearProfileIdentityState() {
    hidden = false;
}
