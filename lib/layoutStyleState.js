/**
 * Module-scoped panel layout selection shared by Shell-side builders and
 * integration helpers. The extension owns config updates and teardown reset.
 */
let layoutStyle = 'default';

export function setLayoutStyle(value) {
    layoutStyle = typeof value === 'string' && value ? value : 'default';
}

export function getLayoutStyle() {
    return layoutStyle;
}

export function clearLayoutStyle() {
    layoutStyle = 'default';
}
