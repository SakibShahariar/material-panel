export function buildClipboardHistoryPage({
    Adw, Gtk, GLib, config, saveConfig, window, addPreferencesPage,
}) {
    config.clipboardHistoryEnabled ??= false;
    config.clipboardHistoryPaused ??= false;
    config.clipboardHistoryClearToken ??= '';
    config.clipboardHistoryMaxEntries ??= 50;
    config.clipboardHistoryMaxAgeDays ??= 7;

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
    const maxEntriesRow = new Adw.ActionRow({
        title: 'Maximum entries',
        subtitle: 'Keep between 10 and 50 recent text entries.',
    });
    const maxEntriesSpin = new Gtk.SpinButton({
        adjustment: new Gtk.Adjustment({
            lower: 10, upper: 50, step_increment: 5, page_increment: 10,
            value: config.clipboardHistoryMaxEntries,
        }),
        numeric: true,
        digits: 0,
        valign: Gtk.Align.CENTER,
    });
    maxEntriesRow.add_suffix(maxEntriesSpin);
    limitsGroup.add(maxEntriesRow);

    const maxAgeRow = new Adw.ActionRow({
        title: 'Retention period',
        subtitle: 'Automatically remove entries after 1 to 7 days.',
    });
    const maxAgeSpin = new Gtk.SpinButton({
        adjustment: new Gtk.Adjustment({
            lower: 1, upper: 7, step_increment: 1, page_increment: 1,
            value: config.clipboardHistoryMaxAgeDays,
        }),
        numeric: true,
        digits: 0,
        valign: Gtk.Align.CENTER,
    });
    maxAgeRow.add_suffix(maxAgeSpin);
    limitsGroup.add(maxAgeRow);

    limitsGroup.add(new Adw.ActionRow({
        title: 'Per-entry text limit',
        subtitle: '256 KiB · Plain text only · Images and files are ignored',
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

    let syncingLimits = false;
    const refresh = () => {
        syncingLimits = true;
        maxEntriesSpin.value = config.clipboardHistoryMaxEntries;
        maxAgeSpin.value = config.clipboardHistoryMaxAgeDays;
        syncingLimits = false;
        enabledSwitch.active = config.clipboardHistoryEnabled === true;
        pauseSwitch.active = config.clipboardHistoryPaused === true;
        pauseSwitch.sensitive = config.clipboardHistoryEnabled === true;
        clearButton.sensitive = config.clipboardHistoryEnabled === true;
    };
    maxEntriesSpin.connect('value-changed', () => {
        if (syncingLimits)
            return;
        config.clipboardHistoryMaxEntries = Math.max(10, Math.min(50, Math.round(maxEntriesSpin.value)));
        saveConfig();
    });
    maxAgeSpin.connect('value-changed', () => {
        if (syncingLimits)
            return;
        config.clipboardHistoryMaxAgeDays = Math.max(1, Math.min(7, Math.round(maxAgeSpin.value)));
        saveConfig();
    });
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
