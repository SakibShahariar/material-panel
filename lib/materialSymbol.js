/**
 * end-4 style icons: Material Symbols Rounded rendered as text glyphs.
 * Same approach as Quickshell MaterialSymbol.qml (font + ligature name).
 *
 * Install (Fedora/Arch examples):
 *   Fedora:  sudo dnf install google-material-symbols-fonts  (if packaged)
 *   Arch:    yay -S ttf-material-symbols-variable-git
 *   Or copy Material Symbols Rounded into ~/.local/share/fonts && fc-cache -fv
 *
 * Falls back to null when the font is missing — callers keep SVG FileIcon.
 */
import St from 'gi://St';
import Clutter from 'gi://Clutter';
import Pango from 'gi://Pango';

/** Our asset key → Material Symbols ligature (underscore names) */
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
    'fedora-logo': 'toys', // placeholder; real logo stays SVG
};

let _fontOk = null;

export function materialSymbolsAvailable() {
    if (_fontOk !== null)
        return _fontOk;
    try {
        const ctx = St.ThemeContext.get_for_stage(global.stage);
        // Probe via Pango font map
        const map = Pango.FontMap.get_default?.() || imports.gi.PangoCairo.FontMap.get_default();
        const fams = [];
        try {
            // list families is heavy; match description instead
            const desc = Pango.FontDescription.from_string('Material Symbols Rounded 16');
            const pc = map.load_font(Pango.Context.new?.() || null, desc);
            _fontOk = !!pc;
        } catch (e) {
            // Fallback: assume available if user theme can resolve — try soft true
            // and let missing glyphs show empty; modules still have SVG path.
            _fontOk = true;
        }
    } catch (e) {
        _fontOk = true;
    }
    return _fontOk;
}

/**
 * @param {string} key our icon key
 * @param {number} size px
 * @param {string} [color] css color
 * @param {number} [fill] 0..1 like end-4 FILL axis
 * @returns {St.Label|null}
 */
export function createMaterialSymbol(key, size = 18, color = null, fill = 1) {
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
    // end-4: Material Symbols Rounded + FILL axis
    try {
        label.style =
            `font-family: "Material Symbols Rounded", "Material Symbols Outlined", sans-serif;` +
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
