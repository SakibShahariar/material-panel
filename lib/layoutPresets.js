/**
 * Named layout presets. Switching never mutates the other layout's saved
 * snapshot — default stays intact while end4 is experimented with.
 */

export const LAYOUT_DEFAULT = 'default';
export const LAYOUT_END4 = 'end4';

export const END4_ZONES = {
    // end-4 BarContent analogue:
    // left: focused window + workspaces
    // center: resources + media + weather + clock
    // right: status + QS
    left: ['focusedWindow', 'workspaces'],
    center: ['cpu', 'media', 'weather', 'clock'],
    right: ['notifications', 'networkSpeed', 'volume', 'battery', 'quicksettings'],
};

export const DEFAULT_ZONES = {
    left: ['activities', 'workspaces', 'cpu'],
    center: ['weather', 'clock', 'notifications'],
    right: ['networkSpeed', 'volume', 'battery', 'quicksettings'],
};

export const END4_PANEL_SIZE = {
    scale: 1.0,
    gapTop: 0,
    gapBottom: 0,
    gapSide: 0, // Hug = full width; raise for Float
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

/**
 * Apply a layout cleanly. Saves the previous layout's zone+size snapshot
 * under config.layoutSnapshots[prev] so switching back restores it.
 */
export function applyLayoutStyle(config, style) {
    const next = style === LAYOUT_END4 ? LAYOUT_END4 : LAYOUT_DEFAULT;
    const prev = config.layoutStyle === LAYOUT_END4 ? LAYOUT_END4 : LAYOUT_DEFAULT;

    if (!config.layoutSnapshots || typeof config.layoutSnapshots !== 'object')
        config.layoutSnapshots = {};

    // Snapshot current before leaving
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
    if (snap?.zones) {
        const preset = config.presets[config.activePreset]
            ?? (config.presets.default = {zones: clone(DEFAULT_ZONES)});
        preset.zones = clone(snap.zones);
        if (snap.panelSize)
            config.panelSize = {...DEFAULT_PANEL_SIZE, ...snap.panelSize};
    } else if (next === LAYOUT_END4) {
        const preset = config.presets[config.activePreset]
            ?? (config.presets.default = {zones: clone(DEFAULT_ZONES)});
        preset.zones = clone(END4_ZONES);
        config.panelSize = {
            ...config.panelSize,
            ...END4_PANEL_SIZE,
            scale: config.panelSize?.scale ?? 1.0,
        };
    } else {
        const preset = config.presets[config.activePreset]
            ?? (config.presets.default = {zones: clone(DEFAULT_ZONES)});
        // Prefer snapshot of default if any; else factory zones only if empty
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
    return style === LAYOUT_END4 ? 'End-4' : 'Default';
}
