import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';

const source = await readFile(new URL('../modules/quicksettings.js', import.meta.url), 'utf8');
const buildStart = source.indexOf('export function buildQuickSettings');
const buildSource = source.slice(buildStart);

test('Quick Settings popup starts with the shared header before layout-specific content', () => {
    assert.match(source, /import \{createPopupHeader\} from '\.\.\/lib\/popupHeader\.js';/);
    const header = buildSource.indexOf("text: 'Quick Settings'");
    const branch = buildSource.indexOf("const ryoku = getLayoutStyle() === 'ryoku'");
    assert.ok(header >= 0 && branch > header, 'header must be created before layout branching');
    assert.match(buildSource, /createPopupHeader\(\{titleActor: headerTitle\}\)/);
    assert.match(buildSource, /headerItem\.add_child\(header\.actor\)/);
    assert.match(buildSource, /menu\.addMenuItem\(headerItem\)/);
});

test('shared header does not replace Quick Settings content or navigation behavior', () => {
    assert.match(buildSource, /fillRyokuQsMenu\(menu/);
    assert.match(buildSource, /buildProfileCard\(/);
    assert.match(buildSource, /orderQuickSettingsTiles\(/);
    assert.match(buildSource, /menu\.connect\('open-state-changed'/);
    assert.match(buildSource, /button\.connect\('clicked'/);
});
