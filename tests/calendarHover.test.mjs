import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('../lib/end4QsExtras.js', import.meta.url), 'utf8');
const calendar = source.slice(source.indexOf('export function buildEnd4CalendarSection()'));
const match = calendar.match(/const paintDay = \(\) => \{([\s\S]*?)\n                \};/);
assert.ok(match, 'calendar painter must exist');

function paint({hover = true, selected = false, today = false, color = '#202020'} = {}) {
    let reads = 0;
    const dayBtn = {hover, get_theme_node: () => ({get_foreground_color: () => {
        reads++;
        return {to_string: () => color};
    }})};
    const context = {dayBtn, lab: {}, eventDot: {}, CELL: 40, isSelected: selected, isToday: today,
        prim: () => '#abcdef', onP: () => '#123456', style: (actor, css) => {actor.style = css;}};
    vm.runInNewContext(`(() => {${match[1]}})()`, context);
    return {css: dayBtn.style, reads};
}

test('calendar hover follows dark and light theme foregrounds', () => {
    for (const color of ['#202020', '#eeeeee']) {
        const result = paint({color});
        assert.ok(result.css.includes(`background-color: alpha(${color}, 0.14)`));
        assert.equal(result.reads, 1);
    }
    assert.ok(!calendar.includes("bg = 'rgba(255,255,255,0.14)';"));
});

test('today and selection take precedence over hover', () => {
    for (const options of [{selected: true}, {today: true}]) {
        const result = paint(options);
        assert.ok(result.css.includes('background-color: #abcdef;'));
        assert.equal(result.reads, 0);
    }
});

test('unhovered ordinary days remain transparent', () => {
    const result = paint({hover: false});
    assert.ok(result.css.includes('background-color: transparent;'));
    assert.equal(result.reads, 0);
});
