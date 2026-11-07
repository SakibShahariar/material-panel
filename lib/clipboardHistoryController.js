import {
    addClipboardHistoryEntry,
    normalizeClipboardHistory,
    normalizeClipboardText,
} from './clipboardHistoryState.js';

export const CLIPBOARD_TEXT_MIME_TYPES = Object.freeze([
    'text/plain;charset=utf-8',
    'UTF8_STRING',
    'text/plain',
    'STRING',
]);

/**
 * Event-driven clipboard capture coordinator.
 *
 * All GNOME Shell objects and persistence are injected so lifecycle and race
 * behavior can be tested without a live Shell session.
 */
export class ClipboardHistoryController {
    constructor({
        selection,
        clipboard,
        store,
        clipboardType,
        selectionType,
        now = () => Math.floor(Date.now() / 1000),
        idFactory,
        getSourceAppId = () => null,
        excludedAppIds = [],
        maxEntries = 50,
        maxAgeDays = 7,
    }) {
        if (!selection || !clipboard || !store)
            throw new TypeError('Selection, clipboard, and store adapters are required');
        if (typeof idFactory !== 'function')
            throw new TypeError('An entry ID factory is required');

        this._selection = selection;
        this._clipboard = clipboard;
        this._store = store;
        this._clipboardType = clipboardType;
        this._selectionType = selectionType;
        this._now = now;
        this._idFactory = idFactory;
        this._getSourceAppId = getSourceAppId;
        this._excludedAppIds = new Set(excludedAppIds);
        this._maxEntries = Math.max(1, Math.min(50, Math.floor(Number(maxEntries) || 50)));
        this._maxAgeSeconds = Math.max(86400, Math.min(7 * 86400, Math.floor(Number(maxAgeDays) || 7) * 86400));
        this._entries = [];
        this._enabled = false;
        this._paused = false;
        this._destroyed = false;
        this._ready = false;
        this._generation = 0;
        this._captureSequence = 0;
        this._ownerChangedId = 0;
        this._saveQueue = Promise.resolve();
        this._selfCopyText = null;
        this._onChanged = null;
        this._onError = null;
    }

    get entries() {
        return this._entries.map(entry => ({...entry}));
    }

    get enabled() {
        return this._enabled;
    }

    get paused() {
        return this._paused;
    }

    copyEntry(id) {
        const entry = this._entries.find(item => item.id === id);
        if (!entry || !this._enabled || this._destroyed)
            return false;
        try {
            this._selfCopyText = {text: entry.text, expiresAt: Date.now() + 1000};
            this._clipboard.set_text(this._clipboardType, entry.text);
            return true;
        } catch (error) {
            this._selfCopyText = null;
            return false;
        }
    }

    setOnChanged(callback) {
        this._onChanged = typeof callback === 'function' ? callback : null;
    }

    setOnError(callback) {
        this._onError = typeof callback === 'function' ? callback : null;
    }

    _emitError(message) {
        try { this._onError?.(message); } catch (error) {}
    }

    async enable({paused = false} = {}) {
        if (this._destroyed)
            throw new Error('Clipboard history controller has been destroyed');
        if (this._enabled)
            return;
        this._enabled = true;
        this._paused = Boolean(paused);
        const generation = ++this._generation;

        // Loading persisted history is allowed only after explicit opt-in.
        let loaded = [];
        try {
            loaded = await this._store.load(this._limits());
        } catch (error) {
            if (generation === this._generation && this._enabled)
                this._enabled = false;
            throw error;
        }
        if (generation !== this._generation || !this._enabled || this._destroyed)
            return;

        this._entries = normalizeClipboardHistory(loaded, this._now(), this._limits());
        this._ready = true;
        if (!this._paused)
            this._connect();
        this._emitChanged();
    }

    _limits() {
        return {maxEntries: this._maxEntries, maxAgeSeconds: this._maxAgeSeconds};
    }

    async setLimits({maxEntries = this._maxEntries, maxAgeDays = this._maxAgeSeconds / 86400} = {}) {
        this._maxEntries = Math.max(1, Math.min(50, Math.floor(Number(maxEntries) || 50)));
        this._maxAgeSeconds = Math.max(86400, Math.min(7 * 86400, Math.floor(Number(maxAgeDays) || 7) * 86400));
        const nextEntries = normalizeClipboardHistory(this._entries, this._now(), this._limits());
        this._generation++;
        this._captureSequence++;
        this._entries = nextEntries;
        this._emitChanged();
        if (!this._enabled || this._destroyed || !this._ready)
            return;
        const write = this._saveQueue.then(() => this._store.write(nextEntries, this._limits()));
        this._saveQueue = write.catch(() => {});
        await write;
    }

