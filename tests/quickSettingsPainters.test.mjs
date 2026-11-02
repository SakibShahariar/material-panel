import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';

const end4 = await readFile(new URL('../modules/quicksettingsEnd4.js', import.meta.url), 'utf8');
const defaults = await readFile(new URL('../modules/quicksettings.js', import.meta.url), 'utf8');
const ryoku = await readFile(new URL('../modules/quicksettingsRyoku.js', import.meta.url), 'utf8');

test('End-4 toggle and power controls share one hover/pressed interaction binder', () => {
    assert.equal((end4.match(/function bindPressedPaint\(/g) || []).length, 1);
    assert.match(end4, /function bindToggleButton[\s\S]*?bindPressedPaint\(btn/);
    assert.match(end4, /bindPressedPaint\(b, \(pressed, hovered\) =>/);
    assert.equal((end4.match(/button-press-event/g) || []).length, 2);
    assert.equal((end4.match(/button-release-event/g) || []).length, 2);
});

test('all Quick Settings layouts reuse the shared slider and configured tile APIs', () => {
    assert.match(defaults, /import \{createSlider, sliderStyleFor\} from '\.\.\/lib\/simpleSlider\.js'/);
    assert.match(end4, /import \{createSlider, sliderStyleFor\} from '\.\.\/lib\/simpleSlider\.js'/);
    assert.match(defaults, /normalizeQuickSettingsTiles\(getQuickSettingsTiles\(\)\)/);
    assert.match(end4, /normalizeQuickSettingsTiles\(getQuickSettingsTiles\(\)\)/);
    assert.match(ryoku, /normalizeQuickSettingsTiles\(getQuickSettingsTiles\(\)\)/);
    assert.match(ryoku, /volumeSliderRow,[\s\S]*?brightnessSliderRow,[\s\S]*?powerRow,/);
});

test('all Quick Settings layouts place the media card before sound and connectivity controls', () => {
    const end4Build = end4.slice(end4.indexOf('const shell = new St.BoxLayout'));
    assert.ok(end4Build.indexOf('buildMediaPlayerRow()') < end4Build.indexOf('buildDualSliders()'));
    const defaultBuild = defaults.slice(defaults.indexOf('export function buildQuickSettings'));
    assert.ok(defaultBuild.indexOf('buildMediaPlayerRow()') < defaultBuild.indexOf('volumeSliderRow()'));
    const ryokuBuild = ryoku.slice(ryoku.indexOf('export function fillRyokuQsMenu'));
    assert.ok(ryokuBuild.indexOf('buildMediaPlayerRow()') < ryokuBuild.indexOf("mk('sound'"));
    assert.ok(ryokuBuild.indexOf("mk('sound'") < ryokuBuild.indexOf("mk('network'"));
    assert.ok(ryokuBuild.indexOf("mk('network'") < ryokuBuild.indexOf("mk('bluetooth'"));
});

test('all Quick Settings layouts share the same expandable network builders and slider input contract', async () => {
    const slider = await readFile(new URL('../lib/simpleSlider.js', import.meta.url), 'utf8');
    assert.ok(defaults.includes("getQsExpandController().register('wifi'"));
    assert.ok(defaults.includes("getQsExpandController().register('bt'"));
    assert.ok(end4.includes("import {wifiQsBlock, bluetoothTile} from './quicksettings.js'"));
    assert.ok(ryoku.includes('wifiQsBlock,'));
    assert.ok(ryoku.includes('bluetoothTile,'));
    assert.ok(slider.includes("container.connect('key-press-event'"));
    assert.ok(slider.includes("container.connect('scroll-event'"));
    assert.ok(slider.includes("container.connect('button-press-event'"));
    assert.ok(slider.includes("global.stage.connect('captured-event'"));
    assert.ok(end4.includes("createSlider({"));
});

test('notifications and calendar remain available after the core controls in every Quick Settings layout', () => {
    assert.ok(defaults.includes("new PopupMenu.PopupSubMenuMenuItem('Notifications'"));
    assert.ok(defaults.includes("new PopupMenu.PopupSubMenuMenuItem('Calendar'"));
    assert.ok(end4.includes('buildEnd4NotiSection()'));
    assert.ok(end4.includes('buildEnd4CalendarSection()'));
    assert.ok(ryoku.includes("new PopupMenu.PopupSubMenuMenuItem('Notifications'"));
    assert.ok(ryoku.includes("new PopupMenu.PopupSubMenuMenuItem('Calendar'"));
    assert.ok(ryoku.includes("import {buildEnd4NotiSection, buildEnd4CalendarSection}"));
});
