import St from 'gi://St';
import Atk from 'gi://Atk';

/**
 * Accessible names for panel chips (Orca / keyboard).
 */

/**
 * Assign an accessible role without assuming which role enum the running
 * Shell exposes. Newer St versions dropped St.AccessibleRole; Atk.Role uses
 * the same numeric values and remains available.
 */
export function setAccessibleRole(actor, roleName) {
    if (!actor || !roleName)
        return;
    try {
        const role = St.AccessibleRole?.[roleName] ?? Atk.Role?.[roleName];
        if (role !== undefined && role !== null)
            actor.accessible_role = role;
    } catch (e) {}
}

/**
 * Some Shell versions no longer expose St.Widget.set_tooltip_text(). Keep the
 * accessible name as the authoritative label and simply skip the visual
 * tooltip when the API is unavailable.
 */
export function setTooltip(actor, text) {
    if (!actor || !text)
        return;
    try {
        if (typeof actor.set_tooltip_text === 'function')
            actor.set_tooltip_text(String(text));
    } catch (e) {}
}

export function setChipA11y(actor, name) {
    if (!actor || !name)
        return;
    try {
        actor.accessible_name = String(name);
    } catch (e) {}
    try {
        actor.can_focus = true;
    } catch (e) {}
}