    pause() {
        if (!this._enabled || this._paused || this._destroyed)
            return;
        this._paused = true;
        this._generation++;
        this._captureSequence++;
        this._disconnect();
        this._emitChanged();
    }

    resume() {
        if (!this._enabled || !this._paused || this._destroyed)
            return;
        this._paused = false;
        this._generation++;
        this._captureSequence++;
        this._connect();
        this._emitChanged();
    }

    async clear() {
        if (!this._enabled || this._destroyed)
            return;
        this._generation++;
        this._captureSequence++;
        this._entries = [];
        this._emitChanged();
        await this._saveQueue;
        await this._store.clear();
    }

    async disable() {
        if (!this._enabled && !this._entries.length)
            return;
        this._enabled = false;
        this._paused = false;
        this._ready = false;
        this._generation++;
        this._captureSequence++;
        this._disconnect();
        this._entries = [];
        this._emitChanged();
        await this._saveQueue;
        await this._store.clear();
    }

    destroy() {
        if (this._destroyed)
            return;
        this._destroyed = true;
        this._ready = false;
        this._enabled = false;
        this._paused = false;
        this._generation++;
        this._captureSequence++;
        this._disconnect();
        this._entries = [];
        this._onChanged = null;
        this._onError = null;
    }

    _connect() {
        if (this._ownerChangedId || !this._enabled || this._paused || this._destroyed)
            return;
        this._ownerChangedId = this._selection.connect('owner-changed',
            (_selection, selectionType, source) => {
                if (selectionType !== this._selectionType)
                    return;
                this._capture(source);
            });
    }

    _disconnect() {
        if (!this._ownerChangedId)
            return;
        try {
            this._selection.disconnect(this._ownerChangedId);
        } catch (error) {
            // Teardown must continue even if the signal was already disconnected.
        }
        this._ownerChangedId = 0;
    }

    async _capture(source) {
        if (!this._enabled || this._paused || this._destroyed)
            return;

        const captureSequence = ++this._captureSequence;
        const generation = this._generation;

        let appId = null;
        try {
            appId = this._getSourceAppId(source);
        } catch (error) {
            appId = null;
        }
        if (appId && this._excludedAppIds.has(appId))
            return;

        // St.Clipboard.get_text() may invoke its callback synchronously when
        // there is no supported text target. Never call it without this check.
        let mimeTypes;
        try {
            mimeTypes = this._clipboard.get_mimetypes(this._clipboardType);
        } catch (error) {
            return;
        }
        if (!Array.isArray(mimeTypes) ||
            !mimeTypes.some(type => CLIPBOARD_TEXT_MIME_TYPES.includes(type)))
            return;

        let text;
        try {
            text = await new Promise(resolve => {
                this._clipboard.get_text(this._clipboardType, (_clipboard, value) => resolve(value));
            });
        } catch (error) {
            return;
        }
        if (captureSequence !== this._captureSequence ||
            generation !== this._generation ||
            !this._enabled || this._paused || this._destroyed)
            return;

        const cleanText = normalizeClipboardText(text);
        if (cleanText === null)
            return;
        if (this._selfCopyText !== null) {
            const selfCopy = this._selfCopyText;
            this._selfCopyText = null;
            if (selfCopy.expiresAt >= Date.now() && selfCopy.text === cleanText)
                return;
        }

        this._saveQueue = this._saveQueue.then(async () => {
            if (generation !== this._generation || !this._enabled ||
                this._paused || this._destroyed)
                return;

            const result = addClipboardHistoryEntry(this._entries, cleanText, {
                now: this._now(),
                id: this._idFactory(),
                ...this._limits(),
            });
            if (!result.added)
                return;

            await this._store.write(result.entries, this._limits());
            if (generation !== this._generation || !this._enabled || this._destroyed)
                return;
            this._entries = result.entries;
            this._emitChanged();
        }).catch(() => {
            this._emitError('Clipboard history could not be saved. The copied text was not retained.');
        });
        await this._saveQueue;
    }

    _emitChanged() {
        try {
            this._onChanged?.(this.entries, {enabled: this._enabled, paused: this._paused});
        } catch (error) {
            // UI observers must not break clipboard capture or lifecycle cleanup.
        }
    }
}
