#!/usr/bin/env bash
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"
OUT="$(cd "$ROOT/../internal/rustcore" 2>/dev/null && pwd || (mkdir -p "$ROOT/../internal/rustcore" && cd "$ROOT/../internal/rustcore" && pwd))"
UBG="${UBG:-$(command -v uniffi-bindgen-go || echo "$HOME/.cargo/bin/uniffi-bindgen-go")}"
case "$(uname -s)" in
  Darwin) LIB="$ROOT/lib/libzigzag_rustcore.dylib" ;;
  *) LIB="$ROOT/lib/libzigzag_rustcore.so" ;;
esac

[[ -x "$UBG" ]] || { echo "uniffi-bindgen-go not found (set UBG=...)"; exit 1; }
[[ -f "$LIB" ]] || { echo "$LIB missing — run scripts/build.sh first"; exit 1; }
"$UBG" --version

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
export PATH="$HOME/sdk/go1.26.6/bin:$PATH"
cd "$ROOT"
"$UBG" "$LIB" --out-dir "$tmp" --config "$ROOT/uniffi.toml"
find "$tmp" -type f \( -name '*.go' -o -name '*.h' \) -exec cp -f {} "$OUT/" \;
sed -i.bak 's/^package zigzag_rustcore$/package rustcore/' "$OUT/zigzag_rustcore.go" && rm -f "$OUT/zigzag_rustcore.go.bak"
ls -l "$OUT"
