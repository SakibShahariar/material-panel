# Known limitations

This page records current implementation gaps, not problems every installation will encounter. Check the [open issue tracker](https://github.com/SakibShahariar/material-panel/issues) for status and planned work.

## Panel and appearance

- **Multiple monitors:** the panel is drawn only on the primary monitor, while the stock GNOME top bar is hidden on all displays ([#30](https://github.com/SakibShahariar/material-panel/issues/30), [#110](https://github.com/SakibShahariar/material-panel/issues/110)).
- **Work areas:** monitor and work-area changes are observed, but maximized-window interactions still need runtime validation across GNOME Shell versions.
- **Theme fallback:** Matugen palettes are supported; without a usable custom palette, the extension uses a bundled palette instead of fully inheriting the active Shell theme ([#145](https://github.com/SakibShahariar/material-panel/issues/145)).
- **Tray compatibility:** third-party icons require AppIndicator/KStatusNotifierItem Support or BetterTrayIcons. The bridge supports extensions using GNOME's public `addToStatusArea` API; extensions accessing panel internals directly may not work.
- **Generated files:** generated icons, theme CSS, calendar events, and HTTP validators now use the XDG cache directory. Existing calendar data in `~/.config/material-panel/calendar-events.json` is read as a migration fallback until the next successful sync.

## Modules and integrations

- **Weather:** one location at a time; saving multiple locations and cycling between them is not implemented ([#143](https://github.com/SakibShahariar/material-panel/issues/143)).
- **Wi-Fi:** shows saved wireless profiles rather than scanning nearby access points. Signal/security/in-range indicators and password-based joining of a new network are not implemented ([#100](https://github.com/SakibShahariar/material-panel/issues/100), [#28](https://github.com/SakibShahariar/material-panel/issues/28)).
- **Brightness:** requires `brightnessctl` and a usable `/sys/class/backlight` device; otherwise the slider is hidden.
- **Bluetooth:** adapter toggling and device pairing/connection controls work when BlueZ exposes the needed operations. Shared popup/Quick Settings behavior still needs consolidation ([#95](https://github.com/SakibShahariar/material-panel/issues/95)).
- **Disk usage:** reports `/` and the home path; arbitrary mounted filesystem selection is not available ([#39](https://github.com/SakibShahariar/material-panel/issues/39)).
- **Batteries:** only one battery device is selected; multiple physical batteries are not combined or listed ([#43](https://github.com/SakibShahariar/material-panel/issues/43)).
- **Calendar:** the ICS importer does not expand `RRULE` recurrence sets or apply `EXDATE` exclusions. The End-4 calendar uses Monday-first English weekday labels and does not yet open an agenda or mark event days ([#105](https://github.com/SakibShahariar/material-panel/issues/105)).
- **Preferences:** missing dependencies and unavailable modules are not yet detected and explained consistently ([#35](https://github.com/SakibShahariar/material-panel/issues/35)).

## Architecture and performance

- **Polling:** refresh pausing is not consistent across all modules, and a shared sampler is not yet implemented ([#96](https://github.com/SakibShahariar/material-panel/issues/96)).
- **Rebuilds:** some panel changes still trigger full teardown/rebuilds; redundant rebuilds need measurement and reduction ([#20](https://github.com/SakibShahariar/material-panel/issues/20)).
- **Quick Settings:** the default, End-4, and Ryoku implementations duplicate some UI behavior; the default tile list is hard-coded ([#103](https://github.com/SakibShahariar/material-panel/issues/103)).
- **Shared state:** some settings and callbacks are passed through `globalThis`; replacing this with a dedicated shared-state path remains cleanup work ([#88](https://github.com/SakibShahariar/material-panel/issues/88)).

These are not all user-facing bugs: some describe missing features or maintainability improvements. Automated source-level tests do not replace GNOME Shell runtime checks.
