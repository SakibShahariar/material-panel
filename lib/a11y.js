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
