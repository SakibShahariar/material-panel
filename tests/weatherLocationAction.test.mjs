import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';

const weather = await readFile(new URL('../modules/weather.js', import.meta.url), 'utf8');

test('Weather popup exposes a Change location action that opens extension preferences', () => {
    assert.ok(weather.includes("new PopupMenu.PopupMenuItem('Change location…')"));
    assert.ok(weather.includes("Main.extensionManager.openExtensionPrefs('material-panel@SakibShahariar', '', {})"));
    assert.ok(weather.includes("changeLocationItem.connect('activate'"));
    assert.ok(weather.includes('menu.close();'));
});

test('Weather popup displays the active forecast source and keeps IP geolocation disabled', () => {
    assert.ok(weather.includes("sourceLbl.text = [d.source, ageLabel].filter(Boolean).join(' · ')"));
    assert.ok(weather.includes('IP geolocation is intentionally not used'));
    assert.ok(!weather.includes('ipapi.co'));
    assert.ok(!weather.includes('ipinfo.io'));
});

test('Weather popup offers saved locations and protects against stale fetch results after switching', () => {
    assert.ok(weather.includes('getWeatherLocations()'));
    assert.ok(weather.includes('new PopupMenu.PopupMenuItem(location.name)'));
    assert.ok(weather.includes('setWeatherLocationIndex(index)'));
    assert.ok(weather.includes('requestGeneration++'));
    assert.ok(weather.includes('generation !== requestGeneration'));
    assert.ok(weather.includes('pendingFetch && !destroyed'));
});

test('Weather failures identify the selected saved city instead of hiding which location failed', () => {
    assert.ok(weather.includes('Weather data for ${requestedPlace} is unavailable'));
    assert.ok(weather.includes('place: requestedPlace || \'Location unavailable\''));
});
