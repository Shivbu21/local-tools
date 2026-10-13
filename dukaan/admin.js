/* DukaanQ — owner dashboard. localStorage-backed, passcode-gated. */
"use strict";

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const K = { settings: "dukaan_settings", products: "dukaan_products", orders: "dukaan_orders", pass: "dukaan_passcode" };
const DEFAULT_HASH = "03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4"; // "1234"

const read = (k, fb) => {
  try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? fb : v; } catch { return fb; }
};
const write = (k, v) => localStorage.setItem(k, JSON.stringify(v));
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const inr = (n) => "₹" + Number(n || 0).toLocaleString("en-IN");
const uid = () => "p" + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36);

async function sha256hex(str) {
  if (window.crypto?.subtle) {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
  }
  return "plain:" + str; /* non-secure context: fail closed, never matches a stored hash */
}

function toast(msg) {
  const t = $("#toast");
  t.textContent = msg; t.classList.add("show");
  clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove("show"), 2600);
}

/* ---------- passcode gate ---------- */
async function tryUnlock() {
  const v = $("#inPass").value;
  const hash = await sha256hex(v);
  const saved = localStorage.getItem(K.pass) || DEFAULT_HASH;
  if (hash === saved) {
    sessionStorage.setItem("dukaan_unlocked", "1");
    $("#view-lock").hidden = true; $("#view-dash").hidden = false;
    boot();
  } else {
    $("#passErr").classList.add("show");
    $("#inPass").value = "";
  }
}
$("#btnUnlock").onclick = tryUnlock;
$("#inPass").addEventListener("keydown", (e) => { if (e.key === "Enter") tryUnlock(); });
if (sessionStorage.getItem("dukaan_unlocked") === "1") {
  $("#view-lock").hidden = true; $("#view-dash").hidden = false;
}

/* ---------- tabs ---------- */
$$(".tabs [role=tab]").forEach((b) => b.onclick = () => {
  $$(".tabs [role=tab]").forEach((x) => x.setAttribute("aria-selected", "false"));
  b.setAttribute("aria-selected", "true");
  ["orders", "products", "setup"].forEach((t) => $("#tab-" + t).hidden = t !== b.dataset.tab);
});

/* ---------- orders ---------- */
const orders = () => read(K.orders, []);
const saveOrders = (o) => write(K.orders, o);
const todayISO = () => new Date().toISOString().slice(0, 10);

function renderStats() {
  const os = orders();
  const today = os.filter((o) => (o.created_at || "").slice(0, 10) === todayISO() && o.status !== "cancelled");
  $("#stOrders").textContent = today.length;
  $("#stRevenue").textContent = inr(today.filter((o) => o.status === "paid" || o.status === "delivered").reduce((a, o) => a + o.total, 0));
  $("#stPending").textContent = os.filter((o) => o.status === "pending").length;
}
function setStatus(id, status) {
  const os = orders();
  const o = os.find((x) => x.id === id);
  if (o) { o.status = status; saveOrders(os); renderOrders(); renderStats(); toast("Order " + status); }
}
function renderOrders() {
  const os = [...orders()].reverse();
  $("#noOrders").hidden = os.length > 0;
  $("#orderList").innerHTML = os.map((o) => `
    <div class="card">
      <div class="ch"><strong>${esc(o.id)}</strong><span class="st ${o.status}">${o.status}</span></div>
      <div class="olines">
        ${o.items.map((i) => `<div class="ln"><span>${i.qty} × ${esc(i.name)}</span><span>${inr(i.price * i.qty)}</span></div>`).join("")}
        <div class="ln" style="font-weight:800"><span>Total</span><span>${inr(o.total)}</span></div>
      </div>
      <div class="meta">👤 ${esc(o.customer.name)} · 📞 ${esc(o.customer.phone)}</div>
      <div class="meta">📍 ${esc(o.customer.address)}</div>
      <div class="meta">${new Date(o.created_at).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}</div>
      <div class="oactions">
        ${o.status === "pending" ? `<button class="abtn go" data-act="paid" data-id="${o.id}">Mark paid</button>` : ""}
        ${o.status === "paid" ? `<button class="abtn go" data-act="delivered" data-id="${o.id}">Mark delivered</button>` : ""}
        ${o.status !== "delivered" && o.status !== "cancelled" ? `<button class="abtn bad" data-act="cancelled" data-id="${o.id}">Cancel</button>` : ""}
      </div>
    </div>`).join("");
  $$("#orderList [data-act]").forEach((b) => b.onclick = () => setStatus(b.dataset.id, b.dataset.act));
}

/* ---------- products ---------- */
const prods = () => read(K.products, []);
const saveProds = (p) => write(K.products, p);
let editingId = null, pendingPhoto = null;

