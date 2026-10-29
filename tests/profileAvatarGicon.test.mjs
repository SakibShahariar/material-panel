import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';

const source = await readFile(new URL('../modules/profileCard.js', import.meta.url), 'utf8');
const stylesheet = await readFile(new URL('../stylesheet.css', import.meta.url), 'utf8');

test('profile avatars use GIcon instead of interpolating paths into CSS', () => {
    assert.ok(source.includes('Gio.FileIcon.new(Gio.File.new_for_path(file))'));
    assert.ok(source.includes("style_class: 'material-panel-qs-avatar-image'"));
    assert.ok(!source.includes('background-image: url("file://'));
    assert.ok(stylesheet.includes('.material-panel-qs-avatar-image'));
});

test('profile avatar initial fallback remains available when no image exists', () => {
    assert.ok(source.includes("child: new St.Label({text: initial, style_class: 'material-panel-qs-avatar-label'})"));
    assert.ok(stylesheet.includes('border-radius: 999px;'));
});
