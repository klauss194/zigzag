import { Events } from "@wailsio/runtime";
import "../../bindings/github.com/wailsapp/wails/v3/internal/eventcreate.js";
import { DebugService as Service } from "../../bindings/github.com/klauss/zigzag-go/internal/modules/debug/index.js";

const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };
const $ = (id) => document.getElementById(id);
const payload = (ev) => ev?.data;

const MAX_ROWS = 5000;

let all = [];
let paused = false;
const areas = new Set();

function passes(e) {
  if (LEVELS[e.level] < Number($("level").value)) return false;
  const area = $("area").value;
  if (area && e.area !== area) return false;
  const needle = $("filter").value.trim().toLowerCase();
  if (needle && !(e.msg + " " + e.area).toLowerCase().includes(needle)) return false;
  return true;
}

function rowFor(e) {
  const row = document.createElement("div");
  row.className = "row " + e.level;
  const t = document.createElement("span"); t.className = "t"; t.textContent = e.time;
  const l = document.createElement("span"); l.className = "l " + e.level; l.textContent = e.level;
  const a = document.createElement("span"); a.className = "a"; a.textContent = e.area;
  const m = document.createElement("span"); m.className = "m"; m.textContent = e.msg;
  row.append(t, l, a, m);
  return row;
}

function render() {
  const out = $("out");
  const visible = all.filter(passes);
  out.textContent = "";
  if (!visible.length) {
    out.innerHTML = '<div class="empty">No lines match.</div>';
  } else {
    const frag = document.createDocumentFragment();
    for (const e of visible) frag.appendChild(rowFor(e));
    out.appendChild(frag);
  }
  $("shown").textContent = visible.length;
  $("total").textContent = all.length;
  if ($("follow").classList.contains("on")) out.scrollTop = out.scrollHeight;
}

async function copyVisible() {
  const visible = all.filter(passes);
  const text = visible
    .map((e) => `${e.time} ${e.level.padEnd(5)} ${e.area.padEnd(9)} ${e.msg}`)
    .join("\n");

  const btn = $("copy");
  try {
    await navigator.clipboard.writeText(text);
    btn.textContent = `Copied ${visible.length}`;
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    btn.textContent = document.execCommand("copy") ? `Copied ${visible.length}` : "Copy failed";
    ta.remove();
  }
  setTimeout(() => { btn.textContent = "Copy"; }, 1500);
}

function addArea(name) {
  if (!name || areas.has(name)) return;
  areas.add(name);
  const opt = document.createElement("option");
  opt.value = opt.textContent = name;
  $("area").appendChild(opt);
}

function append(e) {
  all.push(e);
  addArea(e.area);
  if (all.length > MAX_ROWS) all = all.slice(-MAX_ROWS);
  if (paused) return;

  if (!passes(e)) { $("total").textContent = all.length; return; }

  const out = $("out");
  if (out.firstElementChild?.className === "empty") out.textContent = "";
  out.appendChild(rowFor(e));
  while (out.childElementCount > MAX_ROWS) out.removeChild(out.firstChild);
  $("shown").textContent = Number($("shown").textContent) + 1;
  $("total").textContent = all.length;
  if ($("follow").classList.contains("on")) out.scrollTop = out.scrollHeight;
}

for (const id of ["level", "area", "filter"]) {
  $(id).addEventListener("input", render);
}
$("pause").addEventListener("click", () => {
  paused = !paused;
  $("pause").textContent = paused ? "Resume" : "Pause";
  $("pause").classList.toggle("on", paused);
  if (!paused) render();
});
$("follow").addEventListener("click", () => $("follow").classList.toggle("on"));
$("copy").addEventListener("click", copyVisible);
$("clear").addEventListener("click", () => { all = []; render(); });

const live = [];
let bootstrapped = false;

Events.On("trace:line", (ev) => {
  const e = payload(ev);
  if (!e) return;
  if (!bootstrapped) { live.push(e); return; }
  append(e);
});

const history = await Service.TraceSnapshot().catch(() => []);
const seen = new Set();
for (const e of [...(history || []), ...live]) {
  if (seen.has(e.seq)) continue;
  seen.add(e.seq);
  all.push(e);
  addArea(e.area);
}
bootstrapped = true;
render();

setInterval(async () => {
  const n = await Service.TraceDropped().catch(() => 0);
  const el = $("dropped");
  el.hidden = !n;
  if (n) el.textContent = `${n} dropped (viewer fell behind)`;
}, 2000);
