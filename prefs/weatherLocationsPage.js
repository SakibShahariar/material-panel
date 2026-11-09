import {formatWeatherLocations, parseWeatherLocations} from '../lib/weatherLocations.js';

export function buildWeatherLocationsPage({Adw, Gtk, config, saveConfig, window, groupParent, isSyncingExternal}) {
        const weatherGroup = new Adw.PreferencesGroup({
            title: 'Weather location',
            description: 'Optional manual override. Coordinates are decimal degrees; leave both empty to use GNOME Weather. Saved locations use Name|latitude|longitude entries separated by semicolons. No IP geolocation is used.',
        });
        groupParent.add(weatherGroup);
        config.weatherLocation ??= {mode: 'gnome', name: '', latitude: '', longitude: ''};
        const weatherModeMap = ['gnome', 'manual', 'disabled'];
        const weatherModeRow = new Adw.ComboRow({
            title: 'Location source',
            subtitle: 'No IP-based geolocation requests are made.',
            model: Gtk.StringList.new([
                'GNOME Weather location',
                'Manual coordinates',
                'Disabled (no automatic lookup)',
            ]),
        });
        const initialWeatherMode = config.weatherLocation.mode ??
            (String(config.weatherLocation.latitude ?? '').trim() &&
             String(config.weatherLocation.longitude ?? '').trim() ? 'manual' : 'gnome');
        weatherModeRow.set_selected(Math.max(0, weatherModeMap.indexOf(initialWeatherMode)));
        weatherModeRow.connect('notify::selected', () => {
            if (isSyncingExternal()) return;
            config.weatherLocation = {
                ...config.weatherLocation,
                mode: weatherModeMap[weatherModeRow.get_selected()] ?? 'gnome',
            };
            saveConfig();
        });
        weatherGroup.add(weatherModeRow);
        const weatherName = new Adw.EntryRow({
            title: 'City or location name',
            text: String(config.weatherLocation.name ?? ''),
        });
        const weatherLatitude = new Adw.EntryRow({
            title: 'Latitude',
            text: String(config.weatherLocation.latitude ?? ''),
        });
        const weatherLongitude = new Adw.EntryRow({
            title: 'Longitude',
            text: String(config.weatherLocation.longitude ?? ''),
        });
        weatherGroup.add(weatherName);
        weatherGroup.add(weatherLatitude);
        weatherGroup.add(weatherLongitude);
        const weatherActions = new Adw.ActionRow({
            title: 'Manual location',
            subtitle: 'Save coordinates to use this location instead of GNOME Weather.',
        });
        const weatherSave = new Gtk.Button({
            label: 'Save',
            valign: Gtk.Align.CENTER,
        });
        weatherSave.connect('clicked', () => {
            if (isSyncingExternal()) return;
            const latitude = weatherLatitude.text.trim();
            const longitude = weatherLongitude.text.trim();
            const name = weatherName.text.trim();
            if (latitude || longitude) {
                const lat = Number(latitude);
                const lon = Number(longitude);
                if (!latitude || !longitude || !Number.isFinite(lat) || !Number.isFinite(lon) ||
                    lat < -90 || lat > 90 || lon < -180 || lon > 180) {
                    window.add_toast(new Adw.Toast({title: 'Enter valid latitude and longitude'}));
                    return;
                }
            }
            config.weatherLocation = {
                ...config.weatherLocation,
                mode: latitude && longitude ? 'manual' : 'gnome',
                name, latitude, longitude,
            };
            weatherModeRow.set_selected(latitude && longitude ? 1 : 0);
            saveConfig();
            window.add_toast(new Adw.Toast({
                title: latitude && longitude ? 'Manual weather location saved' : 'Using GNOME Weather location',
            }));
        });
        weatherActions.add_suffix(weatherSave);
        weatherActions.activatable_widget = weatherSave;
        weatherGroup.add(weatherActions);

        const savedWeatherLocationsRow = new Adw.EntryRow({
            title: 'Saved locations (2–8)',
            text: formatWeatherLocations(config.weatherLocations),
            show_apply_button: true,
        });
        savedWeatherLocationsRow.connect('apply', () => {
            if (isSyncingExternal()) return;
            const parsed = parseWeatherLocations(savedWeatherLocationsRow.get_text());
            if (parsed === null) {
                window.add_toast(new Adw.Toast({
                    title: 'Enter 2–8 distinct locations as Name|latitude|longitude',
                }));
                savedWeatherLocationsRow.set_text(formatWeatherLocations(config.weatherLocations));
                return;
            }
            config.weatherLocations = parsed;
            saveConfig();
            savedWeatherLocationsRow.set_text(formatWeatherLocations(parsed));
            window.add_toast(new Adw.Toast({
                title: parsed.length ? `${parsed.length} weather locations saved` : 'Saved locations cleared',
            }));
        });
        weatherGroup.add(savedWeatherLocationsRow);


}
