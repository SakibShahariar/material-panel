import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';

const source = await readFile(new URL('../lib/shellCompat.js', import.meta.url), 'utf8');

test('pre-Shell-51 reduced motion follows GNOME animation preference', () => {
    assert.ok(source.includes("if (SHELL_MAJOR < 51) {"));
    assert.ok(source.includes("Gio.Settings.new('org.gnome.desktop.interface')"));
    assert.ok(source.includes("_interfaceSettings.get_boolean('enable-animations')"));
    assert.ok(source.includes('return !_interfaceSettings.get_boolean'));
});

test('Shell 51+ reduced motion keeps the St.Settings path', () => {
    assert.ok(source.includes('const {reducedMotion} = St.Settings.get()'));
    assert.ok(source.includes('St.ReducedMotion.REDUCE'));
});

test('menu open and close transitions honor reduced-motion preference', () => {
    const guardedFlags = source.match(/const a = !!animate && !prefersReducedMotion\(\);/g) || [];
    assert.equal(guardedFlags.length, 2);
});

const extension = await readFile(new URL('../extension.js', import.meta.url), 'utf8');
const stylesheet = await readFile(new URL('../stylesheet.css', import.meta.url), 'utf8');

test('reduced-motion watcher updates the stage class when GNOME preferences change', () => {
    assert.ok(source.includes("connect('changed::enable-animations', apply)"));
    assert.ok(source.includes("connect('notify::reduced-motion', apply)"));
    assert.ok(source.includes("stage.add_style_class_name('material-panel-reduced-motion')"));
    assert.ok(source.includes("stage.remove_style_class_name('material-panel-reduced-motion')"));
});

test('extension installs and disconnects the reduced-motion watcher', () => {
    assert.ok(extension.includes('this._reducedMotionCleanup = watchReducedMotion()'));
    assert.ok(extension.includes('this._reducedMotionCleanup?.()'));
});

test('reduced-motion stage class disables CSS transitions across panel surfaces', () => {
    assert.ok(stylesheet.includes('stage.material-panel-reduced-motion *'));
    assert.ok(stylesheet.includes('transition-duration: 0ms !important'));
    assert.ok(stylesheet.includes('transition-delay: 0ms !important'));
});

const quicksettings = await readFile(new URL('../modules/quicksettings.js', import.meta.url), 'utf8');

test('Quick Settings EQ bars stop and reset when reduced motion is enabled', () => {
    assert.ok(quicksettings.includes('if (prefersReducedMotion()) {'));
    assert.ok(quicksettings.includes('bag.stopEq();'));
    assert.ok(quicksettings.includes('resetEqBars();'));
    assert.ok(quicksettings.includes("connect('changed::enable-animations', syncEqMotion)"));
    assert.ok(quicksettings.includes("connect('notify::reduced-motion', syncEqMotion)"));
});
