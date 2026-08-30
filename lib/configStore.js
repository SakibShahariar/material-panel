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
    // '24h' or '12h' (AM/PM)
    clockFormat: '24h',
    hiddenModules: [],
    presets: {
        default: {
            zones: {
                left: ['activities', 'workspaces', 'cpu'],
                center: ['clock'],
                right: [],
            },
        },
    },
};

export class ConfigStore {
    constructor() {
        // Use HOME-based path, not XDG_CONFIG_HOME, to avoid distrobox
        // divergence: Extension Manager may run inside distrobox/archbox
        // where XDG_CONFIG_HOME is redirected to .../distrobox/archbox/.config,
        // while the shell extension itself runs on the host with
        // XDG_CONFIG_HOME=~/.config. Using HOME keeps both sides on the same file.
        this._configDir = GLib.build_filenamev([GLib.get_home_dir(), '.config', 'material-panel']);
        this._configPath = GLib.build_filenamev([this._configDir, 'config.json']);
        // Legacy XDG path for migration (pre-fix installs)
        this._legacyConfigPath = GLib.build_filenamev([GLib.get_user_config_dir(), 'material-panel', 'config.json']);
        this._monitor = null;
        this._callback = null;
    }

    _cloneDefault() {
        return JSON.parse(JSON.stringify(DEFAULT_CONFIG));
    }

    _ensureDir() {
        const dir = Gio.File.new_for_path(this._configDir);
        if (!dir.query_exists(null))
            dir.make_directory_with_parents(null);
    }

    load() {
        this._ensureDir();
        // Migrate legacy XDG location if home path missing but legacy exists
        const file = Gio.File.new_for_path(this._configPath);
        if (!file.query_exists(null)) {
            const legacyFile = Gio.File.new_for_path(this._legacyConfigPath);
            if (legacyFile.query_exists(null)) {
                try {
                    const [okL, contentsL] = legacyFile.load_contents(null);
                    if (okL) {
                        const textL = new TextDecoder('utf-8').decode(contentsL);
                        JSON.parse(textL); // validate
                        file.replace_contents(textL, null, false, Gio.FileCreateFlags.REPLACE_DESTINATION, null);
                        log('material-panel: migrated config from legacy XDG path to HOME path');
                    }
                } catch (e) { /* fall through to default */ }
            }
        }
        const activeFile = Gio.File.new_for_path(this._configPath);
        if (!activeFile.query_exists(null)) {
            const fresh = this._cloneDefault();
            this.save(fresh);
            return fresh;
        }
        try {
            const [ok, contents] = activeFile.load_contents(null);
            if (!ok)
                return this._cloneDefault();
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
            // Use Number.isFinite check instead of `||` so 0 is treated as a valid value (was bug: 0 || fallback discarded 0)
            const parsedScale = Number(cleanPanelSize.scale);
            cleanPanelSize.scale = Math.max(0.7, Math.min(1.5, Number.isFinite(parsedScale) ? parsedScale : 1.0));
            const parsedTop = Number(cleanPanelSize.gapTop);
            cleanPanelSize.gapTop = Math.max(0, Math.min(14, Math.round(Number.isFinite(parsedTop) ? parsedTop : 5)));
            const parsedBottom = Number(cleanPanelSize.gapBottom);
            cleanPanelSize.gapBottom = Math.max(0, Math.min(14, Math.round(Number.isFinite(parsedBottom) ? parsedBottom : 4)));
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
            return this._cloneDefault();
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
        const legacyTarget = GLib.path_get_basename(this._legacyConfigPath);
        const watchDir = (dirPath) => {
            let realDir = dirPath;
            try {
                const linkTarget = GLib.file_read_link(dirPath);
                if (linkTarget)
                    realDir = GLib.canonicalize_filename(linkTarget, GLib.path_get_dirname(dirPath));
            } catch (e) {}
            try {
                const parentDir = Gio.File.new_for_path(realDir);
                const mon = parentDir.monitor_directory(Gio.FileMonitorFlags.NONE, null);
                mon.connect('changed', (_m, changedFile, _of, eventType) => {
                    log(`material-panel: raw config dir-watch event: file="${changedFile.get_basename()}" type=${eventType} dir="${realDir}"`);
                    const isTarget = changedFile.get_basename() === targetName || changedFile.get_basename() === legacyTarget;
                    if (!isTarget)
                        return;
                    if (eventType === Gio.FileMonitorEvent.CHANGES_DONE_HINT ||
                        eventType === Gio.FileMonitorEvent.CREATED ||
                        eventType === Gio.FileMonitorEvent.RENAMED ||
                        eventType === Gio.FileMonitorEvent.CHANGED) {
                        if (this._debounceId)
                            GLib.source_remove(this._debounceId);
                        this._debounceId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 300, () => {
                            this._debounceId = null;
                            try {
                                // If legacy path was written (distrobox prefs), migrate to home path then load
                                const legacyFile = Gio.File.new_for_path(this._legacyConfigPath);
                                const homeFile = Gio.File.new_for_path(this._configPath);
                                if (this._legacyConfigPath !== this._configPath && legacyFile.query_exists(null) && changedFile.get_basename() === legacyTarget) {
                                    try {
                                        const [okL, cL] = legacyFile.load_contents(null);
                                        if (okL) {
                                            const txt = new TextDecoder('utf-8').decode(cL);
                                            JSON.parse(txt);
                                            homeFile.replace_contents(txt, null, false, Gio.FileCreateFlags.REPLACE_DESTINATION, null);
                                            log('material-panel: synced legacy config write to home path');
                                        }
                                    } catch (e) {}
                                }
                                this._callback(this.load());
                            } catch (e) {
                                logError(e, 'material-panel: failed to reload config');
                            }
                            return GLib.SOURCE_REMOVE;
                        });
                    }
                });
                return mon;
            } catch (e) {
                logError(e, `material-panel: failed to watch ${realDir}`);
                return null;
            }
        };
        this._monitor = watchDir(this._configDir);
        // Also watch legacy dir if different, to catch distrobox writes
        const legacyDir = GLib.path_get_dirname(this._legacyConfigPath);
        if (legacyDir !== this._configDir) {
            this._legacyMonitor = watchDir(legacyDir);
        }
    }

    unwatch() {
        if (this._monitor) {
            this._monitor.cancel();
            this._monitor = null;
        }
        if (this._legacyMonitor) {
            this._legacyMonitor.cancel();
            this._legacyMonitor = null;
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
