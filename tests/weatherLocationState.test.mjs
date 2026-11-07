import assert from 'node:assert/strict';
import test from 'node:test';
import {
    clearWeatherLocation,
    getWeatherLocation,
    setWeatherLocation,
} from '../lib/weatherLocationState.js';

test('weather location is shared and invalid values fall back to an empty configuration', () => {
    const configured = {mode: 'manual', latitude: '23.8', longitude: '90.4'};
    setWeatherLocation(configured);
    assert.equal(getWeatherLocation(), configured);
    setWeatherLocation(null);
    assert.deepEqual(getWeatherLocation(), {});
    setWeatherLocation(['invalid']);
    assert.deepEqual(getWeatherLocation(), {});
});

test('weather location resets on extension teardown', () => {
    setWeatherLocation({mode: 'disabled'});
    clearWeatherLocation();
    assert.deepEqual(getWeatherLocation(), {});
});
