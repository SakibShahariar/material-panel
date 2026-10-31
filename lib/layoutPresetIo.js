const FORMAT = 'material-panel-layout-preset';
const VERSION = 1;
const ZONES = ['left', 'center', 'right'];
const MODULE_ID = /^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/;

function normalizeName(value) {
    const name = String(value ?? '').trim()
        .replace(/[^a-zA-Z0-9_-]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 48);
    if (!name)
        throw new Error('Preset name is empty or invalid');
    return name;
}

function normalizePreset(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value) ||
        !value.zones || typeof value.zones !== 'object' || Array.isArray(value.zones))
        throw new Error('Preset must contain a zones object');

    const preset = JSON.parse(JSON.stringify(value));
    const seen = new Set();
    const zones = {};
    for (const zone of ZONES) {
        const items = preset.zones[zone];
        if (!Array.isArray(items))
            throw new Error(`Preset zone "${zone}" must be an array`);
        zones[zone] = [];
        for (const id of items) {
            if (typeof id !== 'string' || !MODULE_ID.test(id) || seen.has(id))
                continue;
            seen.add(id);
            zones[zone].push(id);
        }
    }
    preset.zones = zones;
    return preset;
}

export function serializeLayoutPreset(name, preset) {
    const document = {
        format: FORMAT,
        version: VERSION,
        name: normalizeName(name),
        preset: normalizePreset(preset),
    };
    return JSON.stringify(document, null, 2);
}

export function parseLayoutPreset(text) {
    const document = JSON.parse(String(text ?? ''));
    if (!document || document.format !== FORMAT || document.version !== VERSION)
        throw new Error('Unsupported layout preset format');
    return {
        name: normalizeName(document.name),
        preset: normalizePreset(document.preset),
    };
}
