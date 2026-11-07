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
    assert.match(panel, /new PopupMenu\\.PopupMenuItem\\(formatClipboardHistoryPreview\\(entry\\.text\\)\\)/);
    assert.match(panel, /item\\.connect\\('activate', \\(\\) => controller\\.copyEntry\\(entry\\.id\\)\\)/);
});
