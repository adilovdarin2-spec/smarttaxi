import { Router } from "express";
import { query } from "../../db/pool.js";
import { listActiveRegions, publicRegion } from "./regions.service.js";

const router = Router();

async function listActive(_req, res, next) {
  try {
    const regions = await listActiveRegions();
    res.json({ regions: regions.map(publicRegion) });
  } catch (error) {
    next(error);
  }
}

router.get("/", listActive);
router.get("/active", listActive);

// Public, safety-relevant config (SOS/support phone) — no sensitive data, so
// no auth requirement. The mobile SOS button dials this instead of a
// hardcoded "112" so it always matches whatever number an operator sets in
// the admin panel.
router.get("/service-settings", async (_req, res, next) => {
  try {
    const settings = (await query(
      "SELECT sos_phone, support_phone, currency, currency_symbol, city FROM service_settings WHERE id=1"
    )).rows[0];
    res.json({
      sosPhone: settings?.sos_phone || null,
      supportPhone: settings?.support_phone || null,
      currency: settings?.currency || "KZT",
      currencySymbol: settings?.currency_symbol || "₸",
      city: settings?.city || null
    });
  } catch (error) {
    next(error);
  }
});

export default router;
