import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import {
    CLIPBOARD_HISTORY_MAX_FILE_BYTES,
    parseClipboardHistory,
    serializeClipboardHistory,
} from './clipboardHistoryState.js';

/**
 * Private, local-only clipboard history storage.
 *
 * The directory and file are created only after the controller is explicitly
 * enabled. Clipboard payloads never pass through ConfigStore or its backups.
 */
export class ClipboardHistoryFileStore {
    constructor() {
        this._directoryPath = GLib.build_filenamev([
            GLib.get_user_data_dir(), 'material-panel', 'clipboard-history',
        ]);
        this._directory = Gio.File.new_for_path(this._directoryPath);
        this._file = this._directory.get_child('history.json');
    }

    async load(limits = {}) {
        if (!this._directory.query_exists(null) || !this._file.query_exists(null))
            return [];

        // Repair permissions before reading an existing history file too. A
        // previous version or manual copy may have left it more permissive.
        this._directory.set_attribute_uint32(
            'unix::mode', 0o700, Gio.FileQueryInfoFlags.NONE, null);
        this._file.set_attribute_uint32(
            'unix::mode', 0o600, Gio.FileQueryInfoFlags.NONE, null);

        const info = this._file.query_info(
            'standard::size', Gio.FileQueryInfoFlags.NONE, null);
        if (info.get_size() > CLIPBOARD_HISTORY_MAX_FILE_BYTES)
            throw new Error('Clipboard history file exceeds the allowed size');

        const serialized = await new Promise((resolve, reject) => {
            this._file.load_contents_async(null, (source, result) => {
                try {
                    const [success, contents] = source.load_contents_finish(result);
                    if (!success)
                        throw new Error('Could not read clipboard history');
                    resolve(new TextDecoder('utf-8', {fatal: true}).decode(contents));
                } catch (error) {
                    reject(error);
                }
            });
        });

        return parseClipboardHistory(serialized, Math.floor(Date.now() / 1000), limits);
    }

    async write(entries, limits = {}) {
        const serialized = serializeClipboardHistory(entries, Math.floor(Date.now() / 1000), limits);
        this._ensureDirectory();

        await new Promise((resolve, reject) => {
            this._file.replace_contents_async(
                serialized,
                null,
                false,
                Gio.FileCreateFlags.PRIVATE | Gio.FileCreateFlags.REPLACE_DESTINATION,
                GLib.PRIORITY_DEFAULT,
                null,
                (source, result) => {
                    try {
                        source.replace_contents_finish(result);
                        resolve();
                    } catch (error) {
                        reject(error);
                    }
                });
        });

        // PRIVATE protects newly created files; enforce the mode for existing
        // files too, including files created by an earlier extension version.
        this._file.set_attribute_uint32(
            'unix::mode', 0o600, Gio.FileQueryInfoFlags.NONE, null);
    }

    async clear() {
        if (this._file.query_exists(null))
            this._file.delete(null);
        if (this._directory.query_exists(null))
            this._directory.delete(null);
    }

    _ensureDirectory() {
        if (!this._directory.query_exists(null))
            this._directory.make_directory_with_parents(null);
        this._directory.set_attribute_uint32(
            'unix::mode', 0o700, Gio.FileQueryInfoFlags.NONE, null);
    }
}
