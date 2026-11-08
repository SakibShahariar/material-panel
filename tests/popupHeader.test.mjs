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

test('every inventoried major module popup uses the shared header helper', async () => {
    const modules = [
        'battery.js', 'bluetooth.js', 'btConnected.js', 'clipboardHistory.js',
        'clock.js', 'controlCenter.js', 'cpu.js', 'disk.js', 'dnd.js',
        'gpu.js', 'mediaPlayer.js', 'memory.js', 'network.js',
        'networkSpeed.js', 'notifications.js', 'powermenu.js',
        'quicksettings.js', 'quicksettingsEnd4.js', 'weather.js',
    ];
    const sources = await Promise.all(modules.map(name =>
        readFile(new URL('../modules/' + name, import.meta.url), 'utf8')));
    for (const [index, source] of sources.entries()) {
        assert.match(source, /import \{createPopupHeader\} from '\.\.\/lib\/popupHeader\.js';/,
            modules[index] + ' must import the shared popup header');
        assert.match(source, /createPopupHeader\(\{/,
            modules[index] + ' must compose its popup header through the shared helper');
    }
});
