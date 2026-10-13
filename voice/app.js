/* VoiceQ — business setup + browser test-call panel.
   All data lives in localStorage under `voiceq_` keys. */

const $ = (s, r = document) => r.querySelector(s);

const K = {
  profile: "voiceq_profile",
  appointments: "voiceq_appointments",
  calls: "voiceq_calls",
};

const DEFAULTS = {
  shopName: "Your Shop",
  services: ["General enquiry"],
  hours: "Mon–Sat, 10 AM – 8 PM",
  greeting: "",
  ownerPhone: "",
};

/* ---------- storage ---------- */
function load(key, fb) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fb;
  } catch (_) { return fb; }
}
function save(key, val) {
  localStorage.setItem(key, JSON.stringify(val));
}
function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function getProfile() {
  return Object.assign({}, DEFAULTS, load(K.profile, {}));
}

function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.remove("show"), 2600);
}

/* ---------- 1 · business setup ---------- */
const draftServices = [...getProfile().services];

function renderSvcList() {
  const box = $("#svcList");
  box.innerHTML = draftServices.map((s, i) =>
    `<span class="svc-chip">${esc(s)}<button type="button" data-i="${i}" aria-label="Remove ${esc(s)}">×</button></span>`
  ).join("") || `<span class="hint">No services yet — add your first one below.</span>`;
  box.querySelectorAll("button").forEach((b) => {
    b.onclick = () => { draftServices.splice(+b.dataset.i, 1); renderSvcList(); };
  });
}

function fillSetup() {
  const p = getProfile();
  $("#inShop").value = p.shopName === DEFAULTS.shopName ? "" : p.shopName;
  $("#inHours").value = p.hours === DEFAULTS.hours ? "" : p.hours;
  $("#inPhone").value = p.ownerPhone || "";
  $("#inGreeting").value = p.greeting || "";
  renderSvcList();
}

$("#btnAddSvc").onclick = () => {
  const v = $("#inSvc").value.trim();
  if (!v) return;
  if (draftServices.length >= 12) { toast("That's plenty — 12 services max."); return; }
  draftServices.push(v);
  $("#inSvc").value = "";
  renderSvcList();
  $("#inSvc").focus();
};
$("#inSvc").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); $("#btnAddSvc").click(); } });

$("#btnSave").onclick = () => {
  const p = {
    shopName: $("#inShop").value.trim() || DEFAULTS.shopName,
    services: draftServices.length ? [...draftServices] : [...DEFAULTS.services],
    hours: $("#inHours").value.trim() || DEFAULTS.hours,
    greeting: $("#inGreeting").value.trim(),
    ownerPhone: $("#inPhone").value.trim(),
  };
  save(K.profile, p);
  toast("Business profile saved.");
};

/* ---------- 2 · test call ---------- */
const SR = window.SpeechRecognition || window.webkitSpeechRecognition || null;
let rec = null;
let listening = false;
let soundOn = true;

const call = {
  active: false,
  id: null,
  startedAt: 0,
  transcript: [],
  flags: { booking: false, info: false, fallbackOnly: true },
  flow: null,          // booking flow state { step, name, date, time }
  awaitingPrice: false,
};

function greetingText() {
  const p = getProfile();
  const g = p.greeting || `Namaste! You've reached ${p.shopName}. How can I help you?`;
  return g.replace("{shop}", p.shopName);
}

function setStatus(mode, text) {
  const el = $("#callStatus");
  el.classList.toggle("idle", mode === "idle");
  $("#callStatusText").textContent = text;
}

function addMsg(who, text) {
  const box = $("#transcript");
  const d = document.createElement("div");
  d.className = "msg " + (who === "ai" ? "ai" : "caller");
  d.innerHTML = `<span class="who">${who === "ai" ? "VoiceQ" : "You"}</span>${esc(text)}`;
  box.appendChild(d);
  box.scrollTop = box.scrollHeight;
}

