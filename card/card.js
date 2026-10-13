/* CardQ — shared logic: storage, crypto, card rendering, vCard, QR. */

export const STORE_CARD = "cardq_card";
export const STORE_PASS = "cardq_pass";
// SHA-256 of "1234"
export const DEFAULT_PASS_HASH = "03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4";

export const ACCENTS = [
  { name: "Emerald", value: "#0e7a3e", deep: "#0a5c2f", soft: "#e3f0e7" },
  { name: "Navy", value: "#1e3a8a", deep: "#172a63", soft: "#e3e8f7" },
  { name: "Maroon", value: "#7c2d12", deep: "#5c200c", soft: "#f6e8df" },
  { name: "Onyx", value: "#1c1917", deep: "#0c0a09", soft: "#e9e6e1" },
  { name: "Teal", value: "#0f766e", deep: "#0b5a55", soft: "#dff0ee" },
  { name: "Plum", value: "#6b21a8", deep: "#4c1779", soft: "#efe4f8" },
];

export function defaultCard() {
  return {
    businessName: "",
    ownerName: "",
    tagline: "",
    phone: "",
    whatsapp: "",
    upiId: "",
    address: "",
    mapsLink: "",
    hours: "",
    services: [],
    photo: "", // dataURL
    accent: ACCENTS[0].value,
  };
}

export function loadCard() {
  try {
    const raw = localStorage.getItem(STORE_CARD);
    if (!raw) return null;
    const d = JSON.parse(raw);
    return Object.assign(defaultCard(), d);
  } catch (_) {
    return null;
  }
}

export function saveCard(d) {
  localStorage.setItem(STORE_CARD, JSON.stringify(d));
}

export function loadPassHash() {
  return localStorage.getItem(STORE_PASS) || DEFAULT_PASS_HASH;
}
export function setPassHash(h) {
  localStorage.setItem(STORE_PASS, h);
}

export async function sha256hex(str) {
  if (window.crypto?.subtle) {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
  }
  return "plain:" + str; /* non-secure context: fail closed, never matches a stored hash */
}

export function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

export const digits = (s) => String(s || "").replace(/\D/g, "");

export function waLink(num, text) {
  const d = digits(num);
  if (!d) return "";
  let url = "https://wa.me/" + d;
  if (text) url += "?text=" + encodeURIComponent(text);
  return url;
}

export function upiLink(upiId, name) {
  if (!upiId) return "";
  return (
    "upi://pay?pa=" + encodeURIComponent(upiId.trim()) +
    "&pn=" + encodeURIComponent((name || "").trim()) +
    "&cu=INR"
  );
}

export function mapsLink(address, custom) {
  if (custom && custom.trim()) return custom.trim();
  if (address && address.trim())
    return "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(address.trim());
  return "";
}

/** Public URL of the card (index.html). Pass an override when rendering previews. */
export function cardURL(override) {
  if (override) return override;
  return location.href.split("?")[0].split("#")[0];
}

export function qrURL(url) {
  return (
    "https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=10&data=" +
    encodeURIComponent(url)
  );
}

function vesc(s) {
  return String(s ?? "").replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/;/g, "\\;").replace(/,/g, "\\,");
}

export function buildVCard(d) {
  const lines = [
    "BEGIN:VCARD",
    "VERSION:3.0",
    "FN:" + vesc(d.ownerName || d.businessName || "Contact"),
    "ORG:" + vesc(d.businessName || ""),
    "TITLE:" + vesc(d.tagline || ""),
  ];
  if (digits(d.phone)) lines.push("TEL;TYPE=CELL,VOICE:" + vesc("+" + digits(d.phone)));
  if (digits(d.whatsapp) && digits(d.whatsapp) !== digits(d.phone))
    lines.push("TEL;TYPE=MSG:" + vesc("+" + digits(d.whatsapp)));
  if (d.address) lines.push("ADR;TYPE=WORK:;;" + vesc(d.address) + ";;;;");
  if (d.businessName) lines.push("NOTE:" + vesc((d.services || []).join(", ")));
  lines.push("END:VCARD");
  return lines.join("\r\n");
}

export function initials(name) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "Q";
  return (parts[0][0] + (parts[1] ? parts[1][0] : "")).toUpperCase();
}

const ICONS = {
  phone: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.13.96.36 1.9.7 2.8a2 2 0 0 1-.45 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.45c.9.34 1.84.57 2.8.7A2 2 0 0 1 22 16.9z"/></svg>',
  wa: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2c-1.5 0-3-.4-4.3-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.6-6.1c-.3-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1-.2.3-.6.8-.8 1-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4 0-.5.1-.7l.4-.5c.1-.2.1-.4 0-.5l-.8-1.9c-.2-.5-.4-.4-.6-.4h-.5c-.2 0-.5.2-.7.5-.9.9-1.1 2.2-.2 3.9a11.6 11.6 0 0 0 4.5 4.2c1.7.8 2.4.9 3.2.7.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.1-1.2 0-.1-.2-.1-.4-.2z"/></svg>',
  upi: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 3h12l-2.5 4.5h-7L6 3z"/><path d="M6 3l2.5 4.5M18 3l-2.5 4.5"/><path d="M8.5 7.5V12a3.5 3.5 0 0 0 7 0V7.5"/><path d="M12 15.5V21M9 18.5h6"/></svg>',
  pin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0z"/><circle cx="12" cy="10" r="3"/></svg>',
  clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg>',
  share: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4"/></svg>',
  save: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12"/><path d="M7 10l5 5 5-5"/><path d="M4 21h16"/></svg>',
};

