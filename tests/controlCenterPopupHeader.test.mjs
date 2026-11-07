import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';

const source = await readFile(new URL('../modules/controlCenter.js', import.meta.url), 'utf8');

test('Control Center section title and description use the shared popup header', () => {
    assert.match(source, /import \{createPopupHeader\} from '\.\.\/lib\/popupHeader\.js';/);
    assert.match(source, /titleActor: heading/);
    assert.match(source, /statusActor: description/);
    assert.match(source, /styleClass: 'material-panel-control-center-header'/);
    assert.match(source, /page\.add_child\(sectionHeader\.actor\)/);
    assert.doesNotMatch(source, /page\.add_child\(heading\);\s*page\.add_child\(description\);/);
});

test('section-specific content remains rendered after the shared header', () => {
    assert.match(source, /page\.add_child\(homeGrid\)/);
    assert.match(source, /page\.add_child\(systemView\)/);
    assert.match(source, /page\.add_child\(card\)/);
    assert.match(source, /currentSectionId = section\.id/);
});
