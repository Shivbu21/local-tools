# RingQ — provider hookup guide

RingQ's honest architecture: a missed call can't trigger a browser on its own.
The simulator + one-tap `wa.me` send in `index.html` works today with zero providers.
Real **automatic** replies need two outside pieces:

1. **A telephony provider** (Exotel, Knowlarity, or similar) that detects the
   missed call on your virtual number.
2. **WhatsApp Business API** (via Meta) to send the reply message.

## Webhook contract

Point the provider's missed-call webhook at your server:

```
POST https://your-server.example/missed-call
Content-Type: application/x-www-form-urlencoded
```

| Field       | Meaning                              |
|-------------|--------------------------------------|
| `From`      | Caller's phone number                |
| `To`        | Your missed-call number              |
| `timestamp` | When the call came in (ISO string)   |

Your handler must respond `200 OK` quickly (providers retry on timeout).

## Sample server (Node + Express, ~30 lines)

```js
const express = require("express");
const app = express();
app.use(express.urlencoded({ extended: true }));

const TEMPLATE = "Hi {name}! Thanks for calling {business}. Here is our price list: {menu_link}";

function render(tpl, v) {
  return tpl.replaceAll("{name}", v.name || "there")
            .replaceAll("{business}", v.business)
            .replaceAll("{menu_link}", v.menu_link);
}

// Exotel / Knowlarity POST { From, To, timestamp } here on every missed call.
app.post("/missed-call", async (req, res) => {
  const { From, To, timestamp } = req.body;
  const message = render(TEMPLATE, {
    name: "", // caller name unknown on a missed call
    business: process.env.BUSINESS_NAME,
    menu_link: process.env.MENU_LINK,
  });
  // Send via WhatsApp Business Cloud API:
  await fetch(`https://graph.facebook.com/v21.0/${process.env.WA_PHONE_ID}/messages`, {
    method: "POST",
    headers: { Authorization: "Bearer " + process.env.WA_TOKEN,
               "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp",
      to: From.replace(/\D/g, ""),
      type: "text", text: { body: message } }),
  });
  // Also log the event wherever you keep RingQ events.
  console.log("missed call", { From, To, timestamp, sent: true });
  res.sendStatus(200);
});

app.listen(3000, () => console.log("RingQ webhook on :3000"));
```

## Setup checklist

1. Get a virtual number from Exotel / Knowlarity; set its missed-call webhook
   to `https://your-server.example/missed-call`.
2. Deploy the handler above (any VPS, Render, Railway, Fly.io).
3. Connect WhatsApp Business API for your reply number; set `WA_PHONE_ID`,
   `WA_TOKEN`, `BUSINESS_NAME`, `MENU_LINK` as environment variables.
4. Keep the `TEMPLATE` constant identical to the template in the RingQ dashboard.
5. Give your number a missed call — the WhatsApp reply goes out automatically,
   and the event lands in the dashboard log.

## Notes

- WhatsApp template messages: Meta requires pre-approved message templates for
  business-initiated conversations. Register your reply text as a template in
  the WhatsApp Manager before going live.
- Missed-call detection: most providers fire the webhook only when the caller
  hangs up before pickup (true missed call), not on answered calls.
- The `{name}` placeholder renders as "there" for real missed calls, because
  the provider only gives you the phone number.
