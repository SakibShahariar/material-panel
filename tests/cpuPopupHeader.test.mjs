import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';

test('Activity dashboard hero carries the headline usage, temperature and trend bar', async () => {
    const source = await readFile(new URL('../lib/activityPopup.js', import.meta.url), 'utf8');
    assert.match(source, /material-panel-activity-hero-value/);
    assert.match(source, /material-panel-activity-eyebrow/);
    assert.match(source, /material-panel-activity-hero-bar/);
    assert.match(source, /material-panel-activity-hero-fill/);
    assert.match(source, /material-panel-activity-temp-badge/);
    assert.match(source, /heroValue\.text = pct != null/);
    assert.match(source, /tempBadge\.text = data\.temp != null/);
});

test('Activity dashboard keeps stat sparklines in a dedicated card row', async () => {
    const source = await readFile(new URL('../lib/activityPopup.js', import.meta.url), 'utf8');
    assert.match(source, /material-panel-activity-stats/);
    assert.match(source, /makeStat\('CPU', cpuSpark\)/);
    assert.match(source, /makeStat\('TEMP', tempSpark\)/);
    assert.match(source, /makeStat\('MEMORY', memSpark\)/);
    assert.match(source, /cpuSpark\.update\(history\.cpu\)/);
});
