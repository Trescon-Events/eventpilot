#!/bin/bash
# Reads .env.local and sets all non-public vars as Cloudflare Worker secrets.
# NEXT_PUBLIC_ vars are build-time — they live in wrangler.jsonc [vars], not here.
# Run from project root: bash scripts/set-cf-secrets.sh

set -e

cd "$(dirname "$0")/.."

if [ ! -f ".env.local" ]; then
  echo "Error: .env.local not found. Run from the EventPilot project root."
  exit 1
fi

TMP=$(mktemp /tmp/cf-secrets.XXXX.json)

python3 - <<'EOF' > "$TMP"
import json, re

secrets = {}
with open(".env.local") as f:
    for line in f:
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("NEXT_PUBLIC_"):
            continue
        m = re.match(r'^([A-Z0-9_]+)=(.*)$', line)
        if m:
            secrets[m.group(1)] = m.group(2)

print(json.dumps(secrets, indent=2))
EOF

echo "Setting these Cloudflare Worker secrets:"
python3 -c "import json; d=json.load(open('$TMP')); [print(f'  {k}') for k in d]"
echo ""

wrangler secret bulk "$TMP"

rm "$TMP"

echo ""
echo "Done. NEXT_PUBLIC_ vars are already in wrangler.jsonc — no action needed for those."
