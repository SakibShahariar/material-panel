import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';

test('shared popup header provides title, optional status, leading content and actions', async () => {
    const source = await readFile(new URL('../lib/popupHeader.js', import.meta.url), 'utf8');
    assert.match(source, /orientation: Clutter\.Orientation\.HORIZONTAL/);
    assert.match(source, /style_class: styleClass/);
    assert.match(source, /material-panel-popup-header-content/);
    assert.match(source, /if \(titleActor\)[\s\S]*?content\.add_child\(titleActor\)/);
    assert.match(source, /if \(statusActor\)[\s\S]*?content\.add_child\(statusActor\)/);
    assert.match(source, /if \(leadingActor\)[\s\S]*?header\.add_child\(leadingActor\)/);
    assert.match(source, /for \(const action of actions\)/);
    assert.match(source, /return \{actor: header, content\}/);
});
