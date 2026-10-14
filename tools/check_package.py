#!/usr/bin/env python3
"""Check the exact publication file allowlist and local Markdown links."""
from pathlib import Path
import re
import subprocess
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parents[1]
DOCUMENT_SUFFIXES = {".doc", ".docx", ".pdf", ".ppt", ".pptx"}


def check_paths(actual, allowed):
    errors = []
    for path in sorted(actual - allowed):
        errors.append(f"Unapproved file: {path}")
    for path in sorted(allowed - actual):
        errors.append(f"Missing approved file: {path}")
    for path in sorted(actual):
        name = Path(path)
        if name.suffix.lower() in DOCUMENT_SUFFIXES:
            errors.append(f"Document format not permitted: {path}")
        if re.search(r"handover|agenda|workshop-summary|(^|/)private/", path, re.I):
            errors.append(f"Delivery material not permitted: {path}")
    return errors


def check_links(root, paths):
    errors = []
    root = root.resolve()
    for name in sorted(paths):
        if not name.endswith(".md"):
            continue
        source = root / name
        for target in re.findall(r"!?\[[^\]]*\]\(([^)\s]+)\)", source.read_text()):
            parsed = urlsplit(target)
            if parsed.scheme or parsed.netloc or not parsed.path:
                continue
            resolved = (source.parent / unquote(parsed.path)).resolve()
            if not resolved.is_relative_to(root) or not resolved.exists():
                errors.append(f"{name}: missing or external local target: {target}")
    return errors


def main():
    allowed = set((ROOT / "public-files.txt").read_text().splitlines())
    actual = set(filter(None, subprocess.check_output([
        "git", "-C", str(ROOT), "ls-files", "--cached", "--others",
        "--exclude-standard", "-z",
    ]).decode().split("\0")))
    errors = check_paths(actual, allowed)
    errors += check_links(ROOT, actual & allowed)
    if errors:
        raise SystemExit("\n".join(errors))
    print(f"PASS: {len(actual)} allowlisted files; no delivery documents; local Markdown links resolve.")


if __name__ == "__main__":
    main()
