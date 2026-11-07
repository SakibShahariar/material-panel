import assert from 'node:assert/strict';
import test from 'node:test';

import {
    DEFAULT_POPUP_SHORTCUTS,
    findPopupShortcutConflicts,
    normalizePopupShortcuts,
} from '../lib/popupShortcuts.js';

test('popup shortcuts default to empty and only accept supported string assignments', () => {
    assert.deepEqual(normalizePopupShortcuts(null), DEFAULT_POPUP_SHORTCUTS);
    assert.deepEqual(normalizePopupShortcuts({
        volume: ' <Super><Alt>V ',
        network: 42,
        unknown: '<Super>X',
        clock: '<Super><Alt>C',
    }), {
        volume: '<Super><Alt>V',
        network: '',
        bluetooth: '',
        clock: '<Super><Alt>C',
        'control-center': '',
    });
});

test('duplicate popup accelerators are reported together and empty assignments do not conflict', () => {
    assert.deepEqual(findPopupShortcutConflicts({
        volume: '<Super><Alt>V',
        network: '<Super><Alt>V',
        bluetooth: '',
        clock: '<Super><Alt>C',
    }), [{accelerator: '<Super><Alt>V', ids: ['volume', 'network']}]);
    assert.deepEqual(findPopupShortcutConflicts({}), []);
});

test('popup shortcut normalization bounds accelerator text', () => {
    assert.equal(normalizePopupShortcuts({volume: 'x'.repeat(120)}).volume.length, 80);
});


test('popup shortcut normalization removes invisible controls from imported configuration', () => {
    assert.equal(normalizePopupShortcuts({
        volume: '<Super>\u202E<Alt>\\nV',
        network: '<Super>\u200B<Alt>C',
    }).volume, '<Super><Alt>V');
    assert.equal(normalizePopupShortcuts({
        network: '<Super>\u200B<Alt>C',
    }).network, '<Super><Alt>C');
});
