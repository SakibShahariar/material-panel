import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';

import {
    DEFAULT_STATUS_INDICATOR_PREFERENCES,
    normalizeStatusIndicatorPreferences,
} from '../lib/statusIndicatorState.js';

test('status indicators default to enabled and active-only', () => {
    assert.deepEqual(normalizeStatusIndicatorPreferences(null), DEFAULT_STATUS_INDICATOR_PREFERENCES);
});

test('status indicator preferences normalize each supported state independently', () => {
    assert.deepEqual(normalizeStatusIndicatorPreferences({
        dnd: {enabled: false, showInactive: true, unknown: true},
        nightlight: {enabled: true, showInactive: false},
        microphone: {enabled: true, showInactive: true},
    }), {
        dnd: {enabled: false, showInactive: true},
        nightlight: {enabled: true, showInactive: false},
    });
});

test('invalid status indicator preferences safely fall back to conservative defaults', () => {
    assert.deepEqual(normalizeStatusIndicatorPreferences({
        dnd: 'enabled',
        nightlight: {enabled: 0, showInactive: 'yes'},
    }), {
        dnd: {enabled: true, showInactive: false},
        nightlight: {enabled: true, showInactive: false},
    });
});

test('aggregate status module is informational and subscribes to settings changes without polling', async () => {
    const source = await readFile(new URL('../modules/statusIndicators.js', import.meta.url), 'utf8');
    assert.match(source, /org\.gnome\.desktop\.notifications/);
    assert.match(source, /org\.gnome\.settings-daemon\.plugins\.color/);
    assert.match(source, /changed::\$\{entry\.key\}/);
    assert.match(source, /entry\.settings\.disconnect\(entry\.handlerId\)/);
    assert.doesNotMatch(source, /timeout_add|setTimeout|set_boolean/);
    assert.match(source, /No visible system status indicators/);
});
