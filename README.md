# Material Panel

A modern, configurable GNOME Shell panel with flexible module placement, Quick Settings, and support for third-party tray icons.

**GNOME Shell:** 49 · 50 · 51

> [!NOTE]
> Material Panel is actively developed. Some features are still in progress; see [known limitations](docs/KNOWN-LIMITATIONS.md) and [open issues](https://github.com/SakibShahariar/material-panel/issues). Automated tests do not replace testing inside GNOME Shell.

## Highlights

- **Your layout:** arrange modules in left, center, and right zones.
- **Personalized look:** tune panel sizing, slider and tile styles, and colors.
- **Quick Settings:** choose the default, End-4, or Ryoku implementation.
- **Everyday controls:** clock, weather, calendar, notifications, audio, Bluetooth, Wi-Fi, battery, system stats, media, and power actions.
- **Tray integration:** host supported third-party status icons, with an optional drawer.
- **Calendar sync:** optionally import events from an ICS feed.

## Install

From the repository directory:

```sh
mkdir -p ~/.local/share/gnome-shell/extensions
ln -s "$(pwd)" ~/.local/share/gnome-shell/extensions/material-panel@SakibShahariar
gnome-extensions enable material-panel@SakibShahariar
```

Open preferences with:

```sh
gnome-extensions prefs material-panel@SakibShahariar
```

For third-party tray icons, install a compatible GNOME extension such as **AppIndicator and KStatusNotifierItem Support** or **BetterTrayIcons**.

## Privacy and data handling

Material Panel is a local GNOME Shell extension. Its desktop integrations read information from the local GNOME session and system services; they do not require a Material Panel account. The extension does not provide cloud synchronization for panel settings.

### Network access

The current runtime network requests are limited to these optional integrations:

- **Weather:** when the Weather module is active, the extension requests forecast data from [Open-Meteo](https://open-meteo.com/). The request includes the configured coordinates: either the manual coordinates saved in preferences or the location selected in GNOME Weather. Material Panel does not use IP geolocation to guess a city. Remove the Weather module from the panel layout to stop its requests.
- **Calendar sync:** the optional ICS sync script requests the feed URL that you provide. The URL may be a private-calendar bearer link, so treat it as a password. Calendar sync is not required for the clock or calendar popup; without a feed, the popup can still display events from an existing local event file.

The extension also opens a calendar event's web link only when you activate that event. The icon-fetch scripts in `scripts/` are developer/maintenance tools; they contact their configured icon sources only when you run them, not as part of normal extension startup.

### Local data

- **Preferences:** `~/.config/material-panel/config.json` stores panel layout, appearance, module, and integration preferences. It can include a manually configured weather location.
- **Calendar feed secret:** `~/.config/material-panel/calendar-ics.url` stores the optional ICS URL when you use the file-based setup. The sync script attempts to restrict this file to owner-only permissions (`0600`). You can instead provide `MATERIAL_PANEL_ICS_URL` in the environment.
- **Calendar data:** the sync script writes imported event details to `$XDG_CACHE_HOME/material-panel/calendar-events.json` (normally `~/.cache/material-panel/calendar-events.json`) and stores HTTP cache validators alongside it. Event titles, times, locations, and meeting links from the feed are therefore present in the local cache. Older installs may still have `~/.config/material-panel/calendar-events.json`, which is read as a migration fallback.
- **Generated appearance assets:** recolored icons and generated theme files are stored in the Material Panel cache directory under `$XDG_CACHE_HOME/material-panel/` (normally `~/.cache/material-panel/`).

Other integrations, such as media controls, Bluetooth, Wi-Fi, audio, notifications, and system metrics, communicate with local desktop services or read local system interfaces. They are used to display or control the corresponding desktop state.

### Disabling and removing optional data

- **Weather:** remove the Weather module from your panel layout. If you use a manual location, you can also clear it in preferences.
- **Calendar sync:** if you installed the optional systemd user timer, stop and disable it with `systemctl --user disable --now material-panel-calendar-sync.timer`. Then remove `~/.config/material-panel/calendar-ics.url` or unset `MATERIAL_PANEL_ICS_URL` wherever you configured it. This stops future feed requests; it does not automatically erase previously imported events.
- **Calendar cache:** after disabling sync, remove `$XDG_CACHE_HOME/material-panel/calendar-events.json` and `$XDG_CACHE_HOME/material-panel/calendar-ics.http.json` if you also want to delete the imported events and HTTP validators. If `XDG_CACHE_HOME` is unset, use `~/.cache/material-panel/`. Remove the legacy `~/.config/material-panel/calendar-events.json` too if it exists and you no longer need it.
- **All Material Panel settings and generated cache:** uninstalling the extension does not automatically remove user data. To reset it completely, remove `~/.config/material-panel/` and `$XDG_CACHE_HOME/material-panel/` after backing up anything you want to keep.

## Test

Run the source-level regression tests:

```sh
python3 -m unittest discover -s tests
node --experimental-default-type=module --test tests/*.test.mjs
```

These tests do not verify GNOME Shell interactions or desktop behavior. See the [development guide](docs/DEVELOPMENT.md) for reload steps, test scope, icons, calendar sync, and architecture.

## Documentation

- [Known limitations](docs/KNOWN-LIMITATIONS.md)
- [Development guide](docs/DEVELOPMENT.md)
- [Open issues and planned work](https://github.com/SakibShahariar/material-panel/issues)

## License

Material Panel is licensed under **GNU GPL-3.0-only**. See [LICENSE](LICENSE) for the full license text. Third-party assets and dependencies may be subject to their own licenses.
