# Material Panel

[![Release](https://img.shields.io/github/v/release/SakibShahariar/material-panel?display_name=tag)](https://github.com/SakibShahariar/material-panel/releases/latest) [![Release workflow](https://github.com/SakibShahariar/material-panel/actions/workflows/release.yml/badge.svg)](https://github.com/SakibShahariar/material-panel/actions/workflows/release.yml)

A modern, configurable GNOME Shell panel with flexible module placement, Quick Settings, and support for third-party tray icons.

**GNOME Shell:** 49 · 50 · 51

> [!NOTE]
> Material Panel is actively developed. Some features are still in progress; see [known limitations](docs/KNOWN-LIMITATIONS.md) and [open issues](https://github.com/SakibShahariar/material-panel/issues). Automated tests do not replace testing inside GNOME Shell.

## GNOME Shell compatibility

The versions below are declared in `metadata.json`. A declared version is not necessarily a runtime-tested version.

| GNOME Shell | Declared support | Runtime-tested status |
| --- | --- | --- |
| 49 | Yes | Not verified in this repository |
| 50 | Yes | Not verified in this repository |
| 51 | Yes | Not verified in this repository |

No per-version runtime test results or confirmed version-specific feature limitations are currently recorded. The general implementation gaps in [known limitations](docs/KNOWN-LIMITATIONS.md) apply independently of this table. The automated tests listed below are source-level tests; they do not establish GNOME Shell runtime compatibility.

After a GNOME Shell upgrade, manually check:

- [ ] Enable, disable, and reload the extension; confirm the panel is restored cleanly.
- [ ] Check panel zones, layouts, visibility, and monitor/work-area changes.
- [ ] Open preferences, change settings, save, and confirm the panel reloads them.
- [ ] Open and operate the default, End-4, and Ryoku Quick Settings implementations.
- [ ] Verify the tray bridge with a supported AppIndicator/KStatusNotifierItem provider.
- [ ] Exercise key modules: clock/calendar, weather, media, Bluetooth, Wi-Fi/network, audio, battery, and notifications.
- [ ] Review GNOME Shell logs for errors, then repeat enable/disable to catch lifecycle leaks.

Only update a version's runtime-tested status after this checklist has been exercised in that version's GNOME Shell session.

## Highlights

- **Your layout:** arrange modules in left, center, and right zones.
- **Personalized look:** tune panel sizing, slider and tile styles, and colors.
- **Quick Settings:** choose the default, End-4, or Ryoku implementation.
- **Control Center Home:** hide, reorder, and resize cards in a saved responsive layout.
- **Everyday controls:** clock, weather, calendar, notifications, audio, Bluetooth, Wi-Fi, battery, system stats, media, and power actions.
- **Tray integration:** host supported third-party status icons, with an optional drawer.
- **Calendar sync:** optionally import events from an ICS feed.

## Quick Launch shortcuts

Add optional application or command shortcuts in **Preferences → Quick Launch**. Each shortcut can have a custom label and an optional symbolic icon name (for example, `utilities-terminal-symbolic`). Leave the icon field empty to use the built-in action/state glyphs. You can edit, reorder, or remove configured entries.

To make a command a toggle, provide a separate **Off command**. The on/off state and active icon update only after the selected command exits successfully; state is session-only and resets when the extension reloads. Both commands are parsed into executable arguments and launched directly without a shell; shell pipelines, redirection, and command substitution are not supported. Commands stop after 30 seconds. Only add commands you trust.

## Context-aware visibility

Per-module visibility rules can hide modules while a window is fullscreen, GNOME Overview is open, Do Not Disturb is active, or GNOME reports the network unavailable. You can also restrict a module to battery power or show it only at or below a chosen battery percentage. Unknown battery state/percentage leaves the module visible. These rules remain independent of manual visibility and Focus Mode.

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
