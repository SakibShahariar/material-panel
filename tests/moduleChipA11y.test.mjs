import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';

const power = await readFile(new URL('../modules/powermenu.js', import.meta.url), 'utf8');
const focused = await readFile(new URL('../modules/focusedWindow.js', import.meta.url), 'utf8');

test('Power Menu trigger has a focusable accessible name', () => {
    assert.ok(power.includes("import {setChipA11y} from '../lib/a11y.js'"));
    assert.ok(power.includes("setChipA11y(button, 'Power menu')"));
});

test('Focused Window chip announces the current title and overview action', () => {
    assert.ok(focused.includes("import {setChipA11y} from '../lib/a11y.js'"));
    assert.ok(focused.includes("setChipA11y(button, 'Focused window: Desktop. Activate to toggle Activities overview.')"));
    assert.ok(focused.includes("setChipA11y(button, `Focused window: ${clean}. Activate to toggle Activities overview.`)"));
});
