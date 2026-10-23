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
