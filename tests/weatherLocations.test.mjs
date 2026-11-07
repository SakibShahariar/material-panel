import assert from 'node:assert/strict';
import test from 'node:test';
import {
    formatWeatherLocations,
    normalizeWeatherLocations,
    parseWeatherLocations,
} from '../lib/weatherLocations.js';

test('normalizes valid weather locations, removes coordinate duplicates and caps the list', () => {
    const values = [
        {name: 'Dhaka', latitude: '23.8103', longitude: '90.4125'},
        {name: 'Duplicate', latitude: 23.8103, longitude: 90.4125},
        ...Array.from({length: 10}, (_, index) => ({
            name: `Place ${index}`, latitude: index, longitude: index + 1,
        })),
    ];
    const locations = normalizeWeatherLocations(values);
    assert.equal(locations.length, 8);
    assert.equal(locations[0].name, 'Dhaka');
    assert.equal(locations[0].latitude, 23.8103);
});

test('rejects invalid coordinates and malformed saved-location lists', () => {
    assert.deepEqual(normalizeWeatherLocations([
        {name: 'Bad latitude', latitude: 91, longitude: 0},
        {name: 'Missing', latitude: 20},
        null,
    ]), []);
    assert.equal(parseWeatherLocations('Dhaka|23.8|90.4'), null);
    assert.equal(parseWeatherLocations('Dhaka|23.8|90.4; Invalid|91|0'), null);
    assert.equal(parseWeatherLocations('Dhaka|23.8|90.4; Dhaka copy|23.8|90.4'), null);
});

test('parses and formats two or more named locations', () => {
    const input = 'Dhaka|23.8103|90.4125; London|51.5072|-0.1276';
    const parsed = parseWeatherLocations(input);
    assert.deepEqual(parsed, [
        {name: 'Dhaka', latitude: 23.8103, longitude: 90.4125},
        {name: 'London', latitude: 51.5072, longitude: -0.1276},
    ]);
    assert.equal(formatWeatherLocations(parsed), input);
    assert.deepEqual(parseWeatherLocations(''), []);
});

test('sanitizes control and bidirectional formatting characters in location labels', () => {
    const locations = normalizeWeatherLocations([
        {name: '  Dhaka\\n\\tCentral  ', latitude: 23.8, longitude: 90.4},
        {name: 'London\\u202Etxt', latitude: 51.5, longitude: -0.1},
        {name: '\\u0000\\u200F', latitude: 1, longitude: 2},
    ]);
    assert.equal(locations[0].name, 'Dhaka Central');
    assert.equal(locations[1].name, 'London txt');
    assert.equal(locations[2].name, '1.00, 2.00');
});

test('sanitizes imported location labels before persistence formatting', () => {
    const parsed = parseWeatherLocations(
        'Dhaka\\nNorth|23.8|90.4; London\\u202Ewest|51.5|-0.1');
    assert.deepEqual(parsed.map(location => location.name), ['Dhaka North', 'London west']);
    assert.equal(formatWeatherLocations(parsed),
        'Dhaka North|23.8|90.4; London west|51.5|-0.1');
});
