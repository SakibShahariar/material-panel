import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';

import {normalizePanelSize, normalizeZoneScale} from '../lib/configNormalization.js';

const defaults = {
    scale: 1,
    gapTop: 5,
    gapBottom: 4,
    gapSide: 0,
    chipGap: 4,
    popupOpacity: 0.92,
};

test('migrates legacy gap into top and bottom gaps', () => {
    assert.deepEqual(
        normalizePanelSize({gap: 8}, defaults),
        {...defaults, gapTop: 8, gapBottom: 7},
    );
});

test('legacy gap migration fills only missing dimensions', () => {
    assert.deepEqual(
        normalizePanelSize({gap: 8, gapTop: 3}, defaults),
        {...defaults, gapTop: 3, gapBottom: 7},
    );
    assert.deepEqual(
        normalizePanelSize({gap: 8, gapBottom: 2}, defaults),
        {...defaults, gapTop: 8, gapBottom: 2},
    );
});

test('preserves explicit zero values and clamps out-of-range settings', () => {
    assert.deepEqual(
        normalizePanelSize({
            scale: 0,
            gapTop: 0,
            gapBottom: 20,
            gapSide: -4,
            chipGap: 0,
            popupOpacity: 0,
        }, defaults),
        {
            scale: 0.7,
            gapTop: 0,
            gapBottom: 14,
            gapSide: 0,
            chipGap: 0,
            popupOpacity: 0.5,
        },
    );
});

test('uses defaults for invalid numeric values', () => {
    assert.deepEqual(
        normalizePanelSize({
            scale: 'invalid',
            gapTop: 'invalid',
            gapBottom: 'invalid',
            gapSide: 'invalid',
            chipGap: 'invalid',
            popupOpacity: 'invalid',
        }, defaults),
        defaults,
    );
});

test('legacy Activity chip modes migrate to equivalent metric selections', async () => {
    const source = await readFile(new URL('../lib/configStore.js', import.meta.url), 'utf8');
    assert.match(source, /merged\.activityChip === 'ram'[\s\S]*?\['memory'\]/);
    assert.match(source, /merged\.activityChip === 'cpu-ram'[\s\S]*?\['cpu', 'memory'\]/);
    assert.match(source, /: \['cpu', 'temperature'\]/);
});

test('Control Center Home card visibility defaults on and normalizes independently', async () => {
    const source = await readFile(new URL('../lib/configStore.js', import.meta.url), 'utf8');
    assert.match(source, /controlCenterHomeCards: \{weather: true, calendar: true\}/);
    assert.match(source, /weather: homeCards\?\.weather !== false/);
    assert.match(source, /calendar: homeCards\?\.calendar !== false/);
});

test('status indicator preferences default to active-only and normalize independently', async () => {
    const source = await readFile(new URL('../lib/configStore.js', import.meta.url), 'utf8');
    assert.match(source, /statusIndicatorPreferences:/);
    assert.match(source, /normalizeStatusIndicatorPreferences\(merged\.statusIndicatorPreferences\)/);
});

test('normalizes multiple saved weather locations without disturbing the legacy location setting', async () => {
    const source = await readFile(new URL('../lib/configStore.js', import.meta.url), 'utf8');
    assert.match(source, /weatherLocations: \[\]/);
    assert.match(source, /normalizeWeatherLocations\(merged\.weatherLocations\)/);
    assert.match(source, /out\.weatherLocations = normalizeWeatherLocations\(out\.weatherLocations\)/);
});

test('popup shortcut configuration defaults empty and normalizes only supported targets', async () => {
    const source = await readFile(new URL('../lib/configStore.js', import.meta.url), 'utf8');
    assert.match(source, /popupShortcuts: \{\}/);
    assert.match(source, /normalizePopupShortcuts\(merged\.popupShortcuts\)/);
    assert.match(source, /out\.popupShortcuts = normalizePopupShortcuts\(out\.popupShortcuts\)/);
});

test('normalizes per-zone scale independently and clamps invalid values', () => {
    assert.deepEqual(normalizeZoneScale({
        left: 0.7,
        center: '1.15',
        right: 1.8,
    }), {left: 0.8, center: 1.15, right: 1.2});
    assert.deepEqual(normalizeZoneScale({
        left: 'invalid',
        center: null,
    }), {left: 1, center: 1, right: 1});
});


test('context visibility rules default off and discard unknown or malformed modules', async () => {
    const source = await readFile(new URL('../lib/configStore.js', import.meta.url), 'utf8');
    assert.match(source, /moduleVisibilityRules: \{\}/);
    assert.match(source, /normalizeModuleVisibilityRules\(merged\.moduleVisibilityRules\)/);
    const {normalizeModuleVisibilityRules} = await import('../lib/moduleVisibility.js');
    assert.deepEqual(normalizeModuleVisibilityRules({
        clock: {hideWhenFullscreen: true},
        unknown: {hideInOverview: true},
        volume: null,
    }), {clock: {hideWhenFullscreen: true, hideInOverview: false, hideWhenDnd: false, hideWhenOffline: false}});
    assert.deepEqual(normalizeModuleVisibilityRules({
        network: {hideWhenOffline: true},
    }), {network: {hideWhenFullscreen: false, hideInOverview: false, hideWhenDnd: false, hideWhenOffline: true}});
});

test('world clocks default empty and normalize on load and save', async () => {
    const source = await readFile(new URL('../lib/configStore.js', import.meta.url), 'utf8');
    assert.match(source, /worldClocks: \[\]/);
    assert.match(source, /normalizeWorldClockEntries\(merged\.worldClocks\)/);
    assert.match(source, /out\.worldClocks = normalizeWorldClockEntries\(out\.worldClocks\)/);
});