function processPhoto(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const maxDim = 800;
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
      const w = Math.max(1, Math.round(img.width * scale));
      const h = Math.max(1, Math.round(img.height * scale));
      const cv = document.createElement("canvas");
      cv.width = w; cv.height = h;
      cv.getContext("2d").drawImage(img, 0, 0, w, h);
      let q = 0.82, url = cv.toDataURL("image/jpeg", q);
      while (url.length > 500 * 1024 && q > 0.3) { q -= 0.1; url = cv.toDataURL("image/jpeg", q); }
      URL.revokeObjectURL(img.src);
      resolve(url);
    };
    img.onerror = () => reject(new Error("Could not read that image"));
    img.src = URL.createObjectURL(file);
  });
}
$("#pfPhoto").addEventListener("change", async (e) => {
  const f = e.target.files[0];
  if (!f) return;
  try {
    pendingPhoto = await processPhoto(f);
    $("#pfPreview").src = pendingPhoto;
    toast("Photo ready (" + Math.round(pendingPhoto.length / 1024) + " KB)");
  } catch { toast("Could not read that image"); }
});
function openForm(p) {
  editingId = p ? p.id : null;
  pendingPhoto = p ? p.photo || null : null;
  $("#pfTitle").textContent = p ? "Edit product" : "Add product";
  $("#pfName").value = p ? p.name : "";
  $("#pfPrice").value = p ? p.price : "";
  $("#pfCat").value = p ? (p.category || "") : "";
  $("#pfPreview").src = pendingPhoto || "";
  $("#pfPhoto").value = "";
  $("#productForm").hidden = false;
  $("#productForm").scrollIntoView({ behavior: "smooth", block: "center" });
}
$("#btnNewProduct").onclick = () => openForm(null);
$("#btnCancelProduct").onclick = () => { $("#productForm").hidden = true; };
$("#btnSaveProduct").onclick = () => {
  const name = $("#pfName").value.trim();
  const price = parseFloat($("#pfPrice").value);
  const category = $("#pfCat").value.trim();
  let ok = true;
  document.querySelector('[data-f="pname"]').classList.toggle("invalid", !name); ok = ok && !!name;
  document.querySelector('[data-f="pprice"]').classList.toggle("invalid", !(price > 0)); ok = ok && price > 0;
  if (!ok) return;
  const ps = prods();
  if (editingId) {
    const p = ps.find((x) => x.id === editingId);
    if (p) Object.assign(p, { name, price, category, photo: pendingPhoto });
  } else {
    ps.push({ id: uid(), name, price, category, photo: pendingPhoto });
  }
  try { saveProds(ps); } catch { toast("Storage full — try a smaller photo"); return; }
  $("#productForm").hidden = true;
  renderProducts();
  toast(editingId ? "Product updated" : "Product added");
};
function renderProducts() {
  const ps = prods();
  $("#productList").innerHTML = ps.map((p) => `
    <div class="card">
      ${p.photo ? `<img class="pthumb" src="${p.photo}" alt="${esc(p.name)}" />` : ""}
      <div class="ch"><strong>${esc(p.name)}</strong><span class="st paid">${inr(p.price)}</span></div>
      ${p.category ? `<div class="meta">${esc(p.category)}</div>` : ""}
      <div class="oactions">
        <button class="abtn" data-edit="${p.id}">Edit</button>
        <button class="abtn bad" data-del="${p.id}">Delete</button>
      </div>
    </div>`).join("") ||
    `<div class="empty"><div class="big">🛍️</div><strong>No products yet</strong><p style="margin:6px 0 0">Add your first product above.</p></div>`;
  $$("#productList [data-edit]").forEach((b) => b.onclick = () => openForm(ps.find((x) => x.id === b.dataset.edit)));
  $$("#productList [data-del]").forEach((b) => b.onclick = () => {
    if (!confirm("Delete this product?")) return;
    saveProds(ps.filter((x) => x.id !== b.dataset.del));
    renderProducts(); toast("Product deleted");
  });
}

/* ---------- setup ---------- */
function renderSetup() {
  const s = read(K.settings, { shopName: "", whatsapp: "", upiId: "" });
  $("#sShop").value = s.shopName || "";
  $("#sWA").value = s.whatsapp || "";
  $("#sUPI").value = s.upiId || "";
  $("#dashShop").textContent = s.shopName || "DukaanQ";
}
$("#btnSaveSetup").onclick = () => {
  write(K.settings, {
    shopName: $("#sShop").value.trim(),
    whatsapp: $("#sWA").value.replace(/\D/g, ""),
    upiId: $("#sUPI").value.trim(),
  });
  renderSetup(); toast("Store details saved");
};

/* ---------- passcode change ---------- */
$("#btnPasscode").onclick = () => {
  $$(".tabs [role=tab]").forEach((x) => x.setAttribute("aria-selected", "false"));
  document.querySelector('[data-tab="setup"]').setAttribute("aria-selected", "true");
  ["orders", "products", "setup"].forEach((t) => $("#tab-" + t).hidden = t !== "setup");
  $("#pcCur").focus();
  window.scrollTo({ top: document.body.scrollHeight });
};
$("#btnChangePass").onclick = async () => {
  const err = $("#pcErr");
  err.classList.remove("show");
  const cur = $("#pcCur").value, nw = $("#pcNew").value, nw2 = $("#pcNew2").value;
  const saved = localStorage.getItem(K.pass) || DEFAULT_HASH;
  if (await sha256hex(cur) !== saved) { err.textContent = "Current passcode is wrong."; err.classList.add("show"); return; }
  if (nw.length < 4) { err.textContent = "New passcode must be at least 4 characters."; err.classList.add("show"); return; }
  if (nw !== nw2) { err.textContent = "New passcodes do not match."; err.classList.add("show"); return; }
  localStorage.setItem(K.pass, await sha256hex(nw));
  $("#pcCur").value = $("#pcNew").value = $("#pcNew2").value = "";
  toast("Passcode changed");
};

/* ---------- live order updates ---------- */
window.addEventListener("storage", (e) => {
  if (e.key === K.orders) { renderOrders(); renderStats(); }
  if (e.key === K.products) renderProducts();
  if (e.key === K.settings) renderSetup();
});

/* ---------- init ---------- */
function boot() { renderSetup(); renderStats(); renderOrders(); renderProducts(); }
if ($("#view-dash").hidden === false) boot();
