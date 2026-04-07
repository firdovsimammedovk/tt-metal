#!/usr/bin/env bash
# Build GitHub Pages tree for tt-metal docs:
#   - "latest" (main): site root contains ttnn/, tt-metalium/, index.html
#   - each tag v*: /<tag>/ttnn/, /<tag>/tt-metalium/, etc.
#
# Intended to run in CI after: venv, submodules, system deps, pip install, and
# TT_METAL_HOME set. Activates .ci-docs-venv when present.
set -euo pipefail

ROOT="${GITHUB_WORKSPACE:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"
cd "$ROOT"
export TT_METAL_HOME="${TT_METAL_HOME:-$ROOT}"

if [[ -f "${ROOT}/.ci-docs-venv/bin/activate" ]]; then
  # shellcheck source=/dev/null
  source "${ROOT}/.ci-docs-venv/bin/activate"
fi

PAGES="${ROOT}/pages"
rm -rf "$PAGES"
mkdir -p "$PAGES"

LIMIT="${DOCS_VERSION_TAG_LIMIT:-10}"
BASE_SHA="$(git rev-parse HEAD)"

export DOC_SITE_BASE_URL="${DOC_SITE_BASE_URL:-https://firdovsimammedovk.github.io/tt-metal}"

_submodules_sync() {
  git submodule sync --recursive
  git submodule update --init --recursive --jobs 8
}

echo "::group::Build latest (main) at site root"
export DOCS_VERSION="latest"
cd docs
make html
cd "$ROOT"
cp -a docs/build/html/. "$PAGES/"
echo "::endgroup::"

if [[ -n "${DOCS_SEARCH_INGEST_API_KEY:-}" ]]; then
  echo "::group::Index search (latest tree only)"
  export DOCS_OUTPUT_DIR="$PAGES"
  export DOCS_INDEX_VERSION="latest"
  if ! python docs/scripts/index_remote_search.py; then
    echo "::warning::Search indexing failed (non-fatal)"
  fi
  echo "::endgroup::"
fi

echo "::group::Build tagged releases under /<tag>/"
TAGLIST="$(git tag -l 'v*' --sort=-version:refname | head -n "$LIMIT")"
if [[ -z "$TAGLIST" ]]; then
  TAGLIST="$(git tag -l --sort=-version:refname | head -n "$LIMIT")"
fi

while IFS= read -r tag; do
  [[ -z "${tag:-}" ]] && continue
  [[ "$tag" == "latest" ]] && continue

  if ! git checkout -q "$tag"; then
    echo "::warning::Could not checkout tag $tag — skip"
    continue
  fi
  _submodules_sync || {
    echo "::warning::submodule sync failed for $tag — skip"
    git checkout -q "$BASE_SHA"
    _submodules_sync || true
    continue
  }
  if [[ ! -f docs/Makefile ]]; then
    echo "::warning::No docs/Makefile at $tag — skip"
    git checkout -q "$BASE_SHA"
    _submodules_sync || true
    continue
  fi

  echo "Building docs for tag $tag"
  cd docs
  rm -rf build
  export DOCS_VERSION="$tag"
  if ! make html; then
    echo "::warning::make html failed for $tag — skip"
    cd "$ROOT"
    git checkout -q "$BASE_SHA"
    _submodules_sync || true
    continue
  fi
  cd "$ROOT"
  mkdir -p "$PAGES/$tag"
  cp -a docs/build/html/. "$PAGES/$tag/"
  git checkout -q "$BASE_SHA"
  _submodules_sync || true
done <<< "$(printf '%s\n' "$TAGLIST")"

echo "::endgroup::"
echo "Pages output: $PAGES"
find "$PAGES" -maxdepth 3 -type f -name 'index.html' 2>/dev/null | head -30 || true
