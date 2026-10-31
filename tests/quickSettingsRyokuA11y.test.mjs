import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';

const profile = await readFile(new URL('../modules/profileCard.js', import.meta.url), 'utf8');
const ryoku = await readFile(new URL('../modules/quicksettingsRyoku.js', import.meta.url), 'utf8');

test('Quick Settings profile preferences button has an accessible name', () => {
    assert.ok(profile.includes("import {setChipA11y} from '../lib/a11y.js'"));
    assert.ok(profile.includes("setChipA11y(prefsBtn, 'Open panel preferences')"));
});

test('Ryoku navigation announces the selected and unselected sections', () => {
    assert.ok(ryoku.includes("import {setChipA11y} from '../lib/a11y.js'"));
    assert.ok(ryoku.includes("`${r.label}, ${on ? 'selected' : 'not selected'}`"));
    assert.ok(ryoku.includes("setChipA11y(railButtons[r.id],"));
    assert.ok(ryoku.includes("setRoute('sound')"));
});
