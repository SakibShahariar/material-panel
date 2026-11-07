import assert from 'node:assert/strict';
import test from 'node:test';

import {renderThemeCss, renderDimensionsCss} from '../lib/themeRenderer.js';
import {renderDimensionsCss as renderDimensionsCssDirect} from '../lib/themeDimensionsRenderer.js';

test('theme renderer resolves supplied Matugen palette roles into concrete stylesheet colors', () => {
    const css = renderThemeCss({
        surface_container_rgb: '20 30 40',
        surface_container_high_rgb: '30 40 50',
        on_surface: '#f0f0f0',
        on_surface_variant: '#c0c0c0',
        on_surface_rgb: '240 240 240',
        primary: '#79c0a0',
        on_primary: '#102018',
        error: '#d06060',
        outline_rgb: '120 130 140',
    }, {popupOpacity: 0.9});
    assert.match(css, /rgba\(20, 30, 40, 0\.88\)/);
    assert.match(css, /#79c0a0/);
    assert.match(css, /#f0f0f0/);
});

test('theme renderer remains usable with an empty neutral fallback palette', () => {
    const css = renderThemeCss({__neutralSurface: true});
    assert.match(css, /rgba\(128, 128, 128, 0\.12\)/);
    assert.match(css, /currentColor/);
});

test('dimension renderer preserves default and End-4 geometry contracts', () => {
    const standard = renderDimensionsCss();
    const end4 = renderDimensionsCss({layoutStyle: 'end4', scale: 1.2});
    assert.match(standard, /\.material-panel-bar/);
    assert.match(end4, /\.material-panel-layout-end4/);
    assert.match(end4, /min-height:/);
    assert.equal(renderDimensionsCssDirect(), standard);
});

test('dimension renderer keeps legacy gap migration behavior', () => {
    const css = renderDimensionsCss({gap: 8, gapTop: null, gapBottom: null});
    assert.match(css, /gapTop=8 gapBottom=7/);
    assert.match(css, /margin: 8px 3px 7px 3px/);
});


test('generated theme emits the shared caption, body, and title typography sizes', () => {
    const css = renderThemeCss({});
    const assertRoleSize = (selector, size) => {
        const start = css.indexOf(selector);
        assert.notEqual(start, -1, `generated CSS includes ${selector}`);
        const end = css.indexOf('}', start);
        assert.notEqual(end, -1, `generated CSS closes ${selector} rule`);
        assert.ok(css.slice(start, end).includes(`font-size: ${size}px;`),
            `${selector} uses ${size}px`);
    };
    assertRoleSize('.material-panel-type-caption,', 10.5);
    assertRoleSize('.material-panel-type-body,', 12);
    assertRoleSize('.material-panel-type-title,', 14);
});


test('dimension renderer normalizes malformed numeric inputs without emitting invalid CSS', () => {
    const css = renderDimensionsCss({
        scale: Symbol('scale'),
        gapTop: Symbol('top gap'),
        gapBottom: NaN,
        chipGap: Symbol('chip gap'),
        zoneScale: {
            left: Symbol('left scale'),
            center: Infinity,
            right: 1.1,
        },
    });
    assert.doesNotMatch(css, /NaN|Infinity/);
    assert.match(css, /height: 40px;/);
    assert.match(css, /margin: 5px 3px 4px 3px/);

    const legacy = renderDimensionsCss({
        gap: Symbol('legacy gap'),
        gapTop: null,
        gapBottom: null,
    });
    assert.doesNotMatch(legacy, /NaN|Infinity/);
    assert.match(legacy, /gapTop=5 gapBottom=4/);
});
