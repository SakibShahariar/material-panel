import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';

const page = await readFile(new URL('../prefs/weatherLocationsPage.js', import.meta.url), 'utf8');
const prefs = await readFile(new URL('../prefs.js', import.meta.url), 'utf8');

test('Weather location preferences are isolated in a focused page builder', () => {
    assert.match(page, /export function buildWeatherLocationsPage/);
    assert.match(page, /Location source/);
    assert.match(page, /Manual coordinates/);
    assert.match(page, /lat < -90 \|\| lat > 90 \|\| lon < -180 \|\| lon > 180/);
    assert.match(page, /parseWeatherLocations\(savedWeatherLocationsRow\.get_text\(\)\)/);
    assert.match(page, /2–8 distinct locations/);
    assert.match(page, /No IP-based geolocation requests are made/);
});

test('Weather location preferences remain composed by the General page', () => {
    assert.match(prefs, /buildWeatherLocationsPage\(\{/);
    assert.match(prefs, /isSyncingExternal: \(\) => syncingExternal/);
});
