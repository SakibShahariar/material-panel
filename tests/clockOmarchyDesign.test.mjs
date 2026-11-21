import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';

const [clock, stylesheet, renderer] = await Promise.all([
    readFile(new URL('../modules/clock.js', import.meta.url), 'utf8'),
    readFile(new URL('../stylesheet.css', import.meta.url), 'utf8'),
    readFile(new URL('../lib/themeRenderer.js', import.meta.url), 'utf8'),
]);

test('clock popup has a clickable hero date that jumps to today', () => {
    assert.match(clock, /material-panel-clock-hero-date/);
    assert.match(clock, /setChipA11y\(heroDate, 'Jump to today'\)/);
    assert.match(clock, /heroDate\.connect\('clicked'/);
    const handler = clock.slice(clock.indexOf("heroDate.connect('clicked'"), clock.indexOf("heroDate.connect('clicked'") + 400);
    assert.match(handler, /viewYear = now\.get_year\(\)/);
    assert.match(handler, /selectedKey = dateKeyToday\(\)/);
    assert.match(handler, /rebuildCal\(\)/);
    assert.match(stylesheet, /material-panel-clock-hero-day \{[\s\S]*?font-size: 40px/);
});

test('clock popup shows a year progress rail', () => {
    assert.match(clock, /material-panel-clock-year-rail/);
    assert.match(clock, /\$\{year\} · \$\{pct\}%/);
    assert.match(clock, /yearBarFill\.width = Math\.round\(\(pct \/ 100\)/);
    assert.match(clock, /updateHeroDate\(\)/);
    for (const [name, source] of [['stylesheet', stylesheet], ['renderer', renderer]]) {
        assert.match(source, /material-panel-clock-year-fill/, name);
    }
});

test('world clock timer teardown does not recurse infinitely', () => {
    const teardown = clock.slice(clock.indexOf('const stopWorldClockTick'));
    assert.doesNotMatch(teardown.slice(0, 160), /stopWorldClockTick\(\);/);
    assert.match(clock, /const stopWorldClockTick = \(\) => \{[\s\S]*?GLib\.source_remove\(worldClockTickId\)/);
});
