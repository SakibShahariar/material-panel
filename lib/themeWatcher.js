import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import {resolveSymlinkPath} from './realPath.js';
import {debugLog} from './debug.js';

function resolveRealDir(dirPath) {
    return resolveSymlinkPath(dirPath);
}

/** Owns the Matugen directory monitor and its debounced change callback. */
export class ThemeFileWatcher {
    constructor() {
        this._monitor = null;
        this._watchedSource = null;
        this._debounceId = null;
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
}
