import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import St from 'gi://St';

import {applyIcons} from './iconTheme.js';

// St (GNOME Shell's CSS engine) doesn't support CSS custom properties/var(),
// so we can't @import matugen's output directly. Instead we parse its
// `--name: value;` lines ourselves and substitute concrete values into our
// own rules, then write that out as a second stylesheet loaded on top of
// the base stylesheet.css (fixed-palette fallback) bundled with the
// extension. Same selectors in both files means the later-loaded one wins.
const VAR_RE = /--([a-zA-Z0-9_]+):\s*([^;]+);/g;

// Directory watching (inotify via GIO) can silently watch the wrong
// location if a path component is a symlink - common with dotfiles
// managers that symlink config directories from a separate repo
// (confirmed: this broke matugen live-reload specifically, since
// ~/.config/matugen is exactly this kind of symlink on some setups).
// Resolves one level of symlink on the directory itself and falls back
// to the original path if it isn't a symlink (the common case).
function resolveRealDir(dirPath) {
    try {
        const linkTarget = GLib.file_read_link(dirPath);
        if (linkTarget)
            return GLib.canonicalize_filename(linkTarget, GLib.path_get_dirname(dirPath));
    } catch (e) {
        // Not a symlink - use as-is.
    }
    return dirPath;
}

export class ThemeManager {
    constructor(extensionPath) {
        this._extensionPath = extensionPath;
        // Use HOME-based path to avoid distrobox XDG divergence (see configStore.js)
        this._generatedPath = GLib.build_filenamev(
            [GLib.get_home_dir(), '.config', 'material-panel', 'generated-theme.css']);
        this._loadedFile = null;
        this._monitor = null;
    }

    _parseMatugenCss(path) {
        const file = Gio.File.new_for_path(path);
        if (!file.query_exists(null))
            return null;
        const [ok, contents] = file.load_contents(null);
        if (!ok)
            return null;
        const text = new TextDecoder('utf-8').decode(contents);
        const vars = {};
        let match;
        VAR_RE.lastIndex = 0;
        while ((match = VAR_RE.exec(text)) !== null)
            vars[match[1]] = match[2].trim();
        return vars;
    }

