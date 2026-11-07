import assert from 'node:assert/strict';
import test from 'node:test';
import {
    clearWeatherSummary,
    getWeatherSummary,
    setWeatherSummary,
    watchWeatherSummary,
} from '../lib/weatherSummaryState.js';

test('weather summary publishes a compact snapshot to subscribers', () => {
    clearWeatherSummary();
    const seen = [];
    const stop = watchWeatherSummary(value => seen.push(value));
    setWeatherSummary({
        temp: 23.6,
        condition: 'Partly cloudy',
        place: 'Dhaka',
        source: 'Open-Meteo · GNOME Weather',
        savedAt: 1234,
        stale: false,
        hourly: [{temp: 99}],
    });
    assert.equal(seen.length, 2);
    assert.equal(seen[0], null);
    assert.deepEqual(getWeatherSummary(), {
        temp: 23.6,
        condition: 'Partly cloudy',
        place: 'Dhaka',
        source: 'Open-Meteo · GNOME Weather',
        savedAt: 1234,
        stale: false,
    });
    stop();
    setWeatherSummary({temp: 25});
    assert.equal(seen.length, 2);
});

test('weather summary represents unavailable and cleared states without stale values', () => {
    setWeatherSummary({temp: null, condition: 'No location configured', source: 'Error'});
    assert.equal(getWeatherSummary().temp, null);
    assert.equal(getWeatherSummary().condition, 'No location configured');
    clearWeatherSummary();
    assert.equal(getWeatherSummary(), null);
});
