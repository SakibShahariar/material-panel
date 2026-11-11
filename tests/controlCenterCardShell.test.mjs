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