    // Maps matugen's Material You role names onto our existing panel classes.
    // Falls back to the same fixed values stylesheet.css already uses, so a
    // partially-populated matugen file degrades gracefully instead of
    // producing missing/invalid CSS values.
    _render(vars) {
        const rgba = (name, alpha, fallback) => {
            const rgb = vars[`${name}_rgb`];
            return rgb ? `rgba(${rgb.split(' ').join(', ')}, ${alpha})` : fallback;
        };
        const hex = (name, fallback) => vars[name] ?? fallback;

        // M3-ish surface ladder (end-4 / DMS style). St has no var(), so we bake values.
        const zoneBg = rgba('surface_container', 0.88, 'rgba(30, 30, 46, 0.88)');
        const chipBg = rgba('surface_container_high', 0.92, 'rgba(49, 50, 68, 0.92)');
        const textColor = hex('on_surface', '#cdd6f4');
        const dimTextColor = hex('on_surface_variant', '#a6adc8');
        const accentBg = hex('primary', '#cba6f7');
        const onAccent = hex('on_primary', '#1e1e2e');
        const hoverBg = rgba('on_surface', 0.14, 'rgba(255, 255, 255, 0.14)');
        // Strong enough to see on QS power row / tiles
        const hoverBgStrong = rgba('on_surface', 0.22, 'rgba(255, 255, 255, 0.22)');
        // QS popup shell (layer 0) — slightly darker than tiles
        const qsPopupBg = rgba('surface', 0.94, 'rgba(24, 24, 37, 0.94)');
        // Cards: profile / media / device list (layer 1)
        const qsCardBg = rgba('surface_container', 0.9, 'rgba(40, 42, 58, 0.9)');
        // Toggle tiles inactive (layer 2) — must read clearly vs popup
        const qsTileBg = rgba('surface_container_high', 0.95, 'rgba(58, 60, 78, 0.95)');
        const outline = rgba('outline', 0.22, 'rgba(147, 153, 178, 0.22)');

        return `/* Generated from matugen output — do not edit by hand */
.material-panel-zone-left,
.material-panel-zone-right,
.material-panel-zone-center {
    background-color: ${zoneBg};
    border: 1px solid ${outline};
}
.material-panel-bar-content-end4 {
    background-color: ${zoneBg};
}
.material-panel-qs-popup .popup-menu-content {
    border: 1px solid ${outline};
}
.material-panel-chip {
    background-color: ${chipBg};
}
.material-panel-clock {
    color: ${accentBg};
}
.material-panel-foreign {
    background-color: ${chipBg};
    color: ${accentBg};
}
.material-panel-foreign StIcon,
.material-panel-foreign .popup-menu-icon,
.material-panel-foreign .app-menu-icon,
.material-panel-foreign-inner StIcon,
.material-panel-foreign StButton StIcon {
    color: ${accentBg};
    -st-icon-style: symbolic;
}
.material-panel-foreign StLabel {
    color: ${accentBg};
}
.material-panel-foreign-inner {
    background-color: transparent !important;
    border-image: none;
    box-shadow: none;
}
.material-panel-cpu-popup-title,
.material-panel-cpu-popup-value {
    color: ${accentBg};
}
.material-panel-cpu-popup-bar-fill {
    background-color: ${accentBg};
}
.material-panel-qs-wifi-row.active .material-panel-qs-wifi-drop StIcon,
.material-panel-qs-wifi-drop.on-accent {
    color: ${onAccent};
}
/* Popup heroes / titles — primary */
.material-panel-clock-popup-time,
.material-panel-clock-cal-title,
.material-panel-battery-popup-title,
.material-panel-battery-popup-value,
.material-panel-weather-popup-temp,
.material-panel-cpu-popup-title,
.material-panel-cpu-popup-value,
.material-panel-cpu-popup-section-title,
.material-panel-popup-stat-value {
    color: ${accentBg};
}
.material-panel-popup-card {
    background-color: ${chipBg};
}
.material-panel-clock-cal-nav-btn {
    color: ${accentBg};
    background-color: transparent;
}
.material-panel-clock-cal-nav-btn:hover {
    background-color: ${hoverBg};
    color: ${accentBg};
}
.material-panel-clock-cal-day.today {
    color: ${onAccent};
    background-color: ${accentBg};
    border-radius: 10px;
}
.material-panel-battery-popup-bar {
    background-color: ${hoverBg};
}
.material-panel-battery-popup-bar-fill {
    background-color: ${accentBg};
}
.material-panel-popup-stat-label {
    color: ${dimTextColor};
}

/* Panel button popups — primary accents on key text */
.material-panel-popup .material-panel-clock-popup-time,
.material-panel-popup .material-panel-battery-popup-value,
.material-panel-popup .material-panel-weather-popup-temp,
.material-panel-popup .material-panel-cpu-popup-title,
.material-panel-popup .material-panel-cpu-popup-value,
.material-panel-popup .material-panel-cpu-popup-section-title,
.material-panel-popup .material-panel-clock-cal-title,
.material-panel-popup .material-panel-popup-stat-value,
.material-panel-popup .material-panel-weather-popup-cond {
    color: ${accentBg};
}
.material-panel-popup .material-panel-clock-cal-nav-btn {
    color: ${accentBg};
}

.material-panel-battery-popup-state,
.material-panel-clock-popup-meta,
.material-panel-weather-popup-place,
.material-panel-weather-popup-source {
    color: ${dimTextColor};
}
.material-panel-clock-cal-day.today {
    background-color: ${accentBg};
    color: ${onAccent};
}
.material-panel-clock-popup-date,
.material-panel-clock-cal-dow-label,
.material-panel-clock-cal-day,
.material-panel-battery-popup-row,
.material-panel-weather-popup-cond,
.material-panel-weather-popup-extra {
    color: ${textColor};
}
.material-panel-workspace-btn {
    color: ${dimTextColor};
    border-radius: 999px;
}
.material-panel-workspace-btn:hover {
    background-color: ${hoverBg};
    color: ${textColor};
    border-radius: 999px;
}
.material-panel-workspace-btn.active {
    color: ${onAccent};
    background-color: ${accentBg};
    border-radius: 999px;
}
/* Active + hover must keep primary (do not drop to hoverBg) */
.material-panel-workspace-btn.active:hover,
.material-panel-workspace-btn.active:active {
    color: ${onAccent};
    background-color: ${accentBg};
    border-radius: 999px;
}
.material-panel-activities-btn {
    color: ${textColor};
}
.material-panel-activities-btn:hover {
    background-color: ${hoverBg};
}
.material-panel-battery-icon,
        .material-panel-volume-icon,
        .material-panel-network-icon,
        .material-panel-network-speed-icon,
        .material-panel-weather-icon,
        .material-panel-notifications-icon {
            color: ${textColor};
        }
.material-panel-cpu-icon,
.material-panel-cpu-temp-icon {
    color: ${accentBg};
}
.material-panel-battery-label,
        .material-panel-volume-label,
        .material-panel-network-speed-label,
        .material-panel-weather-label,
        .material-panel-notifications-label,
        .material-panel-cpu-label,
        .material-panel-cpu-temp-label {
            color: ${accentBg};
        }
.material-panel-volume:hover {
    background-color: ${hoverBg};
}
.material-panel-cpu:hover {
    background-color: ${hoverBg};
}
.material-panel-battery-icon.warn,
.material-panel-battery-label.warn {
    color: ${hex('error', '#ffb4ab')};
}
.material-panel-darkmode-icon,
.material-panel-nightlight-icon,
.material-panel-dnd-icon,
.material-panel-powermenu-icon,
.material-panel-bluetooth-icon {
    color: ${textColor};
}
.material-panel-darkmode-btn:hover,
.material-panel-nightlight-btn:hover,
.material-panel-dnd-btn:hover,
.material-panel-powermenu-btn:hover,
.material-panel-bluetooth-btn:hover {
    background-color: ${hoverBg};
}
.material-panel-darkmode-btn.active,
.material-panel-nightlight-btn.active,
.material-panel-dnd-btn.active,
.material-panel-bluetooth-btn.active {
    background-color: ${accentBg};
}
.material-panel-darkmode-btn.active .material-panel-darkmode-icon,
.material-panel-nightlight-btn.active .material-panel-nightlight-icon,
.material-panel-dnd-btn.active .material-panel-dnd-icon,
.material-panel-bluetooth-btn.active .material-panel-bluetooth-icon {
    color: ${onAccent};
}

/* Interactive surfaces — hover / active (border-radius must match shape or hover looks square) */
.material-panel-chip,
.material-panel-clock-btn,
.material-panel-battery-btn,
.material-panel-weather-btn,
.material-panel-notifications-btn,
.material-panel-activities-btn,
.material-panel-volume,
.material-panel-network,
.material-panel-network-speed,
.material-panel-cpu {
    border-radius: 999px;
}
.material-panel-chip:hover,
.material-panel-clock-btn:hover,
.material-panel-battery-btn:hover,
.material-panel-weather-btn:hover,
.material-panel-notifications-btn:hover,
.material-panel-activities-btn:hover,
.material-panel-volume:hover,
.material-panel-network:hover,
.material-panel-network-speed:hover,
.material-panel-cpu:hover {
    background-color: ${hoverBg};
    border-radius: 999px;
}
.material-panel-chip:active,
.material-panel-clock-btn:active,
.material-panel-battery-btn:active,
.material-panel-weather-btn:active,
.material-panel-notifications-btn:active,
.material-panel-activities-btn:active {
    background-color: ${accentBg};
    color: ${onAccent};
    border-radius: 999px;
}
.material-panel-chip:active .material-panel-clock,
.material-panel-chip:active StLabel,
.material-panel-chip:active StIcon,
.material-panel-clock-btn:active StIcon,
.material-panel-battery-btn:active StIcon,
.material-panel-weather-btn:active StIcon,
.material-panel-notifications-btn:active StIcon,
.material-panel-activities-btn:active StIcon,
.material-panel-media-btn:active StIcon,
.material-panel-bluetooth-btn:active StIcon,
.material-panel-cpu:active StIcon,
.material-panel-volume:active StIcon,
.material-panel-network:active StIcon,
.material-panel-network-speed:active StIcon {
    color: ${onAccent};
}
.material-panel-foreign:hover,
.material-panel-foreign:active {
    border-radius: 999px;
}
.material-panel-foreign:hover {
    background-color: ${hoverBg};
}
.material-panel-foreign:active {
    background-color: ${accentBg};
    color: ${onAccent};
}
.material-panel-foreign:active StIcon,
.material-panel-foreign:active StLabel,
.material-panel-foreign:active .material-panel-foreign-inner StIcon,
.material-panel-foreign.pressed StIcon,
.material-panel-foreign.pressed StLabel,
.material-panel-chip.pressed StIcon,
.material-panel-chip.pressed StLabel,
.material-panel-network-speed.pressed StIcon,
.material-panel-network-speed.pressed StLabel {
    color: ${onAccent};
}
.material-panel-foreign.pressed,
.material-panel-chip.pressed,
.material-panel-network-speed.pressed {
    background-color: ${accentBg};
    color: ${onAccent};
    border-radius: 999px;
}

.material-panel-qs-tile,
.material-panel-qs-bt-tile-row,
.material-panel-qs-wifi-row,
.material-panel-qs-bt-main,
.material-panel-qs-wifi-main,
.material-panel-qs-bt-drop,
.material-panel-qs-wifi-drop {
    border-radius: 16px;
}
.material-panel-qs-tile:hover,
.material-panel-qs-bt-tile-row:hover,
.material-panel-qs-wifi-row:hover {
    background-color: ${hoverBg};
    border-radius: 16px;
}
/* Active QS tiles keep primary on hover */
.material-panel-qs-tile.active:hover,
.material-panel-qs-bt-tile-row.active:hover,
.material-panel-qs-wifi-row.active:hover {
    background-color: ${accentBg};
    border-radius: 16px;
}
.material-panel-qs-tile:active {
    background-color: ${accentBg};
    color: ${onAccent};
    border-radius: 16px;
}
.material-panel-qs-tile:active .material-panel-qs-tile-icon,
.material-panel-qs-tile:active .material-panel-qs-tile-label {
    color: ${onAccent};
}
.material-panel-qs-bt-main:hover,
.material-panel-qs-wifi-main:hover,
.material-panel-qs-bt-drop:hover,
.material-panel-qs-wifi-drop:hover {
    background-color: ${hoverBg};
    border-radius: 14px;
}
.material-panel-qs-bt-main:active,
.material-panel-qs-wifi-main:active,
.material-panel-qs-bt-drop:active,
.material-panel-qs-wifi-drop:active {
    background-color: ${accentBg};
    color: ${onAccent};
    border-radius: 14px;
}
.material-panel-qs-bt-device {
    border-radius: 12px;
}
.material-panel-qs-bt-device:hover {
    background-color: ${hoverBg};
    border-radius: 12px;
}
.material-panel-qs-bt-device.connected:hover {
    background-color: ${accentBg};
    border-radius: 12px;
}
.material-panel-qs-bt-device:active {
    background-color: ${accentBg};
    color: ${onAccent};
    border-radius: 12px;
}
.material-panel-qs-bt-device:active .material-panel-qs-bt-device-name,
.material-panel-qs-bt-device:active .material-panel-qs-bt-device-status,
.material-panel-qs-bt-device:active StIcon {
    color: ${onAccent};
}
.material-panel-workspace-btn:hover {
    background-color: ${hoverBg};
    color: ${textColor};
    border-radius: 999px;
}
.material-panel-workspace-btn:active {
    background-color: ${accentBg};
    color: ${onAccent};
    border-radius: 999px;
}
.material-panel-workspace-btn.active:hover,
.material-panel-workspace-btn.active:active {
    background-color: ${accentBg};
    color: ${onAccent};
    border-radius: 999px;
}
.material-panel-clock-cal-nav-btn:hover {
    background-color: ${hoverBg};
}
.material-panel-clock-cal-nav-btn:active {
    background-color: ${accentBg};
    color: ${onAccent};
}
.material-panel-clock-cal-day:hover {
    background-color: ${hoverBg};
}
.material-panel-popup .popup-menu-item:hover {
    background-color: ${hoverBg};
}
.material-panel-popup .popup-menu-item:active {
    background-color: ${accentBg};
    color: ${onAccent};
}


.material-panel-qs-net-speed-label,
.material-panel-network-speed-icon {
    color: ${accentBg};
}
.material-panel-network-speed.pressed .material-panel-network-speed-icon,
.material-panel-network-speed:active .material-panel-network-speed-icon {
    color: ${onAccent};
}
.material-panel-qs-wifi-speed {
    color: ${dimTextColor};
}
.material-panel-qs-wifi-row.active .material-panel-qs-wifi-speed {
    color: ${onAccent};
}

.material-panel-media-label,
.material-panel-media-popup-title,
.material-panel-media-icon,
.material-panel-bt-chip-batt {
    color: ${accentBg};
}
.material-panel-media-popup-artist,
.material-panel-qs-media-artist {
    color: ${dimTextColor};
}
.material-panel-qs-media-title {
    color: ${textColor};
}
.material-panel-media-popup-btn:hover,
.material-panel-qs-media-btn:hover {
    background-color: ${hoverBg};
}

.material-panel-net-speed-popup-title,
.material-panel-net-speed-popup-down,
.material-panel-net-speed-popup-up {
    color: ${accentBg};
}
.material-panel-net-speed-popup-iface {
    color: ${dimTextColor};
}

.material-panel-clock-btn.pressed,
.material-panel-clock-btn:active {
    background-color: ${accentBg};
}
.material-panel-clock-btn.pressed .material-panel-clock,
.material-panel-clock-btn:active .material-panel-clock,
.material-panel-clock-btn.pressed StLabel,
.material-panel-clock-btn:active StLabel {
    color: ${onAccent};
}
.material-panel-workspace-btn.pressed {
    background-color: ${accentBg};
    color: ${onAccent};
}
.material-panel-cpu.pressed .material-panel-cpu-label,
.material-panel-cpu.pressed .material-panel-cpu-temp-label,
.material-panel-cpu:active .material-panel-cpu-label,
.material-panel-cpu:active .material-panel-cpu-temp-label {
    color: ${onAccent};
}


/* QS interactive states */
.material-panel-qs-profile-prefs {
    border-radius: 999px;
    padding: 6px;
}
.material-panel-qs-profile-prefs:hover {
    background-color: ${hoverBg};
}
.material-panel-qs-profile-prefs:active,
.material-panel-qs-profile-prefs.pressed {
    background-color: ${accentBg};
}
.material-panel-qs-profile-prefs:active StIcon,
.material-panel-qs-profile-prefs.pressed StIcon {
    color: ${onAccent};
}
.material-panel-qs-tile:focus,
.material-panel-qs-bt-main:focus,
.material-panel-qs-wifi-main:focus,
.material-panel-qs-bt-drop:focus,
.material-panel-qs-wifi-drop:focus,
.material-panel-qs-media-btn:focus,
.material-panel-qs-profile-prefs:focus {
    box-shadow: inset 0 0 0 2px ${accentBg};
}
.material-panel-qs-power-btn:hover,
.material-panel-qs-media-btn:hover {
    background-color: ${hoverBg};
}
.material-panel-qs-power-btn:active,
.material-panel-qs-media-btn:active {
    background-color: ${accentBg};
    color: ${onAccent};
}
.material-panel-qs-power-btn:active StIcon,
.material-panel-qs-media-btn:active StIcon {
    color: ${onAccent};
}
.material-panel-qs-bt-device:focus,
.material-panel-qs-wifi-row .material-panel-qs-bt-device:focus {
    box-shadow: inset 0 0 0 2px ${accentBg};
}


/* === QS unified interactive surfaces === */
.material-panel-qs-tile,
.material-panel-qs-bt-tile-row,
.material-panel-qs-wifi-row,
.material-panel-qs-bt-main,
.material-panel-qs-wifi-main,
.material-panel-qs-bt-drop,
.material-panel-qs-wifi-drop,
.material-panel-qs-bt-device,
.material-panel-qs-power-btn,
.material-panel-qs-media-btn,
.material-panel-qs-profile-prefs {
    transition-duration: 120ms;
}
.material-panel-qs-tile:hover,
.material-panel-qs-bt-tile-row:hover,
.material-panel-qs-wifi-row:hover,
.material-panel-qs-bt-main:hover,
.material-panel-qs-wifi-main:hover,
.material-panel-qs-bt-drop:hover,
.material-panel-qs-wifi-drop:hover,
.material-panel-qs-bt-device:hover,
.material-panel-qs-power-btn:hover,
.material-panel-qs-media-btn:hover,
.material-panel-qs-profile-prefs:hover {
    background-color: ${hoverBg};
}
.material-panel-qs-tile:active,
.material-panel-qs-tile.pressed,
.material-panel-qs-bt-tile-row:active,
.material-panel-qs-bt-tile-row.pressed,
.material-panel-qs-wifi-row:active,
.material-panel-qs-wifi-row.pressed,
.material-panel-qs-bt-main:active,
.material-panel-qs-bt-main.pressed,
.material-panel-qs-wifi-main:active,
.material-panel-qs-wifi-main.pressed,
.material-panel-qs-bt-drop:active,
.material-panel-qs-bt-drop.pressed,
.material-panel-qs-wifi-drop:active,
.material-panel-qs-wifi-drop.pressed,
.material-panel-qs-bt-device:active,
.material-panel-qs-bt-device.pressed,
.material-panel-qs-power-btn:active,
.material-panel-qs-power-btn.pressed,
.material-panel-qs-media-btn:active,
.material-panel-qs-media-btn.pressed,
.material-panel-qs-profile-prefs:active,
.material-panel-qs-profile-prefs.pressed {
    background-color: ${accentBg};
    color: ${onAccent};
}
.material-panel-qs-tile:active StLabel,
.material-panel-qs-tile.pressed StLabel,
.material-panel-qs-tile:active StIcon,
.material-panel-qs-tile.pressed StIcon,
.material-panel-qs-bt-main:active StLabel,
.material-panel-qs-bt-main.pressed StLabel,
.material-panel-qs-bt-main:active StIcon,
.material-panel-qs-bt-main.pressed StIcon,
.material-panel-qs-wifi-main:active StLabel,
.material-panel-qs-wifi-main.pressed StLabel,
.material-panel-qs-wifi-main:active StIcon,
.material-panel-qs-wifi-main.pressed StIcon,
.material-panel-qs-bt-drop:active StIcon,
.material-panel-qs-bt-drop.pressed StIcon,
.material-panel-qs-wifi-drop:active StIcon,
.material-panel-qs-wifi-drop.pressed StIcon,
.material-panel-qs-bt-device:active StLabel,
.material-panel-qs-bt-device.pressed StLabel,
.material-panel-qs-bt-device:active StIcon,
.material-panel-qs-bt-device.pressed StIcon,
.material-panel-qs-power-btn:active StIcon,
.material-panel-qs-power-btn.pressed StIcon,
.material-panel-qs-media-btn:active StIcon,
.material-panel-qs-media-btn.pressed StIcon,
.material-panel-qs-profile-prefs:active StIcon,
.material-panel-qs-profile-prefs.pressed StIcon,
.material-panel-qs-wifi-row.pressed .material-panel-qs-wifi-speed,
.material-panel-qs-wifi-row:active .material-panel-qs-wifi-speed {
    color: ${onAccent};
}
/* Keep active (on) tiles readable when also pressed */
.material-panel-qs-tile.active:hover,
.material-panel-qs-tile.active.hover,
.material-panel-qs-bt-tile-row.active:hover,
.material-panel-qs-bt-tile-row.active.hover,
.material-panel-qs-wifi-row.active:hover,
.material-panel-qs-wifi-row.active.hover {
    /* Visible feedback on already-active tiles */
    background-color: ${hoverBg};
}
.material-panel-qs-tile.active.hover .material-panel-qs-tile-label,
.material-panel-qs-tile.active.hover .material-panel-qs-tile-icon,
.material-panel-qs-bt-tile-row.active.hover .material-panel-qs-tile-label,
.material-panel-qs-bt-tile-row.active.hover .material-panel-qs-tile-icon,
.material-panel-qs-wifi-row.active.hover .material-panel-qs-tile-label,
.material-panel-qs-wifi-row.active.hover .material-panel-qs-tile-icon,
.material-panel-qs-wifi-row.active.hover .material-panel-qs-wifi-speed {
    color: ${textColor};
}
.material-panel-qs-tile.active.pressed,
.material-panel-qs-bt-tile-row.active.pressed,
.material-panel-qs-wifi-row.active.pressed {
    background-color: ${accentBg};
}
.material-panel-qs-tile.active.pressed .material-panel-qs-tile-label,
.material-panel-qs-tile.active.pressed .material-panel-qs-tile-icon,
.material-panel-qs-bt-tile-row.active.pressed StLabel,
.material-panel-qs-bt-tile-row.active.pressed StIcon,
.material-panel-qs-wifi-row.active.pressed StLabel,
.material-panel-qs-wifi-row.active.pressed StIcon {
    color: ${onAccent};
}

/* ========== UNIFIED INTERACTION (wins over earlier rules) ========== */
/* Panel chips: resting chipBg + primary icons; pressed = primary bg + on_primary */
.material-panel-chip {
    background-color: ${chipBg};
}
.material-panel-chip.hover {
    background-color: ${hoverBgStrong};
}
.material-panel-chip.pressed,
.material-panel-chip:active {
    background-color: ${accentBg} !important;
    color: ${onAccent};
}
.material-panel-chip.pressed StLabel,
.material-panel-chip.pressed StIcon,
.material-panel-chip:active StLabel,
.material-panel-chip:active StIcon,
.material-panel-chip.pressed .material-panel-clock {
    color: ${onAccent} !important;
}

/* QS tiles */
.material-panel-qs-tile {
    background-color: ${qsTileBg};
    color: ${textColor};
}
.material-panel-qs-tile .material-panel-qs-tile-label {
    color: ${textColor};
}
.material-panel-qs-tile.hover {
    background-color: ${hoverBgStrong};
}
.material-panel-qs-tile.active {
    background-color: ${accentBg};
    color: ${onAccent};
}
.material-panel-qs-tile.active .material-panel-qs-tile-label {
    color: ${onAccent};
}
/* Active + hover: stay primary (do NOT drop to inactive look) */
.material-panel-qs-tile.active.hover,
.material-panel-qs-tile.active:hover {
    background-color: ${accentBg};
    color: ${onAccent};
    /* Clear darken so hover is obvious on already-primary tiles */
    box-shadow: inset 0 0 0 999px rgba(0, 0, 0, 0.20);
    opacity: 1;
}
.material-panel-qs-tile.active.hover .material-panel-qs-tile-label,
.material-panel-qs-tile.active.hover .material-panel-qs-tile-icon {
    color: ${onAccent};
}
.material-panel-qs-tile.pressed,
.material-panel-qs-tile:active,
.material-panel-qs-tile.active.pressed {
    background-color: ${accentBg} !important;
    color: ${onAccent};
    opacity: 1;
}

/* Power actions */
.material-panel-qs-power-btn {
    background-color: ${qsTileBg};
    border-radius: 12px;
    min-height: 40px;
}
.material-panel-qs-power-btn.hover,
.material-panel-qs-power-btn:hover {
    background-color: ${hoverBgStrong} !important;
}
.material-panel-qs-power-btn.pressed,
.material-panel-qs-power-btn:active {
    background-color: ${accentBg} !important;
}
.material-panel-qs-power-btn.pressed StIcon,
.material-panel-qs-power-btn:active StIcon {
    color: ${onAccent};
}

/* BT device rows */
.material-panel-qs-bt-device {
    background-color: ${qsTileBg};
}
.material-panel-qs-bt-device .material-panel-qs-bt-device-name {
    color: ${textColor};
}
.material-panel-qs-bt-device .material-panel-qs-bt-device-status {
    color: ${dimTextColor};
}
.material-panel-qs-bt-device.hover {
    background-color: ${hoverBgStrong};
}
.material-panel-qs-bt-device.connected .material-panel-qs-bt-device-name,
.material-panel-qs-bt-device.connected .material-panel-qs-bt-device-status {
    color: ${accentBg};
    opacity: 1;
}
.material-panel-qs-bt-device.connected.hover {
    background-color: ${hoverBgStrong};
}
.material-panel-qs-bt-device.pressed,
.material-panel-qs-bt-device.connected.pressed {
    background-color: ${accentBg} !important;
}
.material-panel-qs-bt-device.pressed .material-panel-qs-bt-device-name,
.material-panel-qs-bt-device.pressed .material-panel-qs-bt-device-status,
.material-panel-qs-bt-device.pressed StIcon {
    color: ${onAccent} !important;
    opacity: 1;
}

/* Wi-Fi / BT tile rows share tile rules */
.material-panel-qs-wifi-row,
.material-panel-qs-bt-tile-row {
    background-color: ${qsTileBg};
}
.material-panel-qs-wifi-row.active,
.material-panel-qs-bt-tile-row.active {
    background-color: ${accentBg};
}
.material-panel-qs-wifi-row.active .material-panel-qs-tile-label,
.material-panel-qs-wifi-row.active .material-panel-qs-wifi-speed,
.material-panel-qs-bt-tile-row.active .material-panel-qs-tile-label {
    color: ${onAccent};
}
.material-panel-qs-wifi-row.hover,
.material-panel-qs-bt-tile-row.hover {
    background-color: ${hoverBgStrong};
}
.material-panel-qs-wifi-row.active.hover,
.material-panel-qs-bt-tile-row.active.hover {
    background-color: ${accentBg};
    opacity: 0.92;
}


/* BT device rows — hover must be obvious */
.material-panel-qs-bt-device {
    background-color: ${qsTileBg};
    border-radius: 12px;
    padding: 8px 10px;
    transition-duration: 120ms;
}
.material-panel-qs-bt-device.hover,
.material-panel-qs-bt-device:hover {
    background-color: ${hoverBgStrong} !important;
    box-shadow: inset 0 0 0 999px rgba(255, 255, 255, 0.08);
}
.material-panel-qs-bt-device.pressed,
.material-panel-qs-bt-device:active {
    background-color: ${accentBg} !important;
    box-shadow: none;
}


.material-panel-notifications-card {
    background-color: ${qsTileBg};
}
.material-panel-notifications-card:hover,
.material-panel-notifications-open:hover {
    background-color: ${hoverBgStrong};
}
.material-panel-notifications-clear-all:hover,
.material-panel-notifications-dismiss:hover {
    background-color: ${hoverBgStrong};
}
.material-panel-notifications-count {
    color: ${accentBg};
}
.material-panel-notifications-header-title {
    color: ${textColor};
}
.material-panel-notifications-clear-all,
.material-panel-notifications-footer {
    background-color: ${qsTileBg};
    color: ${textColor};
}
.material-panel-notifications-clear-all.hover,
.material-panel-notifications-footer.hover,
.material-panel-notifications-dismiss.hover {
    background-color: ${hoverBgStrong};
}
.material-panel-notifications-clear-all.pressed,
.material-panel-notifications-footer.pressed,
.material-panel-notifications-dismiss.pressed,
.material-panel-notifications-card.pressed {
    background-color: ${accentBg};
    color: ${onAccent};
}
.material-panel-notifications-card {
    background-color: ${qsTileBg};
}
.material-panel-notifications-card.hover {
    background-color: ${hoverBgStrong};
}
.material-panel-notifications-row-title {
    color: ${textColor};
}
.material-panel-notifications-row-body {
    color: ${dimTextColor};
}
.material-panel-notifications-app-header {
    color: ${dimTextColor};
}
.material-panel-notifications-row-time {
    color: ${dimTextColor};
}
.material-panel-notifications-more {
    color: ${accentBg};
}
.material-panel-notifications-row-title {
    color: ${textColor};
}
.material-panel-notifications-row-body {
    color: ${dimTextColor};
}
.material-panel-notifications-app-header {
    color: ${dimTextColor};
}
.material-panel-notifications-row-time {
    color: ${dimTextColor};
}
.material-panel-notifications-more {
    color: ${accentBg};
}
.material-panel-qs-menu .popup-menu-content {
    max-height: 68vh;
}


.material-panel-bt-connected-label,
.material-panel-bt-connected-icon {
    color: ${accentBg};
}
.material-panel-bt-connected-btn.pressed .material-panel-bt-connected-label,
.material-panel-bt-connected-btn.pressed .material-panel-bt-connected-icon {
    color: ${onAccent};
}
/* Class-based hover (St :hover is unreliable) */
.material-panel-chip.hover,
.material-panel-qs-tile.hover,
.material-panel-qs-bt-main.hover,
.material-panel-qs-wifi-main.hover,
.material-panel-qs-bt-drop.hover,
.material-panel-qs-wifi-drop.hover,
.material-panel-qs-bt-device.hover,
.material-panel-qs-power-btn.hover,
.material-panel-qs-media-btn.hover,
.material-panel-qs-profile-prefs.hover {
    background-color: ${hoverBg};
}
.material-panel-qs-bt-device.connected {
    background-color: transparent;
}
.material-panel-qs-bt-device.connected .material-panel-qs-bt-device-name {
    color: ${accentBg};
    font-weight: 600;
}
.material-panel-qs-bt-device.connected .material-panel-qs-bt-device-status {
    color: ${accentBg};
    opacity: 0.85;
}
.material-panel-qs-bt-device.connected StIcon {
    color: ${accentBg};
}
.material-panel-qs-bt-device.connected.hover,
.material-panel-qs-bt-device.connected.hover {
    background-color: ${hoverBg};
}
.material-panel-qs-bt-device.connected.pressed,
.material-panel-qs-bt-device.connected:active {
    background-color: ${accentBg};
}
.material-panel-qs-bt-device.connected.pressed .material-panel-qs-bt-device-name,
.material-panel-qs-bt-device.connected.pressed .material-panel-qs-bt-device-status,
.material-panel-qs-bt-device.connected.pressed StIcon,
.material-panel-qs-bt-device.connected:active StLabel,
.material-panel-qs-bt-device.connected:active StIcon {
    color: ${onAccent};
    opacity: 1;
}
.material-panel-qs-bt-device.pressed .material-panel-qs-bt-device-name,
.material-panel-qs-bt-device.pressed .material-panel-qs-bt-device-status {
    color: ${onAccent};
}

.material-panel-popup .popup-menu-content {
    background-color: ${chipBg};
}
.material-panel-popup .popup-menu-item {
    color: ${textColor};
}
.material-panel-popup .popup-menu-item:hover,
.material-panel-popup .popup-menu-item:focus {
    background-color: ${hoverBg};
}
.material-panel-popup .popup-separator-menu-item .popup-separator-menu-item-separator {
    background-color: ${dimTextColor};
}
.material-panel-qs-popup {
    background-color: transparent;
}
.material-panel-qs-popup .popup-menu-content {
    background-color: ${qsPopupBg};
}
.material-panel-qs-tile {
    background-color: ${qsTileBg};
}
.material-panel-qs-tile:hover {
    background-color: ${hoverBg};
}
.material-panel-qs-tile.active {
    background-color: ${accentBg};
}
.material-panel-qs-bt-tile-row {
    background-color: ${qsTileBg};
}
.material-panel-qs-bt-tile-row.active {
    background-color: ${accentBg};
}
.material-panel-qs-wifi-row {
    background-color: ${qsTileBg};
}
.material-panel-qs-wifi-row.active {
    background-color: ${accentBg};
}
.material-panel-qs-wifi-row.active .material-panel-qs-tile-label,
.material-panel-qs-wifi-row.active .material-panel-qs-tile-icon,
.material-panel-qs-wifi-row.active .material-panel-qs-wifi-speed,
.material-panel-qs-wifi-row.active .material-panel-qs-bt-drop-icon {
    color: ${onAccent};
}
.material-panel-qs-wifi-panel {
    background-color: ${qsCardBg};
}
.material-panel-qs-bt-tile-row.active .material-panel-qs-tile-label,
.material-panel-qs-bt-tile-row.active .material-panel-qs-tile-icon,
.material-panel-qs-bt-tile-row.active .material-panel-qs-bt-drop-icon {
    color: ${onAccent};
}
.material-panel-qs-bt-devices-panel {
    background-color: ${qsCardBg};
}
.material-panel-qs-profile,
.material-panel-qs-media {
    background-color: ${qsCardBg};
}
.material-panel-qs-bt-device {
    background-color: ${qsTileBg};
}
.material-panel-qs-bt-device.connected {
    background-color: ${accentBg};
}
.material-panel-qs-bt-main:hover,
.material-panel-qs-bt-drop:hover {
    background-color: ${hoverBg};
}
.material-panel-qs-bt-tile-row.active .material-panel-qs-bt-drop-icon {
    color: ${onAccent};
}
.material-panel-qs-tile-icon,
.material-panel-qs-tile-label {
    color: ${textColor};
}
.material-panel-qs-tile.active .material-panel-qs-tile-icon,
.material-panel-qs-tile.active .material-panel-qs-tile-label {
    color: ${onAccent};
}
.material-panel-qs-power-btn {
    background-color: ${chipBg};
    color: ${textColor};
}
.material-panel-qs-power-btn:hover {
    background-color: ${hoverBg};
}
.material-panel-qs-bt-devices-panel {
    background-color: ${qsCardBg};
}

.material-panel-qs-list-header {
    color: ${dimTextColor};
}
.material-panel-qs-bt-device.connecting {
    background-color: ${hoverBg};
    color: ${accentBg};
}
.material-panel-qs-bt-device.connecting .material-panel-qs-bt-device-name,
.material-panel-qs-bt-device.connecting .material-panel-qs-bt-device-status {
    color: ${accentBg};
}
.material-panel-qs-bt-drop.list-open,
.material-panel-qs-wifi-drop.list-open {
    background-color: ${hoverBg};
}
.material-panel-qs-bt-empty {
    color: ${dimTextColor};
}
.material-panel-qs-bt-device,
.material-panel-bt-device {
    background-color: ${chipBg};
}
.material-panel-qs-bt-device:hover,
.material-panel-bt-device:hover {
    background-color: ${hoverBg};
}
.material-panel-qs-bt-device.connected,
.material-panel-bt-device.connected {
    background-color: ${qsTileBg};
}
.material-panel-qs-bt-device-name,
.material-panel-qs-bt-device-status,
.material-panel-bt-device-name,
.material-panel-bt-device-status {
    color: ${textColor};
}
/* Connected: primary text for name AND status (same color) */
.material-panel-qs-bt-device.connected .material-panel-qs-bt-device-name,
.material-panel-qs-bt-device.connected .material-panel-qs-bt-device-status,
.material-panel-qs-bt-device-name.is-connected,
.material-panel-qs-bt-device-status.is-connected,
.material-panel-bt-device.connected .material-panel-bt-device-name,
.material-panel-bt-device.connected .material-panel-bt-device-status {
    color: ${accentBg};
}
.material-panel-bt-header-label {
    color: ${textColor};
}
.material-panel-bt-header-count {
    color: ${dimTextColor};
}
.material-panel-bt-hint {
    color: ${dimTextColor};
}
.material-panel-bt-footer-btn {
    background-color: ${chipBg};
    color: ${textColor};
}
.material-panel-bt-footer-btn:hover {
    background-color: ${hoverBg};
}
.material-panel-qs-bt-drop:hover {
    background-color: ${hoverBg};
}
.material-panel-bt-scroll .st-scroll-view {
    border-radius: 8px;
}
.material-panel-qs-slider-icon {
    color: ${textColor};
}
.material-panel-simple-slider-track {
    background-color: ${chipBg};
}
.material-panel-simple-slider-fill {
    background-color: ${accentBg};
}
.material-panel-simple-slider-knob {
    background-color: ${textColor};
}
.material-panel-qs-profile,
.material-panel-qs-media {
    background-color: ${qsCardBg};
}
.material-panel-qs-avatar {
    background-color: ${accentBg};
}
.material-panel-qs-avatar-label {
    color: ${onAccent};
}
.material-panel-qs-profile-name,
.material-panel-qs-media-title {
    color: ${textColor};
}
.material-panel-qs-profile-sub,
.material-panel-qs-media-sub {
    color: ${dimTextColor};
}
.material-panel-qs-media-art {
    background-color: ${hoverBg};
}
.material-panel-qs-media-btn:hover {
    background-color: ${hoverBg};
}
.material-panel-cpu-popup-header {
    padding: 8px 12px 4px 12px;
}
.material-panel-cpu-popup-title {
    font-size: 13px;
    font-weight: 600;
    color: ${textColor};
}
.material-panel-cpu-popup-summary {
    spacing: 24px;
    padding: 4px 0;
}
.material-panel-cpu-popup-label {
    font-size: 10.5px;
    color: ${dimTextColor};
}
.material-panel-cpu-popup-value {
    font-size: 14px;
    font-weight: 600;
    color: ${accentBg};
}
.material-panel-cpu-popup-section-title {
    font-size: 11px;
    font-weight: 600;
    color: ${dimTextColor};
    padding: 4px 12px 2px 12px;
}
.material-panel-cpu-popup-cores {
    spacing: 2px;
    padding: 0 12px 4px 12px;
}
.material-panel-cpu-popup-core-row {
    spacing: 8px;
    padding: 2px 0;
}
.material-panel-cpu-popup-core-name {
    font-size: 11.5px;
    color: ${textColor};
    min-width: 50px;
}
.material-panel-cpu-popup-core-value {
    font-size: 11.5px;
    font-weight: 500;
    color: ${accentBg};
    text-align: right;
}
.material-panel-cpu-popup-thermal {
    spacing: 2px;
    padding: 0 12px 8px 12px;
}
.material-panel-cpu-popup-thermal-row {
    font-size: 11.5px;
    color: ${textColor};
}
`;
    }

