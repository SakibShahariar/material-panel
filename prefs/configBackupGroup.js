import {parsePanelConfig, serializePanelConfig} from '../lib/configImportExport.js';

/** Build the validated configuration backup controls for the General page. */
export function buildConfigurationBackupGroup({Adw, Gtk, Gio, window, store, onImport}) {
    const backupGroup = new Adw.PreferencesGroup({
        title: 'Configuration backup',
        description: 'Export all panel settings, including module placement and theme/icon paths, or import a validated backup.',
    });
    const exportConfigRow = new Adw.ActionRow({
        title: 'Export configuration',
        subtitle: 'Save the complete config.json as a JSON backup',
    });
    const exportConfigButton = new Gtk.Button({
        label: 'Export',
        valign: Gtk.Align.CENTER,
    });
    exportConfigButton.connect('clicked', async () => {
        let data;
        try {
            data = serializePanelConfig(await store.loadAsync());
        } catch (e) {
            logError(e, 'material-panel prefs: config export validation failed');
            window.add_toast(new Adw.Toast({title: 'Could not export configuration'}));
            return;
        }
        const chooser = new Gtk.FileChooserNative({
            title: 'Export Material Panel configuration',
            transient_for: window,
            action: Gtk.FileChooserAction.SAVE,
            accept_label: 'Export',
            cancel_label: 'Cancel',
        });
        chooser.set_current_name('material-panel-config.json');
        chooser.connect('response', (_dialog, response) => {
            if (response !== Gtk.ResponseType.ACCEPT) {
                chooser.destroy();
                return;
            }
            const file = chooser.get_file();
            chooser.destroy();
            if (!file)
                return;
            file.replace_contents_async(
                data, null, false, Gio.FileCreateFlags.REPLACE_DESTINATION,
                null, (source, result) => {
                    try {
                        source.replace_contents_finish(result);
                        window.add_toast(new Adw.Toast({title: 'Configuration exported'}));
                    } catch (e) {
                        logError(e, 'material-panel prefs: config export failed');
                        window.add_toast(new Adw.Toast({title: 'Configuration export failed'}));
                    }
                });
        });
        chooser.show();
    });
    exportConfigRow.add_suffix(exportConfigButton);
    backupGroup.add(exportConfigRow);

    const importConfigRow = new Adw.ActionRow({
        title: 'Import configuration',
        subtitle: 'Validate a backup before replacing the current settings',
    });
    const importConfigButton = new Gtk.Button({
        label: 'Import',
        valign: Gtk.Align.CENTER,
    });
    importConfigButton.connect('clicked', () => {
        const chooser = new Gtk.FileChooserNative({
            title: 'Import Material Panel configuration',
            transient_for: window,
            action: Gtk.FileChooserAction.OPEN,
            accept_label: 'Import',
            cancel_label: 'Cancel',
        });
        chooser.connect('response', (_dialog, response) => {
            if (response !== Gtk.ResponseType.ACCEPT) {
                chooser.destroy();
                return;
            }
            const file = chooser.get_file();
            chooser.destroy();
            if (!file)
                return;
            file.load_contents_async(null, (source, result) => {
                try {
                    const [ok, bytes] = source.load_contents_finish(result);
                    if (!ok)
                        throw new Error('Could not read the selected configuration');
                    const parsed = parsePanelConfig(new TextDecoder('utf-8').decode(bytes));
                    const imported = store._normalizeParsedConfig(parsed, {persistCleanup: false});
                    if (!imported.presets?.[imported.activePreset])
                        throw new Error('The imported active preset is missing');
                    Promise.resolve(onImport(imported)).then(() => {
                        window.add_toast(new Adw.Toast({title: 'Configuration imported'}));
                    }).catch(error => {
                        logError(error, 'material-panel prefs: config import apply failed');
                        window.add_toast(new Adw.Toast({title: 'Configuration import failed'}));
                    });
                } catch (e) {
                    logError(e, 'material-panel prefs: config import validation failed');
                    window.add_toast(new Adw.Toast({title: 'Invalid configuration file'}));
                }
            });
        });
        chooser.show();
    });
    importConfigRow.add_suffix(importConfigButton);
    backupGroup.add(importConfigRow);
    return backupGroup;
}
