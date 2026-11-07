export function buildClipboardHistoryPage({
    Adw, Gtk, GLib, config, saveConfig, window, addPreferencesPage,
}) {
    config.clipboardHistoryEnabled ??= false;
    config.clipboardHistoryPaused ??= false;
    config.clipboardHistoryClearToken ??= '';

    const page = new Adw.PreferencesPage({
        title: 'Clipboard History',
        icon_name: 'edit-paste-symbolic',
    });
    addPreferencesPage(page);

    const captureGroup = new Adw.PreferencesGroup({
        title: 'Private clipboard history',
        description: 'Copied plain text is stored locally on this device. Capture is disabled until you explicitly enable it.',
    });
    page.add(captureGroup);

    const enabledRow = new Adw.ActionRow({
        title: 'Enable clipboard history',
        subtitle: 'Record future copies only. The clipboard contents present when enabling are not imported.',
    });
    const enabledSwitch = new Gtk.Switch({
        active: config.clipboardHistoryEnabled === true,
        valign: Gtk.Align.CENTER,
    });
    enabledRow.add_suffix(enabledSwitch);
    enabledRow.activatable_widget = enabledSwitch;
    captureGroup.add(enabledRow);

    const pauseRow = new Adw.ActionRow({
        title: 'Pause recording',
        subtitle: 'Keep existing entries but stop capturing new copies. Use this before copying sensitive material.',
    });
    const pauseSwitch = new Gtk.Switch({
        active: config.clipboardHistoryPaused === true,
        valign: Gtk.Align.CENTER,
        sensitive: config.clipboardHistoryEnabled === true,
    });
    pauseRow.add_suffix(pauseSwitch);
    pauseRow.activatable_widget = pauseSwitch;
    captureGroup.add(pauseRow);

    const limitsGroup = new Adw.PreferencesGroup({
        title: 'Retention limits',
        description: 'History is bounded and older entries are removed automatically.',
    });
    page.add(limitsGroup);
    limitsGroup.add(new Adw.ActionRow({
        title: 'Maximum history',
        subtitle: '50 entries · 7 days · 256 KiB per text entry',
    }));

    const privacyGroup = new Adw.PreferencesGroup({
        title: 'Privacy and storage',
        description: 'History stays in a private local data directory. It is not included in configuration exports, presets, telemetry, or network requests. Clipboard history is not encrypted at rest.',
    });
    page.add(privacyGroup);
    privacyGroup.add(new Adw.ActionRow({
        title: 'Application exclusions unavailable',
        subtitle: 'GNOME does not expose a reliable source application ID with clipboard ownership changes. Pause recording before copying passwords or other sensitive information.',
    }));

    const clearRow = new Adw.ActionRow({
        title: 'Clear clipboard history',
        subtitle: 'Permanently delete every saved entry from this device.',
    });
    const clearButton = new Gtk.Button({
        label: 'Clear history',
        css_classes: ['destructive-action'],
        valign: Gtk.Align.CENTER,
        sensitive: config.clipboardHistoryEnabled === true,
    });
    clearButton.connect('clicked', () => {
        const dialog = new Adw.AlertDialog({
            heading: 'Clear clipboard history?',
            body: 'All saved clipboard entries will be permanently deleted. This cannot be undone.',
        });
        dialog.add_response('cancel', 'Cancel');
        dialog.add_response('clear', 'Clear history');
        dialog.set_response_appearance('clear', Adw.ResponseAppearance.DESTRUCTIVE);
        dialog.set_default_response('cancel');
        dialog.connect('response', (_dialog, response) => {
            if (response !== 'clear')
                return;
            config.clipboardHistoryClearToken = GLib.uuid_string_random();
            saveConfig();
            window.add_toast(new Adw.Toast({title: 'Clipboard history clear requested'}));
        });
        dialog.present(window);
    });
    clearRow.add_suffix(clearButton);
    privacyGroup.add(clearRow);

    const refresh = () => {
        enabledSwitch.active = config.clipboardHistoryEnabled === true;
        pauseSwitch.active = config.clipboardHistoryPaused === true;
        pauseSwitch.sensitive = config.clipboardHistoryEnabled === true;
        clearButton.sensitive = config.clipboardHistoryEnabled === true;
    };
    enabledSwitch.connect('notify::active', () => {
        config.clipboardHistoryEnabled = enabledSwitch.active;
        if (!enabledSwitch.active)
            config.clipboardHistoryPaused = false;
        refresh();
        saveConfig();
    });
    pauseSwitch.connect('notify::active', () => {
        if (!config.clipboardHistoryEnabled)
            return;
        config.clipboardHistoryPaused = pauseSwitch.active;
        saveConfig();
    });

    return {refresh};
}
