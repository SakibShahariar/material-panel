import assert from 'node:assert/strict';
import test from 'node:test';
import {
    formatWorldClockEntries,
    formatWorldClockEntry,
    normalizeWorldClockEntries,
    parseWorldClockZoneTab,
    parseWorldClockEntries,
} from '../lib/worldClock.js';

test('normalizes world clocks, removes invalid zones and duplicate zones', () => {
    assert.deepEqual(normalizeWorldClockEntries([
        {name: '  Dhaka  ', timeZone: 'Asia/Dhaka'},
        {name: 'Duplicate', timeZone: 'Asia/Dhaka'},
        {name: 'Invalid', timeZone: 'Mars/Olympus'},
        {name: 'No zone', timeZone: ''},
        null,
    ]), [{name: 'Dhaka', timeZone: 'Asia/Dhaka'}]);
});

test('sanitizes city labels while preserving Unicode names', () => {
    assert.deepEqual(normalizeWorldClockEntries([
        {name: 'ঢাকা\nCentral', timeZone: 'Asia/Dhaka'},
        {name: 'القاهرة', timeZone: 'Africa/Cairo'},
    ]).map(entry => entry.name), ['ঢাকা Central', 'القاهرة']);
});

test('limits world clock list to twelve entries', () => {
    const entries = Array.from({length: 14}, (_, index) => ({
        name: 'City ' + index,
        timeZone: 'Etc/GMT+' + index,
    }));
    assert.equal(normalizeWorldClockEntries(entries).length, 12);
});

test('parses and formats ordered city and IANA time-zone preferences', () => {
    const parsed = parseWorldClockEntries(
        'Dhaka|Asia/Dhaka; New York|America/New_York');
    assert.deepEqual(parsed, [
        {name: 'Dhaka', timeZone: 'Asia/Dhaka'},
        {name: 'New York', timeZone: 'America/New_York'},
    ]);
    assert.equal(formatWorldClockEntries(parsed),
        'Dhaka|Asia/Dhaka; New York|America/New_York');
    assert.equal(parseWorldClockEntries('Dhaka|Asia/Dhaka; Broken'), null);
    assert.equal(parseWorldClockEntries('Dhaka|Asia/Dhaka; Other|Asia/Dhaka'), null);
    assert.deepEqual(parseWorldClockEntries('Boston|US/Eastern'), [
        {name: 'Boston', timeZone: 'America/New_York'},
    ]);
    assert.equal(parseWorldClockEntries('Bad|Name|Asia/Dhaka'), null);
});

test('formats local time, date and previous-day offset using IANA time zones', () => {
    const now = new Date('2026-01-01T01:00:00Z');
    const result = formatWorldClockEntry({
        name: 'New York',
        timeZone: 'America/New_York',
    }, now, {locale: 'en-GB', localTimeZone: 'Asia/Dhaka'});
    assert.equal(result.time, '20:00');
    assert.equal(result.dayOffset, -1);
    assert.equal(result.dayOffsetLabel, 'Yesterday');
    assert.match(result.date, /31.*Dec|Dec.*31/);
});

test('uses daylight-saving rules from the time-zone database', () => {
    const winter = formatWorldClockEntry({
        name: 'New York',
        timeZone: 'America/New_York',
    }, new Date('2026-01-15T12:00:00Z'), {locale: 'en-GB'});
    const summer = formatWorldClockEntry({
        name: 'New York',
        timeZone: 'America/New_York',
    }, new Date('2026-07-15T12:00:00Z'), {locale: 'en-GB'});
    assert.equal(winter.time, '07:00');
    assert.equal(summer.time, '08:00');
});

test('rejects invalid entries before formatting', () => {
    assert.equal(formatWorldClockEntry({name: 'Invalid', timeZone: 'Mars/Olympus'}), null);
});

test('formats twelve-hour time while retaining the local day offset', () => {
    const result = formatWorldClockEntry({
        name: 'New York',
        timeZone: 'America/New_York',
    }, new Date('2026-01-01T01:00:00Z'), {
        locale: 'en-US',
        localTimeZone: 'Asia/Dhaka',
        use12h: true,
    });
    assert.equal(result.time, '08:00 PM');
    assert.equal(result.dayOffsetLabel, 'Yesterday');
});

test('parses searchable city names from the system time-zone table', () => {
    const choices = parseWorldClockZoneTab([
        '# country\tcoordinates\ttz\tcomments',
        'BD\t+2300+09000\tAsia/Dhaka\tDhaka',
        'US\t+404251-0740023\tAmerica/New_York\tNew York',
        'GB\t+513030-0000731\tEurope/London\tLondon',
        'XX\t+0000+00000\tMars/Olympus\tInvalid',
        'US\t+404251-0740023\tUS/Eastern\tNew York alias',
    ].join('\n'));
    assert.deepEqual(choices, [
        {name: 'Dhaka', timeZone: 'Asia/Dhaka'},
        {name: 'London', timeZone: 'Europe/London'},
        {name: 'New York', timeZone: 'America/New_York'},
    ]);
});


test('bounds work for very long imported world-clock city labels', () => {
    const name = 'x'.repeat(100_000) + '😀tail';
    const [entry] = normalizeWorldClockEntries([{
        name, timeZone: 'Asia/Dhaka',
    }]);
    assert.equal(entry.name, 'x'.repeat(64));
    assert.equal(Array.from(entry.name).length, 64);
});

test('bounds World Clock name normalization and checks delimiters within the displayed prefix', () => {
    const [entry] = normalizeWorldClockEntries([{
        name: 'x'.repeat(100_000) + '|ignored',
        timeZone: 'Asia/Dhaka',
    }]);
    assert.equal(entry.name, 'x'.repeat(64));
    assert.deepEqual(normalizeWorldClockEntries([{
        name: 'x'.repeat(63) + '|ignored',
        timeZone: 'Asia/Dhaka',
    }]), []);
});

test('does not exceed the World Clock name limit when whitespace reaches its final slot', () => {
    const [entry] = normalizeWorldClockEntries([{
        name: 'x'.repeat(63) + ' y',
        timeZone: 'Asia/Dhaka',
    }]);
    assert.equal(entry.name, 'x'.repeat(63) + ' ');
    assert.equal(Array.from(entry.name).length, 64);
});
