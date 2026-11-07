import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';

const weather = await readFile(new URL('../modules/weather.js', import.meta.url), 'utf8');

test('Weather periodic refresh skips work while both chip and popup are hidden', () => {
    assert.ok(weather.includes('if (destroyed || (!button.mapped && !menu.isOpen))'));
    assert.ok(weather.includes('try { refreshIfStale(); } catch (e) {}'));
    assert.ok(weather.includes("jitterMode: 'positive'"));
});

test('Weather refresh resumes when the chip is mapped or popup opens', () => {
    assert.ok(weather.includes("button.connect('notify::mapped', refreshIfStale)"));
    assert.ok(weather.includes("menu.connect('open-state-changed', (_menu, open) =>"));
    assert.ok(weather.includes('if (!destroyed && (button.mapped || menu.isOpen))'));
});

test('Weather queues a location refresh without overlapping requests and cancels on destroy', () => {
    assert.ok(weather.includes('if (destroyed)'));
    assert.ok(weather.includes('if (fetchInFlight)'));
    assert.ok(weather.includes('pendingFetch = true'));
    assert.ok(weather.includes('pendingFetch && !destroyed'));
    assert.ok(weather.includes('cancellable.cancel()'));
});


test('weather restores a location-and-units keyed forecast cache before requesting fresh data', async () => {
    const source = await readFile(new URL('../modules/weather.js', import.meta.url), 'utf8');
    assert.match(source, /getWeatherCache\(cacheKey, GLib\.get_monotonic_time\(\)\)/);
    assert.match(source, /setWeatherCache\(cacheKey, data, GLib\.get_monotonic_time\(\)\)/);
    assert.match(source, /JSON\.stringify\(\['manual', lat, lon, place, 'metric'\]\)/);
    assert.match(source, /JSON\.stringify\(\['gnome', gw\.lat, gw\.lon, place, 'metric'\]\)/);
    assert.match(source, /applyCurrent\(cached\.data, cached\.savedAt\)/);
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

test('Weather refresh cadence uses positive jitter without shortening the provider minimum', () => {
    assert.match(weather, /baseIntervalMs: 15 \* 60 \* 1000/);
    assert.match(weather, /jitterMode: 'positive'/);
    assert.match(weather, /scheduleWeatherRefresh\(\)/);
    assert.match(weather, /GLib\.timeout_add\(GLib\.PRIORITY_DEFAULT, delayMs/);
    assert.match(weather, /if \(refreshId\) \{[\s\S]*?GLib\.source_remove\(refreshId\)/);
});
