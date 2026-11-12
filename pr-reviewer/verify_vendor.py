#!/usr/bin/env python3
"""Verify the vendored reviewer matches what the paved road published.

This repo cannot put the paved road's `agent/` on PYTHONPATH the way that repo's
own workflow does, so it carries a generated copy. A copy is a liability: the
paved road once shipped a vendored reviewer that drifted 100 lines from the core
and silently reviewed with different logic than the core its tests covered. The
manifest records the source commit and a sha256 per file; this check fails the
build if any of them no longer match, if a bundle file is missing from the
manifest, or if the manifest is empty or malformed.

What it does not prove: the manifest lives in this repo, so it shows the copy is
intact, not that it came from the paved road. That trust comes from loading the
tooling at the base SHA, from the guard refusing PRs that touch pr-reviewer/,
and from branch protection on the base branch.

Run it in the same workflow as the review, BEFORE the review, so a tampered or
stale reviewer stops the build rather than producing a verdict nobody can trust.
"""
import hashlib
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
MANIFEST = ROOT / "pr-reviewer" / "VENDOR_MANIFEST.yaml"
# Not hashed: the manifest itself and this checker, which live only here.
UNHASHED = {"pr-reviewer/VENDOR_MANIFEST.yaml", "pr-reviewer/verify_vendor.py"}


def _bundle_files() -> tuple[set[str], list[str]]:
    """(every file the manifest must cover, problems). Nothing in the tree is
    skipped: bytecode, a cache directory, a symlink or a special file in the
    bundle is a problem, because Python can run it without it being hashed."""
    files, problems = set(), []
    for p in sorted((ROOT / "pr-reviewer").rglob("*")):
        name = p.relative_to(ROOT).as_posix()
        if p.is_symlink():
            problems.append(f"symlink in the bundle: {name}")
        elif p.is_dir():
            if p.name == "__pycache__":
                problems.append(f"bytecode cache in the bundle: {name} (delete it; run "
                                f"the lanes with python -B or PYTHONDONTWRITEBYTECODE=1)")
        elif not p.is_file():
            problems.append(f"not a regular file: {name}")
        elif p.suffix in (".pyc", ".pyo"):
            problems.append(f"bytecode in the bundle: {name}")
        else:
            files.add(name)
    return (files - UNHASHED) | {".reviewer.yaml"}, problems


def main() -> int:
    if not MANIFEST.exists():
        print(f"VENDOR CHECK: FAIL — no manifest at {MANIFEST.relative_to(ROOT)}")
        return 1
    source_commit, entries, in_files = "", {}, False
    for raw in MANIFEST.read_text().splitlines():
        line = raw.strip()
        if line.startswith("#") or not line:
            continue
        if line == "files:":
            in_files = True
            continue
        if line.startswith("source_commit:"):
            source_commit = line.split(":", 1)[1].strip()
        elif in_files and ":" in line:
            name, digest = line.rsplit(":", 1)
            entries[name.strip()] = digest.strip()

    bundle, problems = _bundle_files()
    if not re.fullmatch(r"[0-9a-f]{40}", source_commit):
        problems.append("source_commit is not a full 40-character commit SHA")
    # Fail closed on an empty, partial or reformatted manifest: every file of the
    # bundle must be listed, and nothing else. A file the manifest does not name
    # would otherwise run unchecked.
    for name in sorted(bundle - set(entries)):
        problems.append(f"not in manifest: {name}")
    for name in sorted(set(entries) - bundle):
        problems.append(f"listed but not part of the bundle: {name}")
    for name, want in entries.items():
        if not re.fullmatch(r"[0-9a-f]{64}", want):
            problems.append(f"malformed sha256: {name}")
            continue
        path = ROOT / name
        if not path.exists():
            problems.append(f"missing: {name}")
            continue
        got = hashlib.sha256(path.read_bytes()).hexdigest()
        if got != want:
            problems.append(f"modified: {name}")

    print(f"vendored from {source_commit[:8]} — {len(entries)} file(s) checked")
    for p in problems:
        print(f"  {p}")
    if problems:
        print("VENDOR CHECK: FAIL — the reviewer in this repo is not the one the "
              "paved road published. Re-run scripts/vendor_reviewer.sh from "
              "sample-agentic-cicd-gates rather than editing the copy.")
        return 1
    print("VENDOR CHECK: PASS")
    return 0


if __name__ == "__main__":
    sys.exit(main())
