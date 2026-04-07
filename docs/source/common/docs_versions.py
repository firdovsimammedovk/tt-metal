# SPDX-FileCopyrightText: © 2023 Tenstorrent Inc.
# SPDX-License-Identifier: Apache-2.0
"""Resolve documentation version lists for the Sphinx switcher.

Priority:
1. DOCS_PUBLISHED_VERSIONS — comma-separated list (optional CI override).
2. Git tags in the repository (see DOCS_VERSION_TAG_PATTERN, DOCS_VERSION_TAG_LIMIT).

Requires a full clone in CI (fetch-depth: 0) so tags are visible.
"""

from __future__ import annotations

import os
import subprocess
from pathlib import Path


def _parse_env_list(raw: str) -> list[str]:
    return [x.strip() for x in raw.split(",") if x.strip()]


def _git_toplevel(cwd: Path) -> Path | None:
    try:
        proc = subprocess.run(
            ["git", "rev-parse", "--show-toplevel"],
            cwd=cwd,
            capture_output=True,
            text=True,
            check=True,
            timeout=60,
        )
        root = Path(proc.stdout.strip())
        return root if root.is_dir() else None
    except (subprocess.CalledProcessError, FileNotFoundError, OSError):
        return None


def _tags_from_git(repo_root: Path, pattern: str, max_tags: int) -> list[str]:
    try:
        proc = subprocess.run(
            ["git", "tag", "-l", pattern, "--sort=-version:refname"],
            cwd=repo_root,
            capture_output=True,
            text=True,
            check=True,
            timeout=120,
        )
    except (subprocess.CalledProcessError, FileNotFoundError, OSError):
        return []
    tags = [t.strip() for t in proc.stdout.splitlines() if t.strip()]
    return tags[:max_tags]


def get_published_versions(conf_file: Path) -> list[str]:
    """Return ordered version names for the docs switcher (``latest`` first)."""
    override = os.environ.get("DOCS_PUBLISHED_VERSIONS", "").strip()
    if override:
        return _parse_env_list(override)

    pattern = os.environ.get("DOCS_VERSION_TAG_PATTERN", "v*").strip() or "v*"
    try:
        max_tags = int(os.environ.get("DOCS_VERSION_TAG_LIMIT", "50"))
    except ValueError:
        max_tags = 50
    if max_tags < 1:
        max_tags = 50

    cwd = conf_file.resolve().parent
    root = _git_toplevel(cwd)
    if root is None:
        return ["latest"]

    tags = _tags_from_git(root, pattern, max_tags)
    # If the default v* pattern matches nothing, fall back to all tags (e.g. 1.0.0 without v prefix).
    if not tags and pattern == "v*" and not os.environ.get("DOCS_VERSION_TAG_PATTERN"):
        tags = _tags_from_git(root, "*", max_tags)

    out = ["latest"]
    for t in tags:
        if t == "latest":
            continue
        if t not in out:
            out.append(t)
    return out
