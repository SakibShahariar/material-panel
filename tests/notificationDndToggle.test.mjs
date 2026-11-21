import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';

const [source, renderer] = await Promise.all([
    readFile(new URL('../modules/notifications.js', import.meta.url), 'utf8'),
    readFile(new URL('../lib/themeRenderer.js', import.meta.url), 'utf8'),
]);

test('notification panel header has a Do Not Disturb toggle', () => {
    assert.match(source, /new Gio\.Settings\(\{schema_id: 'org\.gnome\.desktop\.notifications'\}\)/);
    assert.match(source, /material-panel-nc-dnd/);
    assert.match(source, /const on = !dndSettings\.get_boolean\('show-banners'\)/);
    assert.match(source, /dndBtn\.label = on \? '🔕' : '🔔'/);
    assert.match(source, /set_boolean\('show-banners', !dndSettings\.get_boolean\('show-banners'\)\)/);
    assert.match(source, /changed::show-banners', syncDnd/);
    assert.match(source, /actions: \[dndBtn, clearBtn\]/);
});

test('DND toggle is cleaned up on teardown', () => {
    assert.match(source, /dndSettings\.disconnect\(dndChangedId\)/);
});

test('DND toggle uses theme error color for its active state', () => {
    assert.match(renderer, /material-panel-nc-dnd\.active[\s\S]*?error/);
});

test('notification cards use the shared center card design language', () => {
    assert.match(source, /if \(item\.unread\)\s*card\.add_style_class_name\('unread'\)/);
    assert.match(source, /material-panel-nc-avatar-plate/);
    assert.match(source, /material-panel-nc-unread-dot/);
    assert.match(renderer, /material-panel-nc-card\.unread[\s\S]*?accentBg/);
    assert.match(renderer, /material-panel-nc-avatar-plate[\s\S]*?primary/);
    assert.match(renderer, /material-panel-nc-unread-dot[\s\S]*?accentBg/);
});
