import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';

const files = await Promise.all([
    readFile(new URL('../lib/statusState.js', import.meta.url), 'utf8'),
    readFile(new URL('../modules/bluetooth.js', import.meta.url), 'utf8'),
    readFile(new URL('../modules/cpu.js', import.meta.url), 'utf8'),
    readFile(new URL('../modules/mediaPlayer.js', import.meta.url), 'utf8'),
    readFile(new URL('../modules/weather.js', import.meta.url), 'utf8'),
]);
const [helper, bluetooth, cpu, media, weather] = files;

test('shared status state builds an icon, wrapped message, and hide/show API', () => {
    assert.match(helper, /export function createStatusState\(/);
    assert.match(helper, /new St\.Icon\(/);
    assert.match(helper, /new St\.Label\(/);
    assert.match(helper, /wrap: true/);
    assert.match(helper, /actor\.visible = !!message/);
    assert.match(helper, /const setMessage = \(nextMessage, nextIconName = iconName\)/);
    assert.match(helper, /actor\.visible = !!nextMessage/);
    assert.match(helper, /return \{actor, setMessage\}/);
});

test('CPU, media, Bluetooth, and weather use the shared status state helper', () => {
    for (const [name, source] of [
        ['Bluetooth', bluetooth],
        ['CPU', cpu],
        ['Media', media],
        ['Weather', weather],
    ]) {
        assert.match(source, /import \{createStatusState\} from '\.\.\/lib\/statusState\.js'/, name);
        assert.match(source, /createStatusState\(/, name);
    }
});

test('major unavailable states provide explanations and return to normal on recovery', () => {
    assert.match(bluetooth, /No Bluetooth adapter was detected/);
    assert.match(bluetooth, /BlueZ\) is not responding/);
    assert.match(bluetooth, /showAdapterState\(''\)/);
    assert.match(cpu, /No readable CPU thermal sensor was found/);
    assert.match(cpu, /tempUnavailableState\.setMessage\(temp === null/);
    assert.match(media, /No media player is active/);
    assert.match(media, /noMediaState\.setMessage\(''\)/);
    assert.match(weather, /No location configured\. Set one in GNOME Weather or Preferences/);
    assert.match(weather, /weatherState\.setMessage\(unavailable/);
    assert.match(weather, /weatherState\.setMessage\('Loading weather forecast/);
});