/**
 * Render the public card into `mount`. `opts.cardUrl` overrides the URL used
 * for the QR code and copy-link (used by the admin preview).
 */
export function renderCard(d, mount, opts = {}) {
  const accent = ACCENTS.find((a) => a.value === d.accent) || ACCENTS[0];
  const url = cardURL(opts.cardUrl);
  const tel = digits(d.phone) ? "tel:+" + digits(d.phone) : "";
  const wa = waLink(d.whatsapp, "Hi " + (d.businessName || "") + "! I found your card.");
  const upi = upiLink(d.upiId, d.businessName);
  const maps = mapsLink(d.address, d.mapsLink);

  const initialsTxt = initials(d.businessName || d.ownerName);
  const avatar = d.photo
    ? '<img src="' + d.photo + '" alt="' + esc(d.businessName) + '" />'
    : esc(initialsTxt);

  let actions = "";
  if (tel) actions += '<a class="abtn call" href="' + esc(tel) + '">' + ICONS.phone + '<span>Call</span></a>';
  if (wa) actions += '<a class="abtn wa" href="' + esc(wa) + '" target="_blank" rel="noopener">' + ICONS.wa + '<span>WhatsApp</span></a>';
  if (upi) actions += '<a class="abtn upi" href="' + esc(upi) + '">' + ICONS.upi + '<span>Pay</span></a>';

  let rows = "";
  if (d.address || maps) {
    const rowInner =
      '<div class="ic">' + ICONS.pin + '</div>' +
      '<div class="tx"><div class="lb">Visit</div><div class="vl">' + esc(d.address || "Open in Maps") + "</div></div>" +
      '<div class="go">›</div>';
    rows += maps
      ? '<a class="irow" href="' + esc(maps) + '" target="_blank" rel="noopener">' + rowInner + "</a>"
      : '<div class="irow">' + rowInner + "</div>";
  }
  if (d.hours) {
    rows += '<div class="irow"><div class="ic">' + ICONS.clock + '</div>' +
      '<div class="tx"><div class="lb">Hours</div><div class="vl">' + esc(d.hours) + "</div></div></div>";
  }
  if (digits(d.phone)) {
    rows += '<a class="irow" href="' + esc(tel) + '"><div class="ic">' + ICONS.phone + '</div>' +
      '<div class="tx"><div class="lb">Phone</div><div class="vl">' + esc(d.phone) + "</div></div>" +
      '<div class="go">›</div></a>';
  }

  let services = "";
  if (d.services && d.services.length) {
    services =
      '<div class="sect"><h3>Services</h3><div class="chips">' +
      d.services.map((s) => '<span class="chip">' + esc(s) + "</span>").join("") +
      "</div></div>";
  }

  mount.innerHTML =
    '<article class="card" style="--accent:' + accent.value + ";--accent-deep:" + accent.deep + ";--accent-soft:" + accent.soft + '">' +
    '<div class="cover"><span class="cover-mark">Q</span></div>' +
    '<div class="avatar">' + avatar + "</div>" +
    '<div class="who">' +
    (d.ownerName ? '<div class="owner">' + esc(d.ownerName) + "</div>" : "") +
    "<h1>" + esc(d.businessName || "Your Business") + "</h1>" +
    (d.tagline ? '<p class="tagline">' + esc(d.tagline) + "</p>" : "") +
    "</div>" +
    (actions ? '<div class="actions3">' + actions + "</div>" : "") +
    (rows ? '<div class="rows">' + rows + "</div>" : "") +
    services +
    '<div class="actions2">' +
    '<button class="sbtn solid" data-act="save">' + ICONS.save + "<span>Save contact</span></button>" +
    '<button class="sbtn" data-act="share">' + ICONS.share + "<span>Share</span></button>" +
    "</div>" +
    '<div class="qrblock">' +
    '<img src="' + esc(qrURL(url)) + '" alt="QR code for this card" loading="lazy" data-qr />' +
    '<p class="cap">Scan to open this card on any phone</p>' +
    '<div class="linkrow"><span>' + esc(url) + '</span><button data-act="copy">Copy</button></div>' +
    "</div>" +
    '<div class="cardfoot">Made with <b>CardQ</b></div>' +
    "</article>";
}

let toastTimer = null;
export function toast(msg) {
  let t = document.querySelector(".toast");
  if (!t) {
    t = document.createElement("div");
    t.className = "toast";
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 2400);
}
