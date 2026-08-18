import GLib from 'gi://GLib';
import Gio from 'gi://Gio';

const DEFAULT_CONFIG = {
    activePreset: 'default',
    // Path to matugen's generated CSS. Set to null to keep the fixed
    // palette in stylesheet.css and skip matugen entirely.
    colorSource: GLib.build_filenamev(
        [GLib.get_home_dir(), '.config', 'matugen', 'matugen-colors.css']),
    // Scales the top bar (height, padding, pill sizes, bar-level icon
    // sizes) proportionally. 1.0 = Normal. Doesn't affect the quick
    // settings popup contents, which are a separate surface.
    panelScale: 1.0,
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
            return {...DEFAULT_CONFIG, ...parsed};
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
        const parentDir = Gio.File.new_for_path(this._configDir);
        // Directory watch, not single-file: our own save() uses
        // REPLACE_DESTINATION, which likely has the same atomic-replace
        // (new inode) semantics that break a single-file inotify watch -
        // see the identical fix/comment in theme.js's watch().
        this._monitor = parentDir.monitor_directory(Gio.FileMonitorFlags.NONE, null);
        this._monitor.connect('changed', (_m, changedFile, _of, eventType) => {
            if (changedFile.get_basename() !== targetName)
                return;
            if (eventType === Gio.FileMonitorEvent.CHANGES_DONE_HINT ||
                eventType === Gio.FileMonitorEvent.CREATED ||
                eventType === Gio.FileMonitorEvent.RENAMED) {
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
