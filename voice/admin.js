/* VoiceQ — owner dashboard. Passcode gate + appointments + call log + profile. */

const $ = (s, r = document) => r.querySelector(s);

const K = {
  profile: "voiceq_profile",
  appointments: "voiceq_appointments",
  calls: "voiceq_calls",
  passcode: "voiceq_passcode",
};

function load(key, fb) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fb;
  } catch (_) { return fb; }
}
function save(key, val) { localStorage.setItem(key, JSON.stringify(val)); }
function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function timeAgo(iso) {
  const s = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return s + "s ago";
  const m = Math.round(s / 60);
  if (m < 60) return m + "m ago";
  const h = Math.round(m / 60);
  if (h < 24) return h + "h ago";
  return Math.round(h / 24) + "d ago";
}
function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.remove("show"), 2600);
}

async function sha256hex(str) {
  try {
    if (window.crypto && crypto.subtle) {
      const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
      return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
    }
  } catch (_) {}
  return "plain:" + str;
}

/* ---------- passcode gate ---------- */
async function storedHash() {
  let h = localStorage.getItem(K.passcode);
  if (!h) { h = await sha256hex("1234"); localStorage.setItem(K.passcode, h); }
  return h;
}

function showDash() {
  $("#view-lock").hidden = true;
  $("#view-dash").hidden = false;
  renderAll();
}

async function boot() {
  $("#todayLine").textContent = new Date().toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
  $("#view-lock").hidden = false;

  const tryUnlock = async () => {
    const want = await storedHash();
    const got = await sha256hex($("#inPass").value);
    if (got === want) {
      $("#passErr").textContent = "";
      $("#inPass").value = "";
      showDash();
    } else {
      $("#passErr").textContent = "Wrong passcode. Try again.";
    }
  };
  $("#btnUnlock").onclick = tryUnlock;
  $("#inPass").addEventListener("keydown", (e) => { if (e.key === "Enter") tryUnlock(); });
}

/* change passcode */
$("#btnPasscode").onclick = () => {
  $("#pCur").value = ""; $("#pNew").value = ""; $("#pCon").value = "";
  $("#pErr").textContent = "";
  $("#passModal").hidden = false;
};
$("#btnCancelPass").onclick = () => { $("#passModal").hidden = true; };
$("#btnSavePass").onclick = async () => {
  const err = (m) => { $("#pErr").textContent = m; };
  const cur = $("#pCur").value, nw = $("#pNew").value, con = $("#pCon").value;
  if (!cur || !nw || !con) return err("Fill all three fields.");
  if (await sha256hex(cur) !== await storedHash()) return err("Current passcode is wrong.");
  if (nw.length < 4) return err("New passcode needs at least 4 characters.");
  if (nw !== con) return err("New passcodes don't match.");
  localStorage.setItem(K.passcode, await sha256hex(nw));
  $("#passModal").hidden = true;
  toast("Passcode changed. Use the new one next time.");
};

/* ---------- tabs ---------- */
document.querySelectorAll(".tabs button").forEach((b) => {
  b.onclick = () => {
    document.querySelectorAll(".tabs button").forEach((x) => x.setAttribute("aria-selected", "false"));
    b.setAttribute("aria-selected", "true");
    ["appts", "calls", "biz", "tel"].forEach((t) => { $("#tab-" + t).hidden = t !== b.dataset.tab; });
  };
});

/* ---------- stats ---------- */
function isToday(iso) {
  const d = new Date(iso), n = new Date();
  return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
}

function renderStats() {
  const calls = load(K.calls, []);
  const appts = load(K.appointments, []);
  $("#stCalls").textContent = calls.filter((c) => isToday(c.startedAt)).length;
  $("#stBookings").textContent = appts.filter((a) => a.status === "booked").length;
  $("#stMissed").textContent = calls.filter((c) => isToday(c.startedAt) && c.outcome === "missed").length;
}

/* ---------- appointments ---------- */
function renderAppts() {
  const appts = load(K.appointments, []);
  const box = $("#apptList");
  if (!appts.length) {
    box.innerHTML = `<div class="empty">No appointments yet.<br/>Run a test call — bookings made by the receptionist appear here.</div>`;
    return;
  }
  box.innerHTML = appts.map((a) => `
    <div class="item" data-id="${esc(a.id)}">
      <div class="title">${esc(a.name)}<span class="chip ${esc(a.status)}">${esc(a.status)}</span></div>
      <div class="meta">${esc(a.date)} · ${esc(a.time)}${a.phone ? " · " + esc(a.phone) : ""} · ${a.source === "call" ? "via test call" : "manual"} · ${timeAgo(a.createdAt)}</div>
      <div class="actions">
        ${a.status === "booked" ? `<button class="btn ghost small" data-act="done">Mark done</button>
        <button class="btn ghost small" data-act="cancel">Cancel</button>` : ""}
        <button class="btn danger small" data-act="del">Delete</button>
      </div>
    </div>`).join("");
  box.querySelectorAll(".item").forEach((el) => {
    const id = el.dataset.id;
    el.querySelectorAll("button").forEach((b) => {
      b.onclick = () => {
        const list = load(K.appointments, []);
        const i = list.findIndex((x) => x.id === id);
        if (i < 0) return;
        const act = b.dataset.act;
        if (act === "del") list.splice(i, 1);
        else list[i].status = act === "done" ? "done" : "cancelled";
        save(K.appointments, list);
        renderAppts(); renderStats();
      };
    });
  });
}

