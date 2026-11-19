#!/bin/sh
set -eu
if [ -z "${ZIG_TARGET:-}" ]; then
  case "${TARGET:-}" in
    x86_64-*-windows-*) ZIG_TARGET=x86_64-windows-gnu ;;
    aarch64-*-windows-*) ZIG_TARGET=aarch64-windows-gnu ;;
    *) echo "zig-cc.sh: set ZIG_TARGET (cargo TARGET='${TARGET:-}' is not a windows triple)" >&2; exit 1 ;;
  esac
fi
for a in "$@"; do
  shift
  case "$a" in --target=*) ;; *) set -- "$@" "$a" ;; esac
done
exec zig cc -target "$ZIG_TARGET" -fno-sanitize=undefined "$@"
