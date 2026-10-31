import GLib from 'gi://GLib';
import {resolveSymlinkPath} from './realPath.js';
import Gio from 'gi://Gio';
import {normalizePanelSize} from './configNormalization.js';
import {DEFAULT_QUICK_SETTINGS_TILE_IDS, normalizeQuickSettingsTiles} from './quickSettingsTiles.js';
import {normalizeWorkspaceDisplayMode} from './workspaceDisplay.js';

const DEFAULT_CONFIG = {
    configVersion: 3,
    activePreset: 'default',
    // Path to matugen's generated CSS, or null for fixed palette.
    // null = auto-detect ~/.config/matugen/matugen-colors.css if it exists
    //        (resolved at theme apply time, not baked into saved config).
    // Explicit path or empty string in user config always wins.
    colorSource: null,
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
    // 'default' = original strip zones | 'end4' = opt-in floating BarGroups
    layoutStyle: 'default',
    // Quick Settings slider visual style. See lib/sliderStyleMeta.js for the
    // full list ('classic', 'arc', 'rails', 'meter', 'lightsaber', 'wavy',
    // 'carved', 'neon', 'vu', 'snap', 'cursor').
    sliderStyle: 'classic',
    // QS tile visual style — see lib/tileStyleMeta.js
    qsTileStyle: 'classic',
    // Stable IDs in display order; omitting an ID hides that tile.
    qsTiles: [...DEFAULT_QUICK_SETTINGS_TILE_IDS],
    // 'auto' preserves the layout's original workspace presentation.
    workspaceDisplay: 'auto',
    panelSize: {
        scale: 1.0,
        gapTop: 5,
        gapBottom: 4,
        gapSide: 0,
        // Space between chips inside a zone (px)
        chipGap: 4,
        popupOpacity: 0.92,
    },
    // '24h' or '12h' (AM/PM)
    clockFormat: '24h',
    // Preserve the calendar click by default; opt in to click-to-cycle.
    clockClickCyclesFormat: false,
    // Activity (CPU) chip text: 'cpu' | 'cpu-ram' | 'ram'
    activityChip: 'cpu',
    // Network rate display: bytes per second or bits per second.
    networkSpeedUnit: 'bytes',
    // Optional manual weather override. Empty coordinates use GNOME Weather.
    weatherLocation: {mode: 'gnome', name: '', latitude: '', longitude: ''},
    // Hide the real name and hostname shown in the Quick Settings profile card.
    hideProfileIdentity: false,
    hiddenModules: [],
    // Status-area / tray roles hidden from the Material Panel
    hiddenForeignRoles: [],
    // Per-role placement for tray/extension icons: 'left' | 'right' | 'hidden'
    foreignRoleZones: {},
    // Master tray mute — when true, all tray icons hidden; previous zones in foreignRoleZonesBackup
    trayAllHidden: false,
    // Omarchy-style chevron drawer for foreign tray icons
    trayDrawer: true,
    // Tray icons: use system AppIndicator extension (no built-in watcher)
    foreignRoleZonesBackup: {},
    presets: {
        default: {
            zones: {
                left: ['activities', 'workspaces', 'cpu'],
                center: ['weather', 'clock', 'notifications'],
                right: ['networkSpeed', 'volume', 'battery', 'quicksettings'],
            },
        },
        // Opt-in only — never applied unless user sets activePreset or layoutStyle
        // Keep in sync with layoutPresets.END4_ZONES
        end4: {
            zones: {
                left: ['focusedWindow', 'cpu', 'networkSpeed', 'media'],
                center: ['workspaces', 'clock'],
                right: ['weather', 'notifications', 'volume', 'battery', 'quicksettings'],
            },
        },
    },
};


/** Default matugen CSS path (HOME-based, same as ConfigStore paths). */
export function defaultMatugenPath() {
    return GLib.build_filenamev(
        [GLib.get_home_dir(), '.config', 'matugen', 'matugen-colors.css']);
}

/**
 * Resolve effective color source:
 * - explicit non-empty string → that path
 * - null / missing → matugen path if file exists, else null (fixed palette)
 * - empty string → null (user forced fixed palette)
 */
