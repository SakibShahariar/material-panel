#!/usr/bin/env bash
# Pulls a small set of Material Symbols (Rounded, filled) SVGs from Google's
# repo into assets/icons-src/, renamed to the keys lib/iconTheme.js expects.
# Run this once from the project root: bash scripts/fetch-icons.sh
set -euo pipefail

SRC_ICONS=(
  battery_full battery_6_bar battery_3_bar battery_alert battery_charging_full
  volume_up volume_down volume_mute volume_off
  wifi settings_ethernet wifi_off
  apps
)

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
)

WORKDIR="$(mktemp -d)"
trap 'rm -rf "$WORKDIR"' EXIT

echo "Cloning material-design-icons (sparse, this repo is large - only pulling needed folders)..."
git clone --quiet --depth 1 --filter=blob:none --sparse \
  https://github.com/google/material-design-icons.git "$WORKDIR/repo"
cd "$WORKDIR/repo"
git sparse-checkout set --no-cone $(printf 'symbols/web/%s ' "${SRC_ICONS[@]}") > /dev/null

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEST="$SCRIPT_DIR/../assets/icons-src"
mkdir -p "$DEST"

for src in "${SRC_ICONS[@]}"; do
  dir="symbols/web/$src/materialsymbolsrounded"
  key="${MAP[$src]}"
  if [ ! -d "$dir" ]; then
    echo "WARN: no such icon directory: $dir (skipping $key)" >&2
    continue
  fi
  # Prefer a filled variant (fill1) to match the reference screenshot's look;
  # fall back to whatever 24px SVG exists if filenames differ from expected.
  file=$(find "$dir" -iname "*fill1*24px.svg" | sort | head -1)
  [ -z "$file" ] && file=$(find "$dir" -iname "*24px.svg" | sort | head -1)
  [ -z "$file" ] && file=$(find "$dir" -iname "*.svg" | sort | head -1)
  if [ -z "$file" ]; then
    echo "WARN: no SVG found under $dir (skipping $key)" >&2
    continue
  fi
  cp "$file" "$DEST/$key.svg"
  echo "OK: $src -> $key.svg"
done

echo "Done. Icons written to $DEST"
echo "Now: git add -A && git commit -m 'Add bundled icon sources' && git push"
