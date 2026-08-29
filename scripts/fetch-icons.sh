#!/usr/bin/env bash
# Pulls Material Symbols (Rounded, filled) SVGs from Google's repo into
# assets/icons-src/, renamed to the keys lib/iconTheme.js expects.
# Run this once from the project root: bash scripts/fetch-icons.sh
set -euo pipefail

declare -A MAP=(
  [battery_full]=battery-full
  [battery_6_bar]=battery-high
  [battery_3_bar]=battery-low
  [battery_alert]=battery-critical
  [battery_charging_full]=battery-charging
  [volume_up]=volume-high
  [volume_down]=volume-medium
  [volume_mute]=volume-low
  [volume_off]=volume-muted
  [wifi]=network-wifi
  [settings_ethernet]=network-wired
  [wifi_off]=network-offline
  [apps]=apps
  [dark_mode]=dark-mode
  [light_mode]=light-mode
  [nightlight]=night-light
  [do_not_disturb_on]=dnd-active
  [do_not_disturb_off]=dnd-inactive
  [lock]=lock
  [bedtime]=suspend
  [restart_alt]=restart
  [power_settings_new]=shutdown
  [bluetooth]=bluetooth-on
  [bluetooth_disabled]=bluetooth-off
  [settings]=settings
  [brightness_6]=brightness
  [play_arrow]=media-play
  [pause]=media-pause
  [skip_next]=media-next
  [skip_previous]=media-prev
  [memory]=cpu
  [device_thermostat]=cpu-temp
  [upload]=network-up
  [download]=network-down
  [cloud]=weather
  [wb_sunny]=weather-sunny
  [cloud_queue]=weather-partly-cloudy
  [cloud]=weather-cloudy
  [rainy]=weather-rain
  [ac_unit]=weather-snow
  [thunderstorm]=weather-thunder
  [foggy]=weather-fog
  [mode_night]=weather-clear-night
  [notifications_active]=notifications
  [tune]=quicksettings
  [headphones]=headphones
  [keyboard]=keyboard
  [smartphone]=phone
  [desktop_windows]=computer
)

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEST="$SCRIPT_DIR/../assets/icons-src"
mkdir -p "$DEST"

BASE_URL="https://raw.githubusercontent.com/google/material-design-icons/master/symbols/web"

for src in "${!MAP[@]}"; do
  key="${MAP[$src]}"
  dest="$DEST/$key.svg"
  # Prefer filled variant
  url="$BASE_URL/$src/materialsymbolsrounded/${src}_fill1_24px.svg"
  echo -n "Fetching $src -> $key ... "
  if curl -fsSL "$url" -o "$dest" 2>/dev/null; then
    echo "OK"
    continue
  fi
  # fallback to plain 24px
  url2="$BASE_URL/$src/materialsymbolsrounded/${src}_24px.svg"
  if curl -fsSL "$url2" -o "$dest" 2>/dev/null; then
    echo "OK (fallback 24px)"
    continue
  fi
  echo "WARN: failed to fetch $src (tried $url)" >&2
  rm -f "$dest"
done

echo "Done. Icons written to $DEST"
echo "Now: git add -A && git commit -m 'Add bundled icon sources' && git push"
