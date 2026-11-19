#!/usr/bin/env bash
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"
TOOLCHAIN="${TOOLCHAIN:-1.94.0}"
PROFILE="${PROFILE:-release}"
TARGET="${TARGET:-}"
CARGO="${CARGO:-$HOME/.cargo/bin/cargo}"

"$HERE/fetch-sdk.sh"

staticlib_only=0
case "$TARGET" in
  *-windows-gnullvm)
    staticlib_only=1
    t="${TARGET//-/_}"
    cc_var="CC_$t" ar_var="AR_$t"
    cc="$HERE/zig-cc.sh" ar="$HERE/zig-ar.sh"
    case "$(uname -s)" in
      MINGW*|MSYS*|CYGWIN*)
        export ZIGZAG_BASH="$(cygpath -w "$BASH")"
        cc="$HERE/zig-cc.cmd"
        sysroot="$("$(dirname "$CARGO")/rustc" +"$TOOLCHAIN" --print sysroot)"
        host="$("$(dirname "$CARGO")/rustc" +"$TOOLCHAIN" -vV | sed -n 's/^host: //p')"
        ar="$(cygpath -w "$sysroot/lib/rustlib/$host/bin/llvm-ar.exe")"
        if [[ -z "${!ar_var:-}" && ! -f "$ar" ]]; then
          echo "build.sh: no llvm-ar.exe; run: rustup component add llvm-tools --toolchain $TOOLCHAIN" >&2
          exit 1
        fi
        ;;
    esac
    [[ -n "${!cc_var:-}" ]] || export "$cc_var=$cc"
    [[ -n "${!ar_var:-}" ]] || export "$ar_var=$ar"
    ;;
esac

if [[ "$(uname -s)" == Darwin && -z "${MACOSX_DEPLOYMENT_TARGET:-}" && ( -z "$TARGET" || "$TARGET" == *-apple-* ) ]]; then
  dt_args=(+"$TOOLCHAIN" --print deployment-target)
  [[ -n "$TARGET" ]] && dt_args+=(--target "$TARGET")
  dt="$("$(dirname "$CARGO")/rustc" "${dt_args[@]}")"
  export MACOSX_DEPLOYMENT_TARGET="${dt##*=}"
fi

case "$TARGET" in
  *-linux-android) export RUSTFLAGS="${RUSTFLAGS:+$RUSTFLAGS }-C link-arg=-Wl,-soname,libzigzag_rustcore.so" ;;
esac

args=(+"$TOOLCHAIN" build --locked --profile "$PROFILE")
[[ -n "$TARGET" ]] && args+=(--target "$TARGET")

cd "$ROOT"
start=$(date +%s)
[[ "$staticlib_only" == 1 ]] || "$CARGO" "${args[@]}"
if [[ "$PROFILE" == "dist" || "$staticlib_only" == 1 ]]; then
  rustc_args=(+"$TOOLCHAIN" rustc --locked --profile "$PROFILE" --lib --crate-type staticlib)
  [[ -n "$TARGET" ]] && rustc_args+=(--target "$TARGET")
  "$CARGO" "${rustc_args[@]}"
fi
echo "cargo build ($PROFILE) took $(( $(date +%s) - start ))s"

dir="target"
[[ -n "$TARGET" ]] && dir="$dir/$TARGET"
if [[ "$PROFILE" == "dev" ]]; then dir="$dir/debug"; else dir="$dir/$PROFILE"; fi

host_triple="$("$HOME/.cargo/bin/rustc" +"$TOOLCHAIN" -vV | sed -n 's/^host: //p')"
triple="${TARGET:-$host_triple}"
case "$triple" in
  *-apple-*) shared=libzigzag_rustcore.dylib; static=libzigzag_rustcore.a ;;
  *-windows-msvc) shared=zigzag_rustcore.dll; static=zigzag_rustcore.lib ;;
  *-windows-*) shared=zigzag_rustcore.dll; static=libzigzag_rustcore.a ;;
  *) shared=libzigzag_rustcore.so; static=libzigzag_rustcore.a ;;
esac
dests=("lib/$triple")
[[ -z "$TARGET" ]] && dests+=("lib")
for dest in "${dests[@]}"; do
  mkdir -p "$dest"
  for lib in "$static" "$shared"; do
    [[ -f "$dir/$lib" ]] || continue
    if ! cmp -s "$dir/$lib" "$dest/$lib"; then
      cp -f "$dir/$lib" "$dest/.$lib.new"
      mv -f "$dest/.$lib.new" "$dest/$lib"
    fi
  done
  ls -l "$dest/$static"
done
