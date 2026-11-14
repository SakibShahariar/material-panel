import assert from 'node:assert/strict';
import test from 'node:test';
import {
    CONTROL_CENTER_HOME_SHORTCUT_DEFINITIONS,
    DEFAULT_CONTROL_CENTER_HOME_SHORTCUTS,
    buildControlCenterHomeShortcutActors,
    moveControlCenterHomeShortcut,
    normalizeControlCenterHomeShortcuts,
    setControlCenterHomeShortcut,
} from '../lib/controlCenterHomeShortcuts.js';

test('Home shortcuts default to the curated built-in controls, independent of Quick Settings tiles', () => {
    assert.deepEqual(normalizeControlCenterHomeShortcuts(null), ['dark-mode', 'night-light', 'dnd']);
    assert.deepEqual(CONTROL_CENTER_HOME_SHORTCUT_DEFINITIONS.map(item => item.id),
        ['dark-mode', 'night-light', 'dnd']);
});

test('Home shortcut visibility adds and removes choices without changing other order', () => {
    const current = ['dark-mode', 'dnd'];
    assert.deepEqual(setControlCenterHomeShortcut(current, 'night-light', true),
        ['dark-mode', 'dnd', 'night-light']);
    assert.deepEqual(setControlCenterHomeShortcut(current, 'dark-mode', false), ['dnd']);
    assert.deepEqual(setControlCenterHomeShortcut([], 'not-valid id', true), []);
});

test('Home shortcut reordering is bounded and preserves unknown backend IDs', () => {
    const current = normalizeControlCenterHomeShortcuts(['future-action', 'dark-mode', 'dnd', 'dark-mode']);
    assert.deepEqual(current, ['future-action', 'dark-mode', 'dnd']);
    assert.deepEqual(moveControlCenterHomeShortcut(current, 'dnd', -1),
        ['future-action', 'dnd', 'dark-mode']);
    assert.deepEqual(moveControlCenterHomeShortcut(current, 'future-action', -1), current);
});

test('Home shortcut normalization is bounded to twelve unique safe IDs', () => {
    const input = Array.from({length: 20}, (_, index) => 'action-' + index);
    const normalized = normalizeControlCenterHomeShortcuts(input);
    assert.equal(normalized.length, 12);
    assert.equal(new Set(normalized).size, 12);
});


test('Home shortcut builders isolate unavailable and throwing actions', () => {
    const healthy = {id: 'healthy'};
    const errors = [];
    const builders = new Map([
        ['healthy', () => healthy],
        ['missing', () => null],
        ['broken', () => { throw new Error('backend unavailable'); }],
        ['invalid', () => 'not-an-actor'],
    ]);

    const actors = buildControlCenterHomeShortcutActors(
        ['healthy', 'missing', 'broken', 'invalid', 'unknown'],
        builders,
        (id, error) => errors.push([id, error.message]));

    assert.deepEqual(actors, [healthy]);
    assert.deepEqual(errors, [['broken', 'backend unavailable']]);
});

test('Home shortcut error reporting cannot break remaining actor creation', () => {
    const healthy = {id: 'healthy'};
    const actors = buildControlCenterHomeShortcutActors(
        ['broken', 'healthy'],
        new Map([
            ['broken', () => { throw new Error('failed'); }],
            ['healthy', () => healthy],
        ]),
        () => { throw new Error('logger failed'); });

    assert.deepEqual(actors, [healthy]);
});

test('Home shortcut normalization bounds raw IDs before trimming or matching', () => {
    assert.deepEqual(normalizeControlCenterHomeShortcuts([
        ' '.repeat(100_000),
        'a'.repeat(100_000),
        '  dnd  ',
    ]), ['dnd']);
    assert.deepEqual(setControlCenterHomeShortcut([], 'x'.repeat(100_000), true), []);
    assert.deepEqual(moveControlCenterHomeShortcut(['dnd'], 'x'.repeat(100_000), -1), ['dnd']);
});
