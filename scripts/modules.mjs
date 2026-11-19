#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = path.join(repoRoot, "modules.json");

export function loadManifest() {
  const raw = JSON.parse(readFileSync(manifestPath, "utf8"));
  return Object.fromEntries(Object.entries(raw).filter(([name]) => !name.startsWith("/")));
}

function parseList(value) {
  return (value || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function withoutFromArgv(argv) {
  let found = null;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--without=")) found = a.slice("--without=".length);
    else if (a === "--without" && i + 1 < argv.length) found = argv[++i];
  }
  return found;
}

export function stripWithout(argv) {
  const out = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--without=")) continue;
    if (a === "--without") { i++; continue; }
    out.push(a);
  }
  return out;
}

export function resolveModules({ argv = process.argv.slice(2), env = process.env } = {}) {
  const manifest = loadManifest();
  const names = Object.keys(manifest);
  const fromArg = withoutFromArgv(argv);
  const requested = parseList(fromArg !== null ? fromArg : env.ZIGZAG_EXCLUDE);

  const unknown = requested.filter((n) => !names.includes(n));
  if (unknown.length) {
    const err = new Error(
      `unknown module(s): ${unknown.join(", ")} — known: ${names.join(", ")} (modules.json)`,
    );
    err.code = "ZZ_UNKNOWN_MODULE";
    throw err;
  }

  const excluded = new Set(requested);
  const enabled = new Set(names.filter((n) => !excluded.has(n)));
  const ordered = names.filter((n) => excluded.has(n));
  return {
    manifest,
    enabled,
    excluded,
    goTags: ordered.map((n) => `no_${n}`),
    zigFlags: ordered.flatMap((n) => manifest[n].zigFlags || []),
    gradleProps: names
      .filter((n) => manifest[n].android?.gradleProperty)
      .map((n) => `-P${manifest[n].android.gradleProperty}=${enabled.has(n)}`),
    excludeEnv: ordered.join(","),
    suffix: ordered.map((n) => `-no-${n}`).join(""),
    flavor: ordered.length ? ordered.map((n) => `no-${n}`).join("-") : "full",
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [cmd, ...rest] = process.argv.slice(2);
  let mods;
  try {
    mods = resolveModules({ argv: rest });
  } catch (e) {
    process.stderr.write(`modules: ${e.message}\n`);
    process.exit(2);
  }
  switch (cmd) {
    case "go-tags": console.log(mods.goTags.join(",")); break;
    case "zig-flags": console.log(mods.zigFlags.join(" ")); break;
    case "excluded": console.log(mods.excludeEnv); break;
    case "suffix": console.log(mods.suffix); break;
    case "flavor": console.log(mods.flavor); break;
    case "gradle-props": console.log(mods.gradleProps.join(" ")); break;
    case "has": {
      const name = stripWithout(rest)[0];
      if (!name || !(name in mods.manifest)) {
        process.stderr.write(`modules: has needs a known module name\n`);
        process.exit(2);
      }
      process.exit(mods.enabled.has(name) ? 0 : 1);
    }
    default:
      process.stderr.write("usage: modules.mjs go-tags|zig-flags|excluded|suffix|flavor|gradle-props|has <name> [--without=a,b]\n");
      process.exit(2);
  }
}
