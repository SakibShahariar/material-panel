import {normalizeQuickLaunchEntries} from '../lib/quickLaunch.js';

function iconIsValid(value) {
    return !value || /^[A-Za-z0-9][A-Za-z0-9-]{0,79}$/.test(value);
}

function commandIsValid(GLib, value) {
    if (typeof value !== 'string' || !value.trim() || value.length > 512 ||
        /[\\u0000-\\u001f\\u007f]/.test(value))
        return false;
    try {
        const [ok, argv] = GLib.shell_parse_argv(value);
        return ok && Array.isArray(argv) && argv.length > 0;
    } catch (error) {
        return false;
    }
}

/** Build the optional user-configured Quick Settings shortcut editor. */
export function buildQuickLaunchPage({Adw, Gtk, Gio, GLib, config, saveConfig, window, addPreferencesPage}) {
    config.quickLaunch = normalizeQuickLaunchEntries(config.quickLaunch);

    const page = new Adw.PreferencesPage({
        title: 'Quick Launch',
        icon_name: 'system-run-symbolic',
    });
    addPreferencesPage(page);

    const description = new Adw.PreferencesGroup({
        title: 'Quick launch',
        description: 'Add application shortcuts or commands to Quick Settings. Add an off command to make a command a toggle; its state changes only after successful execution and resets when the extension reloads.',
    });
    page.add(description);

    const appInfos = [];
    const seenAppIds = new Set();
    try {
        for (const app of Gio.AppInfo.get_all()) {
            const id = app.get_id?.();
            if (!id || seenAppIds.has(id) || !app.should_show?.())
                continue;
            seenAppIds.add(id);
            appInfos.push({id, name: app.get_display_name?.() || id});
        }
    } catch (error) {
        console.error('material-panel prefs: could not enumerate installed applications', error);
    }
    appInfos.sort((a, b) => a.name.localeCompare(b.name));

    const appRow = new Adw.ActionRow({
        title: 'Installed application',
        subtitle: 'Choose an application from the desktop application list.',
    });
    const appModel = Gtk.StringList.new(appInfos.map(app => app.name));
    const appDropDown = new Gtk.DropDown({model: appModel, valign: Gtk.Align.CENTER});
    appDropDown.set_size_request(190, -1);
    appDropDown.sensitive = appInfos.length > 0;
    const addAppButton = new Gtk.Button({
        label: 'Add',
        valign: Gtk.Align.CENTER,
        sensitive: appInfos.length > 0,
    });
    appRow.add_suffix(appDropDown);
    appRow.add_suffix(addAppButton);
    description.add(appRow);

    const commandRow = new Adw.EntryRow({
        title: 'Command (executable and arguments)',
    });
    const addCommandButton = new Gtk.Button({
        label: 'Add',
        valign: Gtk.Align.CENTER,
    });
    commandRow.add_suffix(addCommandButton);
    description.add(commandRow);

    const offCommandRow = new Adw.EntryRow({
        title: 'Off command (optional toggle)',
    });
    description.add(offCommandRow);

    const iconRow = new Adw.EntryRow({
        title: 'Symbolic icon name (optional)',
    });
    description.add(iconRow);

    const commandHint = new Adw.ActionRow({
        title: 'Command safety',
        subtitle: 'Commands run directly without a shell and stop after 30 seconds. For toggles, the off command runs when active; state changes only after a successful exit. Pipes, redirects, substitutions, and shell expansion are not supported.',
    });
    description.add(commandHint);

    const entriesGroup = new Adw.PreferencesGroup({
        title: 'Configured shortcuts',
        description: 'Reorder shortcuts to control their display order in Quick Settings.',
    });
    page.add(entriesGroup);
    let renderedRows = [];

    const notify = title => {
        try { window.add_toast(new Adw.Toast({title})); } catch (error) {}
    };
    const persist = () => {
        config.quickLaunch = normalizeQuickLaunchEntries(config.quickLaunch);
        saveConfig();
        refresh();
    };
    const editEntry = entry => {
        const editor = new Gtk.Entry({
            text: entry.type === 'app' ? entry.name : entry.target,
            hexpand: true,
            activates_default: true,
        });
        const offEditor = new Gtk.Entry({
            text: entry.offTarget ?? '',
            placeholder_text: 'Off command (optional toggle)',
            hexpand: true,
        });
        const iconEditor = new Gtk.Entry({
            text: entry.icon ?? '',
            placeholder_text: 'Symbolic icon name (optional)',
            hexpand: true,
        });
        const editorBox = new Gtk.Box({orientation: Gtk.Orientation.VERTICAL, spacing: 8});
        editorBox.append(editor);
        if (entry.type === 'command')
            editorBox.append(offEditor);
        editorBox.append(iconEditor);
        const dialog = new Adw.MessageDialog({
            transient_for: window,
            modal: true,
            heading: entry.type === 'app' ? 'Edit shortcut label' : 'Edit command',
            body: entry.type === 'app'
                ? 'Change the name shown in Quick Settings.'
                : 'Enter an executable and optional arguments. This is parsed without a shell.',
        });
        dialog.set_extra_child(editorBox);
        dialog.add_response('cancel', 'Cancel');
        dialog.add_response('save', 'Save');
        dialog.set_response_appearance('save', Adw.ResponseAppearance.SUGGESTED);
        dialog.set_default_response('save');
        dialog.connect('response', (_dialog, response) => {
            if (response === 'save') {
                const value = editor.get_text().trim();
                const offTarget = entry.type === 'command' ? offEditor.get_text().trim() : '';
                const icon = iconEditor.get_text().trim();
                if (!value) {
                    notify('A shortcut value is required');
                } else if (entry.type === 'command' && !commandIsValid(GLib, value)) {
                    notify('Enter a valid executable and arguments (maximum 512 characters)');
                } else if (offTarget && !commandIsValid(GLib, offTarget)) {
                    notify('Enter a valid off command (maximum 512 characters)');
                } else if (offTarget && offTarget === value) {
                    notify('Use a different command for the off action');
                } else if (entry.type === 'command' && config.quickLaunch.some(item =>
                    item.id !== entry.id && item.type === 'command' && item.target === value)) {
                    notify('That command is already in Quick Launch');
                } else if (!iconIsValid(icon)) {
                    notify('Use a symbolic icon name, not a file path');
                } else {
                    const current = config.quickLaunch.find(item => item.id === entry.id);
                    if (current) {
                        if (entry.type === 'app') {
                            current.name = value.slice(0, 80);
                        } else {
                            current.target = value.slice(0, 512);
                            current.name = value.slice(0, 80);
                            if (offTarget)
                                current.offTarget = offTarget.slice(0, 512);
                            else
                                delete current.offTarget;
                        }
                        if (icon)
                            current.icon = icon;
                        else
                            delete current.icon;
                        persist();
                    }
                }
            }
            dialog.close();
        });
        dialog.present();
    };

    function refresh() {
        for (const row of renderedRows) {
            try { entriesGroup.remove(row); } catch (error) {}
        }
        renderedRows = [];
        const entries = normalizeQuickLaunchEntries(config.quickLaunch);
        config.quickLaunch = entries;
        if (!entries.length) {
            const empty = new Adw.ActionRow({
                title: 'No shortcuts configured',
                subtitle: 'Add an installed application or a command above.',
            });
            entriesGroup.add(empty);
            renderedRows.push(empty);
            return;
        }
        entries.forEach((entry, index) => {
            const row = new Adw.ActionRow({
                title: entry.name,
                subtitle: entry.type === 'app'
                    ? `Application · ${entry.target}`
                    : entry.offTarget
                        ? `Toggle · on: ${entry.target} · off: ${entry.offTarget}`
                        : `Command · ${entry.target}`,
            });
            const edit = new Gtk.Button({
                icon_name: 'document-edit-symbolic',
                tooltip_text: 'Edit shortcut',
                valign: Gtk.Align.CENTER,
                css_classes: ['flat'],
            });
            edit.connect('clicked', () => editEntry(entry));
            const up = new Gtk.Button({
                icon_name: 'go-up-symbolic',
                tooltip_text: 'Move up',
                valign: Gtk.Align.CENTER,
                css_classes: ['flat'],
                sensitive: index > 0,
            });
            up.connect('clicked', () => {
                const list = config.quickLaunch;
                const [item] = list.splice(index, 1);
                list.splice(index - 1, 0, item);
                persist();
            });
            const down = new Gtk.Button({
                icon_name: 'go-down-symbolic',
                tooltip_text: 'Move down',
                valign: Gtk.Align.CENTER,
                css_classes: ['flat'],
                sensitive: index < entries.length - 1,
            });
            down.connect('clicked', () => {
                const list = config.quickLaunch;
                const [item] = list.splice(index, 1);
                list.splice(index + 1, 0, item);
                persist();
            });
            const remove = new Gtk.Button({
                icon_name: 'user-trash-symbolic',
                tooltip_text: 'Remove shortcut',
                valign: Gtk.Align.CENTER,
                css_classes: ['flat'],
            });
            remove.connect('clicked', () => {
                config.quickLaunch = config.quickLaunch.filter(item => item.id !== entry.id);
                persist();
            });
            row.add_suffix(edit);
            row.add_suffix(up);
            row.add_suffix(down);
            row.add_suffix(remove);
            entriesGroup.add(row);
            renderedRows.push(row);
        });
    }

    addAppButton.connect('clicked', () => {
        const app = appInfos[appDropDown.get_selected()];
        if (!app)
            return;
        const icon = iconRow.get_text().trim();
        if (!iconIsValid(icon)) {
            notify('Use a symbolic icon name, not a file path');
            return;
        }
        if (config.quickLaunch.some(entry => entry.type === 'app' && entry.target === app.id)) {
            notify('That application is already in Quick Launch');
            return;
        }
        if (config.quickLaunch.length >= 12) {
            notify('Quick Launch supports up to 12 shortcuts');
            return;
        }
        config.quickLaunch.push({
            id: GLib.uuid_string_random(),
            type: 'app',
            target: app.id,
            name: app.name,
            ...(icon ? {icon} : {}),
        });
        iconRow.set_text('');
        persist();
    });

    addCommandButton.connect('clicked', () => {
        const target = commandRow.get_text().trim();
        const icon = iconRow.get_text().trim();
        if (!iconIsValid(icon)) {
            notify('Use a symbolic icon name, not a file path');
            return;
        }
        const offTarget = offCommandRow.get_text().trim();
        if (!target || !commandIsValid(GLib, target)) {
            notify('Enter a valid executable and arguments');
            return;
        }
        if (offTarget && !commandIsValid(GLib, offTarget)) {
            notify('Enter a valid off command (maximum 512 characters)');
            return;
        }
        if (offTarget && offTarget === target) {
            notify('Use a different command for the off action');
            return;
        }
        if (config.quickLaunch.some(entry => entry.type === 'command' && entry.target === target)) {
            notify('That command is already in Quick Launch');
            return;
        }
        if (config.quickLaunch.length >= 12) {
            notify('Quick Launch supports up to 12 shortcuts');
            return;
        }
        config.quickLaunch.push({
            id: GLib.uuid_string_random(),
            type: 'command',
            target,
            name: target.slice(0, 80),
            ...(offTarget ? {offTarget} : {}),
            ...(icon ? {icon} : {}),
        });
        commandRow.set_text('');
        offCommandRow.set_text('');
        iconRow.set_text('');
        persist();
    });

    refresh();
    return {refresh};
}
