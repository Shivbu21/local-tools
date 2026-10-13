/* RingQ — owner dashboard (admin.html). Passcode gate, stats, event log,
   template editor. All localStorage-backed. */

"use strict";

const $ = (s, r = document) => r.querySelector(s);

const LS_CFG = "ringq_config";
const LS_EVENTS = "ringq_events";
const LS_PASS = "ringq_pass";
// SHA-256 of the default passcode "1234".
const DEFAULT_HASH = "03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4";

const HOOK_SAMPLE = `const express = require("express");
const app = express();
app.use(express.urlencoded({ extended: true }));

const TEMPLATE = "Hi {name}! Thanks for calling {business}. Here is our price list: {menu_link}";

function render(tpl, v) {
  return tpl.replaceAll("{name}", v.name || "there")
            .replaceAll("{business}", v.business)
            .replaceAll("{menu_link}", v.menu_link);
}

// Exotel / Knowlarity POST { From, To, timestamp } here on every missed call.
app.post("/missed-call", async (req, res) => {
  const { From, To, timestamp } = req.body;
  const message = render(TEMPLATE, {
    name: "", // caller name unknown on a missed call
    business: process.env.BUSINESS_NAME,
    menu_link: process.env.MENU_LINK,
  });
  // Send via WhatsApp Business Cloud API:
  await fetch(\`https://graph.facebook.com/v21.0/\${process.env.WA_PHONE_ID}/messages\`, {
    method: "POST",
    headers: { Authorization: "Bearer " + process.env.WA_TOKEN,
               "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp",
      to: From.replace(/\\D/g, ""),
      type: "text", text: { body: message } }),
  });
  // Also log the event wherever you keep RingQ events.
  console.log("missed call", { From, To, timestamp, sent: true });
  res.sendStatus(200);
});

app.listen(3000, () => console.log("RingQ webhook on :3000"));`;

/* ---------- hashing (SHA-256 via WebCrypto, plain fallback off-localhost) ---------- */
async function sha256hex(str) {
  if (window.crypto && crypto.subtle) {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
  }
  return "plain:" + str; // non-secure context fallback (file://); still a speed bump
}
function getPassHash() {
  return localStorage.getItem(LS_PASS) || DEFAULT_HASH;
}

/* ---------- storage ---------- */
function loadCfg() {
  try {
    const raw = localStorage.getItem(LS_CFG);
    if (raw) return JSON.parse(raw);
  } catch (_) { /* ignore */ }
  return {};
}
function saveCfg(cfg) {
  localStorage.setItem(LS_CFG, JSON.stringify(cfg));
}
function loadEvents() {
  try {
    const raw = localStorage.getItem(LS_EVENTS);
    if (raw) return JSON.parse(raw);
  } catch (_) { /* ignore */ }
  return [];
}
function saveEvents(evs) {
  localStorage.setItem(LS_EVENTS, JSON.stringify(evs));
}

/* ---------- helpers ---------- */
function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.remove("show"), 2600);
}
function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function timeAgo(iso) {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return m + "m ago";
  const h = Math.round(m / 60);
  if (h < 24) return h + "h ago";
  return new Date(iso).toLocaleDateString();
}
function isToday(iso) {
  const d = new Date(iso), n = new Date();
  return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
}

/* ---------- gate ---------- */
async function boot() {
  $("#todayLine").textContent = new Date().toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" });
  $("#hookCode").textContent = HOOK_SAMPLE;

  $("#btnUnlock").onclick = tryUnlock;
  $("#inPass").addEventListener("keydown", (e) => { if (e.key === "Enter") tryUnlock(); });
  $("#view-lock").hidden = false;
  $("#inPass").focus();
}

async function tryUnlock() {
  const want = getPassHash();
  const got = await sha256hex($("#inPass").value);
  if (got === want) {
    $("#view-lock").hidden = true;
    $("#view-dash").hidden = false;
    renderDash();
  } else {
    $("#passErr").classList.add("show");
    $("#inPass").value = "";
    $("#inPass").focus();
  }
}

/* ---------- dashboard ---------- */
function renderDash() {
  const evs = loadEvents();
  const cfg = loadCfg();

  const today = evs.filter((e) => isToday(e.at));
  $("#stToday").textContent = today.length;
  $("#stSent").textContent = evs.filter((e) => e.sent).length;
  $("#stPending").textContent = evs.filter((e) => !e.sent).length;

  const list = $("#eventList");
  if (!evs.length) {
    list.innerHTML = '<div class="empty">No missed calls yet.<br />Run the simulator on the <a href="index.html" style="color:var(--brand);font-weight:700">setup page</a> to test the flow.</div>';
  } else {
    list.innerHTML = evs.map((e) => `
      <div class="ev" data-id="${esc(e.id)}">
        <div class="ph">${esc(e.phone)}${e.name ? " · " + esc(e.name) : ""}</div>
        <div class="meta">${timeAgo(e.at)} · ${esc(e.template || "custom")} template${e.source === "simulator" ? " · simulated" : ""}</div>
        <div class="msg">${esc(e.message)}</div>
        <div class="foot">
          <span class="st ${e.sent ? "sent" : "pending"}">${e.sent ? "Sent" : "Awaiting reply"}</span>
          <button class="btn ghost small" data-act="toggle">${e.sent ? "Mark unsent" : "Mark as sent"}</button>
        </div>
      </div>`).join("");
  }
  list.querySelectorAll("[data-act='toggle']").forEach((b) => {
    b.onclick = () => {
      const id = b.closest(".ev").dataset.id;
      const all = loadEvents();
      const ev = all.find((x) => x.id === id);
      if (ev) { ev.sent = !ev.sent; saveEvents(all); renderDash(); }
    };
  });

  $("#edTemplate").value = cfg.template || "";
  wireDashButtons();
}

function wireDashButtons() {
  $("#btnSaveTpl").onclick = () => {
    const cfg = loadCfg();
    cfg.template = $("#edTemplate").value;
    cfg.presetName = "custom";
    saveCfg(cfg);
    toast("Template saved");
  };
  $("#btnClear").onclick = () => {
    if (!confirm("Clear the whole event log?")) return;
    saveEvents([]);
    renderDash();
    toast("Log cleared");
  };
  $("#btnPasscode").onclick = openPassModal;
  $("#pwCancel").onclick = () => { $("#passModal").classList.remove("show"); };
  $("#pwSave").onclick = saveNewPasscode;
}

function openPassModal() {
  $("#pwCur").value = ""; $("#pwNew").value = ""; $("#pwConfirm").value = "";
  $("#pwErr").style.display = "none";
  $("#passModal").classList.add("show");
  $("#pwCur").focus();
}

async function saveNewPasscode() {
  const err = $("#pwErr");
  const show = (m) => { err.textContent = m; err.style.display = "block"; };
  const cur = $("#pwCur").value, nw = $("#pwNew").value, cf = $("#pwConfirm").value;
  if (await sha256hex(cur) !== getPassHash()) return show("Current passcode is wrong.");
  if (nw.length < 4) return show("New passcode must be at least 4 characters.");
  if (nw !== cf) return show("New passcodes do not match.");
  localStorage.setItem(LS_PASS, await sha256hex(nw));
  $("#passModal").classList.remove("show");
  toast("Passcode changed");
}

document.addEventListener("DOMContentLoaded", boot);
