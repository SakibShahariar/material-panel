import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';

const weather = await readFile(new URL('../modules/weather.js', import.meta.url), 'utf8');

test('Weather periodic refresh skips work while both chip and popup are hidden', () => {
    assert.ok(weather.includes('if (destroyed || (!button.mapped && !menu.isOpen))'));
    assert.ok(weather.includes('try { refreshIfStale(); } catch (e) {}'));
});

test('Weather refresh resumes when the chip is mapped or popup opens', () => {
    assert.ok(weather.includes("button.connect('notify::mapped', refreshIfStale)"));
    assert.ok(weather.includes("menu.connect('open-state-changed', (_menu, open) =>"));
    assert.ok(weather.includes('if (!destroyed && (button.mapped || menu.isOpen))'));
});

test('Weather still avoids overlapping refreshes and cancels requests on destroy', () => {
    assert.ok(weather.includes('if (destroyed || fetchInFlight)'));
    assert.ok(weather.includes('cancellable.cancel()'));
});


test('weather restores a location-and-units keyed forecast cache before requesting fresh data', async () => {
    const source = await readFile(new URL('../modules/weather.js', import.meta.url), 'utf8');
    assert.match(source, /getWeatherCache\(cacheKey, GLib\.get_monotonic_time\(\)\)/);
    assert.match(source, /setWeatherCache\(cacheKey, data, GLib\.get_monotonic_time\(\)\)/);
    assert.match(source, /JSON\.stringify\(\['manual', lat, lon, place, 'metric'\]\)/);
    assert.match(source, /JSON\.stringify\(\['gnome', gw\.lat, gw\.lon, place, 'metric'\]\)/);
    assert.match(source, /apply\(cached\.data, cached\.savedAt\)/);
});


test('weather forecast popup reuses hourly and daily rows by stable keys', async () => {
    const source = await readFile(new URL('../modules/weather.js', import.meta.url), 'utf8');
    assert.match(source, /const hourlyCells = new Map\(\)/);
    assert.match(source, /const dailyRows = new Map\(\)/);
    assert.match(source, /reconcileWeatherRows\(\s*hourlyRow, hourlyCells/);
    assert.match(source, /reconcileWeatherRows\(\s*dailyCol, dailyRows/);
    assert.doesNotMatch(source, /hourlyRow\.destroy_all_children\(\)/);
    assert.doesNotMatch(source, /dailyCol\.destroy_all_children\(\)/);
});