$("#btnAddAppt").onclick = () => {
  const name = $("#mName").value.trim();
  if (!name) { toast("Add the customer's name first."); return; }
  const appts = load(K.appointments, []);
  appts.unshift({
    id: "appt-" + Date.now(),
    name,
    phone: $("#mPhone").value.trim(),
    date: $("#mDate").value.trim() || "—",
    time: $("#mTime").value.trim() || "—",
    status: "booked", source: "manual",
    createdAt: new Date().toISOString(),
  });
  save(K.appointments, appts);
  $("#mName").value = ""; $("#mPhone").value = ""; $("#mDate").value = ""; $("#mTime").value = "";
  renderAppts(); renderStats();
  toast("Appointment added.");
};

/* ---------- call log ---------- */
function outcomeLabel(o) {
  return { booking: "Booking", info: "Answered", missed: "Missed intent", ended: "Ended" }[o] || o;
}

function renderCalls() {
  const calls = load(K.calls, []);
  const box = $("#callList");
  if (!calls.length) {
    box.innerHTML = `<div class="empty">No calls yet.<br/>Every test call is logged here with its full transcript.</div>`;
    return;
  }
  box.innerHTML = calls.map((c, i) => `
    <div class="item" data-i="${i}">
      <div class="title">Call <span class="chip ${esc(c.outcome)}">${esc(outcomeLabel(c.outcome))}</span></div>
      <div class="meta">${new Date(c.startedAt).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })} · ${c.durationSec}s · ${c.transcript.length} messages</div>
      <div class="actions"><button class="btn ghost small" data-act="toggle">View transcript</button></div>
      <div class="log-transcript" hidden>
        ${c.transcript.map((m) => `<div class="msg ${m.who === "ai" ? "ai" : "caller"}"><span class="who">${m.who === "ai" ? "VoiceQ" : "Caller"}</span>${esc(m.text)}</div>`).join("")}
      </div>
    </div>`).join("");
  box.querySelectorAll(".item").forEach((el) => {
    const btn = el.querySelector('[data-act="toggle"]');
    const t = el.querySelector(".log-transcript");
    btn.onclick = () => {
      t.hidden = !t.hidden;
      btn.textContent = t.hidden ? "View transcript" : "Hide transcript";
    };
  });
}

/* ---------- business editor ---------- */
let bizServices = [];

function renderBizSvc() {
  const box = $("#bSvcList");
  box.innerHTML = bizServices.map((s, i) =>
    `<span class="svc-chip">${esc(s)}<button type="button" data-i="${i}" aria-label="Remove">×</button></span>`).join("");
  box.querySelectorAll("button").forEach((b) => {
    b.onclick = () => { bizServices.splice(+b.dataset.i, 1); renderBizSvc(); };
  });
}

function fillBiz() {
  let p = {};
  try { p = JSON.parse(localStorage.getItem(K.profile) || "{}"); } catch (_) {}
  $("#bShop").value = p.shopName || "";
  $("#bHours").value = p.hours || "";
  $("#bPhone").value = p.ownerPhone || "";
  $("#bGreeting").value = p.greeting || "";
  bizServices = [...(p.services || ["General enquiry"])];
  renderBizSvc();
}

$("#bAddSvc").onclick = () => {
  const v = $("#bSvc").value.trim();
  if (!v || bizServices.length >= 12) return;
  bizServices.push(v);
  $("#bSvc").value = "";
  renderBizSvc();
};

$("#btnSaveBiz").onclick = () => {
  save(K.profile, {
    shopName: $("#bShop").value.trim() || "Your Shop",
    services: bizServices.length ? [...bizServices] : ["General enquiry"],
    hours: $("#bHours").value.trim() || "Mon–Sat, 10 AM – 8 PM",
    ownerPhone: $("#bPhone").value.trim(),
    greeting: $("#bGreeting").value.trim(),
  });
  toast("Business profile saved.");
};

/* ---------- render all ---------- */
function renderAll() {
  renderStats();
  renderAppts();
  renderCalls();
  fillBiz();
}

boot();
window.__vqBoot = true;
