import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';

const weather = await readFile(new URL('../modules/weather.js', import.meta.url), 'utf8');

test('Weather periodic refresh skips work while both chip and popup are hidden', () => {
    assert.ok(weather.includes('if (destroyed || (!button.mapped && !menu.isOpen))'));
    assert.ok(weather.includes('try { refreshIfStale(); } catch (e) {}'));
});

test('Weather refresh resumes when the chip is mapped or popup opens', () => {
    assert.ok(weather.includes("button.connect('notify::mapped', refreshIfStale)"));
    assert.ok(weather.includes("menu.connect('open-state-changed', (_menu, open) =>"));
    assert.ok(weather.includes('if (!destroyed && (button.mapped || menu.isOpen))'));
});

test('Weather still avoids overlapping refreshes and cancels requests on destroy', () => {
    assert.ok(weather.includes('if (destroyed || fetchInFlight)'));
    assert.ok(weather.includes('cancellable.cancel()'));
});