export function resolveColorSource(configured) {
    if (configured === '')
        return null;
    if (configured != null && configured !== undefined && String(configured).trim() !== '')
        return String(configured).trim();
    const candidate = defaultMatugenPath();
    try {
        if (Gio.File.new_for_path(candidate).query_exists(null))
            return candidate;
    } catch (e) {}
    return null;
}

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
        this.invalidConfigBackupPath = null;
        this._selfWriteContent = null;
        this._reloadGeneration = 0;
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
            // Do not write on first read — avoids watcher → full rebuild loop
            return this._cloneDefault();
        }
        try {
            const [ok, contents] = activeFile.load_contents(null);
            if (!ok)
                return this._cloneDefault();
            const text = new TextDecoder('utf-8').decode(contents);
            const parsed = JSON.parse(text);
            return this._normalizeParsedConfig(parsed);
        } catch (e) {
            // Preserve the original file before falling back to defaults so a
            // malformed config can be recovered instead of silently lost.
            try {
                if (activeFile.query_exists(null)) {
                    const backup = Gio.File.new_for_path(`${this._configPath}.broken`);
                    if (!backup.query_exists(null)) {
                        activeFile.copy(backup, Gio.FileCopyFlags.NONE, null, null);
                        log(`material-panel: preserved unreadable config as ${backup.get_path()}`);
                    }
                    this.invalidConfigBackupPath = backup.get_path();
                }
            } catch (backupError) {
                logError(backupError, 'material-panel: failed to preserve invalid config');
            }
            logError(e, 'material-panel: failed to parse config, using default');
            return this._cloneDefault();
        }
    }


    _normalizeParsedConfig(parsed, {persistCleanup = true} = {}) {
            // Merge over defaults: fills in any top-level key introduced by
            // a newer version of the extension (e.g. colorSource) without
            // clobbering what the user already has saved.
            const merged = {...DEFAULT_CONFIG, ...parsed};
            // panelSize specifically gets whitelisted rather than spread
            // wholesale - this schema has changed shape a few times
            // (iconScale/pillHeight -> scale/gap), and a naive spread would
            // keep carrying orphaned keys from old versions forever.
            merged.panelSize = normalizePanelSize(parsed.panelSize, DEFAULT_CONFIG.panelSize);
            merged.qsTiles = normalizeQuickSettingsTiles(merged.qsTiles);
            merged.workspaceDisplay = normalizeWorkspaceDisplayMode(merged.workspaceDisplay);
            merged.clockClickCyclesFormat = merged.clockClickCyclesFormat === true;
            merged.networkSpeedUnit = merged.networkSpeedUnit === 'bits' ? 'bits' : 'bytes';
            if (!Array.isArray(merged.hiddenForeignRoles))
                merged.hiddenForeignRoles = [];
            if (!Array.isArray(merged.hiddenModules))
                merged.hiddenModules = [];
            if (merged.trayDrawer == null) merged.trayDrawer = true;
            if (!merged.foreignRoleZones || typeof merged.foreignRoleZones !== 'object')
                merged.foreignRoleZones = {};
            // Old hide-all wrote every role as "hidden" — undo when master is off
            if (!merged.trayAllHidden) {
                const vals = Object.values(merged.foreignRoleZones);
                if (vals.length && vals.every(v => v === 'hidden'))
                    merged.foreignRoleZones = {};
            }

            // Do NOT mass-migrate hiddenForeignRoles into foreignRoleZones —
            // that made hide-all off unable to show icons and could stick every role as hidden.

            const hadOrphans = 'panelScale' in parsed
                || 'iconScale' in (parsed.panelSize ?? {})
                || 'pillHeight' in (parsed.panelSize ?? {})
                || 'gap' in (parsed.panelSize ?? {});
            delete merged.panelScale; // orphaned top-level key from an even older version
            // Persist cleaned shape immediately so the file doesn't keep
            // carrying dead keys through every future load/save cycle.
            if (hadOrphans) {
                if (persistCleanup) {
                    try { this.save(merged, {suppressWatcher: true}); } catch (e) { logError(e, 'material-panel: failed to rewrite cleaned config'); }
                } else {
                    this._pendingCleanupText = JSON.stringify(merged, null, 2);
                }
            }

            if (merged.layoutStyle == null)
                merged.layoutStyle = 'default';
            if (merged.panelSize && merged.panelSize.gapSide == null)
                merged.panelSize.gapSide = 0;

            // Loading must preserve the user's saved module placement. Any
            // intentional migrations belong in a versioned, one-time migration,
            // not in this read path.


            return merged;
    }

    _readContentsAsync(file) {
        return new Promise((resolve, reject) => {
            try {
                file.load_contents_async(null, (source, result) => {
                    try {
                        const [ok, contents] = source.load_contents_finish(result);
                        resolve(ok ? new TextDecoder('utf-8').decode(contents) : null);
                    } catch (error) {
                        reject(error);
                    }
                });
            } catch (error) {
                reject(error);
            }
        });
    }

    _replaceContentsAsync(file, text) {
        return new Promise((resolve, reject) => {
            try {
                file.replace_contents_async(
                    text, null, false, Gio.FileCreateFlags.REPLACE_DESTINATION, null,
                    (source, result) => {
                        try {
                            source.replace_contents_finish(result);
                            resolve();
                        } catch (error) {
                            reject(error);
                        }
                    });
            } catch (error) {
                reject(error);
            }
        });
    }

    _copyFileAsync(sourceFile, destinationFile) {
        return new Promise((resolve, reject) => {
            try {
                sourceFile.copy_async(
                    destinationFile, Gio.FileCopyFlags.NONE, GLib.PRIORITY_DEFAULT,
                    null, null, (source, result) => {
                        try {
                            source.copy_finish(result);
                            resolve();
                        } catch (error) {
                            reject(error);
                        }
                    });
            } catch (error) {
                reject(error);
            }
        });
    }

    async loadAsync() {
        this._ensureDir();
        const file = Gio.File.new_for_path(this._configPath);
        if (!file.query_exists(null)) {
            const legacyFile = Gio.File.new_for_path(this._legacyConfigPath);
            if (legacyFile.query_exists(null)) {
                try {
                    const legacyText = await this._readContentsAsync(legacyFile);
                    if (legacyText !== null) {
                        JSON.parse(legacyText);
                        this._selfWriteContent = legacyText;
                        await this._replaceContentsAsync(file, legacyText);
                        log('material-panel: migrated config from legacy XDG path to HOME path');
                    }
                } catch (error) {
                    // Keep the existing fallback-to-default behavior for invalid legacy files.
                }
            }
        }

        if (!file.query_exists(null))
            return this._cloneDefault();

        try {
            const text = await this._readContentsAsync(file);
            if (text === null)
                return this._cloneDefault();
            this._pendingCleanupText = null;
            const parsed = JSON.parse(text);
            const merged = this._normalizeParsedConfig(parsed, {persistCleanup: false});
            if (this._pendingCleanupText !== null) {
                const cleanupText = this._pendingCleanupText;
                this._pendingCleanupText = null;
                this._selfWriteContent = cleanupText;
                try {
                    await this._replaceContentsAsync(file, cleanupText);
                } catch (error) {
                    if (this._selfWriteContent === cleanupText)
                        this._selfWriteContent = null;
                    logError(error, 'material-panel: failed to rewrite cleaned config asynchronously');
                }
            }
            return merged;
        } catch (error) {
            try {
                if (file.query_exists(null)) {
                    const backup = Gio.File.new_for_path(`${this._configPath}.broken`);
                    if (!backup.query_exists(null)) {
                        await this._copyFileAsync(file, backup);
                        log(`material-panel: preserved unreadable config as ${backup.get_path()}`);
                    }
                    this.invalidConfigBackupPath = backup.get_path();
                }
            } catch (backupError) {
                logError(backupError, 'material-panel: failed to preserve invalid config');
            }
            logError(error, 'material-panel: failed to parse config, using default');
            return this._cloneDefault();
        }
    }

    async _reloadFromWatcher(isLegacyDir, changedFile, generation) {
        try {
            const homeFile = Gio.File.new_for_path(this._configPath);
            if (!isLegacyDir && this._selfWriteContent !== null) {
                let currentText = null;
                try {
                    currentText = await this._readContentsAsync(homeFile);
                } catch (error) {}
                if (currentText === this._selfWriteContent)
                    return;
                this._selfWriteContent = null;
            }

            const legacyFile = Gio.File.new_for_path(this._legacyConfigPath);
            if (isLegacyDir && this._legacyConfigPath !== this._configPath &&
                legacyFile.query_exists(null) &&
                changedFile.get_basename() === GLib.path_get_basename(this._legacyConfigPath)) {
                try {
                    const legacyText = await this._readContentsAsync(legacyFile);
                    if (legacyText !== null) {
                        JSON.parse(legacyText);
                        this._selfWriteContent = legacyText;
                        await this._replaceContentsAsync(homeFile, legacyText);
                        log('material-panel: synced legacy config write to home path');
                    }
                } catch (error) {
                    logError(error, 'material-panel: failed to sync legacy config write');
                    this._selfWriteContent = null;
                }
            }

            const config = await this.loadAsync();
            let isCurrentGeneration = generation === this._reloadGeneration;
            if (!isCurrentGeneration && this._selfWriteContent !== null) {
                let currentText = null;
                try {
                    currentText = await this._readContentsAsync(homeFile);
                } catch (error) {}
                // Our own async migration/cleanup write can trigger another
                // monitor event. Do not discard the external reload because
                // that newer generation represents the exact self-written text.
                isCurrentGeneration = currentText === this._selfWriteContent;
            }
            if (!isCurrentGeneration || !this._callback)
                return;
            this._callback(config);
        } catch (error) {
            logError(error, 'material-panel: failed to reload config');
        }
    }

    resetDefaults() {
        const fresh = this._cloneDefault();
        this.save(fresh);
        return fresh;
    }

    async resetDefaultsAsync() {
        const fresh = this._cloneDefault();
        await this.saveAsync(fresh);
        return fresh;
    }

    save(config, {suppressWatcher = false} = {}) {
        this._ensureDir();
        const out = {...config};
        // Keep save-time validation identical to load-time normalization.
        out.panelSize = normalizePanelSize(out.panelSize, DEFAULT_CONFIG.panelSize);

        out.configVersion = out.configVersion ?? DEFAULT_CONFIG.configVersion ?? 3;
        const file = Gio.File.new_for_path(this._configPath);
        const text = JSON.stringify(out, null, 2);
        // Atomic write: tmp + move so a crash never leaves truncated config.json
        const tmp = Gio.File.new_for_path(this._configPath + '.tmp');
        tmp.replace_contents(
            text, null, false,
            Gio.FileCreateFlags.REPLACE_DESTINATION, null);
        try {
            tmp.move(file, Gio.FileCopyFlags.OVERWRITE, null, null);
        } catch (e) {
            // The temporary file is disposable if the atomic replacement fails.
            try { tmp.delete(null); } catch (cleanupError) {
                logError(cleanupError, 'material-panel: failed to remove temporary config after save failure');
            }
            logError(e, 'material-panel: atomic config replacement failed');
            throw e;
        }
        if (suppressWatcher)
            this._selfWriteContent = text;
    }

    async saveAsync(config, {suppressWatcher = false} = {}) {
        this._ensureDir();
        const out = {...config};
        // Keep async and synchronous save validation exactly aligned.
        out.panelSize = normalizePanelSize(out.panelSize, DEFAULT_CONFIG.panelSize);
        out.configVersion = out.configVersion ?? DEFAULT_CONFIG.configVersion ?? 3;

        const file = Gio.File.new_for_path(this._configPath);
        const text = JSON.stringify(out, null, 2);
        if (suppressWatcher)
            this._selfWriteContent = text;
        try {
            // GIO's replace operation writes through a temporary file and
            // atomically replaces the destination without blocking the UI.
            await this._replaceContentsAsync(file, text);
        } catch (error) {
            if (this._selfWriteContent === text)
                this._selfWriteContent = null;
            logError(error, 'material-panel: asynchronous config replacement failed');
            throw error;
        }
    }

    // Live-reload: prefs.js runs in a separate process, so this is how the
    // shell process picks up changes saved from the prefs window.
    watch(callback) {
        this._callback = callback;
        const targetName = GLib.path_get_basename(this._configPath);
        const legacyTarget = GLib.path_get_basename(this._legacyConfigPath);
        const watchDir = (dirPath, isLegacyDir = false) => {
            const realDir = resolveSymlinkPath(dirPath);
            try {
                const parentDir = Gio.File.new_for_path(realDir);
                const mon = parentDir.monitor_directory(Gio.FileMonitorFlags.NONE, null);
                mon.connect('changed', (_m, changedFile, _of, eventType) => {
                    const isTarget = changedFile.get_basename() === targetName || changedFile.get_basename() === legacyTarget;
                    if (!isTarget)
                        return;
                    if (eventType === Gio.FileMonitorEvent.CHANGES_DONE_HINT ||
                        eventType === Gio.FileMonitorEvent.CREATED ||
                        eventType === Gio.FileMonitorEvent.RENAMED ||
                        eventType === Gio.FileMonitorEvent.CHANGED) {
                        if (this._debounceId)
                            GLib.source_remove(this._debounceId);
                        const generation = ++this._reloadGeneration;
                        this._debounceId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 300, () => {
                            this._debounceId = null;
                            this._reloadFromWatcher(isLegacyDir, changedFile, generation);
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
        this._monitor = watchDir(this._configDir, false);
        // Also watch legacy dir if different, to catch distrobox writes.
        // Only events from this monitor may sync the legacy file to HOME;
        // both directories contain a file named config.json.
        const legacyDir = GLib.path_get_dirname(this._legacyConfigPath);
        if (legacyDir !== this._configDir) {
            this._legacyMonitor = watchDir(legacyDir, true);
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
        this._reloadGeneration++;
    }

    get path() {
        return this._configPath;
    }
}
