import Clutter from 'gi://Clutter';
import St from 'gi://St';
import {getThemeColor} from './themeColorState.js';

const clampStyleValue = (value, fallback, maximum) =>
    Number.isFinite(value) ? Math.min(maximum, Math.max(0, value)) : fallback;

/**
 * Shared GNOME-native surface for Control Center summary cards.
 * Keep card geometry and surface treatment centralized while leaving each
 * card responsible for its own content, accessible names and lifecycle.
 */
export function createControlCenterCardShell({
    padding = 14,
    spacing = 8,
    radius = 18,
    surface = null,
} = {}) {
    const card = new St.BoxLayout({
        style_class: 'material-panel-control-center-card',
        orientation: Clutter.Orientation.VERTICAL,
        x_expand: true,
    });
    const background = typeof surface === 'string' && surface
        ? surface
        : getThemeColor('qsSurface', 'rgba(49, 50, 68, 0.55)');
    const safePadding = clampStyleValue(padding, 14, 32);
    const safeSpacing = clampStyleValue(spacing, 8, 32);
    const safeRadius = clampStyleValue(radius, 18, 32);
    card.style = `background-color: ${background}; border-radius: ${safeRadius}px; padding: ${safePadding}px; spacing: ${safeSpacing}px;`;
    return card;
}


/** Create the consistent title row used by built-in and optional Home cards. */
export function createControlCenterCardTitle(text, {expand = false} = {}) {
    const label = typeof text === 'string' ? text : '';
    const title = new St.Label({
        text: label,
        x_expand: expand === true,
        style_class: 'material-panel-control-center-card-title',
    });
    title.style = 'font-size: 14px; font-weight: 650;';
    title.accessible_name = label;
    return title;
}
