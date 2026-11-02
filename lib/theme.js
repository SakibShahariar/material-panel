import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {applyIcons} from './iconTheme.js';
import {resolveSymlinkPath} from './realPath.js';
import {debugLog} from './debug.js';
import {renderThemeCss, renderDimensionsCss} from './themeRenderer.js';

// St (GNOME Shell's CSS engine) doesn't support CSS custom properties/var(),
// so we can't @import matugen's output directly. Instead we parse its
// `--name: value;` lines ourselves and substitute concrete values into our
// own rules, then write that out as a second stylesheet loaded on top of
// the base stylesheet.css (neutral emergency fallback) bundled with the
// extension. Same selectors in both files means the later-loaded one wins.
const VAR_RE = /--([a-zA-Z0-9_]+):\s*([^;]+);/g;

// Directory watching (inotify via GIO) can silently watch the wrong
// location if a path component is a symlink - common with dotfiles
// managers that symlink config directories from a separate repo
// (confirmed: this broke matugen live-reload specifically, since
// ~/.config/matugen is exactly this kind of symlink on some setups).
// Resolves nested symlinks through the shared path helper before watching.
function resolveRealDir(dirPath) {
    return resolveSymlinkPath(dirPath);
}

function themeColorInfo(color) {
    try {
        const value = color?.to_string?.() ?? '';
        const match = /^#([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(value);
        if (!match)
            return null;
        const hex = '#' + match[1];
        const r = parseInt(match[1].slice(0, 2), 16);
        const g = parseInt(match[1].slice(2, 4), 16);
        const b = parseInt(match[1].slice(4, 6), 16);
        const alpha = match[2] ? parseInt(match[2], 16) / 255 : 1;
        return {hex, rgb: r + ' ' + g + ' ' + b, alpha, r, g, b};
    } catch (e) {
        return null;
    }
}

