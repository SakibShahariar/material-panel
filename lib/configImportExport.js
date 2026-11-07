function isRecord(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function validatePreset(preset, name) {
    if (!isRecord(preset) || !isRecord(preset.zones))
        throw new Error(`Preset "${name}" must contain a zones object`);
    for (const zone of ['left', 'center', 'right']) {
        if (!Array.isArray(preset.zones[zone]))
            throw new Error(`Preset "${name}" has an invalid ${zone} zone`);
        if (preset.zones[zone].some(id => typeof id !== 'string' || !id.trim()))
            throw new Error(`Preset "${name}" contains an invalid module ID`);
    }
}

export function parsePanelConfig(text) {
    const parsed = JSON.parse(String(text));
    if (!isRecord(parsed))
        throw new Error('Configuration must be a JSON object');
    if (parsed.presets !== undefined) {
        if (!isRecord(parsed.presets))
            throw new Error('Configuration presets must be an object');
        for (const [name, preset] of Object.entries(parsed.presets))
            validatePreset(preset, name);
        const active = parsed.activePreset ?? 'default';
        if (Object.keys(parsed.presets).length > 0 && !parsed.presets[active])
            throw new Error('The active preset does not exist');
    }
    return parsed;
}

export function serializePanelConfig(config) {
    if (!isRecord(config))
        throw new Error('Configuration must be an object');
    if (isRecord(config.presets)) {
        for (const [name, preset] of Object.entries(config.presets))
            validatePreset(preset, name);
    }
    return JSON.stringify(config, null, 2) + '\n';
}

export function createSafeModeConfig(config) {
    const safe = JSON.parse(JSON.stringify(isRecord(config) ? config : {}));
    safe.layoutStyle = 'default';
    safe.activePreset = 'safe';
    safe.presets = isRecord(safe.presets) ? safe.presets : {};
    safe.presets.safe = {
        zones: {
            left: [],
            center: ['clock'],
            right: ['powermenu'],
        },
    };
    safe.hiddenModules = [];
    safe.hiddenForeignRoles = [];
    safe.foreignRoleZones = {};
    safe.trayAllHidden = false;
    return safe;
}
