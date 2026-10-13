/* CardQ — public card page. */
import { loadCard, renderCard, buildVCard, cardURL, toast } from "./card.js";

const mount = document.getElementById("cardMount");
const data = loadCard();

if (!data || !data.businessName) {
  document.title = "CardQ — card not set up yet";
  mount.innerHTML =
    '<div class="empty">' +
    '<div class="mark">Q</div>' +
    "<h1>Card not set up yet</h1>" +
    "<p>This business hasn't created their digital card. If this is your business, build your card in under two minutes.</p>" +
    '<a href="admin.html">Create my card</a>' +
    "</div>";
} else {
  document.title = data.businessName + " — CardQ";
  renderCard(data, mount);
}

/* delegated actions: save contact / share / copy link */
document.addEventListener("click", async (e) => {
  const btn = e.target.closest("[data-act]");
  if (!btn || !data) return;
  const act = btn.dataset.act;

  if (act === "save") {
    try {
      const blob = new Blob([buildVCard(data)], { type: "text/vcard;charset=utf-8" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      const safe = (data.businessName || "contact").replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-") || "contact";
      a.download = safe + ".vcf";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      toast("Contact saved — open the file to add it");
    } catch (_) {
      toast("Couldn't create the contact file");
    }
  }

  if (act === "share") {
    const url = cardURL();
    const shareData = { title: data.businessName, text: data.tagline || data.businessName, url };
    try {
      if (navigator.share) {
        await navigator.share(shareData);
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(url);
        toast("Card link copied");
      } else {
        throw new Error("no-share");
      }
    } catch (err) {
      if (err && err.name === "AbortError") return; // user dismissed
      try {
        const ta = document.createElement("textarea");
        ta.value = url;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        ta.remove();
        toast("Card link copied");
      } catch (_) {
        toast("Copy this link: " + url);
      }
    }
  }

  if (act === "copy") {
    const url = cardURL();
    try {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(url);
      } else {
        const ta = document.createElement("textarea");
        ta.value = url;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        ta.remove();
      }
      toast("Card link copied");
    } catch (_) {
      toast("Copy this link: " + url);
    }
  }
});
