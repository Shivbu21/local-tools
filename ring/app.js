/* RingQ — config + missed-call simulator (index.html). Standalone, localStorage-backed. */

"use strict";

const $ = (s, r = document) => r.querySelector(s);

const LS_CFG = "ringq_config";
const LS_EVENTS = "ringq_events";

const PRESETS = [
  {
    name: "Price list",
    body: "Hi {name}! Thanks for calling {business}. Here is our price list: {menu_link}\n\nReply here on WhatsApp to order. — {business}",
  },
  {
    name: "Booking link",
    body: "Hi {name}! You just called {business}. Book a slot here: {menu_link}\n\nWe will confirm shortly. — {business}",
  },
  {
    name: "Address + hours",
    body: "Hi {name}! Thanks for calling {business}. Find us here: {menu_link}\n\nOpen Mon–Sat, 10am–8pm. — {business}",
  },
];

const DEFAULT_CFG = {
  business: "",
  missedCallNumber: "",
  whatsapp: "",
  menuLink: "",
  template: PRESETS[0].body,
  presetName: PRESETS[0].name,
};

/* ---------- storage ---------- */
function loadCfg() {
  try {
    const raw = localStorage.getItem(LS_CFG);
    if (raw) return { ...DEFAULT_CFG, ...JSON.parse(raw) };
  } catch (_) { /* corrupted → defaults */ }
  return { ...DEFAULT_CFG };
}
function saveCfg(cfg) {
  localStorage.setItem(LS_CFG, JSON.stringify(cfg));
}
function loadEvents() {
  try {
    const raw = localStorage.getItem(LS_EVENTS);
    if (raw) return JSON.parse(raw);
  } catch (_) { /* corrupted → empty */ }
  return [];
}
function saveEvents(evs) {
  localStorage.setItem(LS_EVENTS, JSON.stringify(evs));
}

/* ---------- template engine ---------- */
function renderTemplate(tpl, vars) {
  return String(tpl || "")
    .replaceAll("{name}", vars.name || "there")
    .replaceAll("{business}", vars.business || "our shop")
    .replaceAll("{menu_link}", vars.menu_link || "");
}
function digitsOnly(phone) {
  return String(phone || "").replace(/\D/g, "");
}
function waLink(phone, message) {
  return "https://wa.me/" + digitsOnly(phone) + "?text=" + encodeURIComponent(message);
}
function validPhone(phone) {
  return digitsOnly(phone).length >= 10;
}

/* ---------- ui helpers ---------- */
function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.remove("show"), 2600);
}
function setInvalid(key, bad) {
  const f = document.querySelector(`[data-f="${key}"]`);
  if (f) f.classList.toggle("invalid", bad);
  return !bad;
}

/* ---------- boot ---------- */
const cfg = loadCfg();

$("#inBusiness").value = cfg.business;
$("#inMissed").value = cfg.missedCallNumber;
$("#inWa").value = cfg.whatsapp;
$("#inLink").value = cfg.menuLink;
$("#inTemplate").value = cfg.template;

const presetsEl = $("#presets");
PRESETS.forEach((p) => {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "preset";
  b.textContent = p.name;
  b.onclick = () => {
    $("#inTemplate").value = p.body;
    cfg.presetName = p.name;
    toast(p.name + " template loaded");
  };
  presetsEl.appendChild(b);
});

$("#btnSave").onclick = () => {
  let ok = setInvalid("business", !$("#inBusiness").value.trim());
  ok = setInvalid("missed", !validPhone($("#inMissed").value)) && ok;
  ok = setInvalid("wa", !validPhone($("#inWa").value)) && ok;
  if (!ok) return;
  cfg.business = $("#inBusiness").value.trim();
  cfg.missedCallNumber = $("#inMissed").value.trim();
  cfg.whatsapp = $("#inWa").value.trim();
  cfg.menuLink = $("#inLink").value.trim();
  cfg.template = $("#inTemplate").value;
  saveCfg(cfg);
  $("#saveHint").hidden = false;
  toast("Setup saved");
};

/* ---------- simulator ---------- */
let lastEventId = null;

$("#btnSim").onclick = () => {
  // Read the freshest config from storage (dashboard may have edited the template).
  const live = loadCfg();
  let ok = setInvalid("caller", !validPhone($("#inCaller").value));
  if (!ok) return;

  const caller = $("#inCaller").value.trim();
  const callerName = $("#inCallerName").value.trim();
  const message = renderTemplate(live.template, {
    name: callerName,
    business: live.business,
    menu_link: live.menuLink,
  });

  // Show exactly what the customer receives.
  $("#waBubble").textContent = message;
  $("#waTime").textContent = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  $("#waLink").href = waLink(caller, message);
  $("#simResult").hidden = false;
  $("#btnMarkSent").hidden = false;

  // Log the event for the owner dashboard.
  const evs = loadEvents();
  const ev = {
    id: "ev-" + Date.now(),
    phone: caller,
    name: callerName || null,
    at: new Date().toISOString(),
    template: live.presetName || "custom",
    message,
    sent: false,
    source: "simulator",
  };
  lastEventId = ev.id;
  evs.unshift(ev);
  saveEvents(evs.slice(0, 500));

  $("#simResult").scrollIntoView({ behavior: "smooth", block: "nearest" });
};

$("#btnMarkSent").onclick = () => {
  if (!lastEventId) return;
  const evs = loadEvents();
  const ev = evs.find((e) => e.id === lastEventId);
  if (ev) {
    ev.sent = true;
    saveEvents(evs);
    $("#btnMarkSent").hidden = true;
    toast("Marked as sent");
  }
};
