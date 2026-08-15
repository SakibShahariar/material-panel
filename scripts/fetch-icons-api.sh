#!/usr/bin/env bash
# Alternative to fetch-icons.sh: pulls the same icons via GitHub's contents
# API instead of git clone. Run from the project root.
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

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEST="$SCRIPT_DIR/../assets/icons-src"
mkdir -p "$DEST"

TMPJSON="$(mktemp)"
trap 'rm -f "$TMPJSON"' EXIT

for src in "${SRC_ICONS[@]}"; do
  key="${MAP[$src]}"
  api_url="https://api.github.com/repos/google/material-design-icons/contents/symbols/web/$src/materialsymbolsrounded"

  # Write the API response to a file instead of a shell variable - avoids
  # any risk of JSON content breaking bash's interpolation into python -c.
  curl -s "$api_url" > "$TMPJSON"

  download_url=$(python3 - "$TMPJSON" <<'PYEOF'
import json, sys

path = sys.argv[1]
with open(path, encoding='utf-8') as f:
    try:
        items = json.load(f)
    except Exception as e:
        print(f"PARSE ERROR: {e}", file=sys.stderr)
        sys.exit(1)

if not isinstance(items, list):
    print(f"API ERROR: {items}", file=sys.stderr)
    sys.exit(1)

names = [(i['name'], i['download_url']) for i in items if i['name'].endswith('.svg')]

def pick(pred):
    for n, u in names:
        if pred(n):
            return u
    return None

url = pick(lambda n: 'fill1' in n and '24px' in n) or pick(lambda n: '24px' in n) or (names[0][1] if names else None)
print(url or '')
PYEOF
) || true

  if [ -z "$download_url" ]; then
    echo "WARN: could not resolve an svg for $src (skipping $key) - see error above" >&2
    continue
  fi

  curl -s -o "$DEST/$key.svg" "$download_url"
  echo "OK: $src -> $key.svg"
done

echo "Done. Icons written to $DEST"
echo "Now: git add -A && git commit -m 'Add bundled icon sources' && git push"
