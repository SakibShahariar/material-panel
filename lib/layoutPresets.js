/**
 * Layout presets: default, end4, ryoku (structure only — matugen colors).
 * Snapshots zones/panelSize when switching so layouts don't clobber each other.
 */

export const LAYOUT_DEFAULT = 'default';
export const LAYOUT_END4 = 'end4';
/** Rail + stage QS (Ryoku-inspired structure, not monochrome). */
export const LAYOUT_RYOKU = 'ryoku';

export const END4_ZONES = {
    left: ['focusedWindow', 'cpu', 'networkSpeed', 'media'],
    center: ['workspaces', 'clock'],
    right: ['weather', 'notifications', 'volume', 'battery', 'quicksettings'],
};

export const DEFAULT_ZONES = {
    left: ['activities', 'workspaces', 'cpu'],
    center: ['weather', 'clock', 'notifications'],
    right: ['networkSpeed', 'volume', 'battery', 'quicksettings'],
};

/** Ryoku: calm bar like default; QS is where structure changes. */
export const RYOKU_ZONES = {
    left: ['activities', 'workspaces', 'cpu'],
    center: ['weather', 'clock'],
    right: ['notifications', 'networkSpeed', 'volume', 'battery', 'quicksettings'],
};

export const END4_PANEL_SIZE = {
    scale: 1.0,
    gapTop: 0,
    gapBottom: 0,
    gapSide: 0,
};

export const DEFAULT_PANEL_SIZE = {
    scale: 1.0,
    gapTop: 5,
    gapBottom: 4,
    gapSide: 0,
};

function clone(o) {
    return JSON.parse(JSON.stringify(o));
}

function normalizeStyle(style) {
    if (style === LAYOUT_END4)
        return LAYOUT_END4;
    if (style === LAYOUT_RYOKU)
        return LAYOUT_RYOKU;
    return LAYOUT_DEFAULT;
}

/**
 * Apply a layout cleanly. Saves the previous layout's zone+size snapshot
 * under config.layoutSnapshots[prev] so switching back restores it.
 */
export function applyLayoutStyle(config, style) {
    const next = normalizeStyle(style);
    const prev = normalizeStyle(config.layoutStyle);

    if (!config.layoutSnapshots || typeof config.layoutSnapshots !== 'object')
        config.layoutSnapshots = {};

    try {
        const preset = config.presets?.[config.activePreset];
        config.layoutSnapshots[prev] = {
            zones: clone(preset?.zones ?? DEFAULT_ZONES),
            panelSize: clone(config.panelSize ?? DEFAULT_PANEL_SIZE),
            activePreset: config.activePreset,
        };
    } catch (e) {}

    config.layoutStyle = next;

    const snap = config.layoutSnapshots[next];
    const ensurePreset = () => {
        return config.presets[config.activePreset]
            ?? (config.presets.default = {zones: clone(DEFAULT_ZONES)});
    };

    if (snap?.zones) {
        const preset = ensurePreset();
        if (next === LAYOUT_END4)
            preset.zones = clone(END4_ZONES);
        else if (next === LAYOUT_RYOKU)
            preset.zones = clone(snap.zones?.left ? snap.zones : RYOKU_ZONES);
        else
            preset.zones = clone(snap.zones);
        if (snap.panelSize)
            config.panelSize = {...DEFAULT_PANEL_SIZE, ...snap.panelSize};
    } else if (next === LAYOUT_END4) {
        const preset = ensurePreset();
        preset.zones = clone(END4_ZONES);
        config.panelSize = {
            ...config.panelSize,
            ...END4_PANEL_SIZE,
            scale: config.panelSize?.scale ?? 1.0,
        };
    } else if (next === LAYOUT_RYOKU) {
        const preset = ensurePreset();
        preset.zones = clone(RYOKU_ZONES);
        config.panelSize = {
            ...DEFAULT_PANEL_SIZE,
            scale: config.panelSize?.scale ?? 1.0,
            gapTop: config.panelSize?.gapTop ?? 5,
            gapBottom: config.panelSize?.gapBottom ?? 4,
            gapSide: 0,
        };
    } else {
        const preset = ensurePreset();
        if (!preset.zones || (!preset.zones.left?.length && !preset.zones.center?.length && !preset.zones.right?.length))
            preset.zones = clone(DEFAULT_ZONES);
        config.panelSize = {
            ...DEFAULT_PANEL_SIZE,
            scale: config.panelSize?.scale ?? 1.0,
            gapTop: config.panelSize?.gapTop ?? 5,
            gapBottom: config.panelSize?.gapBottom ?? 4,
            gapSide: 0,
        };
    }

    return config;
}

export function layoutLabel(style) {
    const s = normalizeStyle(style);
    if (s === LAYOUT_END4)
        return 'End-4';
    if (s === LAYOUT_RYOKU)
        return 'Ryoku';
    return 'Default';
}
