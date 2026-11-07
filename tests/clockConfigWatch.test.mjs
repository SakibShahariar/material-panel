import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';

const source = await readFile(new URL('../modules/clock.js', import.meta.url), 'utf8');
const tickStart = source.indexOf('    const tick = () => {');
const tickEnd = source.indexOf('\n    };', tickStart);
const tick = source.slice(tickStart, tickEnd);
const buildStart = source.indexOf('export function buildClock(');
const build = source.slice(buildStart);

test('clock timer formats time without loading config on every tick', () => {
    assert.doesNotMatch(tick, /store\.load\(/);
    assert.match(tick, /formatClockDisplay\(GLib\.DateTime\.new_now_local\(\), use12h, displayMode, isEnd4\(\)\)/);
    assert.match(build, /store\.loadAsync\(\)\.then/);
});

test('clock format follows config watcher changes and watcher is disconnected on destroy', () => {
    assert.match(build, /store\.watch\(cfg => \{[\s\S]*?cfg\?\.clockFormat === '12h'[\s\S]*?cfg\?\.clockClickCyclesFormat === true[\s\S]*?tick\(\)/);
    assert.match(build, /button\.connect\('destroy',[\s\S]*?store\.unwatch\(\)/);
});
