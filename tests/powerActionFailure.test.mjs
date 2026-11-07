import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';

const power = await readFile(new URL('../modules/powermenu.js', import.meta.url), 'utf8');
const confirm = await readFile(new URL('../lib/powerConfirm.js', import.meta.url), 'utf8');
const runner = await readFile(new URL('../lib/powerAction.js', import.meta.url), 'utf8');

test('power actions use argv-based async subprocess completion and report failures', () => {
    assert.ok(runner.includes('Gio.Subprocess.new(argv, Gio.SubprocessFlags.NONE)'));
    assert.ok(runner.includes('wait_check_async(null'));
    assert.ok(runner.includes('wait_check_finish(result)'));
    assert.ok(runner.includes("Main.notify('Material Panel'"));
    assert.ok(!runner.includes('spawn_command_line_async'));
});

test('Lock and Suspend use the shared argv runner without an undefined command', () => {
    assert.ok(power.includes('runPowerAction(label, argv)'));
    assert.ok(!power.includes('spawn_command_line_async(command)'));
    assert.ok(!power.includes('${command}'));
});

test('power menu actions use fixed argv and preserve destructive-action confirmation', () => {
    assert.ok(power.includes("argv: ['loginctl', 'lock-session']"));
    assert.ok(power.includes("argv: ['systemctl', 'suspend']"));
    assert.ok(power.includes("argv: ['systemctl', 'reboot']"));
    assert.ok(power.includes("argv: ['systemctl', 'poweroff']"));
    assert.ok(power.includes('confirmAndRun('));
    assert.ok(confirm.includes('runPowerAction(title, argv)'));
});
