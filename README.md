# Material Panel

A custom, config-driven GNOME Shell top panel — replaces the stock panel
rather than restyling it, while still letting other extensions' status area
buttons (wifi, bluetooth, tray icons, etc.) be placed wherever you want.

Targets GNOME Shell 50.

## Status

Early scaffold. Working:

- Custom panel actor with `left` / `center` / `right` zones, rendered from
  `~/.config/material-panel/config.json`
- Built-in modules: clock (with weekday/date), workspace switcher, activities toggle, battery (UPower), volume (Gvc, click to mute), network (NetworkManager)
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

## Known limitations

- Setting the stock panel's height to 0 can affect `Main.layoutManager`'s
  workarea calculation on some GNOME versions — watch for gaps/overlaps
  around maximized windows. See the comment in `extension.js`.
- The bridge only catches extensions that use the public
  `addToStatusArea` API. A few extensions poke `Main.panel`'s internals
  directly and won't be caught — not chasing 100% compatibility here.
