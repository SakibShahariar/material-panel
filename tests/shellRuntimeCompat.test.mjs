import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';

const files = await Promise.all([
    readFile(new URL('../modules/quicksettings.js', import.meta.url), 'utf8'),
    readFile(new URL('../lib/a11y.js', import.meta.url), 'utf8'),
    readFile(new URL('../modules/volume.js', import.meta.url), 'utf8'),
    readFile(new URL('../modules/dnd.js', import.meta.url), 'utf8'),
    readFile(new URL('../lib/iconTheme.js', import.meta.url), 'utf8'),
    readFile(new URL('../lib/clipboardHistoryStore.js', import.meta.url), 'utf8'),
    readFile(new URL('../lib/statusAreaBridge.js', import.meta.url), 'utf8'),
    readFile(new URL('../lib/themeStylesheet.js', import.meta.url), 'utf8'),
    readFile(new URL('../lib/configStore.js', import.meta.url), 'utf8'),
    readFile(new URL('../prefs.js', import.meta.url), 'utf8'),
    readFile(new URL('../lib/themeRenderer.js', import.meta.url), 'utf8'),
    readFile(new URL('../stylesheet.css', import.meta.url), 'utf8'),
    readFile(new URL('../modules/controlCenter.js', import.meta.url), 'utf8'),
]);
const [quicksettings, a11y, volume, dnd, ...rest] = files;
const writers = rest.slice(0, 6);
const [themeRenderer, stylesheet, controlCenter] = rest.slice(6);

test('quick settings defines the shared interactive helper used by its tiles', () => {
    const definition = quicksettings.indexOf('function wireQsInteractive(actor)');
    assert.ok(definition >= 0, 'wireQsInteractive must be defined, not only called');
    assert.ok(quicksettings.indexOf('wireQsInteractive(mainBtn)') > definition,
        'the helper must be defined before its first call site');
    assert.match(quicksettings, /wireChipPress\(actor, \{stickyUntilLeave: false\}\)/);
    assert.match(quicksettings, /Clutter\.EVENT_PROPAGATE/);
});

test('accessible roles fall back to Atk when St drops AccessibleRole', () => {
    assert.match(a11y, /St\.AccessibleRole\?\.\[roleName\] \?\? Atk\.Role\?\.\[roleName\]/);
    assert.match(a11y, /actor\.accessible_role = role/);
    for (const [name, source, actor] of [
        ['volume', volume, 'box'],
        ['DND', dnd, 'button'],
    ]) {
        assert.doesNotMatch(source, /accessible_role:\s*St\.AccessibleRole/, name);
        assert.match(source, new RegExp(`setAccessibleRole\\(${actor}, 'BUTTON'\\)`), name);
    }
});

function hasUnsupportedPriorityArg(source) {
    let index = 0;
    while ((index = source.indexOf('replace_contents_async(', index)) !== -1) {
        const finish = source.indexOf('replace_contents_finish', index);
        const call = source.slice(index, finish === -1 ? index + 500 : finish);
        if (call.includes('GLib.PRIORITY_DEFAULT'))
            return true;
        index += 1;
    }
    return false;
}

test('every async file write matches the Gio replace_contents_async argument order', () => {
    for (const [index, source] of writers.entries()) {
        if (!source.includes('replace_contents_async('))
            continue;
        assert.equal(hasUnsupportedPriorityArg(source), false,
            `writer ${index} passes an unsupported io-priority argument`);
    }
    assert.match(writers[0], /replace_contents_async\(/);
    assert.match(writers[0], /REPLACE_DESTINATION,\s*null,\s*\(source, result\)/);
});

test('Material Panel text uses a UI sans face instead of the session font', () => {
    for (const [name, source] of [['themeRenderer', themeRenderer], ['stylesheet', stylesheet]]) {
        assert.match(source, /\.material-panel-popup[^{]*\{[\s\S]*?font-family: "Noto Sans", "Adwaita Sans", sans-serif/, name);
    }
});

test('popup hero selector list is closed before the next rule', () => {
    assert.doesNotMatch(themeRenderer,
        /\.material-panel-cpu-popup-section-title,\s*\n\s*\/\* === Popup chrome/);
    assert.match(themeRenderer, /\.material-panel-cpu-popup-section-title \{\ncolor: \$\{accentBg\};\n\}/);
});

test('Control Center cards use a guarded tooltip helper', () => {
    assert.match(a11y, /export function setTooltip\(actor, text\)/);
    assert.match(a11y, /typeof actor\.set_tooltip_text === 'function'/);
    assert.doesNotMatch(controlCenter, /\.set_tooltip_text\(/);
    assert.equal((controlCenter.match(/setTooltip\(/g) || []).length, 3,
        'system, media and wallpaper cards should use setTooltip');
});