    // Bar/panel dimensions from independent user controls (iconScale,
    // pillHeight, gap - see configStore.js). Bar height is DERIVED from
    // pillHeight + gap, not its own separate control - that guarantees
    // no combination of settings can clip content inside the bar, the
    // scale drives icon size (applied in each bar module) AND pillHeight
    // together - deliberately the SAME number for both, so they can never
    // drift out of proportion with each other. gap is independent (see
    // configStore.js comment for why that's safe). Padding/radius/font/
    // workspace-pill-size all derive proportionally from pillHeight.
    _renderDimensions({scale = 1.0, gapTop = 5, gapBottom = 4, gapSide = 0, gap, layoutStyle = 'default'} = {}) {
        // Back-compat: legacy single `gap` maps to both top/bottom
        if (gap != null && gapTop == null && gapBottom == null) {
            gapTop = gap;
            gapBottom = Math.max(0, gap - 1);
        } else {
            gapTop = gapTop ?? 5;
            gapBottom = gapBottom ?? 4;
        }
        const end4 = layoutStyle !== 'default';
        const px = n => `${Math.round(n)}px`;
        const pillHeight = 26 * scale;
        const cornerExtra = end4 ? Math.max(12, Math.round(18 * scale)) : 0;
        const barHeight = pillHeight + gapTop + gapBottom + Math.round(pillHeight * 0.4) + cornerExtra;
        const padV = Math.max(3, Math.round(pillHeight * 0.2));
        const padH = Math.max(4, Math.round(pillHeight * 0.35));
        const padHCenter = Math.max(6, Math.round(pillHeight * 0.55));
        // end-4: fuller capsule radius
        const radius = Math.round(pillHeight * (end4 ? 1.0 : 0.85));
        const clockFont = (pillHeight * 0.46).toFixed(1);
        const workspaceSize = Math.round(pillHeight * 0.77);
        const workspaceFont = (pillHeight * 0.4).toFixed(1);
        const chipPadH = Math.max(6, Math.round(pillHeight * 0.4));
        const labelFont = (pillHeight * 0.38).toFixed(1);
        // Space between floating zone groups (BarGroups)
        const sideMargin = end4 ? Math.max(2, Math.round(3 * scale)) : 3;
        const zoneSpacing = end4 ? Math.max(4, Math.round(6 * scale)) : 8;

        return `/* Generated bar dimensions — scale=${scale} gapTop=${gapTop} gapBottom=${gapBottom} layout=${layoutStyle} */
.material-panel-bar {
    height: ${px(barHeight)};
    background-color: transparent;
    padding: 0;
}
.material-panel-zone {
    spacing: ${px(zoneSpacing)};
}
.material-panel-zone-left,
.material-panel-zone-right,
.material-panel-zone-center {
    min-height: ${px(pillHeight)};
}
.material-panel-zone-left,
.material-panel-zone-right {
    border-radius: ${px(radius)};
    padding: ${px(padV)} ${px(padH)};
    margin: ${px(gapTop)} ${px(sideMargin)} ${px(gapBottom)} ${px(sideMargin)};
}
.material-panel-zone-center {
    border-radius: ${px(radius)};
    padding: ${px(padV)} ${px(padHCenter)};
    margin: ${px(gapTop)} ${px(sideMargin)} ${px(gapBottom)} ${px(sideMargin)};
}
/* end-4 continuous bar (Hug): full-width solid strip + corner ears below */
.material-panel-layout-end4.material-panel-bar {
    background-color: transparent;
    padding: 0;
    spacing: 0;
}
.material-panel-bar-content-end4 {
    height: ${px(pillHeight + padV * 2 + 4)};
    min-height: ${px(pillHeight + padV * 2 + 4)};
    padding: 0 ${px(10)};
    spacing: ${px(zoneSpacing)};
}
.material-panel-layout-end4 .material-panel-zone-left,
.material-panel-layout-end4 .material-panel-zone-right,
.material-panel-layout-end4 .material-panel-zone-center {
    margin: 0;
    padding: ${px(2)} ${px(6)};
    border-radius: ${px(Math.round(pillHeight * 0.85))};
    box-shadow: none;
    border: none;
    background-color: transparent;
}
.material-panel-layout-end4 .material-panel-zone-center {
    padding: ${px(2)} ${px(8)};
}
.material-panel-bar-corners {
    height: ${px(Math.max(12, Math.round(18 * scale)))};
}
.material-panel-bar-corner {
    background-color: transparent;
}
/* workspace dots */
.material-panel-layout-end4 .material-panel-workspace-btn {
    width: ${px(Math.max(8, Math.round(pillHeight * 0.32)))};
    height: ${px(Math.max(8, Math.round(pillHeight * 0.32)))};
    min-width: ${px(Math.max(8, Math.round(pillHeight * 0.32)))};
    padding: 0;
    font-size: 0;
    border-radius: 999px;
}
.material-panel-layout-end4 .material-panel-workspace-btn.active {
    width: ${px(Math.max(16, Math.round(pillHeight * 0.55)))};
    min-width: ${px(Math.max(16, Math.round(pillHeight * 0.55)))};
}
.material-panel-layout-end4 .material-panel-chip {
    padding: ${px(Math.max(2, padV - 1))} ${px(Math.max(6, chipPadH - 2))};
}
.material-panel-layout-end4 .material-panel-clock {
    font-weight: 700;
    letter-spacing: 0.3px;
}
.material-panel-qs-popup.material-panel-layout-end4 .popup-menu-content,
.material-panel-qs-menu.material-panel-layout-end4,
.material-panel-popup.material-panel-layout-end4 {
    border-radius: 20px;
}
.material-panel-layout-end4 .material-panel-qs-tile {
    border-radius: 18px;
    min-height: 52px;
}
.material-panel-layout-end4 .material-panel-qs-power-btn {
    border-radius: 16px;
    min-width: 48px;
    min-height: 48px;
}
.material-panel-popup.material-panel-layout-end4 .material-panel-popup-card {
    border-radius: 14px;
}
.material-panel-clock {
    font-size: ${clockFont}px;
}
.material-panel-workspace-btn {
    width: ${px(workspaceSize)};
    height: ${px(workspaceSize)};
    font-size: ${workspaceFont}px;
}
.material-panel-chip {
    padding: ${px(padV)} ${px(chipPadH)};
}
.material-panel-foreign {
    height: ${px(pillHeight)};
    min-height: ${px(pillHeight)};
    padding: ${px(padV)} ${px(Math.max(4, chipPadH * 0.6))};
    border-radius: ${px(radius)};
    spacing: 2px;
}
.material-panel-foreign StIcon,
.material-panel-foreign .app-menu-icon,
.material-panel-foreign-inner StIcon,
.material-panel-foreign StButton StIcon {
    icon-size: ${px(Math.round(pillHeight * 0.72))} !important;
    width: ${px(Math.round(pillHeight * 0.72))};
    height: ${px(Math.round(pillHeight * 0.72))};
}
.material-panel-foreign StLabel {
    font-size: ${labelFont}px;
}
.material-panel-foreign .panel-button,
.material-panel-foreign-inner {
    -natural-hpadding: 0;
    -natural-vpadding: 0;
    min-height: 0;
    min-width: 0;
    padding: 0 !important;
    margin: 0 !important;
    border: none !important;
    background: transparent !important;
    box-shadow: none !important;
}
/* AppIndicator / StatusNotifier often uses St.Bin with fixed tiny icons */
.material-panel-foreign StBin {
    min-width: ${px(Math.round(pillHeight * 0.72))};
    min-height: ${px(Math.round(pillHeight * 0.72))};
}
.material-panel-battery-label,
        .material-panel-volume-label,
        .material-panel-network-speed-label,
        .material-panel-weather-label,
        .material-panel-notifications-label,
        .material-panel-cpu-label,
        .material-panel-cpu-temp-label {
            font-size: ${labelFont}px;
        }
`;
    }

