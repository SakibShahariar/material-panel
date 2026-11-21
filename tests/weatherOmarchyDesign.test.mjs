import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';

const [weather, stylesheet, renderer] = await Promise.all([
    readFile(new URL('../modules/weather.js', import.meta.url), 'utf8'),
    readFile(new URL('../stylesheet.css', import.meta.url), 'utf8'),
    readFile(new URL('../lib/themeRenderer.js', import.meta.url), 'utf8'),
]);

test('weather hero uses oversized icon and temperature', () => {
    assert.match(weather, /icon_size: 64,/);
    assert.match(weather, /font-size: 52px; font-weight: 700;/);
    assert.match(stylesheet, /material-panel-weather-popup-temp \{[\s\S]*?font-size: 52px/);
});

test('stats use uppercase small-caps labels and include feels-like', () => {
    assert.match(weather, /text: String\(title\)\.toUpperCase\(\)/);
    assert.match(weather, /font-size: 9px; font-weight: 700; opacity: 0\.55; letter-spacing: 1px;/);
    assert.match(weather, /const feelsStat = mkStat\('Feels like'\)/);
    assert.match(weather, /feelsStat\.value\.text = d\.feelsLike != null/);
    assert.doesNotMatch(weather, /const feelsLbl = /);
});

test('daily forecast row uses icon, uppercase day and bright high / dim low', () => {
    assert.match(weather, /row\.add_child\(iconActor\);\s*row\.add_child\(name\);/);
    assert.match(weather, /actors\.name\.text = String\(day\.label \|\| day\.date \|\| ''\)\.toUpperCase\(\)/);
    assert.match(weather, /font-size: 12px; opacity: 0\.5; width: 34px;/);
});

test('weather popup has a divider and a clickable location label', () => {
    assert.match(weather, /material-panel-weather-popup-divider/);
    assert.match(weather, /placeLbl\.reactive = true/);
    assert.match(weather, /placeLbl\.connect\('button-release-event'/);
    assert.match(renderer, /material-panel-weather-popup-divider/);
    assert.match(stylesheet, /material-panel-weather-popup-divider/);
});
