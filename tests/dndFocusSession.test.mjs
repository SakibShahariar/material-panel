import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';

import {
    DndFocusSession, getDndFocusSession, clearDndFocusSession,
} from '../lib/dndSession.js';

class FakeSettings {
    constructor(showBanners = true) {
        this.value = showBanners;
        this.listeners = new Map();
        this.nextId = 1;
    }
    get_boolean(key) {
        assert.equal(key, 'show-banners');
        return this.value;
    }
    set_boolean(key, value) {
        assert.equal(key, 'show-banners');
        if (this.value === value)
            return;
        this.value = value;
        for (const listener of this.listeners.values())
            listener();
    }
    connect(signal, listener) {
        assert.equal(signal, 'changed::show-banners');
        const id = this.nextId++;
        this.listeners.set(id, listener);
        return id;
    }
    disconnect(id) {
        this.listeners.delete(id);
    }
}

function createHarness(initial = true) {
    let now = 1_000;
    let nextId = 1;
    const timers = new Map();
    const settings = new FakeSettings(initial);
    const session = new DndFocusSession(settings, {
        now: () => now,
        schedule: (callback, delay) => {
            const id = nextId++;
            timers.set(id, {callback, delay});
            return id;
        },
        cancelSchedule: id => timers.delete(id),
    });
    return {
        settings, session, timers,
        advance(ms) {
            now += ms;
            for (const [id, timer] of [...timers]) {
                if (timer.delay <= ms) {
                    timers.delete(id);
                    timer.callback();
                } else {
                    timer.delay -= ms;
                }
            }
        },
    };
}

test('focus session suppresses banners and restores the prior manual DND state at expiry', () => {
    const {settings, session, advance} = createHarness(true);
    assert.equal(session.start(25 * 60 * 1000), true);
    assert.equal(settings.value, false);
    assert.equal(session.isActive(), true);
    advance(25 * 60 * 1000);
    assert.equal(settings.value, true);
    assert.equal(session.isActive(), false);
    session.destroy();
});

test('focus session cancellation restores manual DND without changing it', () => {
    const {settings, session} = createHarness(false);
    assert.equal(session.start(50 * 60 * 1000), true);
    assert.equal(settings.value, false);
    assert.equal(session.cancel(), true);
    assert.equal(settings.value, false);
    assert.equal(session.cancel(), false);
    session.destroy();
});

test('extending an active session preserves the original manual notification preference', () => {
    const {settings, session, advance} = createHarness(true);
    session.start(10_000);
    advance(4_000);
    session.start(20_000);
    advance(19_999);
    assert.equal(session.isActive(), true);
    advance(1);
    assert.equal(settings.value, true);
    session.destroy();
});

test('manual setting changes during a focus session are restored after the session', () => {
    const {settings, session} = createHarness(true);
    session.start(60_000);
    settings.set_boolean('show-banners', true);
    assert.equal(settings.value, false, 'scheduled suppression remains active');
    session.cancel();
    assert.equal(settings.value, true, 'the external/manual choice is restored');
    session.destroy();
});

test('destroying the service cancels its timer and restores the manual setting', () => {
    const {settings, session, timers} = createHarness(true);
    session.start(60_000);
    assert.equal(timers.size, 1);
    session.destroy();
    assert.equal(timers.size, 0);
    assert.equal(settings.value, true);
    assert.equal(settings.listeners.size, 0);
});

test('invalid or excessively long focus durations are rejected without changing DND', () => {
    const {settings, session} = createHarness(true);
    for (const duration of [0, -1, NaN, Infinity, 25 * 60 * 60 * 1000])
        assert.equal(session.start(duration), false);
    assert.equal(settings.value, true);
    assert.equal(session.isActive(), false);
    session.destroy();
});

test('shared focus session is reused across panel rebuilds and cleared on extension teardown', () => {
    const {settings, session, timers} = createHarness(true);
    const adapters = {
        now: () => 1_000,
        schedule: (callback, delay) => {
            const id = 1;
            timers.set(id, {callback, delay});
            return id;
        },
        cancelSchedule: id => timers.delete(id),
    };
    const first = getDndFocusSession(settings, adapters);
    const second = getDndFocusSession(new FakeSettings(), adapters);
    assert.equal(first, second);
    first.start(60_000);
    clearDndFocusSession();
    assert.equal(settings.value, true);
    assert.equal(first.isActive(), false);
    session.destroy();
});

test('DND module exposes focus-session durations, status, cancellation, and keyboard access', async () => {
    const [moduleSource, extensionSource, renderer, stylesheet] = await Promise.all([
        readFile(new URL('../modules/dnd.js', import.meta.url), 'utf8'),
        readFile(new URL('../extension.js', import.meta.url), 'utf8'),
        readFile(new URL('../lib/themeRenderer.js', import.meta.url), 'utf8'),
        readFile(new URL('../stylesheet.css', import.meta.url), 'utf8'),
    ]);
    assert.ok(moduleSource.includes('for (const minutes of [25, 50, 90])'));
    assert.ok(moduleSource.includes('`Focus for ${minutes} minutes`'));
    assert.ok(moduleSource.includes('End focus session'));
    assert.ok(moduleSource.includes('focus session active'));
    assert.ok(moduleSource.includes('event.get_button() !== 3'));
    assert.ok(moduleSource.includes('Clutter.KEY_Menu'));
    assert.ok(moduleSource.includes('session.cancel()'));
    assert.ok(moduleSource.includes("settings.set_boolean('show-banners'"));
    assert.ok(extensionSource.includes('clearDndFocusSession();'));
    assert.ok(renderer.includes('.material-panel-dnd-btn.focus-session-active'));
    assert.ok(stylesheet.includes('.material-panel-dnd-btn.focus-session-active'));
});
