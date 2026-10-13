/* CardQ — builder (admin) logic. */
import {
  defaultCard, loadCard, saveCard, loadPassHash, setPassHash,
  sha256hex, renderCard, cardURL, toast, ACCENTS, esc,
} from "./card.js";

const $ = (s) => document.querySelector(s);

const viewLock = $("#view-lock");
const viewBuilder = $("#view-builder");
const state = { card: loadCard() || defaultCard(), saveT: null };

/* ---------------- passcode gate ---------------- */
function show(view) {
  viewLock.hidden = view !== "lock";
  viewBuilder.hidden = view !== "builder";
}

async function tryUnlock() {
  const v = $("#inPass").value;
  const h = await sha256hex(v);
  if (h === loadPassHash()) {
    $("#inPass").value = "";
    $("#passErr").textContent = "";
    show("builder");
    boot();
  } else {
    $("#passErr").textContent = "Wrong passcode. Try again.";
  }
}
$("#btnUnlock").addEventListener("click", tryUnlock);
$("#inPass").addEventListener("keydown", (e) => { if (e.key === "Enter") tryUnlock(); });
show("lock");
$("#inPass").focus();

/* ---------------- builder ---------------- */
function publicURL() {
  return location.href.replace(/admin\.html.*$/, "index.html");
}

function renderPreview() {
  renderCard(state.card, $("#previewMount"), { cardUrl: publicURL() });
}

function flagSaved() {
  saveCard(state.card);
  const f = $("#savedFlag");
  f.classList.add("show");
  clearTimeout(f._t);
  f._t = setTimeout(() => f.classList.remove("show"), 1200);
}
function scheduleSave() {
  clearTimeout(state.saveT);
  state.saveT = setTimeout(() => { flagSaved(); renderPreview(); }, 350);
}

const FIELDS = [
  ["fBiz", "businessName"], ["fOwner", "ownerName"], ["fTag", "tagline"],
  ["fPhone", "phone"], ["fWa", "whatsapp"], ["fUpi", "upiId"],
  ["fAddr", "address"], ["fMaps", "mapsLink"], ["fHours", "hours"],
];

function renderServices() {
  const list = $("#svcList");
  list.innerHTML = "";
  state.card.services.forEach((s, i) => {
    const row = document.createElement("div");
    row.className = "svc-item";
    const sp = document.createElement("span");
    sp.textContent = s;
    const del = document.createElement("button");
    del.type = "button";
    del.textContent = "×";
    del.setAttribute("aria-label", "Remove " + s);
    del.addEventListener("click", () => {
      state.card.services.splice(i, 1);
      flagSaved(); renderServices(); renderPreview();
    });
    row.appendChild(sp); row.appendChild(del);
    list.appendChild(row);
  });
}

function renderSwatches() {
  const box = $("#swatches");
  box.innerHTML = "";
  ACCENTS.forEach((a) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "sw" + (state.card.accent === a.value ? " on" : "");
    b.style.background = "linear-gradient(135deg," + a.value + "," + a.deep + ")";
    b.title = a.name;
    b.setAttribute("aria-label", a.name);
    b.addEventListener("click", () => {
      state.card.accent = a.value;
      flagSaved(); renderSwatches(); renderPreview();
    });
    box.appendChild(b);
  });
}

function setPhotoPreview() {
  const img = $("#photoPrev");
  const ph = $("#photoPh");
  if (state.card.photo) {
    img.src = state.card.photo;
    img.hidden = false;
    if (ph) ph.hidden = true;
  } else {
    img.removeAttribute("src");
    img.hidden = true;
    if (ph) ph.hidden = false;
  }
}

function handlePhotoFile(file) {
  if (!file || !file.type.startsWith("image/")) { toast("Please choose an image file"); return; }
  const img = new Image();
  const objURL = URL.createObjectURL(file);
  img.onload = () => {
    URL.revokeObjectURL(objURL);
    const MAX = 512;
    const scale = Math.min(1, MAX / Math.max(img.width, img.height));
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    c.getContext("2d").drawImage(img, 0, 0, w, h);
    state.card.photo = c.toDataURL("image/jpeg", 0.85);
    setPhotoPreview(); flagSaved(); renderPreview();
    toast("Photo added");
  };
  img.onerror = () => { URL.revokeObjectURL(objURL); toast("Couldn't read that image"); };
  img.src = objURL;
}

function addService() {
  const inp = $("#fSvcNew");
  const v = inp.value.trim();
  if (!v) return;
  state.card.services.push(v);
  inp.value = "";
  inp.focus();
  flagSaved(); renderServices(); renderPreview();
}

async function changePasscode() {
  const cur = $("#fCur").value, nw = $("#fNew").value, nw2 = $("#fNew2").value;
  if ((await sha256hex(cur)) !== loadPassHash()) { toast("Current passcode is wrong"); return; }
  if (nw.length < 4) { toast("New passcode needs at least 4 characters"); return; }
  if (nw !== nw2) { toast("New passcodes don't match"); return; }
  setPassHash(await sha256hex(nw));
  $("#fCur").value = $("#fNew").value = $("#fNew2").value = "";
  toast("Passcode changed");
}

async function copyLink() {
  const url = publicURL();
  try {
    if (navigator.clipboard) await navigator.clipboard.writeText(url);
    else throw new Error("no-clipboard");
    toast("Card link copied — share it anywhere");
  } catch (_) {
    const ta = document.createElement("textarea");
    ta.value = url; document.body.appendChild(ta); ta.select();
    try { document.execCommand("copy"); toast("Card link copied"); }
    catch (_) { toast("Copy this link: " + url); }
    ta.remove();
  }
}

let booted = false;
function boot() {
  if (booted) return;
  booted = true;

  // fill form from stored card
  FIELDS.forEach(([id, key]) => {
    const el = document.getElementById(id);
    el.value = state.card[key] || "";
    el.addEventListener("input", () => { state.card[key] = el.value; scheduleSave(); });
  });

  $("#fPhoto").addEventListener("change", (e) => handlePhotoFile(e.target.files[0]));
  $("#btnPhotoRemove").addEventListener("click", () => {
    state.card.photo = "";
    $("#fPhoto").value = "";
    setPhotoPreview(); flagSaved(); renderPreview();
  });

  $("#btnSvcAdd").addEventListener("click", addService);
  $("#fSvcNew").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); addService(); } });

  $("#btnChangePass").addEventListener("click", changePasscode);
  $("#btnCopyLink").addEventListener("click", copyLink);
  $("#linkView").href = publicURL();

  setPhotoPreview();
  renderServices();
  renderSwatches();
  renderPreview();
}
