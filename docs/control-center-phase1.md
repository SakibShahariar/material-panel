# Control Center phase 1

The optional `control-center` panel module is registered in Preferences but is not inserted into the default panel layout. Enable it from **Preferences → Modules → Module Visibility**.

## Current shell

- The popup provides Home, Media and System navigation.
- Home includes Focus Mode, a small Dark Mode / Night Light / Do Not Disturb action cluster, and a compact Now Playing row with a slim live progress bar and a no-media state.
- Media now has a larger artwork-led player card with album metadata, player switching when multiple MPRIS players are active, playback state, and live position. Its optional restrained visualizer respects the existing preference and reduced-motion setting; both it and the one-second position sampler run only while the Media section is selected and mapped.
- System now shows CPU, memory and CPU-temperature trends, a network summary from the shared Network Speed sample, and an asynchronous read-only top-process list. GPU queries are explicitly off by default and start only after enabling the System GPU toggle.
- Home's weather and system-summary cards, media progress and responsive bento composition remain tracked in #121.
- Section actors are destroyed when switching sections and when the popup closes. The current shell does not start section-specific polling.
- Popup sizing is bounded by the primary monitor; the popup arrow side is selected from the panel edge.

## Live GNOME validation checklist

Run this only on a supported GNOME Shell session. Record the Shell version and display scale with the results.

- [ ] Enable Control Center from Preferences and confirm its panel button appears.
- [ ] Open and close repeatedly; confirm no stale popup, actor warnings or shell hitch.
- [ ] Navigate Home / Media / System with mouse and keyboard; verify focus order and activation.
- [ ] Confirm Focus Mode state is consistent with Quick Settings and Preferences.
- [ ] Open Home with and without an active MPRIS player; verify artwork fallback, metadata, controls and no-media state.
- [ ] Switch away from Home and close the popup; confirm the compact media row releases its MPRIS watcher/proxy.
- [ ] Test panel at top, bottom, left and right; confirm the popup opens away from the panel and remains on-screen.
- [ ] Test narrow and scaled displays; confirm no horizontal overflow or clipped navigation/content.
- [ ] Check theme changes and reduced-motion preferences; confirm the shell remains visually coherent.

Do not close #120 or #121 based on source tests alone. The checklist above is the remaining compositor/runtime validation.
