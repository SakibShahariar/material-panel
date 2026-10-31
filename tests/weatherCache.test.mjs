import assert from 'node:assert/strict';
import test from 'node:test';
import {clearWeatherCache, getWeatherCache, setWeatherCache} from '../lib/weatherCache.js';

test('weather cache restores a fresh forecast for the same location and units', () => {
    clearWeatherCache();
    const data = {place: 'Example', temp: 21};
    setWeatherCache('manual|1|2|metric', data, 1000);
    assert.deepEqual(getWeatherCache('manual|1|2|metric', 2000), {data, savedAt: 1000});
    assert.equal(getWeatherCache('manual|1|2|imperial', 2000), null);
});

test('weather cache expires old entries and rejects time moving backwards', () => {
    clearWeatherCache();
    setWeatherCache('place', {temp: 20}, 1000);
    assert.equal(getWeatherCache('place', 1000 + 60 * 60 * 1_000_000 + 1), null);
    setWeatherCache('place', {temp: 20}, 2000);
    assert.equal(getWeatherCache('place', 1999), null);
});

test('weather cache remains bounded and evicts least recently used entries', () => {
    clearWeatherCache();
    for (let i = 0; i < 9; i++)
        setWeatherCache(String(i), {temp: i}, 1000 + i);
    assert.equal(getWeatherCache('0', 2000), null);
    assert.equal(getWeatherCache('8', 2000).data.temp, 8);
    assert.equal(getWeatherCache('1', 2000).data.temp, 1);
});
