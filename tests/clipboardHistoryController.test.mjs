import assert from 'node:assert/strict';
import test from 'node:test';
import {
    ClipboardHistoryController,
    CLIPBOARD_TEXT_MIME_TYPES,
} from '../lib/clipboardHistoryController.js';

class FakeSelection {
    constructor() { this.listeners = new Map(); this.nextId = 1; }
    connect(signal, callback) {
        assert.equal(signal, 'owner-changed');
        const id = this.nextId++;
        this.listeners.set(id, callback);
        return id;
    }
    disconnect(id) { this.listeners.delete(id); }
    emit(type = 'clipboard', source = null) {
        for (const callback of this.listeners.values())
            callback(this, type, source);
    }
}

class FakeClipboard {
    constructor() { this.mimeTypes = ['text/plain']; this.text = ''; this.reads = 0; this.pending = []; }
    get_mimetypes() { return this.mimeTypes; }
    get_text(_type, callback) {
        this.reads++;
        if (this.pending.length)
            this.pending.shift()(callback);
        else
            callback(this, this.text);
    }
    deferRead() {
        return new Promise(resolve => this.pending.push(callback => resolve({callback})));
    }
}

function setup(overrides = {}) {
    const selection = new FakeSelection();
    const clipboard = new FakeClipboard();
    const store = {
        entries: [],
        loads: 0,
        writes: [],
        clears: 0,
        async load() { this.loads++; return this.entries; },
        async write(entries) { this.writes.push(entries); this.entries = entries; },
        async clear() { this.clears++; this.entries = []; },
    };
    let id = 0;
    const controller = new ClipboardHistoryController({
        selection, clipboard, store,
        clipboardType: 'CLIPBOARD', selectionType: 'clipboard',
        now: () => 1_800_000_000,
        idFactory: () => `id-${++id}`,
        ...overrides,
    });
    return {controller, selection, clipboard, store};
}

test('disabled startup performs no store access, signal connection, or clipboard read', async () => {
    const {controller, selection, clipboard, store} = setup();
    assert.equal(controller.enabled, false);
    assert.equal(store.loads, 0);
    assert.equal(selection.listeners.size, 0);
    selection.emit();
    assert.equal(clipboard.reads, 0);
});

test('enable loads existing history and listens only after explicit opt-in', async () => {
    const {controller, selection, clipboard, store} = setup();
    await controller.enable();
    assert.equal(store.loads, 1);
    assert.equal(selection.listeners.size, 1);
    assert.equal(clipboard.reads, 0);
    clipboard.text = 'new copy';
    selection.emit();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(controller.entries[0].text, 'new copy');
    assert.equal(store.writes.length, 1);
});

test('unsupported MIME types are ignored without calling get_text', async () => {
    const {controller, selection, clipboard} = setup();
    await controller.enable();
    clipboard.mimeTypes = ['image/png'];
    selection.emit();
    assert.equal(clipboard.reads, 0);
    assert.deepEqual(controller.entries, []);
    assert.ok(CLIPBOARD_TEXT_MIME_TYPES.includes('UTF8_STRING'));
});

test('PRIMARY selection events are ignored', async () => {
    const {controller, selection, clipboard} = setup();
    await controller.enable();
    selection.emit('primary');
    assert.equal(clipboard.reads, 0);
});

test('pause disconnects capture and resume does not import the current clipboard', async () => {
    const {controller, selection, clipboard, store} = setup();
    await controller.enable();
    controller.pause();
    assert.equal(selection.listeners.size, 0);
    clipboard.text = 'copied while paused';
    selection.emit();
    assert.equal(clipboard.reads, 0);
    controller.resume();
    assert.equal(clipboard.reads, 0);
    selection.emit();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(controller.entries[0].text, 'copied while paused');
    assert.equal(store.writes.length, 1);
});

test('disable stops capture and deletes stored history', async () => {
    const {controller, selection, clipboard, store} = setup();
    await controller.enable();
    clipboard.text = 'synthetic secret sample';
    selection.emit();
    await new Promise(resolve => setImmediate(resolve));
    await controller.disable();
    assert.equal(controller.enabled, false);
    assert.equal(controller.entries.length, 0);
    assert.equal(selection.listeners.size, 0);
    assert.equal(store.clears, 1);
    selection.emit();
    assert.equal(clipboard.reads, 1);
});

test('self-copy duplicate text is not persisted twice', async () => {
    const {controller, selection, clipboard, store} = setup();
    await controller.enable();
    clipboard.text = 'same text';
    selection.emit();
    await new Promise(resolve => setImmediate(resolve));
    selection.emit();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(controller.entries.length, 1);
    assert.equal(store.writes.length, 1);
});

test('teardown invalidates pending reads and never clears saved history', async () => {
    const {controller, selection, clipboard, store} = setup();
    await controller.enable();
    let finish;
    clipboard.get_text = (_type, callback) => { finish = callback; };
    selection.emit();
    controller.destroy();
    finish(clipboard, 'late synthetic value');
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(store.writes.length, 0);
    assert.equal(store.clears, 0);
    assert.equal(selection.listeners.size, 0);
});