function cssColorRgb(value) {
    const text = String(value ?? '').trim();
    const hex = /^#([0-9a-f]{6})(?:[0-9a-f]{2})?$/i.exec(text);
    if (hex) {
        return [0, 2, 4].map(offset => parseInt(hex[1].slice(offset, offset + 2), 16)).join(' ');
    }
    const rgb = /^rgba?\(\s*(\d+)\s*[, ]\s*(\d+)\s*[, ]\s*(\d+)/i.exec(text);
    return rgb ? [rgb[1], rgb[2], rgb[3]].join(' ') : null;
}

function contrastColor(color) {
    const luminance = (0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b) / 255;
    return luminance > 0.55 ? '#202020' : '#f5f5f5';
}

// Read colors from actual GNOME Shell actors so light/dark Shell themes remain
// authoritative. If the theme exposes no solid popup surface, use translucent
// neutral overlays and inherited text instead of assuming a dark palette.
function getThemeFallbackPalette() {
    const actors = [
        Main.panel?.statusArea?.quickSettings?.menu?.actor,
        Main.panel?.statusArea?.dateMenu?.menu?.actor,
        Main.panel,
    ];
    let foreground = null;
    let surface = null;
    let accent = null;
    let error = null;
    for (const actor of actors) {
        if (!actor)
            continue;
        try {
            const node = actor.get_theme_node();
            if (!foreground)
                foreground = themeColorInfo(node.get_foreground_color());
            const candidateSurface = themeColorInfo(node.get_background_color());
            if (!surface && candidateSurface && candidateSurface.alpha > 0.6)
                surface = candidateSurface;
            for (const [names, assign] of [
                [['accent_color', 'selected_bg_color', 'theme_selected_bg_color'], value => { if (!accent) accent = value; }],
                [['error_color', 'error-color'], value => { if (!error) error = value; }],
            ]) {
                for (const name of names) {
                    try {
                        const [found, color] = node.lookup_color(name, true);
                        const info = found ? themeColorInfo(color) : null;
                        if (info)
                            assign(info);
                    } catch (e) {}
                }
            }
        } catch (e) {}
    }
    const neutralSurface = !surface;
    foreground ??= {hex: 'currentColor', rgb: '128 128 128', r: 128, g: 128, b: 128, alpha: 1};
    surface ??= {hex: 'transparent', rgb: '128 128 128', r: 128, g: 128, b: 128, alpha: 0};
    accent ??= foreground;
    return {
        on_surface: foreground.hex,
        on_surface_rgb: foreground.rgb,
        on_surface_variant: foreground.hex,
        surface: surface.hex,
        surface_rgb: surface.rgb,
        surface_container: surface.hex,
        surface_container_rgb: surface.rgb,
        surface_container_high: surface.hex,
        surface_container_high_rgb: surface.rgb,
        primary: accent.hex,
        on_primary: accent === foreground ? (surface.alpha > 0.6 ? surface.hex : contrastColor(foreground)) : contrastColor(accent),
        secondary: accent.hex,
        tertiary: accent.hex,
        error: error?.hex ?? '#b44d4d',
        outline_rgb: foreground.rgb,
        __neutralSurface: neutralSurface,
    };
}

export class ThemeManager {
    constructor(extensionPath) {
        this._extensionPath = extensionPath;
        // Use HOME-based path to avoid distrobox XDG divergence (see configStore.js)
        this._generatedPath = GLib.build_filenamev(
            [GLib.get_user_cache_dir(), 'material-panel', 'generated-theme.css']);
        this._loadedFile = null;
        this._monitor = null;
        this._watchedSource = null;
        this._lastCss = null;
        this._lastIconPalette = null;
        this._lastApplyKey = null;
        this._applyGeneration = 0;
        this._writeInFlight = false;
        this._pendingWrite = null;
    }

    _parseMatugenCssContents(contents) {
        const text = new TextDecoder('utf-8').decode(contents);
        const vars = {};
        let match;
        VAR_RE.lastIndex = 0;
        while ((match = VAR_RE.exec(text)) !== null)
            vars[match[1]] = match[2].trim();
        return vars;
    }

    _loadMatugenCssAsync(path, callback) {
        const file = Gio.File.new_for_path(path);
        file.load_contents_async(null, (source, result) => {
            let vars = {};
            try {
                const [ok, contents] = source.load_contents_finish(result);
                if (ok)
                    vars = this._parseMatugenCssContents(contents);
            } catch (e) {
                log('material-panel: async Matugen CSS read failed: ' + e.message);
            }
            callback(vars);
        });
    }

// Maps matugen's Material You role names onto our existing panel classes.
    // Missing Matugen roles are filled from the active GNOME Shell theme; a
    // partially-populated palette therefore remains valid in light and dark themes.
    _render(vars, panelSize = {}) {
        return renderThemeCss(vars, panelSize);
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
    _renderDimensions(options = {}) {
        return renderDimensionsCss(options);
    }

    _writeGeneratedAsync(css, generation, callback) {
        if (this._writeInFlight) {
            this._pendingWrite = {css, generation, callback};
            return;
        }
        this._writeInFlight = true;
        const finish = (file, success) => {
            this._writeInFlight = false;
            if (success && generation === this._applyGeneration) {
                try {
                    this._reloadStylesheet(file);
                    this._lastCss = css;
                    callback?.(true);
                } catch (e) {
                    logError(e, 'material-panel: load generated theme stylesheet');
                    callback?.(false);
                }
            } else {
                callback?.(false);
            }
            const pending = this._pendingWrite;
            this._pendingWrite = null;
            if (pending)
                this._writeGeneratedAsync(pending.css, pending.generation, pending.callback);
        };
        const write = () => {
            const file = Gio.File.new_for_path(this._generatedPath);
            file.replace_contents_async(
                css, null, false, Gio.FileCreateFlags.REPLACE_DESTINATION,
                GLib.PRIORITY_DEFAULT, null, (source, result) => {
                    try {
                        source.replace_contents_finish(result);
                        finish(file, true);
                    } catch (e) {
                        logError(e, 'material-panel: async write generated theme stylesheet');
                        finish(file, false);
                    }
                });
        };
        try {
            const dir = Gio.File.new_for_path(GLib.path_get_dirname(this._generatedPath));
            dir.make_directory_async(GLib.PRIORITY_DEFAULT, null, (source, result) => {
                try {
                    source.make_directory_finish(result);
                } catch (e) {
                    if (!e.matches(Gio.io_error_quark(), Gio.IOErrorEnum.EXISTS)) {
                        logError(e, 'material-panel: create generated theme directory');
                        finish(null, false);
                        return;
                    }
                }
                write();
            });
        } catch (e) {
            logError(e, 'material-panel: start generated theme directory creation');
            finish(null, false);
        }
    }

    _reloadStylesheet(file) {
        const theme = St.ThemeContext.get_for_stage(global.stage).get_theme();
        if (this._loadedFile)
            theme.unload_stylesheet(this._loadedFile);
        theme.load_stylesheet(file);
        this._loadedFile = file;
    }

    // sourcePath: path to Matugen's generated CSS, or null/undefined to use
    // colors resolved from the active GNOME Shell theme as the fallback.
    // scale: panelScale multiplier for bar dimensions (1.0 = Normal).
    // panelSize: {iconScale, pillHeight, gap} - see configStore.js.
    // Applies the resolved palette and dimensions; unchanged inputs skip
    // rendering, icon work, and stylesheet I/O after the first successful apply.
    apply(sourcePath, panelSize = {}, layoutStyle = 'default', onApplied = null) {
        const generation = ++this._applyGeneration;
        const processVars = inputVars => {
            if (generation !== this._applyGeneration)
                return;
            const fallback = getThemeFallbackPalette();
            const hasMatugenSurface = !!(inputVars.surface_container_rgb || inputVars.surface_rgb ||
                inputVars.surface_container || inputVars.surface);
            const vars = {
                ...fallback,
                ...inputVars,
                __neutralSurface: fallback.__neutralSurface && !hasMatugenSurface,
            };
            // A partial Matugen file may provide hex colors without *_rgb roles.
            // Derive matching RGB channels instead of accidentally mixing in the
            // GNOME fallback surface color for those roles.
            for (const role of ['surface_container', 'surface_container_high', 'surface', 'on_surface', 'outline']) {
                if (inputVars[role] && !inputVars[role + '_rgb']) {
                    const rgb = cssColorRgb(inputVars[role]);
                    if (rgb)
                        vars[role + '_rgb'] = rgb;
                }
            }
            if (inputVars.primary && !inputVars.on_primary) {
                const color = themeColorInfo({to_string: () => inputVars.primary});
                if (color)
                    vars.on_primary = contrastColor(color);
            }
            const iconColors = [
                vars['on_surface'],
                vars['on_primary'],
                vars['primary'],
            ];
            const iconPalette = iconColors.join('|');
            // Stable, sorted inputs prevent CSS-variable insertion order from
            // invalidating the cache while still including fallback colors,
            // layout, and every panel-size input used by the renderers.
            const applyKey = JSON.stringify({
                vars: Object.keys(vars).sort().map(key => [key, vars[key]]),
                panelSize: Object.keys(panelSize ?? {}).sort().map(key => [key, panelSize[key]]),
                layoutStyle,
            });
            if (applyKey === this._lastApplyKey && this._loadedFile &&
                !this._writeInFlight && !this._pendingWrite) {
                onApplied?.(true);
                return;
            }
            const finishApply = success => {
                if (success && generation === this._applyGeneration)
                    this._lastApplyKey = applyKey;
                onApplied?.(success);
            };
            const applyStylesheet = () => {
                if (generation !== this._applyGeneration)
                    return;
                try {
                globalThis._materialPanelBarColor =
                    vars['surface_container'] ?? vars['surface'] ?? vars['background'] ?? 'transparent';
                globalThis._materialPanelPrimary = vars['primary'];
                globalThis._materialPanelOnPrimary = vars['on_primary'];
                globalThis._materialPanelOnSurface = vars['on_surface'];
                globalThis._materialPanelSurface =
                    vars['surface_container'] ?? vars['surface'] ?? vars['background'] ?? 'transparent';
                globalThis._materialPanelHoverBg = vars['on_surface_rgb']
                    ? 'rgba(' + vars['on_surface_rgb'].trim().split(/[\s,]+/).filter(Boolean).join(', ') + ', 0.14)'
                    : 'rgba(205, 214, 244, 0.14)';
                globalThis._materialPanelHoverBgStrong = vars['on_surface_rgb']
                    ? 'rgba(' + vars['on_surface_rgb'].trim().split(/[\s,]+/).filter(Boolean).join(', ') + ', 0.22)'
                    : 'rgba(205, 214, 244, 0.22)';
                globalThis._materialPanelQsSurface = vars['surface_container_high_rgb']
                    ? 'rgba(' + vars['surface_container_high_rgb'].trim().split(/[\s,]+/).filter(Boolean).join(', ') + ', 0.55)'
                    : (vars['surface_container_rgb']
                        ? 'rgba(' + vars['surface_container_rgb'].trim().split(/[\s,]+/).filter(Boolean).join(', ') + ', 0.55)'
                        : 'rgba(49, 50, 68, 0.55)');
                globalThis._materialPanelSecondary = vars['secondary'] ?? vars['primary'];
                globalThis._materialPanelTertiary = vars['tertiary'] ?? vars['primary'];
            } catch (e) {}
            if (sourcePath && Object.keys(vars).length === 0)
                logError(new Error('material-panel: Matugen source not found/empty at ' + sourcePath + ', using fixed palette'));
            const css = this._render(vars, panelSize) + this._renderDimensions({...panelSize, layoutStyle});
            if (css === this._lastCss && this._loadedFile && !this._writeInFlight && !this._pendingWrite) {
                finishApply(true);
                return;
            }
                this._writeGeneratedAsync(css, generation, finishApply);
            };
            if (iconPalette !== this._lastIconPalette) {
                try {
                    applyIcons(this._extensionPath, ...iconColors, () => {
                        if (generation !== this._applyGeneration)
                            return;
                        this._lastIconPalette = iconPalette;
                        applyStylesheet();
                    });
                } catch (e) {
                    logError(e, 'material-panel: icon recoloring failed');
                    applyStylesheet();
                }
            } else {
                applyStylesheet();
            }
        };
        if (!sourcePath) {
            processVars({});
            return generation;
        }
        try {
            this._loadMatugenCssAsync(sourcePath, processVars);
        } catch (e) {
            logError(e, 'material-panel: start async Matugen CSS read');
            processVars({});
        }
        return generation;
    }

    watch(sourcePath, onChange) {
        // Config changes often re-apply the theme without changing the
        // palette source. Keep the existing directory monitor in that case.
        if (this._watchedSource === sourcePath && this._monitor)
            return;
        this.unwatch();
        const targetName = GLib.path_get_basename(sourcePath);
        const parentPath = resolveRealDir(GLib.path_get_dirname(sourcePath));
        const parentDir = Gio.File.new_for_path(parentPath);
        debugLog(`theme.watch() creating monitor on dir="${parentPath}" for file="${targetName}"`);
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
        this._watchedSource = sourcePath;
        debugLog('theme.watch() monitor created successfully, connecting changed signal');
        this._monitor.connect('changed', (_m, changedFile, _of, eventType) => {
            // Unconditional, before any filtering - if this never appears
            // in the log, the monitor itself isn't firing at all, which is
            // a different (and more useful to know) problem than "it fires
            // but we're filtering out the events we care about".
            debugLog(`raw dir-watch event: file="${changedFile.get_basename()}" type=${eventType}`);
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
        this._watchedSource = null;
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
        this._lastCss = null;
        this._lastIconPalette = null;
        this._lastApplyKey = null;
    }
}
