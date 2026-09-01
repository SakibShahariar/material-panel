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
        const hoverBg = rgba('on_surface', 0.10, 'rgba(255, 255, 255, 0.10)');
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
.material-panel-qs-popup .popup-menu-content {
    border: 1px solid ${outline};
}
.material-panel-chip {
    background-color: ${chipBg};
}
.material-panel-clock {
    color: ${accentBg};
}
.material-panel-workspace-btn {
    color: ${dimTextColor};
}
.material-panel-workspace-btn:hover {
    background-color: ${hoverBg};
    color: ${textColor};
}
.material-panel-workspace-btn.active {
    color: ${onAccent};
    background-color: ${accentBg};
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
    background-color: ${accentBg};
}
.material-panel-qs-bt-device-name,
.material-panel-qs-bt-device-status,
.material-panel-bt-device-name,
.material-panel-bt-device-status {
    color: ${textColor};
}
.material-panel-qs-bt-device.connected .material-panel-qs-bt-device-name,
.material-panel-qs-bt-device.connected .material-panel-qs-bt-device-status,
.material-panel-bt-device.connected .material-panel-bt-device-name,
.material-panel-bt-device.connected .material-panel-bt-device-status {
    color: ${onAccent};
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
    _renderDimensions({scale = 1.0, gapTop = 5, gapBottom = 4, gap} = {}) {
        // Back-compat: legacy single `gap` maps to both top/bottom
        if (gap != null && gapTop == null && gapBottom == null) {
            gapTop = gap;
            gapBottom = Math.max(0, gap - 1);
        } else {
            gapTop = gapTop ?? 5;
            gapBottom = gapBottom ?? 4;
        }
        const px = n => `${Math.round(n)}px`;
        const pillHeight = 26 * scale;
        // Zones no longer have a hard height (see above) - they size to
        // natural content, which is what actually eliminates clipping.
        // The bar itself still needs an explicit height for workarea
        // reservation though, so it gets a proportional buffer to
        // comfortably fit whatever the zone naturally renders at, with
        // centering handling any leftover space symmetrically.
        const barHeight = pillHeight + gapTop + gapBottom + Math.round(pillHeight * 0.4);
        const padV = Math.max(3, Math.round(pillHeight * 0.2));
        const padH = Math.max(4, Math.round(pillHeight * 0.35));
        const padHCenter = Math.max(6, Math.round(pillHeight * 0.55));
        const radius = Math.round(pillHeight * 0.85); // fuller pill (end-4 / M3)
        const clockFont = (pillHeight * 0.46).toFixed(1);
        const workspaceSize = Math.round(pillHeight * 0.77);
        const workspaceFont = (pillHeight * 0.4).toFixed(1);
        const chipPadH = Math.max(6, Math.round(pillHeight * 0.4));
        const labelFont = (pillHeight * 0.38).toFixed(1);
        const sideMargin = 3;

        return `/* Generated bar dimensions — scale=${scale} gapTop=${gapTop} gapBottom=${gapBottom} */
.material-panel-bar {
    height: ${px(barHeight)};
    background-color: transparent;
    padding: 0 ${px(sideMargin)};
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
    apply(sourcePath, panelSize = {}) {
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
        const css = this._render(vars) + this._renderDimensions(panelSize);
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
