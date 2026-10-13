/* BillQ — customer bill view. Reads ?bill=<id>, renders the bill from localStorage. */
"use strict";

const $ = (s, r = document) => r.querySelector(s);
const K = { bills: "billq_bills", settings: "billq_settings" };

function load(key, fb) {
  try { const v = JSON.parse(localStorage.getItem(key)); return v == null ? fb : v; }
  catch (_) { return fb; }
}
function inr(n) { return "₹" + Number(n || 0).toLocaleString("en-IN"); }
function fmtDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}
function monthLabel(ym) {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-IN", { month: "long", year: "numeric" });
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

function renderBill(bill) {
  const settings = load(K.settings, { businessName: "My Business", upiId: "" });
  $("#view-bill").hidden = false;
  $("#bBiz").textContent = settings.businessName || "My Business";
  $("#bMonth").textContent = "Bill for " + monthLabel(bill.month);
  $("#bAmount").textContent = Number(bill.amount).toLocaleString("en-IN");
  $("#bCustomer").textContent = bill.customerName;
  $("#bPlan").textContent = bill.plan;
  $("#bId").textContent = bill.id;
  $("#bDue").textContent = fmtDate(bill.dueDate);
  const paid = bill.status === "paid";
  const st = $("#bStatus");
  st.textContent = paid ? "Paid" : "Unpaid";
  st.className = "st " + (paid ? "paid" : "unpaid");
  $("#rowPaid").hidden = !paid;
  if (paid) $("#bPaidOn").textContent = fmtDate(bill.paidAt);
  const link = upiLink(settings, bill.amount);
  $("#payBlock").hidden = paid || !link;
  $("#noUpi").hidden = paid || !!link;
  $("#paidNote").hidden = !paid;
  if (link && !paid) {
    $("#btnPay").href = link;
    $("#payAmt").textContent = Number(bill.amount).toLocaleString("en-IN");
  }
}

function renderLookup() {
  $("#view-lookup").hidden = false;
  $("#btnLookup").onclick = () => {
    const d = digits($("#inPhone").value);
    const box = $("#lookupResults");
    if (d.length < 12) {
      box.innerHTML = '<p class="muted small" style="text-align:center">Enter a valid 10-digit mobile number.</p>';
      return;
    }
    const bills = load(K.bills, []).filter((b) => digits(b.phone) === d)
      .sort((a, b) => b.month.localeCompare(a.month));
    if (!bills.length) {
      box.innerHTML = '<div class="empty">No bills found for this number on this device.</div>';
      return;
    }
    box.innerHTML = '<div class="card">' + bills.map((b) =>
      '<div class="billrow"><div class="grow">' +
      '<div class="nm">' + monthLabel(b.month) + '</div>' +
      '<div class="sub">' + escapeHtml(b.plan) + ' · <span class="mono">' + escapeHtml(b.id) + '</span></div>' +
      '<div class="acts"><a class="btn ghost small" href="index.html?bill=' + encodeURIComponent(b.id) + '">View bill</a></div>' +
      '</div><div><div class="amt">' + inr(b.amount) + '</div>' +
      '<div style="text-align:right;margin-top:4px"><span class="st ' + b.status + '">' + (b.status === "paid" ? "Paid" : "Unpaid") + '</span></div></div></div>'
    ).join("") + "</div>";
  };
}

function escapeHtml(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

(function init() {
  const id = new URLSearchParams(location.search).get("bill");
  if (id) {
    const bill = load(K.bills, []).find((b) => b.id === id);
    if (bill) renderBill(bill);
    else $("#view-missing").hidden = false;
  } else {
    renderLookup();
  }
})();