    _writeGenerated(css) {
        const dir = Gio.File.new_for_path(GLib.path_get_dirname(this._generatedPath));
        if (!dir.query_exists(null))
            dir.make_directory_with_parents(null);
        const file = Gio.File.new_for_path(this._generatedPath);
        file.replace_contents(css, null, false, Gio.FileCreateFlags.REPLACE_DESTINATION, null);
        // Also write to legacy XDG location if different, so old installs don't leave stale file
        const legacyPath = GLib.build_filenamev([GLib.get_user_config_dir(), 'material-panel', 'generated-theme.css']);
        if (legacyPath !== this._generatedPath) {
            try {
                const ldir = Gio.File.new_for_path(GLib.path_get_dirname(legacyPath));
                if (!ldir.query_exists(null)) ldir.make_directory_with_parents(null);
                const lfile = Gio.File.new_for_path(legacyPath);
                lfile.replace_contents(css, null, false, Gio.FileCreateFlags.REPLACE_DESTINATION, null);
            } catch (e) {}
        }
        return file;
    }

    _reloadStylesheet(file) {
        const theme = St.ThemeContext.get_for_stage(global.stage).get_theme();
        if (this._loadedFile)
            theme.unload_stylesheet(this._loadedFile);
        theme.load_stylesheet(file);
        this._loadedFile = file;
    }

