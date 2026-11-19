import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { findGo } from "../../scripts/find-go.mjs";

const log = (msg) => process.stdout.write(`[frontend] ${msg}\n`);

const argv = process.argv.slice(2);
const at = argv.indexOf("--mode");
const mode = at >= 0 ? argv[at + 1] : "release";
if (mode !== "release" && mode !== "dev") {
  log(`usage: node build.mjs --mode release|dev (got ${JSON.stringify(mode)})`);
  process.exit(2);
}

const goPort = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const go = findGo(log);
const result = spawnSync(go, ["run", "./cmd/frontendbuild", "-mode", mode], {
  cwd: goPort,
  stdio: "inherit",
  env: process.env,
});
if (result.error) {
  log(`could not run ${go}: ${result.error.message}`);
  process.exit(1);
}
process.exit(result.status ?? 1);
