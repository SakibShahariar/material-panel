import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {getThemeColor} from '../lib/themeColorState.js';
import {setChipA11y} from '../lib/a11y.js';
import {getQuickLaunchEntries, getQuickLaunchEntryRevision, setQuickLaunchEntryState} from '../lib/quickLaunchState.js';
import {QUICK_LAUNCH_TIMEOUT_SECONDS} from '../lib/quickLaunch.js';
import {describeQuickLaunchProcessFailure, launchQuickLaunchEntry, notifyQuickLaunchSuccess} from '../lib/quickLaunchRunner.js';

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

function notifyLaunchSuccess(entry, onSuccess = null) {
    notifyQuickLaunchSuccess(
        () => Main.notify('Quick launch completed', entry.name),
        onSuccess,
        error => logError(error, `material-panel: quick launch success notification ${entry.id}`),
    );
}

function launchEntry(entry, {commandTarget = entry.target, onComplete = null} = {}) {
    const launched = launchQuickLaunchEntry(entry, {
        getDesktopAppInfo: id => Gio.DesktopAppInfo.new(id),
        parseCommand: command => commandArgv(command),
        // Parsed argv is passed directly to GSubprocess; no shell is created.
        // Commands are bounded so a hung action cannot run indefinitely.
        spawnCommand: (argv, complete) => {
            const process = Gio.Subprocess.new(
                argv,
                Gio.SubprocessFlags.STDOUT_SILENCE | Gio.SubprocessFlags.STDERR_SILENCE);
            let timedOut = false;
            let timeoutId = 0;
            const finish = (success, error = null) => {
                try { complete?.(success, error); } catch (callbackError) {
                    logError(callbackError, `material-panel: quick launch completion ${entry.id}`);
                }
            };
            try {
                timeoutId = GLib.timeout_add_seconds(
                    GLib.PRIORITY_DEFAULT,
                    QUICK_LAUNCH_TIMEOUT_SECONDS,
                    () => {
                        timedOut = true;
                        timeoutId = 0;
                        try { process.force_exit(); } catch (error) {}
                        return GLib.SOURCE_REMOVE;
                    });
                if (!timeoutId)
                    throw new Error('Could not enforce the command time limit.');
            } catch (error) {
                try { process.force_exit(); } catch (stopError) {}
                throw error;
            }
            try {
                process.wait_async(null, (subprocess, result) => {
                    if (timeoutId) {
                        try { GLib.source_remove(timeoutId); } catch (error) {}
                        timeoutId = 0;
                    }
                    try {
                        subprocess.wait_finish(result);
                        if (timedOut) {
                            const error = new Error(
                                `Command exceeded the ${QUICK_LAUNCH_TIMEOUT_SECONDS}-second time limit.`);
                            notifyLaunchFailure(entry, error);
                            finish(false, error);
                        } else if (subprocess.get_successful()) {
                            notifyLaunchSuccess(entry, () => finish(true));
                        } else {
                            const didExit = subprocess.get_if_exited();
                            const didSignal = !didExit && subprocess.get_if_signaled();
                            const error = new Error(describeQuickLaunchProcessFailure({
                                didExit,
                                exitStatus: didExit ? subprocess.get_exit_status() : null,
                                didSignal,
                                termSignal: didSignal ? subprocess.get_term_sig() : null,
                            }));
                            notifyLaunchFailure(entry, error);
                            finish(false, error);
                        }
                    } catch (error) {
                        notifyLaunchFailure(entry, error);
                        finish(false, error);
                    }
                });
            } catch (error) {
                if (timeoutId) {
                    try { GLib.source_remove(timeoutId); } catch (removeError) {}
                    timeoutId = 0;
                }
                try { process.force_exit(); } catch (stopError) {}
                throw error;
            }
        },
        onError: (failedEntry, error) => notifyLaunchFailure(failedEntry, error),
        commandTarget,
        onComplete,
    });
    if (entry.type === 'app' && launched)
        notifyLaunchSuccess(entry);
    return launched;
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
                if (entry.offTarget)
                    commandArgv(entry.offTarget);
            } catch (error) {
                available = false;
                unavailableReason = error.message;
            }
        }

        const isToggle = entry.type === 'command' && Boolean(entry.offTarget);
        const entryRevision = getQuickLaunchEntryRevision(entry.id);
        let active = isToggle && entry.active === true;
        let busy = false;
        const button = new St.Button({
            reactive: available,
            can_focus: true,
            track_hover: available,
            x_expand: true,
            style_class: 'material-panel-qs-quick-launch-button',
        });
        const content = new St.BoxLayout({
            orientation: Clutter.Orientation.HORIZONTAL,
            x_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
            style: 'spacing: 8px;',
        });
        const iconActor = entry.icon || isToggle ? new St.Icon({
            icon_name: entry.icon || (active ? 'emblem-ok-symbolic' : 'system-run-symbolic'),
            icon_size: 16,
            y_align: Clutter.ActorAlign.CENTER,
        }) : null;
        if (iconActor)
            content.add_child(iconActor);
        const labelActor = new St.Label({
            text: entry.name,
            x_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
        });
        content.add_child(labelActor);
        button.set_child(content);
        const applyVisualState = () => {
            try {
                const background = active
                    ? getThemeColor('primary', '#89b4fa')
                    : getThemeColor('qsSurface', 'rgba(56, 59, 76, 0.9)');
                const foreground = active
                    ? getThemeColor('onPrimary', '#1e1e2e')
                    : getThemeColor('onSurface', '#cdd6f4');
                button.style = `background-color: ${background}; border-radius: 14px; padding: 9px 10px; min-height: 42px;`;
                labelActor.style = `font-size: 12px; font-weight: 600; color: ${foreground};`;
                if (iconActor) {
                    if (!entry.icon)
                        iconActor.icon_name = active ? 'emblem-ok-symbolic' : 'system-run-symbolic';
                    iconActor.style = `color: ${foreground};`;
                }
                setChipA11y(button, isToggle
                    ? `${entry.name}, ${active ? 'on' : 'off'}`
                    : `Launch ${entry.name}`);
                button.set_tooltip_text(isToggle
                    ? `${entry.name}: ${active ? 'On' : 'Off'} · Click to turn ${active ? 'off' : 'on'}`
                    : `Launch ${entry.name}`);
            } catch (error) {}
        };
        if (!available) {
            button.opacity = 150;
            button.set_tooltip_text(unavailableReason);
            setChipA11y(button, `${entry.name}, unavailable`);
        } else {
            applyVisualState();
            button.connect('clicked', () => {
                if (!isToggle) {
                    launchEntry(entry);
                    return;
                }
                if (busy)
                    return;
                const nextActive = !active;
                const commandTarget = nextActive ? entry.target : entry.offTarget;
                const transition = nextActive ? 'on' : 'off';
                busy = true;
                button.reactive = false;
                button.opacity = 170;
                setChipA11y(button, `${entry.name}, turning ${transition}`);
                button.set_tooltip_text(`${entry.name}: turning ${transition}…`);
                launchEntry(entry, {
                    commandTarget,
                    onComplete: success => {
                        busy = false;
                        try {
                            button.reactive = true;
                            button.opacity = 255;
                        } catch (error) {}
                        if (success && setQuickLaunchEntryState(entry.id, nextActive, {
                            target: entry.target,
                            offTarget: entry.offTarget,
                            revision: entryRevision,
                        }))
                            active = nextActive;
                        applyVisualState();
                    },
                });
            });
        }
        grid.layout_manager.attach(button, index % 2, Math.floor(index / 2), 1, 1);
    });

    root.add_child(grid);
    return root;
}
