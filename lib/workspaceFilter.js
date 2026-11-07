export const WORKSPACE_FILTERS = Object.freeze([
    'all',
    'active',
    'urgent',
    'occupied',
]);

export function normalizeWorkspaceFilter(value) {
    return WORKSPACE_FILTERS.includes(value) ? value : 'all';
}

/**
 * Return original workspace indices so filtered indicators keep their real
 * numbering and activation targets. The active workspace is retained in
 * occupied/urgent modes even when it has no windows.
 */
export function filterWorkspaceIndices(filter, states, activeIndex) {
    if (!Array.isArray(states) || states.length === 0)
        return [];

    const active = Number.isInteger(activeIndex) && activeIndex >= 0 &&
        activeIndex < states.length ? activeIndex : 0;
    const mode = normalizeWorkspaceFilter(filter);

    if (mode === 'active')
        return [active];

    const indices = [];
    for (let index = 0; index < states.length; index++) {
        const state = states[index] ?? {};
        if (index === active ||
            (mode === 'occupied' && state.occupied === true) ||
            (mode === 'urgent' && state.urgent === true) ||
            mode === 'all')
            indices.push(index);
    }
    return indices;
}