    // sourcePath: path to matugen's generated CSS, or null/undefined to
    // skip matugen and use the same fixed values as fallback defaults.
    // scale: panelScale multiplier for bar dimensions (1.0 = Normal).
    // sourcePath: path to matugen's generated CSS, or null/undefined to
    // skip matugen and use the same fixed values as fallback defaults.
    // panelSize: {iconScale, pillHeight, gap} - see configStore.js.
    // Always writes and loads a stylesheet either way — this is the only
    // place panel colors are ever set, so there's no load-order ambiguity
    // with the bundled (colorless) stylesheet.css.
    apply(sourcePath, panelSize = {}, layoutStyle = 'default') {
        let vars = {};
        if (sourcePath) {
            vars = this._parseMatugenCss(sourcePath) ?? {};
            if (Object.keys(vars).length === 0) {
                logError(new Error(
                    `material-panel: matugen source not found/empty at ${sourcePath}, using fixed palette`));
            }
        }
        // Generate icons first so CSS and icons are always in sync.
        // If icon generation fails, we still have the previous generation's icons
        // rather than a half-applied theme (new CSS, old icons).
        applyIcons(this._extensionPath, vars['on_surface'] ?? '#cdd6f4', vars['on_primary'] ?? '#1e1e2e', vars['primary'] ?? '#cba6f7');
        try {
            // Hug corner fill — match zone/bar surface
            // Prefer opaque-ish surface for Cairo corners
            globalThis._materialPanelBarColor =
                vars['surface_container'] ?? vars['surface'] ?? vars['background'] ?? '#1e1e2e';
        } catch (e) {}
        const css = this._render(vars) + this._renderDimensions({...panelSize, layoutStyle});
        this._reloadStylesheet(this._writeGenerated(css));
    }

