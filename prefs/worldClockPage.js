import {
    formatWorldClockEntries,
    normalizeWorldClockEntries,
    parseWorldClockEntries,
    parseWorldClockZoneTab,
} from '../lib/worldClock.js';

export function buildWorldClockPage({Adw, Gtk, GLib, config, saveConfig, window, groupParent}) {
        const worldClockGroup = new Adw.PreferencesGroup({
            title: 'World Clock',
            description: 'Search the system time-zone database to add cities. Reorder or remove saved cities in the list below.'
        });
        groupParent.add(worldClockGroup);
        let worldClockChoices = [];
        try {
            const [loaded, bytes] = GLib.file_get_contents('/usr/share/zoneinfo/zone.tab');
            if (loaded)
                worldClockChoices = parseWorldClockZoneTab(new TextDecoder().decode(bytes));
        } catch (e) {
            // The manual IANA time-zone editor below remains available without tzdata.
        }
        const worldClockChoiceModel = Gtk.StringList.new(worldClockChoices.map(choice =>
            `${choice.name} — ${choice.timeZone}`));
        const worldClockChoiceDropDown = new Gtk.DropDown({
            model: worldClockChoiceModel,
            enable_search: true,
            valign: Gtk.Align.CENTER,
            sensitive: worldClockChoices.length > 0,
        });
        const worldClockAddRow = new Adw.ActionRow({
            title: 'Find a city',
            subtitle: worldClockChoices.length
                ? 'Search by city or time-zone name, then add it to the Clock popup.'
                : 'System time-zone database unavailable; use the manual list below.',
        });
        const worldClockAddButton = new Gtk.Button({
            label: 'Add',
            valign: Gtk.Align.CENTER,
            sensitive: worldClockChoices.length > 0,
        });
        const worldClockRow = new Adw.EntryRow({
            title: 'Cities and time zones (up to 12)',
            text: formatWorldClockEntries(config.worldClocks),
            show_apply_button: true,
        });
        worldClockRow.connect('apply', () => {
            if (syncingExternal)
                return;
            const parsed = parseWorldClockEntries(worldClockRow.get_text());
            if (parsed === null) {
                window.add_toast(new Adw.Toast({
                    title: 'Use unique City|IANA/Time_Zone entries (up to 12)',
                }));
                worldClockRow.set_text(formatWorldClockEntries(config.worldClocks));
                return;
            }
            config.worldClocks = parsed;
            saveConfig();
            worldClockRow.set_text(formatWorldClockEntries(parsed));
            window.add_toast(new Adw.Toast({
                title: parsed.length ? `${parsed.length} world clocks saved` : 'World clocks cleared',
            }));
        });
        worldClockGroup.add(worldClockRow);
        worldClockAddButton.connect('clicked', () => {
            if (syncingExternal)
                return;
            const choice = worldClockChoices[worldClockChoiceDropDown.get_selected()];
            if (!choice)
                return;
            const current = normalizeWorldClockEntries(config.worldClocks);
            if (current.some(entry => entry.timeZone === choice.timeZone)) {
                window.add_toast(new Adw.Toast({title: `${choice.name} is already saved`}));
                return;
            }
            if (current.length >= 12) {
                window.add_toast(new Adw.Toast({title: 'World Clock supports up to 12 cities'}));
                return;
            }
            config.worldClocks = normalizeWorldClockEntries([...current, choice]);
            saveConfig();
            worldClockRow.set_text(formatWorldClockEntries(config.worldClocks));
            window.add_toast(new Adw.Toast({title: `${choice.name} added to World Clock`}));
        });
        worldClockAddRow.add_suffix(worldClockChoiceDropDown);
        worldClockAddRow.add_suffix(worldClockAddButton);
        worldClockGroup.add(worldClockAddRow);


}
