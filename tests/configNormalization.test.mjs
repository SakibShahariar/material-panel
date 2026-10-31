import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';

import {normalizePanelSize} from '../lib/configNormalization.js';

const defaults = {
    scale: 1,
    gapTop: 5,
    gapBottom: 4,
    gapSide: 0,
    chipGap: 4,
    popupOpacity: 0.92,
};

test('migrates legacy gap into top and bottom gaps', () => {
    assert.deepEqual(
        normalizePanelSize({gap: 8}, defaults),
        {...defaults, gapTop: 8, gapBottom: 7},
    );
});

test('preserves explicit zero values and clamps out-of-range settings', () => {
    assert.deepEqual(
        normalizePanelSize({
            scale: 0,
            gapTop: 0,
            gapBottom: 20,
            gapSide: -4,
            chipGap: 0,
            popupOpacity: 0,
        }, defaults),
        {
            scale: 0.7,
            gapTop: 0,
            gapBottom: 14,
            gapSide: 0,
            chipGap: 0,
            popupOpacity: 0.5,
        },
    );
});

test('uses defaults for invalid numeric values', () => {
    assert.deepEqual(
        normalizePanelSize({
            scale: 'invalid',
            gapTop: 'invalid',
            gapBottom: 'invalid',
            gapSide: 'invalid',
            chipGap: 'invalid',
            popupOpacity: 'invalid',
        }, defaults),
        defaults,
    );
});

test('legacy Activity chip modes migrate to equivalent metric selections', async () => {
    const source = await readFile(new URL('../lib/configStore.js', import.meta.url), 'utf8');
    assert.match(source, /merged\.activityChip === 'ram'[\s\S]*?\['memory'\]/);
    assert.match(source, /merged\.activityChip === 'cpu-ram'[\s\S]*?\['cpu', 'memory'\]/);
    assert.match(source, /: \['cpu', 'temperature'\]/);
});
