# Material Panel

A configurable GNOME Shell top panel that replaces the stock panel while keeping third-party status-area icons available and movable.

**Supported GNOME Shell versions:** 49 · 50 · 51 (see `metadata.json`)

> [!NOTE]
> Material Panel is actively developed. Feature completeness varies by module, and source-level tests do not replace testing inside GNOME Shell. See [open issues](https://github.com/SakibShahariar/material-panel/issues) for current bugs, limitations, and planned work.

## At a glance

- **Flexible layout** — arrange built-in modules across left, center, and right zones.
- **Appearance controls** — adjust panel sizing, slider styles, tile styles, and color palette.
- **Quick Settings** — choose among the default and optional End-4/Ryoku implementations.
- **Built-in modules** — activities, workspaces, clock, weather, notifications, CPU, memory, GPU, disk, battery, volume, network/Wi-Fi, network speed, Bluetooth device controls, media playback, focused-window information, dark mode, night light, Do Not Disturb, and power actions.
- **Third-party icons** — bridge supported status-area icons into the panel, with an optional tray drawer.
- **Calendar integration** — optionally sync events from an ICS feed.

Some capabilities are still in progress. For example, full Wi-Fi scanning and joining new networks, multi-monitor panels, and recurring calendar event expansion are not implemented yet.

## Contents

- [Installation and development](#installation-and-development)
- [Configuration](#configuration)
- [Tests](#tests)
- [Icons and fonts](#icons-and-fonts)
- [Optional ICS calendar sync](#optional-ics-calendar-sync)
- [Architecture](#architecture)
- [Known limitations](#known-limitations)

## Installation and development

From the repository root, link the extension into GNOME's extension directory using the UUID from `metadata.json`:

```sh
mkdir -p ~/.local/share/gnome-shell/extensions
ln -s "$(pwd)" ~/.local/share/gnome-shell/extensions/material-panel@SakibShahariar
gnome-extensions enable material-panel@SakibShahariar
```

For a development reload loop:

- **Xorg:** press `Alt+F2`, enter `r`, then press Enter to reload GNOME Shell.
- **Wayland:** log out and back in to reload the shell, or use a nested shell for quick iteration:

```sh
dbus-run-session -- gnome-shell --nested --wayland
```

Follow GNOME Shell logs while developing:

```sh
journalctl -f -o cat /usr/bin/gnome-shell
```

## Configuration

Edit `~/.config/material-panel/config.json` directly or open the preferences window:

```sh
gnome-extensions prefs material-panel@SakibShahariar
```

Configuration changes are watched live, so a re-enable is not normally needed. The panel layout uses left, center, and right zones; common layout and appearance settings are available in Preferences.

### Color palette

Material Panel can use a Matugen-generated CSS palette when available, and falls back to its bundled fixed-palette stylesheet. By default, it checks `~/.config/matugen/matugen-colors.css`. Set `colorSource` in the config to specify another path, or set it to an empty string to force the fixed palette.

## Tests

Run the regression tests from the repository root:

```sh
python3 -m unittest discover -s tests
node --experimental-default-type=module --test tests/*.test.mjs
```

The test suite covers ICS timestamp/time-zone parsing, multi-day all-day event indexing, panel-size config migration and clamping, layout snapshot restoration, network byte-rate calculations, `/proc` memory parsing, and disk-usage validation. These tests do not replace GNOME Shell runtime checks for panel widgets, NetworkManager callbacks, or desktop interactions.

## Icons and fonts

Icon-bearing modules use bundled Material Symbols SVGs instead of relying on the installed system icon theme. Source SVGs are stored in `assets/icons-src/*.svg`; `lib/iconTheme.js` recolors them at theme-apply time and writes generated copies to `~/.config/material-panel/icons/`. Modules load the generated files with `Gio.FileIcon`/`gicon`.

The source SVGs are committed, so a fresh checkout does not need to download them before enabling the extension. To refresh them from Google's `google/material-design-icons` repository (Apache 2.0), run:

```sh
bash scripts/fetch-icons.sh
```

The script tries filled and regular variants, validates downloaded SVGs, and leaves an existing icon untouched if both downloads fail or a response is invalid. Review asset changes before committing them.

Panel and Quick Settings chrome uses **Material Symbols Rounded**, like the end-4 Quickshell `MaterialSymbol` style, including the FILL axis when the variable font is installed.

For the best appearance, install the font:

```sh
# Arch
yay -S ttf-material-symbols-variable-git

# Or copy Material Symbols Rounded.ttf into ~/.local/share/fonts
fc-cache -fv
```

Without the font, the extension falls back to bundled SVGs.

## Optional ICS calendar sync

The optional `scripts/calendar-sync-ics.py` script imports events from an ICS feed into `~/.config/material-panel/calendar-events.json`.

An ICS URL may grant access to a private calendar, so store it with restrictive permissions:

```sh
umask 077
mkdir -p ~/.config/material-panel
printf '%s\\n' 'YOUR_ICS_URL' > ~/.config/material-panel/calendar-ics.url
chmod 600 ~/.config/material-panel/calendar-ics.url
python3 scripts/calendar-sync-ics.py
```

The script also accepts `MATERIAL_PANEL_ICS_URL` as an environment variable. The generated event cache is written with mode `0600` because it may contain event titles, locations, and meeting links. HTTP `ETag` and `Last-Modified` validators are stored separately in `calendar-ics.http.json`; unchanged feeds return without reparsing or rewriting the event cache.

To install a systemd user timer that syncs every 15 minutes:

```sh
python3 scripts/calendar-sync-ics.py --install-timer
```

**Recurrence limitation:** the current parser does not expand `RRULE` recurrence sets or apply `EXDATE` exclusions. A recurring `VEVENT` is shown only at its original `DTSTART`; running the sync timer more often does not expand recurring instances.

## Architecture

```text
extension.js                 enable()/disable() and panel lifecycle
lib/configStore.js            load/save/watch config.json
lib/panelBuilder.js           render config into panel actors
lib/zone.js                   ordered panel zones
lib/statusAreaBridge.js       reparent third-party status-area actors
lib/moduleRegistry.js         built-in panel module factory registry
lib/theme.js                  palette resolution and generated stylesheet
lib/iconTheme.js              runtime SVG recoloring
lib/simpleSlider.js           shared slider interaction
lib/trayDrawer.js             third-party tray icon drawer
modules/*.js                  built-in panel and Quick Settings modules
scripts/calendar-sync-ics.py  optional ICS-to-JSON calendar sync
prefs.js                      GTK4/Adwaita preferences window
stylesheet.css                bundled fallback styling
```

### Panel lifecycle and compatibility

`panelBuilder.render(config)` currently performs a full teardown and rebuild rather than incremental updates. Preset switches, preference saves, and other panel changes use the same rendering path.

GNOME's `Main.panel` is a singleton that other extensions may use through `addToStatusArea`. Material Panel keeps it alive (hidden, with zero height) rather than destroying it. `StatusAreaBridge` reparents third-party actors without destroying them; on rebuild, bridged actors are detached before teardown and reattached afterward.

This bridge only catches extensions that use the public `addToStatusArea` API. Extensions that access `Main.panel` internals directly may not be compatible.

## Known limitations

The following are current implementation gaps, not a guarantee that every setup will experience a bug:

- **Multi-monitor:** the panel is drawn on the primary monitor only. The stock GNOME top bar is hidden on all monitors while the extension is enabled, so secondary displays will not show a top bar. See [#30](https://github.com/SakibShahariar/material-panel/issues/30) and [#110](https://github.com/SakibShahariar/material-panel/issues/110).
- **Panel work area:** setting the stock panel height to zero may affect `Main.layoutManager` work-area calculations on some GNOME versions. Watch for gaps or overlaps around maximized windows; see the comment in `extension.js`.
- **Weather location:** the hard-coded Dhaka fallback has been removed. Users can configure a manual latitude/longitude and optional display name in Preferences; when manual coordinates are not configured, the module uses the location configured in GNOME Weather. It does not silently substitute Dhaka or use IP geolocation. Cycling among multiple saved weather locations is not implemented yet ([#143](https://github.com/SakibShahariar/material-panel/issues/143); the fallback bug is fixed in [#55](https://github.com/SakibShahariar/material-panel/issues/55)).
- **Third-party tray icons:** require **AppIndicator and KStatusNotifierItem Support** (or BetterTrayIcons). Material Panel hosts those icons on the bar; it does not run its own StatusNotifier watcher. The bridge supports extensions using GNOME's public `addToStatusArea` API; extensions that access `Main.panel` internals directly may not be compatible.
- **Brightness:** the slider requires `brightnessctl`. If it is missing, or there is no `/sys/class/backlight` device (common on desktop monitors without DDC/CI support), the slider is hidden.
- **Wi-Fi:** the module currently lists saved wireless profiles, not a scan of all nearby access points. Signal strength, security indicators, and in-range status are not shown; joining a new network with a password is not implemented. See [#100](https://github.com/SakibShahariar/material-panel/issues/100) and [#28](https://github.com/SakibShahariar/material-panel/issues/28).
- **Bluetooth:** adapter toggling and device pairing/connection controls are implemented when BlueZ exposes the required operations. Some adapter/device paths remain less tested; if an action fails, check logs for `material-panel: bluez` errors. Shared behavior between the Bluetooth popup and Quick Settings is still being consolidated ([#95](https://github.com/SakibShahariar/material-panel/issues/95)).
- **Disk usage:** the module currently reports `/` and the home path; it does not yet provide a selector for arbitrary mounted filesystems ([#39](https://github.com/SakibShahariar/material-panel/issues/39)).
- **Multiple batteries:** the panel currently selects one battery device rather than combining or listing all physical batteries. Multi-battery systems may therefore not be represented accurately ([#43](https://github.com/SakibShahariar/material-panel/issues/43)).
- **Calendar:** the ICS importer does not expand `RRULE` recurrence sets or apply `EXDATE` exclusions. The End-4 calendar also hard-codes Monday-first English weekday labels, and its day cells do not yet open an agenda or mark event days ([#105](https://github.com/SakibShahariar/material-panel/issues/105)).
- **Polling and rebuilds:** memory and disk periodic refreshes pause while their chips are unmapped and their menus are closed, but a shared sampler and consistent pause behavior across all modules (including CPU/GPU and locked or blank screens) are not implemented yet ([#96](https://github.com/SakibShahariar/material-panel/issues/96)). Panel updates still perform full teardown/rebuilds in some paths; redundant rebuilds need measurement and further reduction ([#20](https://github.com/SakibShahariar/material-panel/issues/20)).
- **Quick Settings architecture:** the default, End-4, and Ryoku implementations still contain duplicated UI behavior, and the default tile list is hard-coded rather than driven by a configurable registry ([#103](https://github.com/SakibShahariar/material-panel/issues/103)).
- **Theme fallback:** Matugen palettes are supported, but when a usable custom palette is unavailable the fallback remains a bundled fixed palette rather than fully inheriting the active GNOME Shell theme ([#145](https://github.com/SakibShahariar/material-panel/issues/145)).
- **Generated files:** generated icon/theme files and the synced calendar-event cache currently live under `~/.config/material-panel/`; relocating regenerable files to an appropriate cache/state directory is tracked in [#87](https://github.com/SakibShahariar/material-panel/issues/87).

These limitations are tracked alongside other bugs and planned features in the [open issue tracker](https://github.com/SakibShahariar/material-panel/issues). Some issues describe planned improvements rather than broken behavior. Source-level tests do not replace GNOME Shell runtime testing.
