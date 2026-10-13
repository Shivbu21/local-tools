/* StockQ — owner dashboard. Products, low-stock alerts, WhatsApp supplier orders. */
(function () {
  "use strict";

  var LS_PRODUCTS = "stockq_products";
  var LS_SALES = "stockq_sales";
  var LS_PASS = "stockq_passcode";

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  function uid() { return "p" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function toast(msg) {
    var t = $("#toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(t._h);
    t._h = setTimeout(function () { t.classList.remove("show"); }, 2400);
  }

  /* ---------- storage ---------- */
  function seedProducts() {
    // Starter kirana catalog on first run (same seed as the counter screen,
    // so whichever screen opens first on a fresh install gets products).
    return [
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
  }
  function loadProducts() {
    try {
      var raw = localStorage.getItem(LS_PRODUCTS);
      if (raw) return JSON.parse(raw);
    } catch (e) { /* corrupted -> reseed */ }
    var seed = seedProducts();
    saveProducts(seed);
    return seed;
  }
  function saveProducts(list) { localStorage.setItem(LS_PRODUCTS, JSON.stringify(list)); }
  function loadSales() {
    try { return JSON.parse(localStorage.getItem(LS_SALES) || "[]"); }
    catch (e) { return []; }
  }

  function suggested(p) {
    // Order up to 2x the reorder point.
    return Math.max(0, p.reorder * 2 - p.stock);
  }

  function isLow(p) { return p.stock <= p.reorder; }

  function todayISO() {
    var d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }

  /* ---------- passcode ---------- */
  function sha256hex(str) {
    var buf = new TextEncoder().encode(str);
    return crypto.subtle.digest("SHA-256", buf).then(function (h) {
      return Array.prototype.map.call(new Uint8Array(h), function (b) {
        return ("0" + b.toString(16)).slice(-2);
      }).join("");
    });
  }

  function storedHash() { return localStorage.getItem(LS_PASS); }

  function checkPass(input) {
    return sha256hex(input).then(function (h) {
      if (storedHash()) return h === storedHash();
      return sha256hex("1234").then(function (d) { return h === d; }); // default 1234
    });
  }

  function unlock() {
    $("#view-lock").hidden = true;
    $("#view-dash").hidden = false;
    renderAll();
  }

  $("#btnUnlock").addEventListener("click", function () {
    var v = $("#inPass").value;
    checkPass(v).then(function (ok) {
      if (ok) { $("#passErr").classList.remove("show"); $("#inPass").value = ""; unlock(); }
      else { $("#passErr").classList.add("show"); }
    });
  });
  $("#inPass").addEventListener("keydown", function (e) {
    if (e.key === "Enter") $("#btnUnlock").click();
  });

  /* ---------- passcode change modal ---------- */
  function openPassModal() {
    $("#pCur").value = ""; $("#pNew").value = ""; $("#pNew2").value = "";
    $("#pErr").classList.remove("show");
    $("#passModal").hidden = false;
  }
  function closePassModal() { $("#passModal").hidden = true; }
  $("#btnPasscode").addEventListener("click", openPassModal);
  $("#pCancel").addEventListener("click", closePassModal);
  $("#pSave").addEventListener("click", function () {
    var cur = $("#pCur").value, nw = $("#pNew").value, nw2 = $("#pNew2").value;
    var err = $("#pErr");
    function fail(m) { err.textContent = m; err.classList.add("show"); }
    checkPass(cur).then(function (ok) {
      if (!ok) return fail("Current passcode is wrong.");
      if (nw.length < 4) return fail("New passcode needs at least 4 characters.");
      if (nw !== nw2) return fail("New passcodes do not match.");
      sha256hex(nw).then(function (h) {
        localStorage.setItem(LS_PASS, h);
        closePassModal();
        toast("Passcode changed.");
      });
    });
  });

  /* ---------- rendering ---------- */
  function renderAll() {
    var products = loadProducts();
    renderStats(products);
    renderAlerts(products);
    renderSuppliers(products);
    renderProducts(products);
    renderSalesLog();
  }

  function renderStats(products) {
    var low = products.filter(isLow);
    var out = products.filter(function (p) { return p.stock <= 0; });
    var t = todayISO();
    var sold = loadSales()
      .filter(function (s) { return s.kind === "sale" && s.ts.slice(0, 10) === t; })
      .reduce(function (n, s) { return n + Math.abs(s.delta); }, 0);
    $("#stLow").textContent = low.length;
    $("#stOut").textContent = out.length;
    $("#stSales").textContent = sold;
  }

  function urgency(p) {
    // zero stock first, then lowest stock/reorder ratio
    if (p.stock <= 0) return -1;
    return p.reorder > 0 ? p.stock / p.reorder : p.stock;
  }

  function renderAlerts(products) {
    var low = products.filter(isLow).sort(function (a, b) { return urgency(a) - urgency(b); });
    var box = $("#alertList");
    if (!low.length) {
      box.innerHTML = '<div class="empty">All stocked up. Nothing below reorder point. 👍</div>';
      return;
    }
    box.innerHTML = "";
    low.forEach(function (p) {
      var row = document.createElement("div");
      row.className = "arow" + (p.stock <= 0 ? " zero" : "");
      row.innerHTML =
        '<span class="dot ' + (p.stock <= 0 ? "red" : "amber") + '"></span>' +
        '<div class="info"><strong>' + esc(p.name) + '</strong>' +
        '<small>' + p.stock + ' ' + esc(p.unit) + ' left · reorder at ' + p.reorder + '</small></div>' +
        '<span class="sugg tip" title="Suggested order = 2 × reorder point − current stock">order ' + suggested(p) + '</span>';
      box.appendChild(row);
    });
  }

  function waNumber(phone) {
    return String(phone || "").replace(/\D/g, "");
  }

  function renderSuppliers(products) {
    var low = products.filter(isLow);
    var box = $("#supplierList");
    box.innerHTML = "";
    if (!low.length) {
      box.innerHTML = '<div class="card"><div class="empty">No pending supplier orders.</div></div>';
      return;
    }
    var groups = {};
    low.forEach(function (p) {
      var key = (p.supplier || "").trim() || "General";
      (groups[key] = groups[key] || { name: key, phone: (p.phone || "").trim(), items: [] }).items.push(p);
    });
    Object.keys(groups).sort().forEach(function (key) {
      var g = groups[key];
      var card = document.createElement("div");
      card.className = "card";
      var rows = g.items.map(function (p) {
        return '<div class="arow"><div class="info"><strong>' + esc(p.name) + '</strong>' +
          '<small>' + p.stock + ' ' + esc(p.unit) + ' left</small></div>' +
          '<span class="sugg">× ' + suggested(p) + ' ' + esc(p.unit) + '</span></div>';
      }).join("");
      var btn = g.phone && waNumber(g.phone)
        ? '<a class="btn wa" style="width:100%;margin-top:10px" target="_blank" rel="noopener" href="' + waHref(g) + '">Order on WhatsApp</a>'
        : '<div class="empty" style="padding:10px">Add a supplier WhatsApp number to order.</div>';
      card.innerHTML = '<div style="font-weight:800;font-size:16px;margin-bottom:6px">' + esc(g.name) +
        (g.phone ? ' <small style="color:var(--muted);font-weight:600">' + esc(g.phone) + '</small>' : '') + '</div>' +
        rows + btn;
      box.appendChild(card);
    });
  }

  function waHref(g) {
    var lines = g.items.map(function (p) {
      return "• " + p.name + " — " + suggested(p) + " " + p.unit;
    });
    var msg = "Namaste " + g.name + "! Please send this order:\n" + lines.join("\n") + "\n\n— via StockQ";
    return "https://wa.me/" + waNumber(g.phone) + "?text=" + encodeURIComponent(msg);
  }

  function renderProducts(products) {
    var box = $("#prodList");
    box.innerHTML = "";
    if (!products.length) {
      box.innerHTML = '<div class="empty">No products yet. Add your first one above.</div>';
      return;
    }
    products.forEach(function (p) {
      var row = document.createElement("div");
      row.className = "prow";
      row.innerHTML =
        '<div class="info"><strong>' + esc(p.name) + '</strong>' +
        '<small>' + p.stock + ' ' + esc(p.unit) + ' · reorder at ' + p.reorder +
        (p.supplier ? ' · ' + esc(p.supplier) : '') + '</small></div>' +
        '<button class="iconbtn" data-act="edit" aria-label="Edit ' + esc(p.name) + '">✏️</button>' +
        '<button class="iconbtn danger" data-act="del" aria-label="Delete ' + esc(p.name) + '">🗑</button>';
      row.querySelector('[data-act="edit"]').addEventListener("click", function () { openEdit(p.id); });
      row.querySelector('[data-act="del"]').addEventListener("click", function () {
        if (confirm("Delete " + p.name + "?")) {
          saveProducts(loadProducts().filter(function (x) { return x.id !== p.id; }));
          renderAll();
          toast("Deleted.");
        }
      });
      box.appendChild(row);
    });
  }

  function renderSalesLog() {
    var t = todayISO();
    var rows = loadSales().filter(function (s) { return s.ts.slice(0, 10) === t; }).reverse().slice(0, 60);
    var box = $("#salesLog");
    if (!rows.length) { box.innerHTML = '<div class="empty">No sales logged today yet.</div>'; return; }
    box.innerHTML = "";
    rows.forEach(function (s) {
      var d = document.createElement("div");
      d.className = "logrow";
      var time = s.ts.slice(11, 16);
      var qtyTxt = (s.delta < 0 ? "−" : "+") + Math.abs(s.delta);
      var kind = s.kind === "sale" ? "sold" : (s.kind === "restock" ? "stock in" : "adjusted");
      d.innerHTML = '<span>' + esc(s.name) + ' <small style="color:var(--muted)">· ' + kind + '</small></span>' +
        '<span><span class="q ' + (s.delta < 0 ? "neg" : "pos") + '">' + qtyTxt + '</span> <span class="t">' + time + '</span></span>';
      box.appendChild(d);
    });
  }

  /* ---------- add product ---------- */
  $("#btnAdd").addEventListener("click", function () {
    var name = $("#fName").value.trim();
    if (!name) { toast("Enter a product name."); $("#fName").focus(); return; }
    var list = loadProducts();
    list.push({
      id: uid(),
      name: name,
      unit: $("#fUnit").value.trim() || "pc",
      stock: Math.max(0, parseInt($("#fStock").value, 10) || 0),
      reorder: Math.max(0, parseInt($("#fReorder").value, 10) || 0),
      supplier: $("#fSupplier").value.trim(),
      phone: $("#fPhone").value.trim()
    });
    saveProducts(list);
    $("#fName").value = ""; $("#fUnit").value = ""; $("#fStock").value = "0";
    $("#fReorder").value = "5"; $("#fSupplier").value = ""; $("#fPhone").value = "";
    renderAll();
    toast(name + " added.");
  });

  /* ---------- edit product modal ---------- */
  var editId = null;
  function openEdit(id) {
    var p = loadProducts().find(function (x) { return x.id === id; });
    if (!p) return;
    editId = id;
    $("#editTitle").textContent = "Edit " + p.name;
    $("#eName").value = p.name;
    $("#eUnit").value = p.unit;
    $("#eStock").value = p.stock;
    $("#eReorder").value = p.reorder;
    $("#eSupplier").value = p.supplier || "";
    $("#ePhone").value = p.phone || "";
    $("#eErr").classList.remove("show");
    $("#editModal").hidden = false;
  }
  $("#eCancel").addEventListener("click", function () { $("#editModal").hidden = true; });
  $("#eSave").addEventListener("click", function () {
    var name = $("#eName").value.trim();
    if (!name) { $("#eErr").textContent = "Name is required."; $("#eErr").classList.add("show"); return; }
    var list = loadProducts();
    var p = list.find(function (x) { return x.id === editId; });
    if (!p) return;
    p.name = name;
    p.unit = $("#eUnit").value.trim() || "pc";
    p.stock = Math.max(0, parseInt($("#eStock").value, 10) || 0);
    p.reorder = Math.max(0, parseInt($("#eReorder").value, 10) || 0);
    p.supplier = $("#eSupplier").value.trim();
    p.phone = $("#ePhone").value.trim();
    saveProducts(list);
    $("#editModal").hidden = true;
    renderAll();
    toast("Saved.");
  });

  // cross-tab sync (counter sales reflect here)
  window.addEventListener("storage", function (e) {
    if ((e.key === LS_PRODUCTS || e.key === LS_SALES) && !$("#view-dash").hidden) renderAll();
  });

  // boot: locked
  $("#view-lock").hidden = false;
})();
