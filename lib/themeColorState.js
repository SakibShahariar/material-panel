const DEFAULT_COLORS = Object.freeze({
    barColor: '#1e1e2e',
    primary: '#89b4fa',
    onPrimary: '#1e1e2e',
    onSurface: '#cdd6f4',
    surface: '#1e1e2e',
    hoverBg: 'rgba(205, 214, 244, 0.14)',
    hoverBgStrong: 'rgba(205, 214, 244, 0.22)',
    qsSurface: 'rgba(49, 50, 68, 0.55)',
    secondary: '#89b4fa',
    tertiary: '#89b4fa',
});

let colors = {};

export function setThemeColors(next = {}) {
    colors = {...next};
}

export function getThemeColor(name, fallback = DEFAULT_COLORS[name]) {
    return colors[name] ?? fallback;
}

export function clearThemeColors() {
    colors = {};
}

export function resolveThemeColors(vars = {}) {
    const surface = vars.surface_container ?? vars.surface ?? vars.background ?? 'transparent';
    const onSurfaceRgb = vars.on_surface_rgb;
    const surfaceHighRgb = vars.surface_container_high_rgb;
    const surfaceRgb = vars.surface_container_rgb;
    const rgba = (rgb, alpha) =>
        'rgba(' + rgb.trim().split(/[\s,]+/).filter(Boolean).join(', ') + ', ' + alpha + ')';

    return {
        barColor: surface,
        primary: vars.primary,
        onPrimary: vars.on_primary,
        onSurface: vars.on_surface,
        surface,
        hoverBg: onSurfaceRgb ? rgba(onSurfaceRgb, 0.14) : DEFAULT_COLORS.hoverBg,
        hoverBgStrong: onSurfaceRgb ? rgba(onSurfaceRgb, 0.22) : DEFAULT_COLORS.hoverBgStrong,
        qsSurface: surfaceHighRgb
            ? rgba(surfaceHighRgb, 0.55)
            : surfaceRgb ? rgba(surfaceRgb, 0.55) : DEFAULT_COLORS.qsSurface,
        secondary: vars.secondary ?? vars.primary,
        tertiary: vars.tertiary ?? vars.primary,
    };
}
