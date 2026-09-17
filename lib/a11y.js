/**
 * Accessible names for panel chips (Orca / keyboard).
 */
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
