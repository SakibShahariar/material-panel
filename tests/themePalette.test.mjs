import assert from 'node:assert/strict';
import test from 'node:test';
import {parseMatugenCssContents, themeColorInfo, cssColorRgb, contrastColor} from '../lib/themePalette.js';

test('Matugen CSS parser extracts trimmed custom-property values and resets between reads', () => {
    const first = parseMatugenCssContents(new TextEncoder().encode(':root { --primary: #79c0a0; --on_surface: #f0f0f0; }'));
    const second = parseMatugenCssContents(new TextEncoder().encode('--surface: #202020;'));
    assert.deepEqual(first, {primary: '#79c0a0', on_surface: '#f0f0f0'});
    assert.deepEqual(second, {surface: '#202020'});
});

test('GNOME theme colors are normalized with alpha and RGB components', () => {
    assert.deepEqual(themeColorInfo({to_string: () => '#79c0a080'}), {
        hex: '#79c0a0', rgb: '121 192 160', alpha: 128 / 255, r: 121, g: 192, b: 160,
    });
    assert.equal(themeColorInfo({to_string: () => 'transparent'}), null);
});

test('CSS hex and rgb colors are converted to space-separated channels', () => {
    assert.equal(cssColorRgb('#79c0a0'), '121 192 160');
    assert.equal(cssColorRgb('rgba(12, 34, 56, 0.5)'), '12 34 56');
    assert.equal(cssColorRgb('invalid'), null);
});

test('contrast helper selects readable foregrounds for light and dark accents', () => {
    assert.equal(contrastColor({r: 255, g: 255, b: 255}), '#202020');
    assert.equal(contrastColor({r: 0, g: 0, b: 0}), '#f5f5f5');
});
