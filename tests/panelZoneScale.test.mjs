import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {renderDimensionsCss} from '../lib/themeRenderer.js';
import {normalizeZoneScale} from '../lib/configNormalization.js';

test('zone scale normalization preserves independent values within safe bounds', () => {
    assert.deepEqual(normalizeZoneScale({left: 0.8, center: '1.05', right: 1.2}), {
        left: 0.8, center: 1.05, right: 1.2,
    });
    assert.deepEqual(normalizeZoneScale({left: 0.1, center: 'invalid'}), {
        left: 0.8, center: 1, right: 1,
    });
});

test('dimension CSS scales each zone and keeps the bar sized to the tallest zone', () => {
    const css = renderDimensionsCss({
        scale: 1,
        zoneScale: {left: 0.8, center: 1, right: 1.2},
    });
    assert.match(css, /\.material-panel-zone-left \{\s*min-height: 21px/);
    assert.match(css, /\.material-panel-zone-center \{\s*min-height: 26px/);
    assert.match(css, /\.material-panel-zone-right \{\s*min-height: 31px/);
    assert.match(css, /\.material-panel-bar \{\s*height: 52px/);
});

test('both layouts pass the same zone scale to module factories and CSS', async () => {
    const [builder, extension, prefs, config] = await Promise.all([
        readFile(new URL('../lib/panelBuilder.js', import.meta.url), 'utf8'),
        readFile(new URL('../extension.js', import.meta.url), 'utf8'),
        readFile(new URL('../prefs.js', import.meta.url), 'utf8'),
        readFile(new URL('../lib/configStore.js', import.meta.url), 'utf8'),
    ]);
    assert.match(builder, /_renderDefault\(preset, scale, hiddenModules, zoneScale\)/);
    assert.match(builder, /_renderEnd4\(preset, scale, hiddenModules, zoneScale\)/);
    assert.match(builder, /scale \* zoneScale\[zoneName\]/);
    assert.match(builder, /scale \* zoneScale\.left/);
    assert.match(builder, /scale \* zoneScale\.center/);
    assert.match(builder, /scale \* zoneScale\.right/);
    assert.match(extension, /zoneScale: this\._config\.zoneScale/);
    assert.match(prefs, /Per-zone density/);
    assert.match(prefs, /makeZoneScaleRow\('left'/);
    assert.match(prefs, /makeZoneScaleRow\('center'/);
    assert.match(prefs, /makeZoneScaleRow\('right'/);
    assert.match(config, /zoneScale: \{left: 1, center: 1, right: 1\}/);
});
