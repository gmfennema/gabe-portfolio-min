#!/usr/bin/env python3
"""Stamp width and height on every <img> inside a post or project article.

The reader measures a note before its pictures have loaded. Without intrinsic
dimensions the browser reserves no room for them, page breaks are computed for
a document with no images in it, and the pictures then push text under the
page's clip. Explicit width/height gives the browser an aspect ratio to hold
space with, so what is measured is what is finally rendered.

Usage: python3 tools/size-images.py [--check]
       --check exits non-zero if any content image is missing dimensions.
"""

import re
import struct
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
IMG = re.compile(r"<img\b[^>]*>", re.I)
ATTR = re.compile(r"""(\w[\w-]*)\s*=\s*["']([^"']*)["']""")


def png_size(data):
    if data[:8] != b"\x89PNG\r\n\x1a\n":
        return None
    width, height = struct.unpack(">II", data[16:24])
    return width, height


def jpeg_size(data):
    if data[:2] != b"\xff\xd8":
        return None
    index = 2
    while index < len(data) - 9:
        if data[index] != 0xFF:
            index += 1
            continue
        marker = data[index + 1]
        if marker in (0xD8, 0x01) or 0xD0 <= marker <= 0xD7:
            index += 2
            continue
        length = struct.unpack(">H", data[index + 2:index + 4])[0]
        if 0xC0 <= marker <= 0xCF and marker not in (0xC4, 0xC8, 0xCC):
            height, width = struct.unpack(">HH", data[index + 5:index + 9])
            return width, height
        index += 2 + length
    return None


def webp_size(data):
    if data[:4] != b"RIFF" or data[8:12] != b"WEBP":
        return None
    chunk = data[12:16]
    if chunk == b"VP8 ":
        width, height = struct.unpack("<HH", data[26:30])
        return width & 0x3FFF, height & 0x3FFF
    if chunk == b"VP8L":
        bits = struct.unpack("<I", data[21:25])[0]
        return (bits & 0x3FFF) + 1, ((bits >> 14) & 0x3FFF) + 1
    if chunk == b"VP8X":
        width = int.from_bytes(data[24:27], "little") + 1
        height = int.from_bytes(data[27:30], "little") + 1
        return width, height
    return None


def gif_size(data):
    if data[:6] not in (b"GIF87a", b"GIF89a"):
        return None
    return struct.unpack("<HH", data[6:10])


def svg_size(text):
    view_box = re.search(r'viewBox\s*=\s*["\']([\d.\s-]+)["\']', text)
    if view_box:
        parts = view_box.group(1).split()
        if len(parts) == 4:
            return round(float(parts[2])), round(float(parts[3]))
    width = re.search(r'\bwidth\s*=\s*["\'](\d+(?:\.\d+)?)', text)
    height = re.search(r'\bheight\s*=\s*["\'](\d+(?:\.\d+)?)', text)
    if width and height:
        return round(float(width.group(1))), round(float(height.group(1)))
    return None


def intrinsic_size(path):
    try:
        data = path.read_bytes()
    except OSError:
        return None
    if path.suffix.lower() == ".svg":
        return svg_size(data.decode("utf-8", "replace"))
    return png_size(data) or jpeg_size(data) or webp_size(data) or gif_size(data)


def resolve(src, page):
    if src.startswith(("http://", "https://", "data:", "//")):
        return None
    return (page.parent / src.split("?")[0]).resolve()


def process(page, check_only):
    html = page.read_text()
    missing = []
    changed = False

    def replace(match):
        nonlocal changed
        tag = match.group(0)
        attrs = dict((key.lower(), value) for key, value in ATTR.findall(tag))
        if "src" not in attrs or ("width" in attrs and "height" in attrs):
            return tag
        target = resolve(attrs["src"], page)
        if target is None or not target.exists():
            missing.append(attrs["src"])
            return tag
        size = intrinsic_size(target)
        if not size:
            missing.append(attrs["src"])
            return tag
        changed = True
        return tag[:-1].rstrip("/").rstrip() + f' width="{size[0]}" height="{size[1]}"' + ("/>" if tag.endswith("/>") else ">")

    updated = IMG.sub(replace, html)
    if changed and not check_only:
        page.write_text(updated)
    return changed, missing


def main():
    check_only = "--check" in sys.argv
    pages = sorted(ROOT.glob("*.html")) + sorted(ROOT.glob("posts/*.html")) + sorted(ROOT.glob("projects/*.html"))
    touched, unresolved = [], []
    for page in pages:
        changed, missing = process(page, check_only)
        if changed:
            touched.append(page.relative_to(ROOT))
        unresolved += [(page.relative_to(ROOT), src) for src in missing]

    for page, src in unresolved:
        print(f"no intrinsic size: {page} -> {src}")
    if check_only:
        if touched:
            print("images missing width/height in: " + ", ".join(str(p) for p in touched))
            return 1
        print("all content images carry width and height")
        return 1 if unresolved else 0
    print(f"sized images in {len(touched)} file(s)" + (": " + ", ".join(str(p) for p in touched) if touched else ""))
    return 0


if __name__ == "__main__":
    sys.exit(main())
