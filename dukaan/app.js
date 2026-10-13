/* DukaanQ — public storefront logic. Data in localStorage under dukaan_ keys. */
"use strict";

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const K = { settings: "dukaan_settings", products: "dukaan_products", cart: "dukaan_cart", orders: "dukaan_orders" };

const read = (k, fb) => {
  try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? fb : v; } catch { return fb; }
};
const write = (k, v) => localStorage.setItem(k, JSON.stringify(v));
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const inr = (n) => "₹" + Number(n || 0).toLocaleString("en-IN");

const settings = () => read(K.settings, { shopName: "DukaanQ", whatsapp: "", upiId: "" });
const products = () => read(K.products, []);
const cart = () => read(K.cart, {});
const saveCart = (c) => write(K.cart, c);

const state = { cat: "All", q: "" };

function toast(msg) {
  const t = $("#toast");
  t.textContent = msg; t.classList.add("show");
  clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove("show"), 2600);
}

/* ---------- header ---------- */
function renderHeader() {
  const s = settings();
  $("#shopName").textContent = s.shopName || "DukaanQ";
  $("#shopSub").textContent = "WhatsApp storefront";
  document.title = (s.shopName || "DukaanQ") + " — WhatsApp storefront";
}

/* ---------- product grid ---------- */
function categories() {
  const cats = [...new Set(products().map((p) => p.category).filter(Boolean))];
  return ["All", ...cats.sort()];
}
function renderChips() {
  const box = $("#catChips");
  box.innerHTML = categories().map((c) =>
    `<button class="chip${c === state.cat ? " on" : ""}" data-cat="${esc(c)}">${esc(c)}</button>`).join("");
  $$(".chip", box).forEach((b) => b.onclick = () => { state.cat = b.dataset.cat; renderChips(); renderGrid(); });
}
function filtered() {
  const q = state.q.trim().toLowerCase();
  return products().filter((p) =>
    (state.cat === "All" || p.category === state.cat) &&
    (!q || (p.name + " " + (p.category || "")).toLowerCase().includes(q)));
}
function renderGrid() {
  const list = filtered();
  const grid = $("#grid");
  $("#emptyState").hidden = list.length > 0 || products().length > 0;
  grid.innerHTML = list.map((p) => `
    <div class="pcard">
      <div class="ph">${p.photo ? `<img src="${p.photo}" alt="${esc(p.name)}" loading="lazy" />` : `<span class="noph">🛍️</span>`}</div>
      <div class="bd">
        <div class="nm">${esc(p.name)}</div>
        ${p.category ? `<div class="cat">${esc(p.category)}</div>` : ""}
        <div class="row">
          <span class="pr">${inr(p.price)}</span>
          <button class="addbtn" data-add="${p.id}">Add</button>
        </div>
      </div>
    </div>`).join("");
  $$("[data-add]", grid).forEach((b) => b.onclick = () => addToCart(b.dataset.add));
}
function cartQty() { return Object.values(cart()).reduce((a, b) => a + b, 0); }
function addToCart(id) {
  const c = cart(); c[id] = (c[id] || 0) + 1; saveCart(c);
  renderCartBadge();
  toast("Added to cart");
}
function renderCartBadge() {
  const n = cartQty();
  $("#cartCount").textContent = n; $("#cartCountTop").textContent = n;
  $("#btnCart").hidden = n === 0; $("#btnCartTop").hidden = n === 0;
}

/* ---------- cart drawer ---------- */
function cartLines() {
  const ps = Object.fromEntries(products().map((p) => [p.id, p]));
  return Object.entries(cart())
    .map(([id, qty]) => ({ p: ps[id], qty }))
    .filter((l) => l.p);
}
function cartTotal() { return cartLines().reduce((a, l) => a + l.p.price * l.qty, 0); }
function openDrawer() { renderCartItems(); $("#scrim").hidden = false; $("#drawer").hidden = false; }
function closeDrawer() { $("#scrim").hidden = true; $("#drawer").hidden = true; }
function renderCartItems() {
  const lines = cartLines();
  $("#cartItems").innerHTML = lines.length ? lines.map((l) => `
    <div class="citem">
      ${l.p.photo ? `<img class="th" src="${l.p.photo}" alt="" />` : `<div class="th"></div>`}
      <div class="inf"><div class="n">${esc(l.p.name)}</div><div class="p">${inr(l.p.price)} each</div></div>
      <div class="stepper">
        <button data-dec="${l.p.id}" aria-label="Decrease">−</button>
        <span>${l.qty}</span>
        <button data-inc="${l.p.id}" aria-label="Increase">+</button>
      </div>
    </div>`).join("") : `<div class="empty" style="padding:30px"><div class="big">🛒</div><strong>Your cart is empty</strong></div>`;
  $$("[data-inc]", $("#cartItems")).forEach((b) => b.onclick = () => { const c = cart(); c[b.dataset.inc]++; saveCart(c); renderCartItems(); renderCartBadge(); });
  $$("[data-dec]", $("#cartItems")).forEach((b) => b.onclick = () => { const c = cart(); const id = b.dataset.dec; c[id]--; if (c[id] <= 0) delete c[id]; saveCart(c); renderCartItems(); renderCartBadge(); });
  $("#cartTotal").textContent = inr(cartTotal());
  $("#btnPlace").disabled = lines.length === 0;
}

