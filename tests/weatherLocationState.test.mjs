import assert from 'node:assert/strict';
import test from 'node:test';
import {
    clearWeatherLocation,
    getWeatherLocation,
    setWeatherLocation,
    setWeatherLocations,
    getWeatherLocations,
    getWeatherLocationIndex,
    setWeatherLocationIndex,
    clearWeatherLocations,
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

test('saved locations keep an active selection until the configured list changes', () => {
    setWeatherLocations([
        {name: 'Dhaka', latitude: 23.8, longitude: 90.4},
        {name: 'London', latitude: 51.5, longitude: -0.1},
    ]);
    assert.equal(getWeatherLocationIndex(), 0);
    assert.equal(setWeatherLocationIndex(1), true);
    assert.equal(getWeatherLocationIndex(), 1);
    setWeatherLocations([
        {name: 'Dhaka', latitude: 23.8, longitude: 90.4},
        {name: 'London', latitude: 51.5, longitude: -0.1},
    ]);
    assert.equal(getWeatherLocationIndex(), 1);
    assert.equal(getWeatherLocations().length, 2);
    setWeatherLocations([{name: 'Tokyo', latitude: 35.6, longitude: 139.7}]);
    assert.equal(getWeatherLocationIndex(), 0);
    assert.equal(setWeatherLocationIndex(4), false);
    clearWeatherLocations();
    assert.deepEqual(getWeatherLocations(), []);
});
