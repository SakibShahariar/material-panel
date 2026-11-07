import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';

const source = await readFile(new URL('../lib/theme.js', import.meta.url), 'utf8');
const [palette, renderer, stylesheet] = await Promise.all([
    readFile(new URL('../lib/themePalette.js', import.meta.url), 'utf8'),
    readFile(new URL('../lib/themeRenderer.js', import.meta.url), 'utf8'),
    readFile(new URL('../stylesheet.css', import.meta.url), 'utf8'),
]);

test('theme fallback reads foreground, popup surface and accent colors from GNOME Shell theme nodes', () => {
    assert.ok(source.includes('function getThemeFallbackPalette()'));
    assert.ok(source.includes('colors resolved from the active GNOME Shell theme as the fallback'));
    assert.ok(!source.includes('same fixed values as fallback defaults'));
    assert.ok(source.includes('node.get_foreground_color()'));
    assert.ok(source.includes('node.get_background_color()'));
    assert.ok(source.includes('node.lookup_color(name, true)'));
});

test('partial Matugen hex roles get matching RGB values instead of mixed theme colors', () => {
    assert.ok(palette.includes('function cssColorRgb(value)'));
    assert.ok(source.includes("if (inputVars[role] && !inputVars[role + '_rgb'])"));
    assert.ok(source.includes('if (inputVars.primary && !inputVars.on_primary)'));
});

test('missing or transparent theme colors use neutral translucent fallbacks, not a hard-coded dark palette', () => {
    assert.ok(source.includes('__neutralSurface: neutralSurface'));
    assert.ok(renderer.includes('neutralSurface ? 0.12 : 0.88'));
    assert.ok(renderer.includes('rgba(128, 128, 128, 0.12)'));
    assert.ok(renderer.includes("const textColor = hex('on_surface', 'currentColor')"));
    assert.ok(stylesheet.includes('rgba(128, 128, 128,'));
    assert.ok(!stylesheet.includes('rgba(255, 255, 255,'));
});
