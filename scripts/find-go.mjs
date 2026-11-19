import { spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";

const isWindows = process.platform === "win32";
const exe = isWindows ? ".exe" : "";

function goCandidates() {
  const dirs = [];
  if (process.env.GOROOT) dirs.push(path.join(process.env.GOROOT, "bin"));
  const sdk = path.join(process.env.HOME || process.env.USERPROFILE || "", "sdk");
  if (existsSync(sdk)) {
    const versioned = readdirSync(sdk)
      .filter((name) => name.startsWith("go"))
      .sort()
      .reverse();
    dirs.push(...versioned.map((name) => path.join(sdk, name, "bin")));
  }
  dirs.push("/usr/local/go/bin", "/usr/lib/go/bin");
  if (isWindows) {
    for (const root of [process.env.ProgramW6432, process.env.ProgramFiles]) {
      if (root) dirs.push(path.join(root, "Go", "bin"));
    }
    dirs.push("C:\\Program Files\\Go\\bin", "C:\\Go\\bin");
  }
  return [...new Set(dirs)];
}

export function findGo(log) {
  const probe = (cmd, useShell) => {
    const r = spawnSync(cmd, ["version"], { stdio: "ignore", shell: useShell });
    return r.status === 0;
  };
  if (probe(`go${exe}`, isWindows)) return `go${exe}`;
  const tried = [];
  for (const dir of goCandidates()) {
    const candidate = path.join(dir, `go${exe}`);
    tried.push(candidate);
    if (existsSync(candidate) && probe(candidate, false)) return candidate;
  }
  log(`no go toolchain found. Looked on PATH and at:`);
  for (const t of tried) log(`  ${t}`);
  log(`install Go 1.25+ or put it on PATH, then retry`);
  process.exit(1);
}
