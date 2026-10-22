#!/usr/bin/env python3
"""Stamp each field note's reading time into posts/posts.json.

The Field Notes index shows every note's reading time, and the note itself
shows one too. The note counts its own words in the browser; the index has
only posts.json to go on, so the minutes are kept there. Counted by hand they
drift the moment a note is edited. Here they are counted the way site.js
counts them (the words of article.note-body, 220 a minute, rounded, never
less than one), so the index and the note always agree.

Usage: python3 tools/reading-times.py [--check]
       --check exits non-zero if any note's minutes are missing or stale.
"""

import html
import json
import math
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
POSTS = ROOT / "posts" / "posts.json"
WORDS_PER_MINUTE = 220  # NOTE_WORDS_PER_MINUTE in site.js
ARTICLE = re.compile(r'<article class="note-body[^"]*">(.*?)</article>', re.S)
TAG = re.compile(r"<[^>]*>")


def minutes(page):
    match = ARTICLE.search(page.read_text())
    if not match:
        return None
    # The same text the browser's textContent gives: tags vanish, entities resolve.
    text = html.unescape(TAG.sub("", match.group(1)))
    words = len(text.split())
    return max(1, math.floor(words / WORDS_PER_MINUTE + 0.5))


def main():
    check_only = "--check" in sys.argv
    posts = json.loads(POSTS.read_text())
    stale, unreadable = [], []
    for post in posts:
        count = minutes(ROOT / post["path"])
        if count is None:
            unreadable.append(post["path"])
            continue
        if post.get("minutes") != count:
            stale.append(f'{post["path"]} ({post.get("minutes")} -> {count})')
            post["minutes"] = count

    for path in unreadable:
        print(f"no article.note-body in {path}")
    if check_only:
        if stale:
            print("stale reading times: " + ", ".join(stale))
            print("run: python3 tools/reading-times.py")
            return 1
        print("every note's reading time is current")
        return 1 if unreadable else 0
    if stale:
        POSTS.write_text(json.dumps(posts, indent=2, ensure_ascii=False))
    print(f"updated {len(stale)} reading time(s)" + (": " + ", ".join(stale) if stale else ""))
    return 1 if unreadable else 0


if __name__ == "__main__":
    sys.exit(main())
