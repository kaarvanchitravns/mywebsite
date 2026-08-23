/* ==========================================================================
   KAARVAN — EDITABLE PRICING & PROMO CODES
   --------------------------------------------------------------------------
   Edit the numbers and text below to change what customers see on the
   "Order Now" page (product prices, units, descriptions, promo codes).

   Save this file and re-upload it to your hosting next to index.html.
   You do NOT need to open or touch index.html to change prices.

   RULES WHEN EDITING:
   - Keep the quotes "" around any text.
   - Only change the number after "price:" — whole rupees, no commas or ₹
     symbol (write 2999, not "₹2,999").
   - Don't remove commas between entries, or the curly braces { } / brackets [ ].
   - "unit" is the small label shown next to the price (e.g. "per vehicle").
   - "icon" must stay one of: fastag, gps, dashcam, platform (these map to
     the icon artwork already built into the page — new icon names won't
     show anything).
   - If you break the formatting by accident, the site will silently fall
     back to its last-known-good built-in prices rather than showing an
     error to customers — so changes here are safe to experiment with.
   ========================================================================== */

window.KAARVAN_PRICING = {

  // ---- PRODUCTS -----------------------------------------------------------
  products: [
    {
      id: "fastag",
      name: "KAARVAN FASTag",
      price: 150,
      unit: "per tag",
      note: "One-time issuance, linked to your bank or prepaid wallet for toll payments.",
      icon: "fastag"
    },
    {
      id: "gps_ais140",
      name: "GPS Tracker — AIS-140",
      price: 4499,
      unit: "per vehicle",
      note: "Government-certified AIS-140 tracker for mandated commercial/public vehicles, with panic button and command-centre integration.",
      icon: "gps"
    },
    {
      id: "gps_tracking",
      name: "GPS Tracker — Tracking Device",
      price: 2999,
      unit: "per vehicle",
      note: "Standard GPS tracker for private fleet visibility, live location and route history.",
      icon: "gps"
    },
    {
      id: "dashcam",
      name: "AI Dashcam",
      price: 7499,
      unit: "per vehicle",
      note: "Dual-channel dashcam with driver-behaviour alerts.",
      icon: "dashcam"
    },
    {
      id: "platform",
      name: "Fleet Intelligence Platform",
      price: 499,
      unit: "per vehicle / month",
      note: "Dashboard, alerts, reports and API access, billed per vehicle.",
      icon: "platform"
    }
  ],

  // ---- PROMO CODES ---------------------------------------------------------
  // The code itself (e.g. "KAARVAN10") is what the customer types in — keep
  // it in CAPITAL LETTERS.
  //   type   : "percent" (value is a % off) or "flat" (value is a flat ₹ off)
  //   value  : the number that goes with "type" above
  //   label  : short text shown to the customer once the code is applied
  //   minQty : optional — minimum quantity required to use this code.
  //            Delete the whole "minQty: N," line to remove the minimum.
  promoCodes: {
    "KAARVAN10": { type: "percent", value: 10, label: "10% off" },
    "FLEET500":  { type: "flat", value: 500, label: "₹500 off on 5+ units", minQty: 5 }
  }

};
