import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('../lib/calendarGrid.js', import.meta.url), 'utf8');

function weekStart(Locale) {
    const context = {Intl: {Locale}};
    vm.runInNewContext(source.replaceAll('export ', ''), context);
    return context.getCalendarWeekStart('en-US');
}

test('week start supports the method-based API', () => {
    assert.equal(weekStart(class {getWeekInfo() {return {firstDay: 7};}}), 7);
});

test('week start retains support for the legacy getter', () => {
    assert.equal(weekStart(class {get weekInfo() {return {firstDay: 6};}}), 6);
});

test('method-based API takes precedence over the legacy getter', () => {
    assert.equal(weekStart(class {
        getWeekInfo() {return {firstDay: 7};}
        get weekInfo() {throw new Error('legacy getter accessed');}
    }), 7);
});

test('invalid first days retain the Monday fallback', () => {
    for (const firstDay of [0, 8, 1.5, '7', null])
        assert.equal(weekStart(class {getWeekInfo() {return {firstDay};}}), 1);
});

test('missing APIs and invalid locales retain the Monday fallback', () => {
    assert.equal(weekStart(class {}), 1);
    assert.equal(weekStart(class {constructor() {throw new Error('invalid locale');}}), 1);
});