function speak(text) {
  addMsg("ai", text);
  if (!soundOn) return;
  try {
    if (!("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1; u.pitch = 1;
    window.speechSynthesis.speak(u);
  } catch (_) { /* headless / no voices — transcript still shows */ }
}

/* ----- the brain ----- */
function cleanName(t) {
  return t.replace(/^(my name is|i am|i'm|this is|myself)\s+/i, "").trim();
}

function brain(raw) {
  const t = raw.toLowerCase().trim();
  const p = getProfile();

  // mid-flow: booking steps take priority (but allow cancelling)
  if (call.flow) {
    if (/\b(cancel|stop|never mind|forget it)\b/.test(t)) {
      call.flow = null;
      return "No problem — I've cancelled that. Anything else I can help with?";
    }
    const f = call.flow;
    if (f.step === "name") {
      f.name = cleanName(raw).split(/\s+/).slice(0, 3).join(" ") || raw.trim();
      f.step = "date";
      return `Thanks ${f.name}. Which day would you like to come in?`;
    }
    if (f.step === "date") {
      f.date = raw.trim();
      f.step = "time";
      return `Got it — ${f.date}. And what time works for you?`;
    }
    if (f.step === "time") {
      f.time = raw.trim();
      call.flow = null;
      const appts = load(K.appointments, []);
      appts.unshift({
        id: "appt-" + Date.now(),
        name: f.name, date: f.date, time: f.time,
        status: "booked", source: "call", createdAt: new Date().toISOString(),
      });
      save(K.appointments, appts);
      call.flags.booking = true;
      call.flags.fallbackOnly = false;
      return `Done, ${f.name} — you're booked for ${f.date} at ${f.time} at ${p.shopName}. Anything else?`;
    }
  }

  // price sub-flow: we asked "which service?" — this answer names it
  if (call.awaitingPrice) {
    call.awaitingPrice = false;
    const hit = p.services.find((s) => t.includes(s.toLowerCase()) || s.toLowerCase().includes(t.split(/\s+/)[0]));
    call.flags.info = true; call.flags.fallbackOnly = false;
    const svc = hit || raw.trim();
    return `For ${svc}, the exact price depends on the work involved — the owner will confirm it with you. Shall I book you an appointment?`;
  }

  if (/\b(bye|goodbye|see you)\b/.test(t)) {
    call._bye = true;
    call.flags.fallbackOnly = false;
    return `Thanks for calling ${p.shopName}. Goodbye!`;
  }
  if (/\b(book|appointment|schedule|slot|reserve)\b/.test(t)) {
    call.flow = { step: "name" };
    call.flags.fallbackOnly = false;
    return "Sure, I can book that for you. What's your name?";
  }
  if (/\b(price|prices|cost|charge|charges|rate|rates|fee|fees|how much)\b/.test(t)) {
    call.awaitingPrice = true;
    call.flags.info = true; call.flags.fallbackOnly = false;
    return `Which service would you like the price for? We offer ${p.services.join(", ")}.`;
  }
  if (/\b(hour|hours|open|close|closing|timing|when)\b/.test(t)) {
    call.flags.info = true; call.flags.fallbackOnly = false;
    return `We're open ${p.hours}.`;
  }
  if (/\b(service|services|offer|offers|menu|what do you|treatments?)\b/.test(t)) {
    call.flags.info = true; call.flags.fallbackOnly = false;
    return `We offer ${p.services.join(", ")}. Would you like to book one?`;
  }
  if (/^(hi|hii+|hello|hey|namaste|good (morning|afternoon|evening))\b/.test(t)) {
    call.flags.fallbackOnly = false;
    return greetingText();
  }
  if (/\b(thank|thanks|shukriya|dhanyavad)\b/.test(t)) {
    call.flags.fallbackOnly = false;
    return "You're welcome! Anything else I can help with?";
  }
  return "Sorry, I didn't quite catch that. You can ask about our services, our timings, prices — or just say \"book an appointment\".";
}

function handleUserUtterance(text) {
  if (!call.active || !text.trim()) return;
  addMsg("caller", text.trim());
  call.transcript.push({ who: "caller", text: text.trim() });
  const reply = brain(text);
  // brain() may end the call (bye) — only speak if still meaningful
  call.transcript.push({ who: "ai", text: reply });
  speak(reply);
  if (call._bye) { call._bye = false; setTimeout(() => endCall("ended"), 1200); }
}

/* ----- mic ----- */
function stopMic() {
  listening = false;
  $("#btnMic").textContent = "Mic";
  try { rec && rec.stop(); } catch (_) {}
}

$("#btnMic").onclick = () => {
  if (!call.active) return;
  if (!SR) { $("#micNote").hidden = false; $("#inSay").focus(); return; }
  if (listening) { stopMic(); return; }
  try {
    rec = new SR();
    rec.lang = "en-IN";
    rec.interimResults = false;
    rec.onresult = (e) => {
      const txt = e.results[0][0].transcript;
      stopMic();
      handleUserUtterance(txt);
    };
    rec.onerror = () => { stopMic(); $("#micNote").hidden = false; };
    rec.onend = () => { listening = false; $("#btnMic").textContent = "Mic"; };
    rec.start();
    listening = true;
    $("#btnMic").textContent = "Stop";
  } catch (_) {
    $("#micNote").hidden = false;
  }
};

/* ----- typed input ----- */
function sendTyped() {
  const v = $("#inSay").value;
  if (!v.trim()) return;
  $("#inSay").value = "";
  handleUserUtterance(v);
}
$("#btnSend").onclick = sendTyped;
$("#inSay").addEventListener("keydown", (e) => { if (e.key === "Enter") sendTyped(); });

$("#btnMute").onclick = () => {
  soundOn = !soundOn;
  $("#btnMute").textContent = soundOn ? "Sound on" : "Muted";
  $("#btnMute").setAttribute("aria-pressed", String(soundOn));
  if (!soundOn) { try { window.speechSynthesis && window.speechSynthesis.cancel(); } catch (_) {} }
};

/* ----- call lifecycle ----- */
$("#btnCall").onclick = () => {
  if (call.active) return;
  call.active = true;
  call.id = "call-" + Date.now();
  call.startedAt = Date.now();
  call.transcript = [];
  call.flags = { booking: false, info: false, fallbackOnly: true };
  call.flow = null;
  call.awaitingPrice = false;

  $("#btnCall").disabled = true;
  $("#btnCall").textContent = "In call…";
  $("#callPanel").hidden = false;
  $("#callSummary").hidden = true;
  $("#transcript").innerHTML = "";
  setStatus("", "Ringing…");
  if (!SR) $("#micNote").hidden = false;

  setTimeout(() => {
    if (!call.active) return;
    setStatus("", "In call — speak or type");
    const g = greetingText();
    call.transcript.push({ who: "ai", text: g });
    speak(g);
  }, 900);
  $("#inSay").focus();
};

function fmtDur(ms) {
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
}

function endCall(outcome) {
  if (!call.active) return;
  call.active = false;
  stopMic();
  try { window.speechSynthesis && window.speechSynthesis.cancel(); } catch (_) {}

  const durMs = Date.now() - call.startedAt;
  let finalOutcome = outcome;
  if (!finalOutcome) {
    if (call.flags.booking) finalOutcome = "booking";
    else if (call.flags.info) finalOutcome = "info";
    else if (call.transcript.length > 1) finalOutcome = "missed";
    else finalOutcome = "ended";
  }
  const log = {
    id: call.id,
    startedAt: new Date(call.startedAt).toISOString(),
    durationSec: Math.round(durMs / 1000),
    transcript: call.transcript,
    outcome: finalOutcome,
  };
  const calls = load(K.calls, []);
  calls.unshift(log);
  save(K.calls, calls.slice(0, 200));

  setStatus("idle", "Call ended");
  const sum = $("#callSummary");
  const bits = [`Call ended · ${fmtDur(durMs)}`];
  if (finalOutcome === "booking") bits.push("booking saved");
  else if (finalOutcome === "missed") bits.push("no clear request — review the log");
  sum.textContent = bits.join(" · ");
  sum.hidden = false;

  $("#btnCall").disabled = false;
  $("#btnCall").textContent = "Call again";
}

$("#btnEndCall").onclick = () => endCall();

/* ---------- boot ---------- */
fillSetup();
window.__vqBoot = true;