    watch(sourcePath, onChange) {
        this.unwatch();
        const targetName = GLib.path_get_basename(sourcePath);
        const parentPath = resolveRealDir(GLib.path_get_dirname(sourcePath));
        const parentDir = Gio.File.new_for_path(parentPath);
        log(`material-panel: theme.watch() creating monitor on dir="${parentPath}" for file="${targetName}"`);
        // Watching the containing directory rather than the file itself:
        // tools that generate config files often write atomically (temp
        // file + rename), which replaces the file's inode. A single-file
        // monitor's watch is tied to the original inode and goes silently
        // dead once that happens - a directory watch survives this and
        // still reports the change, so we filter for our filename here.
        try {
            this._monitor = parentDir.monitor_directory(Gio.FileMonitorFlags.NONE, null);
        } catch (e) {
            logError(e, `material-panel: monitor_directory() threw for "${parentPath}"`);
            return;
        }
        if (!this._monitor) {
            logError(new Error(`material-panel: monitor_directory() returned null for "${parentPath}"`));
            return;
        }
        log('material-panel: theme.watch() monitor created successfully, connecting changed signal');
        this._monitor.connect('changed', (_m, changedFile, _of, eventType) => {
            // Unconditional, before any filtering - if this never appears
            // in the log, the monitor itself isn't firing at all, which is
            // a different (and more useful to know) problem than "it fires
            // but we're filtering out the events we care about".
            log(`material-panel: raw dir-watch event: file="${changedFile.get_basename()}" type=${eventType}`);
            if (changedFile.get_basename() !== targetName)
                return;
            if (eventType === Gio.FileMonitorEvent.CHANGES_DONE_HINT ||
                eventType === Gio.FileMonitorEvent.CREATED ||
                eventType === Gio.FileMonitorEvent.RENAMED ||
                eventType === Gio.FileMonitorEvent.CHANGED) {
                // Debounced: a single logical "wallpaper changed" event
                // from matugen can produce several raw filesystem events
                // (temp write, rename, metadata touch) in quick succession
                // - without this, each one independently triggered a full
                // icon-regeneration + panel-rebuild cycle, causing a
                // visible cascade (confirmed via logs: the full icon loop
                // and unrelated status-area re-registration both firing
                // many times for what should have been one change).
                if (this._debounceId)
                    GLib.source_remove(this._debounceId);
                this._debounceId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 300, () => {
                    this._debounceId = null;
                    try {
                        onChange();
                    } catch (e) {
                        logError(e, 'material-panel: failed to reapply theme');
                    }
                    return GLib.SOURCE_REMOVE;
                });
            }
        });
    }

    unwatch() {
        if (this._monitor) {
            this._monitor.cancel();
            this._monitor = null;
        }
        if (this._debounceId) {
            GLib.source_remove(this._debounceId);
            this._debounceId = null;
        }
    }

    destroy() {
        this.unwatch();
        if (this._loadedFile) {
            const theme = St.ThemeContext.get_for_stage(global.stage).get_theme();
            theme.unload_stylesheet(this._loadedFile);
            this._loadedFile = null;
        }
    }
}
