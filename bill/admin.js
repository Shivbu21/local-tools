/* BillQ — owner dashboard. All data in localStorage under billq_* keys. */
"use strict";

const $ = (s, r = document) => r.querySelector(s);
const K = {
  customers: "billq_customers",
  bills: "billq_bills",
  settings: "billq_settings",
  passcode: "billq_passcode",
};
const DEFAULT_HASH = "03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4"; // sha256("1234")

function load(key, fb) {
  try { const v = JSON.parse(localStorage.getItem(key)); return v == null ? fb : v; }
  catch (_) { return fb; }
}
function save(key, v) { localStorage.setItem(key, JSON.stringify(v)); }
async function sha256hex(s) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
function inr(n) { return "₹" + Number(n || 0).toLocaleString("en-IN"); }
function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function toast(msg) {
  const t = $("#toast");
  t.textContent = msg; t.classList.add("show");
  clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove("show"), 2600);
}
function monthLabel(ym) {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-IN", { month: "long", year: "numeric" });
}
function dueDateISO(ym) {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m, 7); // 7th of next month (m is 0-indexed next month)
  return d.toISOString();
}
function fmtDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}
function digits(phone) {
  let d = String(phone || "").replace(/\D/g, "");
  if (d.length === 10) d = "91" + d;
  return d;
}
function upiLink(settings, amount) {
  if (!settings.upiId) return null;
  return "upi://pay?pa=" + encodeURIComponent(settings.upiId) +
    "&pn=" + encodeURIComponent(settings.businessName || "BillQ") +
    "&am=" + encodeURIComponent(String(amount)) + "&cu=INR";
}
function waLink(bill) {
  const settings = load(K.settings, {});
  const biz = settings.businessName || "your service provider";
  let text = "Hello " + bill.customerName + ", this is " + biz +
    ". Your " + bill.plan + " bill for " + monthLabel(bill.month) +
    " is " + inr(bill.amount) + ", due " + fmtDate(bill.dueDate) + ".";
  const upi = upiLink(settings, bill.amount);
  if (upi) text += " Pay here: " + upi;
  return "https://wa.me/" + digits(bill.phone) + "?text=" + encodeURIComponent(text);
}
function billPageLink(id) {
  return new URL("index.html?bill=" + encodeURIComponent(id), location.href).href;
}
function uid() { return "c" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

/* ---------- passcode gate ---------- */
async function boot() {
  const hash = load(K.passcode, DEFAULT_HASH);
  $("#view-lock").hidden = false;
  const tryUnlock = async () => {
    const h = await sha256hex($("#inPass").value);
    if (h === hash) { $("#view-lock").hidden = true; $("#view-dash").hidden = false; initDash(); }
    else { $("#passErr").textContent = "Wrong passcode. Try again."; $("#inPass").value = ""; $("#inPass").focus(); }
  };
  $("#btnUnlock").onclick = tryUnlock;
  $("#inPass").addEventListener("keydown", (e) => { if (e.key === "Enter") tryUnlock(); });
  $("#inPass").focus();
}

/* ---------- dashboard ---------- */
let tab = "bills";

function initDash() {
  const settings = load(K.settings, {});
  $("#bizLine").textContent = settings.businessName ? settings.businessName + " · owner dashboard" : "Owner dashboard";
  const now = new Date();
  $("#selMonth").value = now.toISOString().slice(0, 7);
  $("#selMonth").addEventListener("change", renderAll);
  document.querySelectorAll(".tabs [role=tab]").forEach((b) => {
    b.onclick = () => {
      tab = b.dataset.tab;
      document.querySelectorAll(".tabs [role=tab]").forEach((x) => x.setAttribute("aria-selected", x === b ? "true" : "false"));
      ["bills", "defaulters", "customers", "settings"].forEach((t) => { $("#tab-" + t).hidden = t !== tab; });
      renderAll();
    };
  });
  $("#btnGenerate").onclick = generateBills;
  $("#btnLock").onclick = () => location.reload();
  renderAll();
}

function renderAll() {
  renderStats(); renderBills(); renderDefaulters(); renderCustomers(); renderSettings();
}

function selMonth() { return $("#selMonth").value || new Date().toISOString().slice(0, 7); }

function renderStats() {
  const m = selMonth();
  const bills = load(K.bills, []).filter((b) => b.month === m);
  const collected = bills.filter((b) => b.status === "paid").reduce((s, b) => s + Number(b.amount), 0);
  const pending = bills.filter((b) => b.status !== "paid").reduce((s, b) => s + Number(b.amount), 0);
  const defaulters = new Set(bills.filter((b) => b.status !== "paid").map((b) => b.customerId)).size;
  $("#stCollected").textContent = inr(collected);
  $("#stPending").textContent = inr(pending);
  $("#stDefaulters").textContent = defaulters;
  $("#cBills").textContent = bills.length;
  $("#cDef").textContent = new Set(load(K.bills, []).filter((b) => b.status !== "paid").map((b) => b.customerId)).size;
  $("#cCust").textContent = load(K.customers, []).length;
}

function billActions(b) {
  const paid = b.status === "paid";
  let h = '<div class="acts">';
  if (!paid) h += '<a class="btn wa small" target="_blank" rel="noopener" href="' + esc(waLink(b)) + '">WhatsApp reminder</a>';
  h += paid
    ? '<button class="btn ghost small" data-act="unpaid" data-id="' + esc(b.id) + '">Mark unpaid</button>'
    : '<button class="btn ghost small" data-act="paid" data-id="' + esc(b.id) + '">Mark paid</button>';
  h += '<button class="btn ghost small" data-act="copy" data-id="' + esc(b.id) + '">Copy bill link</button>';
  return h + "</div>";
}

function billRow(b) {
  return '<div class="billrow"><div class="grow">' +
    '<div class="nm">' + esc(b.customerName) + '</div>' +
    '<div class="sub">' + esc(b.plan) + " · " + esc(b.id) + " · due " + fmtDate(b.dueDate) + "</div>" +
    billActions(b) +
    '</div><div><div class="amt">' + inr(b.amount) + '</div>' +
    '<div style="text-align:right;margin-top:4px"><span class="st ' + b.status + '">' + (b.status === "paid" ? "Paid" : "Unpaid") + "</span></div></div></div>";
}

function renderBills() {
  const m = selMonth();
  const bills = load(K.bills, []).filter((b) => b.month === m)
    .sort((a, b) => a.customerName.localeCompare(b.customerName));
  $("#tab-bills").innerHTML = bills.length
    ? '<div class="card">' + bills.map(billRow).join("") + "</div>"
    : '<div class="empty">No bills for ' + esc(monthLabel(m)) + ' yet.<br/>Add customers, then tap "Generate this month\'s bills".</div>';
  wireActions($("#tab-bills"));
}

function renderDefaulters() {
  const bills = load(K.bills, []).filter((b) => b.status !== "paid")
    .sort((a, b) => Number(b.amount) - Number(a.amount));
  const total = bills.reduce((s, b) => s + Number(b.amount), 0);
  $("#tab-defaulters").innerHTML = bills.length
    ? '<div class="card"><div class="row" style="margin-bottom:6px"><h3 style="margin:0">' + bills.length +
      ' unpaid bills</h3><strong>' + inr(total) + " pending</strong></div>" +
      bills.map(billRow).join("") + "</div>"
    : '<div class="empty">No defaulters. Everyone is paid up. 🎉</div>';
  wireActions($("#tab-defaulters"));
}

function renderCustomers() {
  const customers = load(K.customers, []);
  let h = '<div class="card"><h3>Add customer</h3>' +
    '<div class="field"><label for="cName">Name</label><input id="cName" placeholder="e.g. Ramesh Gupta" /></div>' +
    '<div class="frow"><div class="field"><label for="cPhone">Phone</label><input id="cPhone" inputmode="numeric" placeholder="10-digit mobile" maxlength="13" /></div>' +
    '<div class="field"><label for="cAmt">Monthly amount (₹)</label><input id="cAmt" inputmode="numeric" placeholder="e.g. 1800" /></div></div>' +
    '<div class="field"><label for="cPlan">Plan</label><input id="cPlan" placeholder=\'e.g. Milk 1L daily\' /></div>' +
    '<button class="btn primary" id="btnAddCust">Add customer</button></div>';
  h += customers.length
    ? '<div class="card">' + customers.map((c) =>
      '<div class="billrow"><div class="grow"><div class="nm">' + esc(c.name) + '</div>' +
      '<div class="sub">' + esc(c.plan) + " · " + esc(c.phone) + "</div></div>" +
      '<div><div class="amt">' + inr(c.amount) + '/mo</div>' +
      '<div class="acts" style="justify-content:flex-end"><button class="btn danger-ghost small" data-cdel="' + esc(c.id) + '">Remove</button></div></div></div>'
    ).join("") + "</div>"
    : '<div class="empty">No customers yet. Add your first subscriber above.</div>';
  $("#tab-customers").innerHTML = h;
  $("#btnAddCust").onclick = addCustomer;
  $("#tab-customers").querySelectorAll("[data-cdel]").forEach((b) => {
    b.onclick = () => {
      if (!confirm("Remove this customer? Their old bills stay.")) return;
      save(K.customers, load(K.customers, []).filter((c) => c.id !== b.dataset.cdel));
      renderAll(); toast("Customer removed");
    };
  });
}

function addCustomer() {
  const name = $("#cName").value.trim();
  const phone = $("#cPhone").value.trim();
  const amount = Number($("#cAmt").value);
  const plan = $("#cPlan").value.trim() || "Monthly plan";
  if (!name) { toast("Enter the customer's name"); return; }
  if (digits(phone).length < 12) { toast("Enter a valid 10-digit mobile number"); return; }
  if (!amount || amount <= 0) { toast("Enter a valid monthly amount"); return; }
  const customers = load(K.customers, []);
  customers.push({ id: uid(), name, phone, plan, amount, createdAt: new Date().toISOString() });
  save(K.customers, customers);
  renderAll(); toast("Customer added");
}

function renderSettings() {
  const s = load(K.settings, { businessName: "", upiId: "" });
  $("#tab-settings").innerHTML =
    '<div class="card"><h3>Business</h3>' +
    '<div class="field"><label for="sBiz">Business name</label><input id="sBiz" value="' + esc(s.businessName || "") + '" placeholder="e.g. Sharma Dairy" /></div>' +
    '<div class="field"><label for="sUpi">UPI ID (for the Pay button)</label><input id="sUpi" value="' + esc(s.upiId || "") + '" placeholder="e.g. sharma@upi" />' +
    '<div class="hint">Customers tap Pay and their UPI app opens with your ID and the bill amount filled in.</div></div>' +
    '<button class="btn primary" id="btnSaveSettings">Save settings</button></div>' +
    '<div class="card"><h3>Change passcode</h3>' +
    '<div class="field"><label for="pCur">Current passcode</label><input type="password" id="pCur" inputmode="numeric" /></div>' +
    '<div class="frow"><div class="field"><label for="pNew">New passcode</label><input type="password" id="pNew" inputmode="numeric" /></div>' +
    '<div class="field"><label for="pConf">Confirm new</label><input type="password" id="pConf" inputmode="numeric" /></div></div>' +
    '<button class="btn primary" id="btnChangePass">Change passcode</button></div>';
  $("#btnSaveSettings").onclick = () => {
    save(K.settings, { businessName: $("#sBiz").value.trim(), upiId: $("#sUpi").value.trim() });
    const nb = $("#sBiz").value.trim();
    $("#bizLine").textContent = nb ? nb + " · owner dashboard" : "Owner dashboard";
    toast("Settings saved");
  };
  $("#btnChangePass").onclick = async () => {
    const cur = $("#pCur").value, nw = $("#pNew").value, cf = $("#pConf").value;
    const stored = load(K.passcode, DEFAULT_HASH);
    if (await sha256hex(cur) !== stored) { toast("Current passcode is wrong"); return; }
    if (nw.length < 4) { toast("New passcode must be at least 4 characters"); return; }
    if (nw !== cf) { toast("New passcodes don't match"); return; }
    save(K.passcode, await sha256hex(nw));
    $("#pCur").value = $("#pNew").value = $("#pConf").value = "";
    toast("Passcode changed");
  };
}

/* ---------- bill generation (idempotent by month+customer) ---------- */
function generateBills() {
  const m = selMonth();
  const customers = load(K.customers, []);
  if (!customers.length) { toast("Add customers first"); return; }
  const bills = load(K.bills, []);
  const existing = new Set(bills.filter((b) => b.month === m).map((b) => b.customerId));
  const missing = customers.filter((c) => !existing.has(c.id));
  if (!missing.length) { toast("Bills for " + monthLabel(m) + " already exist — nothing to add"); return; }
  let seq = bills.filter((b) => b.month === m)
    .reduce((mx, b) => { const n = parseInt(String(b.id).split("-").pop(), 10); return isNaN(n) ? mx : Math.max(mx, n); }, 0);
  const due = dueDateISO(m);
  const now = new Date().toISOString();
  missing.forEach((c) => {
    seq += 1;
    bills.push({
      id: "BILL-" + m + "-" + String(seq).padStart(3, "0"),
      customerId: c.id, customerName: c.name, phone: c.phone,
      plan: c.plan, amount: c.amount, month: m,
      dueDate: due, status: "unpaid", createdAt: now, paidAt: null,
    });
  });
  save(K.bills, bills);
  renderAll();
  toast(missing.length + " bill" + (missing.length > 1 ? "s" : "") + " generated for " + monthLabel(m));
}

function wireActions(root) {
  root.querySelectorAll("[data-act]").forEach((b) => {
    b.onclick = async () => {
      const bills = load(K.bills, []);
      const bill = bills.find((x) => x.id === b.dataset.id);
      if (!bill) return;
      if (b.dataset.act === "paid") { bill.status = "paid"; bill.paidAt = new Date().toISOString(); toast("Marked paid"); }
      else if (b.dataset.act === "unpaid") { bill.status = "unpaid"; bill.paidAt = null; toast("Marked unpaid"); }
      else if (b.dataset.act === "copy") {
        const link = billPageLink(bill.id);
        try { await navigator.clipboard.writeText(link); toast("Bill link copied"); }
        catch (_) { prompt("Copy the bill link:", link); }
        return;
      }
      save(K.bills, bills);
      renderAll();
    };
  });
}

boot();
