# Material Panel

A custom, config-driven GNOME Shell top panel — replaces the stock panel
rather than restyling it, while still letting other extensions' status area
buttons (wifi, bluetooth, tray icons, etc.) be placed wherever you want.

Targets GNOME Shell 49, 50, and 51, as declared in `metadata.json`.

## Status

Material Panel is an actively developed GNOME Shell extension. It replaces the
stock top panel with a configurable panel and built-in status modules. Feature
completeness varies by module; check the [open issues](https://github.com/SakibShahariar/material-panel/issues)
for known bugs, limitations, and planned work.

Implemented in the current codebase:

- Zone-based panel layout (left, center, and right) loaded from
  `~/.config/material-panel/config.json`, with a preferences window for common
  layout and appearance settings.
- Built-in modules for activities, workspaces, clock, weather, notifications,
  CPU, memory, GPU, disk, battery, volume, network/Wi-Fi, network speed,
  Bluetooth, media playback, focused-window information, dark mode, night
  light, Do Not Disturb, and power actions.
- Quick Settings popup implementations, including the default and optional
  End-4/Ryoku variants, with configurable visual styles for sliders and tiles.
- Palette generation from a Matugen CSS file when available, with a bundled
  fixed-palette stylesheet as fallback. The default configuration auto-detects
  `~/.config/matugen/matugen-colors.css`; set `colorSource` in the config to
  override the path or use an empty string to force the fixed palette.
- Runtime-recolored Material Symbols SVGs, extension status-area bridging, and
  an optional tray drawer for supported third-party status icons.
- An optional ICS calendar-sync script that writes event data for the panel's
  calendar integrations.

This is not a claim that every module is fully polished or runtime-tested on
every supported GNOME version. Multi-monitor support, full Wi-Fi scanning and
joining of new networks, recurring calendar expansion, and other unfinished
items remain tracked in the issue list.

## Architecture

```
extension.js                 enable()/disable() and panel lifecycle
lib/configStore.js            load/save/watch config.json
lib/panelBuilder.js           render config into panel actors
lib/zone.js                   ordered panel zones
lib/statusAreaBridge.js       reparent third-party status-area actors
lib/moduleRegistry.js         built-in module factory registry
lib/theme.js                  palette resolution and generated stylesheet
lib/iconTheme.js              runtime SVG recoloring
lib/simpleSlider.js           shared slider interaction
lib/trayDrawer.js             third-party tray icon drawer
modules/*.js                  built-in panel and Quick Settings modules
scripts/calendar-sync-ics.py  optional ICS-to-JSON calendar sync
prefs.js                      GTK4/Adwaita preferences window
stylesheet.css                bundled fallback styling
```

Key design decision: `panelBuilder.render(config)` always does a full
teardown + rebuild, never incremental patching. Every code path that changes
the panel (preset switch, prefs window save, future live editor) goes
through the same function, so none of them need special-cased logic.

Key risk being managed: `Main.panel` is a singleton other extensions call
`addToStatusArea` on. We keep it alive (hidden, zero height) rather than
destroying it, and `StatusAreaBridge` reparents — never destroys — whatever
lands there. On every rebuild, bridged actors are detached (not destroyed)
before teardown and reattached after, so other extensions' UI survives
preset switches and config reloads.

## Install (dev loop)

```sh
# Symlink into GNOME's extensions directory using the UUID in metadata.json.
mkdir -p ~/.local/share/gnome-shell/extensions
ln -s "$(pwd)" ~/.local/share/gnome-shell/extensions/material-panel@SakibShahariar

# On Wayland you can't reload gnome-shell without logging out. Easiest loop:
#   - log into an Xorg session while developing (Alt+F2, 'r', Enter reloads
#     shell on X11), or
#   - use a nested shell for quick iteration:
dbus-run-session -- gnome-shell --nested --wayland

# Enable the extension
gnome-extensions enable material-panel@SakibShahariar

# Watch logs while developing
journalctl -f -o cat /usr/bin/gnome-shell
```

Edit `~/.config/material-panel/config.json` directly, or use
`gnome-extensions prefs material-panel@SakibShahariar` — both are watched live, no
re-enable needed.

## Icons

Icon-bearing modules use bundled Material Symbols SVGs rather than relying
on the installed system icon theme. `assets/icons-src/*.svg` contains the
source SVGs; `lib/iconTheme.js` recolors them at theme-apply time and writes
the generated copies to `~/.config/material-panel/icons/`. Modules load
those generated files with `Gio.FileIcon`/`gicon`.

The source SVGs are committed, so a fresh checkout does not need to download
them before enabling the extension. To refresh the sources from Google's
`google/material-design-icons` repository (Apache 2.0), run:

```sh
bash scripts/fetch-icons.sh
```

The fetch script tries filled and regular variants, validates the downloaded
SVG, and leaves an existing icon untouched if both downloads fail or the
response is invalid. Review the resulting asset changes before committing
them.

## Optional ICS calendar sync

The optional `scripts/calendar-sync-ics.py` script imports events from an ICS
feed into `~/.config/material-panel/calendar-events.json`. A calendar's
secret iCalendar URL acts like a password, so store it with private file
permissions:

```sh
umask 077
mkdir -p ~/.config/material-panel
printf '%s\n' 'YOUR_ICS_URL' > ~/.config/material-panel/calendar-ics.url
chmod 600 ~/.config/material-panel/calendar-ics.url
python3 scripts/calendar-sync-ics.py
```

The script also accepts `MATERIAL_PANEL_ICS_URL` in the environment. The
generated event cache is written with mode `0600` because it may contain
event titles, locations, and meeting links. To install a systemd user timer
that syncs every 15 minutes, run `python3 scripts/calendar-sync-ics.py
--install-timer`. Recurring-event expansion and exclusions are not yet
implemented.

## Known limitations

- Weather uses the location configured in GNOME Weather when available. If that location cannot be read, the fallback is explicitly labeled **Dhaka (default location)**; a separate manual-location setting is not implemented yet.

- Third-party tray icons require **AppIndicator and KStatusNotifierItem Support** (or BetterTrayIcons). Material Panel hosts those icons on the bar; it does not run its own StatusNotifier watcher.

- Brightness slider requires `brightnessctl` to be installed (handles
  device detection and write permissions itself). If it's missing, or if
  there's no `/sys/class/backlight` device at all (common on desktop
  monitors without DDC/CI support), the slider just doesn't appear rather
  than showing broken.

