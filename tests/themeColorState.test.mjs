import assert from 'node:assert/strict';
import test from 'node:test';

import {
    setThemeColors, getThemeColor, clearThemeColors, resolveThemeColors,
} from '../lib/themeColorState.js';

test('theme color state preserves caller fallbacks and resets without global properties', () => {
    clearThemeColors();
    assert.equal(getThemeColor('primary', '#fallback'), '#fallback');
    setThemeColors({primary: '#79c0a0'});
    assert.equal(getThemeColor('primary', '#fallback'), '#79c0a0');
    clearThemeColors();
    assert.equal(getThemeColor('primary', '#fallback'), '#fallback');
    assert.equal(Object.hasOwn(globalThis, '_materialPanelPrimary'), false);
});

test('palette resolver preserves Matugen roles and computes translucent surfaces', () => {
    assert.deepEqual(resolveThemeColors({
        surface_container: '#202020',
        surface_container_rgb: '32 32 32',
        surface_container_high_rgb: '48 48 48',
        on_surface: '#f0f0f0',
        on_surface_rgb: '240 240 240',
        primary: '#79c0a0',
        on_primary: '#102018',
        secondary: '#a0b090',
        tertiary: '#d0a0b0',
    }), {
        barColor: '#202020',
        primary: '#79c0a0',
        onPrimary: '#102018',
        onSurface: '#f0f0f0',
        surface: '#202020',
        hoverBg: 'rgba(240, 240, 240, 0.14)',
        hoverBgStrong: 'rgba(240, 240, 240, 0.22)',
        qsSurface: 'rgba(48, 48, 48, 0.55)',
        secondary: '#a0b090',
        tertiary: '#d0a0b0',
    });
});

test('palette resolver retains neutral fallbacks when Matugen RGB roles are absent', () => {
    const result = resolveThemeColors({});
    assert.equal(result.barColor, 'transparent');
    assert.equal(result.hoverBg, 'rgba(205, 214, 244, 0.14)');
    assert.equal(result.qsSurface, 'rgba(49, 50, 68, 0.55)');
    assert.equal(result.secondary, undefined);
});
