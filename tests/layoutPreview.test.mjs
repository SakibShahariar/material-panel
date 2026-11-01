import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';

test('Preferences renders previews for Default, End-4, and Ryoku without applying them', async () => {
    const prefs = await readFile(new URL('../prefs.js', import.meta.url), 'utf8');
    assert.ok(prefs.includes("title: 'Default'"));
    assert.ok(prefs.includes("title: 'End-4'"));
    assert.ok(prefs.includes("title: 'Ryoku'"));
    assert.ok(prefs.includes('layoutPreviewGrid.append(card)'));
    assert.ok(prefs.includes('updateLayoutPreviews(config.layoutStyle ?? LAYOUT_DEFAULT)'));
    assert.ok(prefs.includes('updateLayoutPreviews(style)'));
    assert.ok(prefs.includes('quickSettings:'));
});

test('layout preview cards show the actual configured left, center, and right module zones', async () => {
    const prefs = await readFile(new URL('../prefs.js', import.meta.url), 'utf8');
    assert.ok(prefs.includes('zones: DEFAULT_ZONES'));
    assert.ok(prefs.includes('zones: END4_ZONES'));
    assert.ok(prefs.includes('zones: RYOKU_ZONES'));
    assert.ok(prefs.includes("for (const zone of ['left', 'center', 'right'])"));
    assert.ok(prefs.includes('(entry.zones[zone] || []).map(moduleLabel).join'));
});

 
test('layout preview cards wrap responsively in narrow Preferences windows', async () => {
    const prefs = await readFile(new URL('../prefs.js', import.meta.url), 'utf8');
    assert.match(prefs, /const layoutPreviewGrid = new Gtk\.FlowBox\(/);
    assert.match(prefs, /min_children_per_line: 1/);
    assert.match(prefs, /max_children_per_line: 3/);
    assert.match(prefs, /hexpand: true/);
    assert.match(prefs, /card\.set_hexpand\(true\)/);
    assert.match(prefs, /layoutPreviewGrid\.insert\(card, -1\)/);
});
