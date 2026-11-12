import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

function assertExpectedFileType(file, expectedType, description) {
    const info = file.query_info(
        'standard::type,standard::is-symlink,standard::size',
        Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS,
        null);
    if (info.get_is_symlink() || info.get_file_type() !== expectedType) {
        const type = expectedType === Gio.FileType.DIRECTORY ? 'directory' : 'regular file';
        throw new Error(`${description} must be a non-symlink ${type}`);
    }
    return info;
}

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
        this._parentDirectory = Gio.File.new_for_path(GLib.build_filenamev([
            GLib.get_user_data_dir(), 'material-panel',
        ]));
        this._directoryPath = GLib.build_filenamev([
            GLib.get_user_data_dir(), 'material-panel', 'clipboard-history',
        ]);
        this._directory = Gio.File.new_for_path(this._directoryPath);
        this._file = this._directory.get_child('history.json');
    }

    async load(limits = {}) {
        if (!this._parentDirectory.query_exists(null))
            return [];
        assertExpectedFileType(this._parentDirectory, Gio.FileType.DIRECTORY,
            'Clipboard history parent');
        if (!this._directory.query_exists(null))
            return [];
        assertExpectedFileType(this._directory, Gio.FileType.DIRECTORY,
            'Clipboard history directory');
        if (!this._file.query_exists(null))
            return [];

        // Inspect paths without following symbolic links before repairing
        // permissions. Never chmod or read a target outside the private store.
        const info = assertExpectedFileType(
            this._file, Gio.FileType.REGULAR, 'Clipboard history file');
        this._directory.set_attribute_uint32(
            'unix::mode', 0o700, Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS, null);
        this._file.set_attribute_uint32(
            'unix::mode', 0o600, Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS, null);
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
        if (this._file.query_exists(null))
            assertExpectedFileType(this._file, Gio.FileType.REGULAR, 'Clipboard history file');

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
            'unix::mode', 0o600, Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS, null);
    }

    async clear() {
        if (!this._parentDirectory.query_exists(null))
            return;
        assertExpectedFileType(this._parentDirectory, Gio.FileType.DIRECTORY,
            'Clipboard history parent');
        if (!this._directory.query_exists(null))
            return;
        assertExpectedFileType(this._directory, Gio.FileType.DIRECTORY,
            'Clipboard history directory');
        if (this._file.query_exists(null)) {
            assertExpectedFileType(this._file, Gio.FileType.REGULAR, 'Clipboard history file');
            this._file.delete(null);
        }
        this._directory.delete(null);
    }

    _ensureDirectory() {
        if (!this._parentDirectory.query_exists(null))
            this._parentDirectory.make_directory_with_parents(null);
        assertExpectedFileType(this._parentDirectory, Gio.FileType.DIRECTORY,
            'Clipboard history parent');
        if (!this._directory.query_exists(null))
            this._directory.make_directory(null);
        assertExpectedFileType(this._directory, Gio.FileType.DIRECTORY,
            'Clipboard history directory');
        this._directory.set_attribute_uint32(
            'unix::mode', 0o700, Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS, null);
    }
}
