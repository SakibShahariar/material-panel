import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');

test('clipboard history is disabled by default and initializes only after opt-in', () => {
    const config = read('lib/configStore.js');
    const extension = read('extension.js');
    assert.match(config, /clipboardHistoryEnabled:\s*false/);

    const start = extension.indexOf('_syncClipboardHistory(config)');
    const end = extension.indexOf('_applyTrayOnly()', start);
    assert.ok(start >= 0 && end > start);
    const sync = extension.slice(start, end);
    assert.ok(sync.indexOf('if (!enabled)') < sync.indexOf('St.Clipboard.get_default()'));
    assert.ok(sync.indexOf('if (!enabled)') < sync.indexOf('new ClipboardHistoryFileStore()'));
});

test('clipboard payload storage is separate, bounded, private, and atomically replaced', () => {
    const store = read('lib/clipboardHistoryStore.js');
    const state = read('lib/clipboardHistoryState.js');
    const config = read('lib/configStore.js');

    assert.match(store, /GLib\.get_user_data_dir\(\)/);
    assert.match(store, /'clipboard-history'/);
    assert.match(store, /replace_contents_async/);
    assert.match(store, /Gio\.FileCreateFlags\.PRIVATE/);
    assert.match(store, /'unix::mode', 0o700/);
    assert.match(store, /'unix::mode', 0o600/);
    assert.match(state, /CLIPBOARD_HISTORY_MAX_TEXT_BYTES = 256 \* 1024/);
    assert.match(state, /CLIPBOARD_HISTORY_MAX_FILE_BYTES = 14 \* 1024 \* 1024/);
    assert.doesNotMatch(config, /clipboardHistoryEntries|clipboardHistoryPayload/);
});

test('clipboard history is registered as a panel module and preferences page', () => {
    const registry = read('lib/moduleRegistry.js');
    const ids = read('lib/moduleIds.js');
    const catalog = read('prefs/moduleCatalog.js');
    const prefs = read('prefs.js');
    const panel = read('modules/clipboardHistory.js');

    assert.match(registry, /clipboardHistory:\s*buildClipboardHistory/);
    assert.match(ids, /'clipboardHistory'/);
    assert.match(catalog, /id: 'clipboardHistory'/);
    assert.match(prefs, /buildClipboardHistoryPage/);
    assert.match(panel, /Clipboard history is recording/);
    assert.match(panel, /controller\.copyEntry\(entry\.id\)/);
});


test('clipboard preview formatting is display-only and copy preserves the original entry', () => {
    const panel = read('modules/clipboardHistory.js');
    assert.ok(panel.includes("new PopupMenu.PopupMenuItem(formatClipboardHistoryPreview(entry.text))"));
    assert.ok(panel.includes("item.connect('activate', () => controller.copyEntry(entry.id))"));
});

test('clipboard history repairs existing directory and file permissions before reading', () => {
    const store = read('lib/clipboardHistoryStore.js');
    const load = store.slice(store.indexOf('async load('), store.indexOf('async write('));
    const directoryMode = load.indexOf("'unix::mode', 0o700");
    const fileMode = load.indexOf("'unix::mode', 0o600");
    const readContents = load.indexOf('load_contents_async');
    assert.ok(directoryMode >= 0 && directoryMode < readContents);
    assert.ok(fileMode >= 0 && fileMode < readContents);
});

test('clipboard history refuses symlinked parent, directory, and file paths before touching data', () => {
    const store = read('lib/clipboardHistoryStore.js');
    assert.match(store, /function assertExpectedFileType\(file, expectedType, description\)/);
    assert.match(store, /Gio\.FileQueryInfoFlags\.NOFOLLOW_SYMLINKS/);
    assert.match(store, /info\.get_is_symlink\(\) \|\| info\.get_file_type\(\) !== expectedType/);
    assert.match(store, /Gio\.FileType\.DIRECTORY/);
    assert.match(store, /Gio\.FileType\.REGULAR/);

    const load = store.slice(store.indexOf('async load('), store.indexOf('async write('));
    assert.ok(load.indexOf('assertExpectedFileType(this._parentDirectory') < load.indexOf('load_contents_async'));
    assert.ok(load.indexOf('assertExpectedFileType(this._directory') < load.indexOf('load_contents_async'));
    assert.ok(load.indexOf('assertExpectedFileType(\n            this._file') < load.indexOf('load_contents_async'));

    const clearStart = store.indexOf('async clear()');
    const clearEnd = store.indexOf('\n    _ensureDirectory()', clearStart);
    const clear = store.slice(clearStart, clearEnd);
    assert.ok(clear.indexOf('assertExpectedFileType(this._parentDirectory') < clear.indexOf('this._file.delete'));
    assert.ok(clear.indexOf('assertExpectedFileType(this._directory') < clear.indexOf('this._file.delete'));
    assert.ok(clear.indexOf('assertExpectedFileType(this._file') < clear.indexOf('this._file.delete'));
});
