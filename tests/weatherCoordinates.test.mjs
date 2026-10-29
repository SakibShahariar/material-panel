import assert from 'node:assert/strict';
import test from 'node:test';
import {radiansToDegreesLatLon} from '../lib/weatherCoordinates.js';

test('converts GNOME Weather radians to degrees even near zero', () => {
    assert.deepEqual(radiansToDegreesLatLon(2.5 * Math.PI / 180, 3 * Math.PI / 180), {
        lat: 2.5, lon: 3,
    });
});

test('converts typical GNOME Weather coordinates from radians', () => {
    const result = radiansToDegreesLatLon(0.4163, 1.577);
    assert.ok(Math.abs(result.lat - 23.85) < 0.02);
    assert.ok(Math.abs(result.lon - 90.36) < 0.02);
});

test('rejects non-finite and out-of-range converted coordinates', () => {
    for (const pair of [[NaN, 0], [0, Infinity], [Math.PI, 0], [0, 2 * Math.PI]])
        assert.equal(radiansToDegreesLatLon(...pair), null);
});
