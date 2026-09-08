# end-4 icons → material-panel

## end-4 system

| Layer | Mechanism | Where |
|-------|-----------|--------|
| **UI glyphs** | **Material Symbols** font (`MaterialSymbol { text: "wifi" }`) | Bar, QS toggles, sliders |
| **Distro / brand** | SVG in `assets/icons/*-symbolic.svg` | Uptime pill, AI, etc. |
| **Fluent** | SVG in `assets/icons/fluent/` | Waffle panel family only |

Material Symbol names (examples from QS):
`volume_up`, `light_mode`, `wifi`, `bluetooth`, `dark_mode`, `nightlight`,
`do_not_disturb_on`, `lock`, `power_settings_new`, `settings`, `tune`, `notifications`

## Our approach

GNOME Shell cannot use the Material Symbols font the same way Quickshell does.
We **download Material Symbols as SVG** (Iconify) into `assets/icons-src/`, then
`applyIcons()` recolors them to primary / on-primary / on-surface like before.

| Our key | Material Symbol |
|---------|-----------------|
| volume-high | volume-up |
| brightness | light-mode |
| network-wifi | wifi |
| bluetooth-on | bluetooth |
| dark-mode | dark-mode |
| night-light | nightlight |
| dnd-active | do-not-disturb-on |
| lock | lock |
| notifications | notifications |
| settings | settings |
| quicksettings | tune |
| shutdown | power-settings-new |
| fedora-logo | end-4 `fedora-symbolic.svg` |

Refresh sources:

```bash
# already done in repo; re-fetch individual:
curl -fsSL 'https://api.iconify.design/material-symbols:wifi.svg?height=24' \
  -o assets/icons-src/network-wifi.svg
```

After install, reload extension so `applyIcons()` writes recolored copies under
`~/.config/material-panel/icons/`.
