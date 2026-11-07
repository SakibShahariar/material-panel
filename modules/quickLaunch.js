import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {getThemeColor} from '../lib/themeColorState.js';
import {setChipA11y} from '../lib/a11y.js';
import {getQuickLaunchEntries} from '../lib/quickLaunchState.js';
import {QUICK_LAUNCH_TIMEOUT_SECONDS} from '../lib/quickLaunch.js';
import {launchQuickLaunchEntry} from '../lib/quickLaunchRunner.js';

function commandArgv(command) {
    const [ok, argv] = GLib.shell_parse_argv(command);
    if (!ok || !Array.isArray(argv) || argv.length === 0)
        throw new Error('Enter an executable followed by optional arguments.');
    return argv;
}

function notifyLaunchFailure(entry, error) {
    const detail = error?.message || String(error);
    try {
        Main.notifyError('Quick launch failed', `${entry.name}: ${detail}`);
    } catch (notifyError) {
        logError(error, `material-panel: quick launch ${entry.id}`);
    }
}

function launchEntry(entry) {
    launchQuickLaunchEntry(entry, {
        getDesktopAppInfo: id => Gio.DesktopAppInfo.new(id),
        parseCommand: command => commandArgv(command),
        // Parsed argv is passed directly to GSubprocess; no shell is created.
        // Commands are bounded so a hung action cannot run indefinitely.
        spawnCommand: argv => {
            const process = Gio.Subprocess.new(
                argv,
                Gio.SubprocessFlags.STDOUT_SILENCE | Gio.SubprocessFlags.STDERR_SILENCE);
            let timedOut = false;
            const timeoutId = GLib.timeout_add_seconds(
                GLib.PRIORITY_DEFAULT,
                QUICK_LAUNCH_TIMEOUT_SECONDS,
                () => {
                    timedOut = true;
                    process.force_exit();
                    return GLib.SOURCE_REMOVE;
                });
            process.wait_async(null, (subprocess, result) => {
                if (timeoutId)
                    GLib.source_remove(timeoutId);
                try {
                    subprocess.wait_finish(result);
                    if (timedOut) {
                        notifyLaunchFailure(entry, new Error(
                            `Command exceeded the ${QUICK_LAUNCH_TIMEOUT_SECONDS}-second time limit.`));
                    } else if (subprocess.get_successful()) {
                        Main.notify('Quick launch completed', entry.name);
                    } else {
                        notifyLaunchFailure(entry, new Error('Command exited unsuccessfully.'));
                    }
                } catch (error) {
                    notifyLaunchFailure(entry, error);
                }
            });
        },
        onError: (failedEntry, error) => notifyLaunchFailure(failedEntry, error),
    });
}

export function buildQuickLaunchSection() {
    const entries = getQuickLaunchEntries();
    if (!entries.length)
        return null;

    const root = new St.BoxLayout({
        orientation: Clutter.Orientation.VERTICAL,
        x_expand: true,
        style_class: 'material-panel-qs-section material-panel-qs-quick-launch',
    });
    const heading = new St.Label({
        text: 'Quick launch',
        style_class: 'material-panel-qs-section-title',
        x_align: Clutter.ActorAlign.START,
    });
    root.add_child(heading);

    const grid = new St.Widget({
        x_expand: true,
        layout_manager: new Clutter.GridLayout({
            column_homogeneous: true,
            column_spacing: 8,
            row_spacing: 8,
        }),
    });

    entries.forEach((entry, index) => {
        let available = true;
        let unavailableReason = '';
        if (entry.type === 'app') {
            try {
                available = !!Gio.DesktopAppInfo.new(entry.target);
                if (!available)
                    unavailableReason = 'Application is not installed';
            } catch (error) {
                available = false;
                unavailableReason = 'Application is unavailable';
            }
        } else {
            try {
                commandArgv(entry.target);
            } catch (error) {
                available = false;
                unavailableReason = error.message;
            }
        }

        const button = new St.Button({
            reactive: available,
            can_focus: true,
            track_hover: available,
            x_expand: true,
            style_class: 'material-panel-qs-quick-launch-button',
        });
        button.set_child(new St.Label({
            text: entry.name,
            x_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
            style: 'font-size: 12px; font-weight: 600;',
        }));
        try {
            const surface = getThemeColor('qsSurface', 'rgba(56, 59, 76, 0.9)');
            button.style = `background-color: ${surface}; border-radius: 14px; padding: 9px 10px; min-height: 42px;`;
        } catch (error) {}
        setChipA11y(button, available ? `Launch ${entry.name}` : `${entry.name}, unavailable`);
        if (!available) {
            button.opacity = 150;
            button.set_tooltip_text(unavailableReason);
        } else {
            button.set_tooltip_text(`Launch ${entry.name}`);
            button.connect('clicked', () => launchEntry(entry));
        }
        grid.layout_manager.attach(button, index % 2, Math.floor(index / 2), 1, 1);
    });

    root.add_child(grid);
    return root;
}
