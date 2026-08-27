import GLib from 'gi://GLib';
import Gio from 'gi://Gio';

const DEFAULT_CONFIG = {
    activePreset: 'default',
    // Path to matugen's generated CSS. Set to null to keep the fixed
    // palette in stylesheet.css and skip matugen entirely.
    colorSource: GLib.build_filenamev(
        [GLib.get_home_dir(), '.config', 'matugen', 'matugen-colors.css']),
    // Top-bar sizing controls. Doesn't affect the quick settings popup
    // contents, which are a separate surface.
    // - scale: single multiplier for icon size AND pill height together
    //   (padding/font/radius/workspace-pill-size all derive proportionally
    //   from pill height) - kept as ONE number specifically so icon size
    //   and pill size can never drift out of proportion with each other,
    //   which is what independent sliders allowed and caused visible
    //   clipping/mismatch.
    // - gapTop/gapBottom: vertical margins (top/bottom) for the pills —
    //   horizontal side margins are fixed small (3-4px) and not user-
    //   configurable, so gap only affects top/bottom as requested.
    //   Bottom is intentionally ~0.5-1px less than top by default.
    panelSize: {
        scale: 1.0,
        gapTop: 5,
        gapBottom: 4,
    },
    presets: {
        default: {
            zones: {
                left: ['activities', 'workspaces'],
                center: ['clock'],
                right: [],
            },
        },
    },
};

export class ConfigStore {
    constructor() {
        this._configDir = GLib.build_filenamev([GLib.get_user_config_dir(), 'material-panel']);
        this._configPath = GLib.build_filenamev([this._configDir, 'config.json']);
        this._monitor = null;
        this._callback = null;
    }

    _ensureDir() {
        const dir = Gio.File.new_for_path(this._configDir);
        if (!dir.query_exists(null))
            dir.make_directory_with_parents(null);
    }

    load() {
        this._ensureDir();
        const file = Gio.File.new_for_path(this._configPath);
        if (!file.query_exists(null)) {
            this.save(DEFAULT_CONFIG);
            return DEFAULT_CONFIG;
        }
        try {
            const [ok, contents] = file.load_contents(null);
            if (!ok)
                return DEFAULT_CONFIG;
            const text = new TextDecoder('utf-8').decode(contents);
            const parsed = JSON.parse(text);
            // Merge over defaults: fills in any top-level key introduced by
            // a newer version of the extension (e.g. colorSource) without
            // clobbering what the user already has saved.
            const merged = {...DEFAULT_CONFIG, ...parsed};
            // panelSize specifically gets whitelisted rather than spread
            // wholesale - this schema has changed shape a few times
            // (iconScale/pillHeight -> scale/gap), and a naive spread would
            // keep carrying orphaned keys from old versions forever.
            // Migrate legacy single `gap` → gapTop/gapBottom
            let migratedGapTop = parsed.panelSize?.gapTop;
            let migratedGapBottom = parsed.panelSize?.gapBottom;
            if (migratedGapTop == null || migratedGapBottom == null) {
                const legacyGap = parsed.panelSize?.gap;
                if (legacyGap != null) {
                    migratedGapTop = legacyGap;
                    migratedGapBottom = Math.max(0, legacyGap - 1);
                }
            }
            const cleanPanelSize = {
                scale: parsed.panelSize?.scale ?? DEFAULT_CONFIG.panelSize.scale,
                gapTop: migratedGapTop ?? DEFAULT_CONFIG.panelSize.gapTop,
                gapBottom: migratedGapBottom ?? DEFAULT_CONFIG.panelSize.gapBottom,
            };
            // Clamp to valid ranges so a hand-edited config can't produce NaN/negative layout
            cleanPanelSize.scale = Math.max(0.7, Math.min(1.5, Number(cleanPanelSize.scale) || 1.0));
            cleanPanelSize.gapTop = Math.max(0, Math.min(14, Math.round(Number(cleanPanelSize.gapTop) || 5)));
            cleanPanelSize.gapBottom = Math.max(0, Math.min(14, Math.round(Number(cleanPanelSize.gapBottom) || 4)));
            merged.panelSize = cleanPanelSize;
            const hadOrphans = 'panelScale' in parsed
                || 'iconScale' in (parsed.panelSize ?? {})
                || 'pillHeight' in (parsed.panelSize ?? {})
                || 'gap' in (parsed.panelSize ?? {});
            delete merged.panelScale; // orphaned top-level key from an even older version
            // Persist cleaned shape immediately so the file doesn't keep
            // carrying dead keys through every future load/save cycle.
            if (hadOrphans) {
                try { this.save(merged); } catch (e) { logError(e, 'material-panel: failed to rewrite cleaned config'); }
            }
            return merged;
        } catch (e) {
            logError(e, 'material-panel: failed to parse config, using default');
            return DEFAULT_CONFIG;
        }
    }

    save(config) {
        this._ensureDir();
        const file = Gio.File.new_for_path(this._configPath);
        const text = JSON.stringify(config, null, 2);
        file.replace_contents(
            text, null, false,
            Gio.FileCreateFlags.REPLACE_DESTINATION, null);
    }

    // Live-reload: prefs.js runs in a separate process, so this is how the
    // shell process picks up changes saved from the prefs window.
    watch(callback) {
        this._callback = callback;
        const targetName = GLib.path_get_basename(this._configPath);
        // Resolves a symlinked config dir to its real target - see the
        // identical fix in theme.js's watch(), which is what actually
        // surfaced this as a real bug (matugen's config dir was symlinked
        // on the system this was tested on).
        let realDir = this._configDir;
        try {
            const linkTarget = GLib.file_read_link(this._configDir);
            if (linkTarget)
                realDir = GLib.canonicalize_filename(linkTarget, GLib.path_get_dirname(this._configDir));
        } catch (e) {
            // Not a symlink - use as-is.
        }
        const parentDir = Gio.File.new_for_path(realDir);
        // Directory watch, not single-file: our own save() uses
        // REPLACE_DESTINATION, which likely has the same atomic-replace
        // (new inode) semantics that break a single-file inotify watch -
        // see the identical fix/comment in theme.js's watch().
        this._monitor = parentDir.monitor_directory(Gio.FileMonitorFlags.NONE, null);
        this._monitor.connect('changed', (_m, changedFile, _of, eventType) => {
            log(`material-panel: raw config dir-watch event: file="${changedFile.get_basename()}" type=${eventType}`);
            if (changedFile.get_basename() !== targetName)
                return;
            if (eventType === Gio.FileMonitorEvent.CHANGES_DONE_HINT ||
                eventType === Gio.FileMonitorEvent.CREATED ||
                eventType === Gio.FileMonitorEvent.RENAMED ||
                eventType === Gio.FileMonitorEvent.CHANGED) {
                // Debounced - see the identical comment/fix in theme.js's
                // watch(). A single logical write can fire multiple raw
                // filesystem events.
                if (this._debounceId)
                    GLib.source_remove(this._debounceId);
                this._debounceId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 300, () => {
                    this._debounceId = null;
                    try {
                        this._callback(this.load());
                    } catch (e) {
                        logError(e, 'material-panel: failed to reload config');
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
        this._callback = null;
    }

    get path() {
        return this._configPath;
    }
}
