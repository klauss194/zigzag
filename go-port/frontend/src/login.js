import { Service } from "../bindings/github.com/klauss/zigzag-go/internal/bridge/index.js";
import { Window } from "@wailsio/runtime";
import { isMobile } from "./platform/device.js";
import { SignUp } from "./domain/sign-up.js";

if (isMobile) document.documentElement.dataset.platform = "mobile";

const $ = (id) => document.getElementById(id);

function ulog(level, msg) {
  try { Service.TraceUI(level, "auth", msg).catch(() => {}); } catch {  }
}

const query = new URLSearchParams(location.search);
const lastServer = query.get("hs");

const preview = query.get("preview") === "mobile";
if (preview) document.documentElement.dataset.platform = "mobile";

async function enter({ button, error, open, passwords, outcome, explain }) {
  button.disabled = true;
  error.textContent = "";

  try {
    const session = await open();
    for (const field of passwords) field.value = "";
    ulog("info", `${outcome} as ${session.userId} (${session.deviceId})`);

    await Service.EnterApp();
  } catch (e) {
    error.textContent = explain(String(e && e.message ? e.message : e));
    button.disabled = false;
  }
}

$("login").addEventListener("submit", (event) => {
  event.preventDefault();
  if (preview) return;
  if (!$("hs").value.trim()) {
    $("err").textContent = "Enter your server";
    return;
  }
  enter({
    button: $("go"),
    error: $("err"),
    open: () => Service.Login($("hs").value.trim(), $("user").value.trim(), $("pass").value),
    passwords: [$("pass")],
    outcome: "signed in",
    explain: (text) => text,
  });
});

$("signup").addEventListener("submit", (event) => {
  event.preventDefault();
  if (preview) return;
  const fields = {
    homeserver: $("new-hs").value,
    code: $("code").value, username: $("new-user").value,
    password: $("new-pass").value, confirm: $("new-confirm").value,
  };
  const problem = SignUp.problem(fields);
  if (problem) {
    $("signup-err").textContent = problem;
    return;
  }
  enter({
    button: $("create"),
    error: $("signup-err"),
    open: () => Service.Register(fields.homeserver.trim(), fields.username.trim(), fields.password, fields.code.trim()),
    passwords: [$("new-pass"), $("new-confirm")],
    outcome: "signed up",
    explain: SignUp.sentence,
  });
});

function show(mode) {
  const signingUp = mode === "signup";
  $("login").hidden = signingUp;
  $("signup").hidden = !signingUp;
  (signingUp ? firstEmptySignUpField() : firstEmptySignInField()).focus();
}
$("to-signup").addEventListener("click", (event) => { event.preventDefault(); show("signup"); });
$("to-login").addEventListener("click", (event) => { event.preventDefault(); show("login"); });

$("close").addEventListener("click", () => { Window.Close(); });

if (lastServer) {
  for (const id of ["hs", "new-hs"]) if (!$(id).value) $(id).value = lastServer;
}

function firstEmptySignInField() {
  return $("hs").value ? $("user") : $("hs");
}
function firstEmptySignUpField() {
  return $("new-hs").value ? $("code") : $("new-hs");
}
firstEmptySignInField().focus();
