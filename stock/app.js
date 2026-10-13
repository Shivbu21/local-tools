/* StockQ — counter screen. Tap = sell 1, long-press = adjust, Stock-in mode = receive. */
(function () {
  "use strict";

  var LS_PRODUCTS = "stockq_products";
  var LS_SALES = "stockq_sales";

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  function uid() { return "p" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function loadProducts() {
    try {
      var raw = localStorage.getItem(LS_PRODUCTS);
      if (raw) return JSON.parse(raw);
    } catch (e) { /* corrupted -> reseed */ }
    var seed = [
      { name: "Atta", unit: "10 kg", stock: 14, reorder: 6, supplier: "Sharma Traders", phone: "919810012345" },
      { name: "Basmati Rice", unit: "5 kg", stock: 8, reorder: 5, supplier: "Sharma Traders", phone: "919810012345" },
      { name: "Sugar", unit: "1 kg", stock: 22, reorder: 10, supplier: "Sharma Traders", phone: "919810012345" },
      { name: "Salt", unit: "1 kg", stock: 30, reorder: 12, supplier: "", phone: "" },
      { name: "Mustard Oil", unit: "1 L", stock: 9, reorder: 6, supplier: "Gupta Oils", phone: "919876543210" },
      { name: "Tea", unit: "250 g", stock: 16, reorder: 8, supplier: "Gupta Oils", phone: "919876543210" },
      { name: "Toor Dal", unit: "1 kg", stock: 4, reorder: 6, supplier: "Sharma Traders", phone: "919810012345" },
      { name: "Milk", unit: "500 ml", stock: 0, reorder: 12, supplier: "City Dairy", phone: "919650043210" },
      { name: "Eggs", unit: "12 pc", stock: 11, reorder: 6, supplier: "City Dairy", phone: "919650043210" },
      { name: "Biscuits", unit: "pack", stock: 25, reorder: 10, supplier: "", phone: "" },
      { name: "Soap", unit: "pc", stock: 18, reorder: 8, supplier: "", phone: "" },
      { name: "Detergent", unit: "1 kg", stock: 7, reorder: 5, supplier: "", phone: "" }
    ].map(function (p) {
      return { id: uid(), name: p.name, unit: p.unit, stock: p.stock, reorder: p.reorder, supplier: p.supplier, phone: p.phone };
    });
    saveProducts(seed);
    return seed;
  }

  function saveProducts(list) {
    localStorage.setItem(LS_PRODUCTS, JSON.stringify(list));
  }

  function logChange(pid, name, delta, kind) {
    var raw = localStorage.getItem(LS_SALES);
    var log = [];
    try { log = raw ? JSON.parse(raw) : []; } catch (e) { log = []; }
    if (!Array.isArray(log)) log = [];
    log.push({ id: uid(), pid: pid, name: name, delta: delta, kind: kind, ts: new Date().toISOString() });
    if (log.length > 2000) log = log.slice(log.length - 2000);
    localStorage.setItem(LS_SALES, JSON.stringify(log));
  }

  var products = loadProducts();
  var mode = "sell"; // sell | in
  var query = "";

  function toast(msg) {
    var t = $("#toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(t._h);
    t._h = setTimeout(function () { t.classList.remove("show"); }, 2200);
  }

  function filtered() {
    var q = query.trim().toLowerCase();
    if (!q) return products;
    return products.filter(function (p) { return p.name.toLowerCase().indexOf(q) !== -1; });
  }

  function cardClass(p) {
    if (p.stock <= 0) return "pcard out";
    if (p.stock <= p.reorder) return "pcard low";
    return "pcard";
  }

  function render() {
    var list = filtered();
    var grid = $("#grid");
    grid.innerHTML = "";
    list.forEach(function (p) {
      var d = document.createElement("div");
      d.className = cardClass(p);
      d.dataset.id = p.id;
      d.setAttribute("role", "button");
      d.setAttribute("tabindex", "0");
      d.setAttribute("aria-label", p.name + ", stock " + p.stock + " " + p.unit + ". Tap to " + (mode === "sell" ? "sell one" : "add one") + ".");
      d.innerHTML =
        '<div class="nm">' + esc(p.name) + '</div>' +
        '<div class="stk">' + p.stock + ' <small>' + esc(p.unit) + '</small></div>' +
        '<div class="tap-hint">' + (mode === "sell" ? "tap = sell 1" : "tap = +1 stock") + '</div>';
      grid.appendChild(d);
      attachTap(d, p);
    });
    $("#empty").hidden = list.length > 0;

    var low = products.filter(function (p) { return p.stock <= p.reorder; }).length;
    var out = products.filter(function (p) { return p.stock <= 0; }).length;
    $("#alertStrip").textContent = low
      ? (out ? out + " out of stock · " : "") + low + " low on stock"
      : "Stock levels OK";
    $("#alertStrip").style.color = out ? "var(--bad)" : (low ? "var(--warn)" : "var(--muted)");
  }

  function bump(p, delta, kind) {
    var next = p.stock + delta;
    if (next < 0) { toast(p.name + " is out of stock"); return; }
    p.stock = next;
    saveProducts(products);
    logChange(p.id, p.name, delta, kind);
    render();
  }

  function attachTap(el, p) {
    var pressTimer = null;
    var moved = false;
    var startX = 0, startY = 0;
    var fired = false;

    function cancel() {
      if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; }
    }

    el.addEventListener("pointerdown", function (e) {
      fired = false; moved = false;
      startX = e.clientX; startY = e.clientY;
      cancel();
      pressTimer = setTimeout(function () {
        if (!moved) { fired = true; openAdjust(p.id); }
        pressTimer = null;
      }, 550);
    });
    el.addEventListener("pointermove", function (e) {
      if (Math.abs(e.clientX - startX) > 12 || Math.abs(e.clientY - startY) > 12) { moved = true; cancel(); }
    });
    ["pointerup", "pointercancel", "pointerleave"].forEach(function (ev) {
      el.addEventListener(ev, function () {
        var wasLong = fired;
        cancel();
        if (!wasLong && ev === "pointerup" && !moved) {
          // plain tap
          if (mode === "sell") bump(p, -1, "sale");
          else bump(p, +1, "restock");
        }
        fired = false;
      });
    });
    el.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); mode === "sell" ? bump(p, -1, "sale") : bump(p, +1, "restock"); }
    });
    // suppress the synthetic click / context menu after long-press
    el.addEventListener("contextmenu", function (e) { e.preventDefault(); });
  }

  /* ---------- adjust popover ---------- */
  var popPid = null;

  function openAdjust(pid) {
    var p = products.find(function (x) { return x.id === pid; });
    if (!p) return;
    popPid = pid;
    $("#popName").textContent = p.name;
    syncPop(p);
    $("#popVeil").hidden = false;
  }

  function syncPop(p) {
    p = p || products.find(function (x) { return x.id === popPid; });
    if (!p) return;
    $("#popCur").textContent = "Current stock: " + p.stock + " " + p.unit + " · reorder at " + p.reorder;
    $("#popVal").textContent = p.stock;
  }

  function closeAdjust() {
    $("#popVeil").hidden = true;
    popPid = null;
  }

  $("#popMinus").addEventListener("click", function () {
    var p = products.find(function (x) { return x.id === popPid; });
    if (p) bump(p, -1, "adjust");
    syncPop();
  });
  $("#popPlus").addEventListener("click", function () {
    var p = products.find(function (x) { return x.id === popPid; });
    if (p) bump(p, +1, "adjust");
    syncPop();
  });
  $("#popClose").addEventListener("click", closeAdjust);
  $("#popVeil").addEventListener("click", function (e) {
    if (e.target === $("#popVeil")) closeAdjust();
  });

  /* ---------- mode + search ---------- */
  function setMode(m) {
    mode = m;
    $("#modeSell").classList.toggle("on", m === "sell");
    $("#modeIn").classList.toggle("on", m === "in");
    $("#modeSell").setAttribute("aria-selected", m === "sell");
    $("#modeIn").setAttribute("aria-selected", m === "in");
    render();
  }
  $("#modeSell").addEventListener("click", function () { setMode("sell"); });
  $("#modeIn").addEventListener("click", function () { setMode("in"); });

  var qT = null;
  $("#q").addEventListener("input", function (e) {
    clearTimeout(qT);
    qT = setTimeout(function () { query = e.target.value; render(); }, 120);
  });

  // cross-tab sync (dashboard edits reflect here)
  window.addEventListener("storage", function (e) {
    if (e.key === LS_PRODUCTS) { products = loadProducts(); render(); }
  });

  render();
})();
