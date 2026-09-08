/**
 * Material Symbols Rounded glyphs (end-4 style).
 * ONLY used when the font is actually installed; otherwise returns null
 * so callers use SVG FileIcon (never show "tu" / "volume_up" as text).
 */
import St from 'gi://St';
import Clutter from 'gi://Clutter';
import Pango from 'gi://Pango';
import GLib from 'gi://GLib';

export const SYMBOL_NAME = {
    'volume-high': 'volume_up',
    'volume-medium': 'volume_down',
    'volume-low': 'volume_mute',
    'volume-muted': 'volume_off',
    'network-wifi': 'wifi',
    'network-wired': 'settings_ethernet',
    'network-offline': 'wifi_off',
    'network-up': 'arrow_upward',
    'network-down': 'arrow_downward',
    'battery-full': 'battery_full',
    'battery-high': 'battery_5_bar',
    'battery-low': 'battery_2_bar',
    'battery-critical': 'battery_1_bar',
    'battery-charging': 'battery_charging_full',
    'brightness': 'light_mode',
    'dark-mode': 'dark_mode',
    'light-mode': 'light_mode',
    'night-light': 'bedtime',
    'bluetooth-on': 'bluetooth',
    'bluetooth-off': 'bluetooth_disabled',
    'notifications': 'notifications',
    'settings': 'settings',
    'quicksettings': 'tune',
    'cpu': 'memory',
    'cpu-temp': 'device_thermostat',
    'weather': 'partly_cloudy_day',
    'weather-sunny': 'clear_day',
    'weather-partly-cloudy': 'partly_cloudy_day',
    'weather-cloudy': 'cloud',
    'weather-rain': 'rainy',
    'weather-snow': 'weather_snowy',
    'weather-thunder': 'thunderstorm',
    'weather-fog': 'foggy',
    'weather-clear-night': 'clear_night',
    'media-play': 'play_arrow',
    'media-pause': 'pause',
    'media-next': 'skip_next',
    'media-prev': 'skip_previous',
    'headphones': 'headphones',
    'computer': 'desktop_windows',
    'apps': 'apps',
    'lock': 'lock',
    'suspend': 'bedtime',
    'restart': 'restart_alt',
    'shutdown': 'power_settings_new',
    'dnd-active': 'do_not_disturb_on',
    'dnd-inactive': 'do_not_disturb_off',
};

let _fontOk = null;

function _familyExists(family) {
    try {
        // fc-list is reliable on user systems
        const [ok, out] = GLib.spawn_command_line_sync(`fc-list "${family}" file`);
        if (ok) {
            const s = new TextDecoder().decode(out).trim();
            if (s.length > 0)
                return true;
        }
    } catch (e) {}
    try {
        const [ok, out] = GLib.spawn_command_line_sync('fc-list : family');
        if (ok) {
            const s = new TextDecoder().decode(out);
            if (s.includes('Material Symbols Rounded') || s.includes('Material Symbols Outlined'))
                return true;
        }
    } catch (e) {}
    return false;
}

export function materialSymbolsAvailable() {
    if (_fontOk !== null)
        return _fontOk;
    _fontOk = _familyExists('Material Symbols Rounded') ||
        _familyExists('Material Symbols Outlined');
    return _fontOk;
}

export function createMaterialSymbol(key, size = 18, color = null, fill = 1) {
    // Critical: without the font, ligatures render as "tu", "volume_up", etc.
    if (!materialSymbolsAvailable())
        return null;
    const name = SYMBOL_NAME[key];
    if (!name)
        return null;

    const label = new St.Label({
        style_class: 'material-symbol-icon',
        text: name,
        y_align: Clutter.ActorAlign.CENTER,
        x_align: Clutter.ActorAlign.CENTER,
        reactive: false,
    });
    try {
        label.clutter_text.ellipsize = Pango.EllipsizeMode.NONE;
    } catch (e) {}
    applyMaterialSymbolStyle(label, size, color, fill);
    return label;
}

export function applyMaterialSymbolStyle(label, size, color, fill = 1) {
    if (!label)
        return;
    const f = Math.max(0, Math.min(1, Number(fill) || 0));
    const col = color || 'inherit';
    try {
        label.style =
            `font-family: "Material Symbols Rounded", "Material Symbols Outlined";` +
            `font-size: ${Math.round(size)}px;` +
            `font-weight: 400;` +
            `font-style: normal;` +
            `font-variation-settings: "FILL" ${f.toFixed(1)}, "wght" 400, "GRAD" 0, "opsz" ${Math.round(size)};` +
            `color: ${col};` +
            `padding: 0; margin: 0;` +
            `width: ${Math.round(size + 2)}px; height: ${Math.round(size + 2)}px;` +
            `text-align: center;`;
    } catch (e) {}
}

export function setMaterialSymbolKey(label, key) {
    const name = SYMBOL_NAME[key];
    if (label && name)
        label.text = name;
}

export function setMaterialSymbolColor(label, color, fill = 1) {
    if (!label)
        return;
    try {
        const sizeMatch = /font-size:\s*([\d.]+)px/.exec(label.style || '');
        const size = sizeMatch ? Number(sizeMatch[1]) : 18;
        applyMaterialSymbolStyle(label, size, color, fill);
    } catch (e) {}
}
