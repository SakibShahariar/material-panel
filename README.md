# Material Panel

A custom, config-driven GNOME Shell top panel — replaces the stock panel
rather than restyling it, while still letting other extensions' status area
buttons (wifi, bluetooth, tray icons, etc.) be placed wherever you want.

Targets GNOME Shell 50.

## Status

Early scaffold. Working:

- Custom panel actor with `left` / `center` / `right` zones, rendered from
  `~/.config/material-panel/config.json`
- Built-in modules: clock (with weekday/date), workspace switcher, activities toggle, battery (UPower), volume (Gvc, click to mute), network (NetworkManager, dropdown with Wi-Fi toggle + reconnect to known networks), dark mode toggle, night light toggle, do-not-disturb toggle, power menu (lock/suspend/restart/shutdown via loginctl/systemctl), bluetooth power toggle
- Bundled Material Symbols icons, recolored at runtime to match the active
  palette (matugen or fixed) - see "Icons" below. Run `scripts/fetch-icons.sh`
  once before first use.
- Bridge that intercepts `Main.panel.addToStatusArea` so other extensions'
  buttons can be claimed into any zone via `"extension:<uuid-or-role>"` in
  the config, without destroying their actors on panel rebuild
- Basic prefs window (reorder/remove modules per zone)
- Fixed color palette in `stylesheet.css`

Not yet built (see project notes / conversation history for the plan):

- matugen wallpaper-adaptive theming — deliberately deferred; the seam is
  the color values in `stylesheet.css`, nothing else needs to change
- Multiple presets / preset switching UI
- Live drag-and-drop editing directly on the panel (edit-mode input
  handling, click-vs-drag disambiguation)
- Full Quick Settings (wifi/bluetooth/power submenu) — not reimplemented

## Architecture

```
extension.js          enable()/disable() — hides stock panel, builds ours
lib/configStore.js     load/save/watch config.json (single source of truth)
lib/panelBuilder.js    render(config) -> full teardown + rebuild of actors
lib/zone.js            one ordered row within the panel
lib/statusAreaBridge.js reparents other extensions' buttons, never destroys them
lib/moduleRegistry.js  id -> built-in widget factory lookup
modules/*.js           built-in widgets (clock, workspaces, activities)
prefs.js               GTK4/Adwaita settings window
stylesheet.css          panel styling — fixed palette for now
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
# Symlink into GNOME's extensions directory. Replace `you` in metadata.json's
# uuid first if you haven't already — it should be your GitHub username.
ln -s "$(pwd)" ~/.local/share/gnome-shell/extensions/material-panel@you

# On Wayland you can't reload gnome-shell without logging out. Easiest loop:
#   - log into an Xorg session while developing (Alt+F2, 'r', Enter reloads
#     shell on X11), or
#   - use a nested shell for quick iteration:
dbus-run-session -- gnome-shell --nested --wayland

# Enable the extension
gnome-extensions enable material-panel@you

# Watch logs while developing
journalctl -f -o cat /usr/bin/gnome-shell
```

Edit `~/.config/material-panel/config.json` directly, or use
`gnome-extensions prefs material-panel@you` — both are watched live, no
re-enable needed.

## Icons

Icon-bearing modules (activities, battery, volume, network) don't use
system icon-theme lookups (`icon_name`) - that would mean icons look
different depending on whatever icon theme happens to be installed, and
plain system symbolic icons don't recolor against matugen output the way
we'd want (GNOME's symbolic recoloring uses a specific encoding Google's
Material Symbols source files don't use).

Instead: `assets/icons-src/*.svg` holds single-fill-color Material Symbols
source files (empty until you run the fetch script below), and `lib/iconTheme.js` regex-substitutes the fill color
at theme-apply time, writing recolored copies to
`~/.config/material-panel/icons/`. Modules load those via
`Gio.FileIcon`/`gicon`, not `icon_name`. This runs every time `theme.js`
applies - alongside CSS generation - so icons stay in sync with matugen
automatically.

Run once after cloning, before enabling the extension:

```sh
bash scripts/fetch-icons.sh
```

This sparse-clones just the needed folders from
`google/material-design-icons` (Apache 2.0 licensed) and copies ~13 SVGs
into `assets/icons-src/`. If Google's internal file-naming has changed
since this was written, the script logs a `WARN` per missing icon rather
than failing outright - that module just renders without an icon until
you fix the mapping in the script.

## Known limitations

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
