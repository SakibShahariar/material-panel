import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import St from 'gi://St';

// St (GNOME Shell's CSS engine) doesn't support CSS custom properties/var(),
// so we can't @import matugen's output directly. Instead we parse its
// `--name: value;` lines ourselves and substitute concrete values into our
// own rules, then write that out as a second stylesheet loaded on top of
// the base stylesheet.css (fixed-palette fallback) bundled with the
// extension. Same selectors in both files means the later-loaded one wins.
const VAR_RE = /--([a-zA-Z0-9_]+):\s*([^;]+);/g;

export class ThemeManager {
    constructor() {
        this._generatedPath = GLib.build_filenamev(
            [GLib.get_user_config_dir(), 'material-panel', 'generated-theme.css']);
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

        const zoneBg = rgba('surface_container', 0.82, 'rgba(30, 30, 46, 0.75)');
        const borderColor = rgba('outline_variant', 0.5, 'rgba(255, 255, 255, 0.08)');
        const textColor = hex('on_surface', '#cdd6f4');
        const dimTextColor = hex('on_surface_variant', '#9399b2');
        const accentBg = hex('primary', '#cba6f7');
        const onAccent = hex('on_primary', '#1e1e2e');
        const hoverBg = rgba('on_surface', 0.08, 'rgba(255, 255, 255, 0.08)');

        return `/* Generated from matugen output — do not edit by hand */
.material-panel-zone-left,
.material-panel-zone-right,
.material-panel-zone-center {
    background-color: ${zoneBg};
    border-color: ${borderColor};
}
.material-panel-clock {
    color: ${textColor};
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
.material-panel-battery-label,
.material-panel-volume-icon,
.material-panel-volume-label,
.material-panel-network-icon {
    color: ${textColor};
}
.material-panel-volume:hover,
.material-panel-network:hover {
    background-color: ${hoverBg};
}
.material-panel-battery-icon.warn,
.material-panel-battery-label.warn {
    color: ${hex('error', '#ffb4ab')};
}
}
`;
    }

    _writeGenerated(css) {
        const dir = Gio.File.new_for_path(GLib.path_get_dirname(this._generatedPath));
        if (!dir.query_exists(null))
            dir.make_directory_with_parents(null);
        const file = Gio.File.new_for_path(this._generatedPath);
        file.replace_contents(css, null, false, Gio.FileCreateFlags.REPLACE_DESTINATION, null);
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
    // Always writes and loads a stylesheet either way — this is the only
    // place panel colors are ever set, so there's no load-order ambiguity
    // with the bundled (colorless) stylesheet.css.
    apply(sourcePath) {
        let vars = {};
        if (sourcePath) {
            vars = this._parseMatugenCss(sourcePath) ?? {};
            if (Object.keys(vars).length === 0) {
                logError(new Error(
                    `material-panel: matugen source not found/empty at ${sourcePath}, using fixed palette`));
            }
        }
        this._reloadStylesheet(this._writeGenerated(this._render(vars)));
    }

    watch(sourcePath, onChange) {
        this.unwatch();
        const file = Gio.File.new_for_path(sourcePath);
        this._monitor = file.monitor_file(Gio.FileMonitorFlags.NONE, null);
        this._monitor.connect('changed', (_m, _f, _of, eventType) => {
            if (eventType === Gio.FileMonitorEvent.CHANGES_DONE_HINT ||
                eventType === Gio.FileMonitorEvent.CREATED) {
                try {
                    onChange();
                } catch (e) {
                    logError(e, 'material-panel: failed to reapply theme');
                }
            }
        });
    }

    unwatch() {
        if (this._monitor) {
            this._monitor.cancel();
            this._monitor = null;
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