- Wifi module only reconnects to already-known networks (saved
  connections). Connecting to a brand-new network with a password requires
  implementing NetworkManager's secret-agent D-Bus flow - not done yet.
- Bluetooth module only toggles the adapter on/off. Device pairing/
  connection management (a device list, "Connect"/"Pair" actions) isn't
  built - that needs more BlueZ D-Bus work (org.bluez.Device1 per paired
  device) than the single adapter Powered property this uses.
- Bluetooth's adapter discovery (finding the right D-Bus object path) is
  the least-tested piece of this project - if the toggle doesn't work,
  check the log for `material-panel: bluez` errors first.

- Setting the stock panel's height to 0 can affect `Main.layoutManager`'s
  workarea calculation on some GNOME versions — watch for gaps/overlaps
  around maximized windows. See the comment in `extension.js`.
- The bridge only catches extensions that use the public
  `addToStatusArea` API. A few extensions poke `Main.panel`'s internals
  directly and won't be caught — not chasing 100% compatibility here.


## Icons (end-4 style)

Panel/QS chrome uses **Material Symbols Rounded** (same as end-4 Quickshell `MaterialSymbol`), including the FILL axis when the variable font is installed.

Install the font for best results:

```bash
# Arch
yay -S ttf-material-symbols-variable-git
# or copy Material Symbols Rounded.ttf into ~/.local/share/fonts && fc-cache -fv
```

Without the font, the extension falls back to bundled SVGs.


## Multi-monitor

Material Panel currently draws on the **primary monitor only**. The stock GNOME top bar is hidden on all monitors while the extension is enabled, so secondary displays will not show a top bar. Multi-monitor panels may come later.
