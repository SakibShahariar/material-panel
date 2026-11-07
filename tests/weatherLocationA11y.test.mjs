import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';

test('saved weather locations announce their selected state accessibly', async () => {
    const source = await readFile(new URL('../modules/weather.js', import.meta.url), 'utf8');
    assert.match(source, /const updateSavedLocationLabels = \(\) => \{[\s\S]*?const active = index === activeIndex/);
    assert.match(source, /setChipA11y\(entry\.actor, active[\s\S]*?selected weather location/);
    assert.match(source, /savedLocationItems\.push\(\{actor: entry\.actor, label: entry\.label, location\}\)/);
    assert.match(source, /setWeatherLocationIndex\(index\);[\s\S]*?updateSavedLocationLabels\(\)/);
});