/* ---------- checkout ---------- */
function setInvalid(key, bad) {
  document.querySelector(`[data-f="${key}"]`).classList.toggle("invalid", bad);
  return !bad;
}
function placeOrder() {
  const name = $("#inName").value.trim();
  const phone = $("#inPhone").value.replace(/\D/g, "");
  const address = $("#inAddr").value.trim();
  let ok = setInvalid("name", !name);
  ok = setInvalid("phone", phone.length < 10) && ok;
  ok = setInvalid("address", !address) && ok;
  const lines = cartLines();
  if (!lines.length) { toast("Your cart is empty"); return; }
  if (!ok) return;
  const s = settings();
  const order = {
    id: "DQ-" + Date.now().toString(36).toUpperCase(),
    items: lines.map((l) => ({ name: l.p.name, price: l.p.price, qty: l.qty })),
    total: cartTotal(),
    customer: { name, phone, address },
    status: "pending",
    created_at: new Date().toISOString(),
  };
  const orders = read(K.orders, []); orders.push(order); write(K.orders, orders);
  write(K.cart, {});
  renderCartBadge();
  closeDrawer();
  showDone(order, s);
}
function upiLink(order, s) {
  const p = new URLSearchParams({
    pa: s.upiId || "", pn: s.shopName || "DukaanQ",
    am: Number(order.total).toFixed(2), cu: "INR",
    tn: "Order " + order.id,
  });
  return "upi://pay?" + p.toString();
}
function waNumber(raw) {
  let d = String(raw || "").replace(/\D/g, "");
  if (d.length === 10 && /^[6-9]/.test(d)) d = "91" + d;
  return d;
}
function waLink(order, s) {
  const lines = order.items.map((i) => `• ${i.qty} × ${i.name} — ${inr(i.price * i.qty)}`).join("\n");
  const msg = `New order from ${s.shopName || "DukaanQ"}\nOrder ${order.id}\n${lines}\nTotal: ${inr(order.total)}\n\nName: ${order.customer.name}\nPhone: ${order.customer.phone}\nAddress: ${order.customer.address}`;
  return "https://wa.me/" + waNumber(s.whatsapp) + "?text=" + encodeURIComponent(msg);
}
function showDone(order, s) {
  $("#doneName").textContent = order.customer.name.split(" ")[0];
  $("#doneId").textContent = order.id;
  $("#doneBox").innerHTML =
    order.items.map((i) => `<div class="ln"><span>${i.qty} × ${esc(i.name)}</span><span>${inr(i.price * i.qty)}</span></div>`).join("") +
    `<div class="ln tt"><span>Total</span><span>${inr(order.total)}</span></div>`;
  $("#btnPay").href = upiLink(order, s);
  $("#btnWA").href = waLink(order, s);
  if (!s.upiId) $("#btnPay").style.display = "none"; else $("#btnPay").style.display = "";
  if (!waNumber(s.whatsapp)) $("#btnWA").style.display = "none"; else $("#btnWA").style.display = "";
  $("#scrim").hidden = false; $("#doneSheet").hidden = false;
}

/* ---------- events ---------- */
$("#inSearch").addEventListener("input", (e) => { state.q = e.target.value; renderGrid(); });
$("#btnCart").onclick = openDrawer;
$("#btnCartTop").onclick = openDrawer;
$("#btnCloseDrawer").onclick = closeDrawer;
$("#scrim").onclick = () => { closeDrawer(); $("#doneSheet").hidden = true; };
$("#btnPlace").onclick = placeOrder;
$("#btnCloseDone").onclick = () => { $("#scrim").hidden = true; $("#doneSheet").hidden = true; };
$("#btnShopMore").onclick = () => { $("#scrim").hidden = true; $("#doneSheet").hidden = true; };
["inName", "inPhone", "inAddr"].forEach((id) =>
  $("#" + id).addEventListener("input", () => document.querySelector(`[data-f="${id.replace("in", "").toLowerCase().replace("addr", "address")}"]`)?.classList.remove("invalid")));
window.addEventListener("storage", (e) => {
  if (e.key === K.products || e.key === K.settings) { renderHeader(); renderChips(); renderGrid(); }
});

/* ---------- init ---------- */
renderHeader(); renderChips(); renderGrid(); renderCartBadge();
