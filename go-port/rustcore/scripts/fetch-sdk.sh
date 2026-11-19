#!/usr/bin/env bash
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"
SDK_URL="${SDK_URL:-https://github.com/matrix-org/matrix-rust-sdk}"
SDK_BASE="${SDK_BASE:-96ffd1a0b3fc8fe950774a32893c8f12743af007}"
DEST="$ROOT/vendor/matrix-rust-sdk"
STAMP="$ROOT/vendor/.stamp"

want="$SDK_BASE $(cat "$ROOT"/sdk-patches/*.patch | sha256sum | cut -d' ' -f1)"
if [[ -f "$STAMP" && "$(cat "$STAMP")" == "$want" && -d "$DEST/.git" ]]; then
  echo "vendor/matrix-rust-sdk is current ($SDK_BASE + $(ls "$ROOT"/sdk-patches/*.patch | wc -l) patches)"
  exit 0
fi

mkdir -p "$ROOT/vendor"
if [[ ! -d "$DEST/.git" ]]; then
  git clone --no-checkout "$SDK_URL" "$DEST"
fi
cd "$DEST"
if ! git cat-file -e "$SDK_BASE^{commit}" 2>/dev/null; then
  git fetch "$SDK_URL" "$SDK_BASE" || git fetch "$SDK_URL"
fi
git -c advice.detachedHead=false checkout --force "$SDK_BASE"
git clean -fdq
for p in "$ROOT"/sdk-patches/*.patch; do
  echo "applying $(basename "$p")"
  git apply --whitespace=nowarn "$p"
done
echo "$want" > "$STAMP"
echo "vendor/matrix-rust-sdk = $SDK_BASE + $(ls "$ROOT"/sdk-patches/*.patch | wc -l) patches"
