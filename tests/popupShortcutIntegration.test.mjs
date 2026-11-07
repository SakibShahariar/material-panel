import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');

test('PanelBuilder exposes only current visible popup module actors to shortcuts', async () => {
    const source = await read('../lib/panelBuilder.js');
    assert.match(source, /this\._moduleActors = new Map\(\)/);
    assert.match(source, /this\._moduleActors\.set\(id, actor\)/);
    assert.match(source, /hasModule\(id\)/);
    assert.match(source, /activateModule\(id\)/);
    assert.match(source, /actor\.emit\('clicked'\)/);
    assert.match(source, /this\._moduleActors\.clear\(\)/);
});

test('extension registers and removes supported global popup shortcuts safely', async () => {
    const source = await read('../extension.js');
    assert.match(source, /Main\.wm\.addKeybinding\(/);
    assert.match(source, /Main\.wm\.removeKeybinding\(key\)/);
    assert.match(source, /Meta\.KeyBindingFlags\.NONE/);
    assert.match(source, /Shell\.ActionMode\.NORMAL/);
    assert.match(source, /this\._builder\?\.hasModule\(target\.id\)/);
    assert.match(source, /this\._removePopupKeybindings\(true\)/);
    assert.match(source, /this\._syncPopupShortcuts\(this\._config\)/);
});

test('global shortcut settings are declared and compiled into extension packages', async () => {
    const [metadata, schema, packager] = await Promise.all([
        read('../metadata.json'),
        read('../schemas/org.gnome.shell.extensions.material-panel.gschema.xml'),
        read('../scripts/package_extension.py'),
    ]);
    assert.match(metadata, /"settings-schema": "org\.gnome\.shell\.extensions\.material-panel"/);
    for (const key of ['open-volume', 'open-network', 'open-bluetooth', 'open-clock', 'open-control-center'])
        assert.match(schema, new RegExp(`key name="${key}" type="as"`));
    assert.match(packager, /glib-compile-schemas/);
    assert.match(packager, /schemas\/gschemas\.compiled/);
});
