# Development guide

## Local installation

From the repository root, link the extension into GNOME's extension directory:

```sh
mkdir -p ~/.local/share/gnome-shell/extensions
ln -s "$(pwd)" ~/.local/share/gnome-shell/extensions/material-panel@SakibShahariar
gnome-extensions enable material-panel@SakibShahariar
```

Open preferences with `gnome-extensions prefs material-panel@SakibShahariar`.

## Reload and logs

- **Xorg:** press `Alt+F2`, enter `r`, then press Enter.
- **Wayland:** log out and back in, or use a nested shell for iteration:

```sh
dbus-run-session -- gnome-shell --nested --wayland
```

Follow Shell logs while debugging:

```sh
journalctl -f -o cat /usr/bin/gnome-shell
```

## Tests

Run both test suites from the repository root:

```sh
python3 -m unittest discover -s tests
node --experimental-default-type=module --test tests/*.test.mjs
```

Coverage includes ICS parsing and time zones, multi-day all-day event indexing, conditional HTTP caching, config-change classification and normalization, layout presets/snapshots, Bluetooth codec matching, GPU metrics, network-speed calculations, process snapshots, `/proc` memory parsing, and disk-usage validation. These tests do not exercise live GNOME Shell widgets, NetworkManager callbacks, or desktop interactions.

## Icons and fonts

Bundled Material Symbols SVGs are stored in `assets/icons-src/*.svg`. `lib/iconTheme.js` recolors them and writes generated copies to `~/.config/material-panel/icons/`. To refresh the source assets:

```sh
bash scripts/fetch-icons.sh
```

The script prefers filled SVG variants and falls back to plain 24px variants. Review asset changes before committing them.

Panel and Quick Settings chrome uses Material Symbols Rounded. Install a compatible variable font for the intended appearance; without it, bundled SVGs provide fallbacks.

## Optional ICS calendar sync

The optional `scripts/calendar-sync-ics.py` imports an ICS feed into `~/.config/material-panel/calendar-events.json`. Treat the URL as a secret because it may grant access to a private calendar:

```sh
umask 077
mkdir -p ~/.config/material-panel
printf '%s\\n' 'YOUR_ICS_URL' > ~/.config/material-panel/calendar-ics.url
chmod 600 ~/.config/material-panel/calendar-ics.url
python3 scripts/calendar-sync-ics.py
```

Alternatively, provide `MATERIAL_PANEL_ICS_URL` in the environment. The generated cache is written with mode `0600`; HTTP validators are stored separately. To install a systemd user timer that syncs every 15 minutes:

```sh
python3 scripts/calendar-sync-ics.py --install-timer
```

The parser currently does not expand `RRULE` recurrence sets or apply `EXDATE` exclusions.

## Architecture overview

- `extension.js` — enable/disable and panel lifecycle
- `lib/configStore.js` — load, save, and watch configuration
- `lib/panelBuilder.js` / `lib/zone.js` — build panel actors and ordered zones
- `lib/statusAreaBridge.js` — host third-party status-area actors
- `lib/moduleRegistry.js` — built-in module factory registry
- `lib/theme.js` / `lib/iconTheme.js` — palette and generated icon handling
- `lib/simpleSlider.js` / `lib/trayDrawer.js` — shared slider and tray drawer
- `modules/` — panel and Quick Settings modules
- `prefs.js` — GTK4/Adwaita preferences
- `scripts/calendar-sync-ics.py` — optional ICS import

GNOME's `Main.panel` is a singleton used by extensions through `addToStatusArea`. Material Panel keeps it alive and hides it rather than destroying it. Its bridge reparents supported third-party actors; extensions that access panel internals directly may not be compatible.
