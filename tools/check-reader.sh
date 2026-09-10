#!/usr/bin/env bash
# Run the field-note reader invariants in a real browser and report.
#
#   tools/check-reader.sh            # uses the first Chrome/Chromium it finds
#   CHROME=/path/to/chrome tools/check-reader.sh
#
# Exits non-zero when any invariant fails, so it can gate a deploy.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
port="${PORT:-8713}"

chrome="${CHROME:-}"
if [ -z "$chrome" ]; then
  for candidate in \
    "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" \
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
    "$(command -v google-chrome || true)" \
    "$(command -v chromium || true)" \
    "$(command -v chromium-browser || true)"; do
    if [ -n "$candidate" ] && [ -x "$candidate" ]; then chrome="$candidate"; break; fi
  done
fi
if [ -z "$chrome" ]; then
  echo "No Chrome or Chromium found. Set CHROME=/path/to/chrome." >&2
  exit 2
fi

python3 -m http.server "$port" --directory "$root" >/dev/null 2>&1 &
server=$!
trap 'kill "$server" 2>/dev/null || true' EXIT
for _ in $(seq 1 40); do
  if curl -sf -o /dev/null "http://localhost:$port/tests/reader-invariants.html"; then break; fi
  sleep 0.25
done

# Reduced motion keeps page turns instant, so the checks see the settled state.
output="$("$chrome" --headless=new --no-sandbox --disable-gpu \
  --force-prefers-reduced-motion --virtual-time-budget=180000 --window-size=1500,1000 \
  --dump-dom "http://localhost:$port/tests/reader-invariants.html" 2>/dev/null)"

results="$(printf '%s' "$output" | python3 -c '
import html, re, sys
page = sys.stdin.read()
match = re.search(r"<pre id=\"log\">(.*?)</pre>", page, re.S)
print(html.unescape(re.sub(r"<[^>]*>", "", match.group(1))) if match else "")
')"

if [ -z "$results" ]; then
  echo "The invariant page produced no results (did the browser run?)." >&2
  exit 2
fi

printf '%s\n' "$results" | grep -E '^(FAIL|RESULT)' || true
printf '%s\n' "$results" | grep -c '^PASS' | sed 's/^/passing checks: /'

if printf '%s' "$results" | grep -q '^RESULT PASS'; then exit 0; fi
exit 1
