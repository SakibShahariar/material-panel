import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {applyIcons} from './iconTheme.js';
import {renderThemeCss, renderDimensionsCss} from './themeRenderer.js';
import {ThemeFileWatcher} from './themeWatcher.js';
import {ThemeStylesheet} from './themeStylesheet.js';
import {parseMatugenCssContents, themeColorInfo, cssColorRgb, contrastColor} from './themePalette.js';

// St (GNOME Shell's CSS engine) doesn't support CSS custom properties/var(),
// so we can't @import matugen's output directly. Instead we parse its
// `--name: value;` lines ourselves and substitute concrete values into our
// own rules, then write that out as a second stylesheet loaded on top of
// the base stylesheet.css (neutral emergency fallback) bundled with the
// extension. Same selectors in both files means the later-loaded one wins.
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
        this._watcher = new ThemeFileWatcher();
        this._stylesheet = new ThemeStylesheet(this._generatedPath);
        this._lastIconPalette = null;
        this._lastApplyKey = null;
        this._applyGeneration = 0;
    }

    _parseMatugenCssContents(contents) {
        return parseMatugenCssContents(contents);
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
        this._stylesheet.write(css, () => generation === this._applyGeneration, callback);
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
            if (applyKey === this._lastApplyKey && this._stylesheet.loadedFile &&
                !this._stylesheet.writeInFlight && !this._stylesheet.hasPendingWrite) {
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
            if (css === this._stylesheet.lastCss && this._stylesheet.loadedFile && !this._stylesheet.writeInFlight && !this._stylesheet.hasPendingWrite) {
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
        this._watcher.watch(sourcePath, onChange);
    }

    unwatch() {
        this._watcher.unwatch();
    }

    destroy() {
        this.unwatch();
        this._stylesheet.destroy();
        this._lastIconPalette = null;
        this._lastApplyKey = null;
    }
}
