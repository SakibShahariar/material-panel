import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import St from 'gi://St';

/** Serializes generated-theme writes and owns the loaded GNOME stylesheet. */
export class ThemeStylesheet {
    constructor(generatedPath) {
        this._generatedPath = generatedPath;
        this._loadedFile = null;
        this._lastCss = null;
        this._writeInFlight = false;
        this._pendingWrite = null;
    }

    get loadedFile() { return this._loadedFile; }
    get lastCss() { return this._lastCss; }
    get writeInFlight() { return this._writeInFlight; }
    get hasPendingWrite() { return this._pendingWrite !== null; }

    write(css, isCurrent, callback) {
        if (this._writeInFlight) {
            this._pendingWrite = {css, isCurrent, callback};
            return;
        }
        this._writeInFlight = true;
        const finish = (file, success) => {
            this._writeInFlight = false;
            if (success && isCurrent()) {
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
                this.write(pending.css, pending.isCurrent, pending.callback);
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

    destroy() {
        if (this._loadedFile) {
            const theme = St.ThemeContext.get_for_stage(global.stage).get_theme();
            theme.unload_stylesheet(this._loadedFile);
            this._loadedFile = null;
        }
        this._lastCss = null;
    }
}
