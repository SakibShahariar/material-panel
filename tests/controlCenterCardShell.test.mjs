import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');

test('Control Center card shell centralizes theme-aware surface and bounded geometry', async () => {
    const shell = await read('../lib/controlCenterCardShell.js');
    assert.match(shell, /getThemeColor\('qsSurface'/);
    assert.match(shell, /material-panel-control-center-card/);
    assert.match(shell, /clampStyleValue\(padding, 14, 32\)/);
    assert.match(shell, /clampStyleValue\(spacing, 8, 32\)/);
    assert.match(shell, /clampStyleValue\(radius, 18, 32\)/);
});

test('built-in Home action, media, weather and calendar cards use the shared shell', async () => {
    const source = await read('../modules/controlCenter.js');
    assert.match(source, /import \{createControlCenterCardShell\} from '..\/lib\/controlCenterCardShell\.js'/);
    for (const card of ['actions', 'media', 'weather', 'calendar'])
        assert.ok(source.includes(`createControlCenterCardShell({padding: 14, spacing:`),
            `missing shared card shell use for ${card}`);
    assert.doesNotMatch(source, /actionsCard\.style = `background-color:/);
    assert.doesNotMatch(source, /mediaCard\.style = `background-color:/);
    assert.doesNotMatch(source, /weatherCard\.style = `background-color:/);
    assert.doesNotMatch(source, /calendarCard\.style = `background-color:/);
});


test('System overview and Wallpaper cards use the shared theme-aware shell', async () => {
    const source = await read('../modules/controlCenter.js');
    assert.match(source, /const systemSummaryContent = createControlCenterCardShell\(/);
    assert.match(source, /const wallpaperContent = createControlCenterCardShell\(/);
    assert.match(source, /systemSummaryCard\.connect\('clicked', onOpen\)/);
    assert.match(source, /wallpaperCard\.set_child\(wallpaperContent\)/);
});


test('shared card title helper centralizes typography and accessible names', async () => {
    const shell = await read('../lib/controlCenterCardShell.js');
    const source = await read('../modules/controlCenter.js');
    assert.match(shell, /export function createControlCenterCardTitle\(text, \{expand = false\} = \{\}\)/);
    assert.match(shell, /material-panel-control-center-card-title/);
    assert.match(shell, /title\.accessible_name = label/);
    assert.match(shell, /font-size: 14px; font-weight: 650/);
    for (const label of ['System overview', 'Quick actions', 'Now playing', 'Weather', 'Calendar', 'Wallpaper'])
        assert.ok(source.includes(`createControlCenterCardTitle('${label}'`) ||
            (label === 'Now playing' && source.includes("createControlCenterCardTitle('Now playing', {expand: true}")),
        `missing shared title helper for ${label}`);
    assert.doesNotMatch(source, /(?:systemSummaryTitle|actionsTitle|mediaTitle|weatherTitle|calendarTitle|wallpaperTitle)\.style = 'font-size: 14px; font-weight: 650;'/);
});
