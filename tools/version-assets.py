#!/usr/bin/env python3
"""Point every page at the current site.css and site.js by content hash.

Pages request the stylesheet and script with a ?v= token. When that token is
edited by hand it gets forgotten, and browsers keep serving the copy they
already have — the change ships but nobody sees it. Here the token is the
first eight characters of the file's SHA-256, so it changes exactly when the
file does, and never otherwise.

Usage: python3 tools/version-assets.py [--check]
       --check exits non-zero if any page is pointing at a stale version.
"""

import hashlib
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ASSETS = ("site.css", "site.js")


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()[:8]


def main():
    check_only = "--check" in sys.argv
    versions = {}
    for asset in ASSETS:
        path = ROOT / asset
        if not path.exists():
            print(f"missing {asset}", file=sys.stderr)
            return 2
        versions[asset] = digest(path)

    pages = sorted(ROOT.glob("**/*.html"))
    stale, updated = [], []
    for page in pages:
        if "node_modules" in page.parts:
            continue
        html = page.read_text()
        original = html
        for asset, version in versions.items():
            pattern = re.compile(r"(" + re.escape(asset) + r")\?v=[^\"'\s>]*")
            html = pattern.sub(lambda match, v=version: f"{match.group(1)}?v={v}", html)
        if html != original:
            (stale if check_only else updated).append(page.relative_to(ROOT))
            if not check_only:
                page.write_text(html)

    if check_only:
        if stale:
            print("stale asset links in: " + ", ".join(str(p) for p in stale))
            print("run: python3 tools/version-assets.py")
            return 1
        print("all pages point at the current site.css and site.js")
        return 0

    summary = ", ".join(f"{asset} -> {version}" for asset, version in versions.items())
    print(f"{summary}\nupdated {len(updated)} page(s)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
