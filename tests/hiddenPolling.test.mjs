import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';

const shellCompat = await readFile(new URL('../lib/shellCompat.js', import.meta.url), 'utf8');

const modules = await Promise.all(
    ['gpu', 'disk', 'battery', 'memory', 'cpu', 'networkSpeed'].map(async name => [
        name,
        await readFile(new URL(`../modules/${name}.js`, import.meta.url), 'utf8'),
    ])
);

test('system metric polling skips hidden chips with closed popups', () => {
    for (const [name, source] of modules) {
        assert.ok(
            source.includes('if (isSessionLocked() || (!button.mapped && !menu.isOpen))'),
            `${name} periodic polling should pause while its chip is hidden`
        );
    }
});

test('CPU periodic sampling pauses while its chip and popup are hidden', async () => {
    const cpu = await readFile(new URL('../modules/cpu.js', import.meta.url), 'utf8');
    assert.match(
        cpu,
        /let timerId = GLib\.timeout_add_seconds\(GLib\.PRIORITY_DEFAULT, 2, \(\) => \{[\s\S]*?if \(isSessionLocked\(\) \|\| \(!button\.mapped && !menu\.isOpen\)\)[\s\S]*?primed = false;[\s\S]*?prevCores = \[\];[\s\S]*?updateLabels\(\);/
    );
});

test('system metric polling also pauses while GNOME is locked', () => {
    assert.match(shellCompat, /Main\.sessionMode\.isLocked/);
    for (const [name, source] of modules) {
        assert.ok(
            source.includes('isSessionLocked() || (!button.mapped && !menu.isOpen)'),
            `${name} periodic polling should pause during the lock screen`
        );
    }
});

test('manual refresh remains available when opening directly refreshed module popups', () => {
    for (const name of ['gpu', 'disk', 'memory']) {
        const source = modules.find(([moduleName]) => moduleName === name)[1];
        assert.match(
            source,
            /button\.connect\('clicked',[\s\S]*?refresh\(\)/,
            `${name} should refresh on direct interaction`
        );
    }

    const battery = modules.find(([name]) => name === 'battery')[1];
    assert.match(
        battery,
        /menu\.connect\('open-state-changed',[\s\S]*?if \(open\)[\s\S]*?refresh\(\)/,
        'battery should refresh when its popup opens'
    );
});

test('Bluetooth headset discovery pauses on the lock screen, including forced refreshes', async () => {
    const bluetooth = await readFile(new URL('../modules/btConnected.js', import.meta.url), 'utf8');
    assert.match(bluetooth, /import \{menuOpen, menuClose, isSessionLocked\} from '\.\.\/lib\/shellCompat\.js'/);
    assert.match(bluetooth, /if \(isSessionLocked\(\) \|\| \(!force && !button\.is_mapped && !menu\.isOpen\)\)/);
});

test('profile card uptime sampling pauses while its popup is hidden or the session is locked', async () => {
    const profile = await readFile(new URL('../modules/profileCard.js', import.meta.url), 'utf8');
    assert.match(profile, /import \{isSessionLocked\} from '\.\.\/lib\/shellCompat\.js'/);
    assert.match(profile, /if \(isSessionLocked\(\) \|\| !row\.is_mapped\)\s*return GLib\.SOURCE_CONTINUE/);
    assert.match(profile, /const initialUptime = readUptimeSeconds\(\)/);
});
