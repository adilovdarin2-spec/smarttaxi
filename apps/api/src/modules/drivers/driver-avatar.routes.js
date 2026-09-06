import { Router } from "express";
import { requireAuth, requireRole } from "../../common/auth.js";
import { AppError } from "../../common/errors.js";
import { query } from "../../db/pool.js";
import { uploadDriverAvatar } from "./driver-avatar.middleware.js";

const router = Router();

async function resolveOwnDriverId(userId) {
  const driver = (await query("SELECT id FROM drivers WHERE user_id=$1", [userId])).rows[0];
  if (!driver) throw new AppError("Driver profile not found", 404, "DRIVER_NOT_FOUND");
  return driver.id;
}

// Camera-only on the client — this route doesn't distinguish how the file
// was captured, that's enforced by the mobile app never offering a gallery
// picker for this flow (see driver_profile_widgets.dart), the same way the
// backend can't tell a photo ID from a random image either way.
router.post("/", requireAuth, requireRole("DRIVER"), uploadDriverAvatar, async (req, res, next) => {
  try {
    if (!req.file) throw new AppError("No file uploaded", 400, "FILE_REQUIRED");
    const driverId = await resolveOwnDriverId(req.user.id);
    await query(`
      INSERT INTO driver_avatars (driver_id, data, mime, updated_at)
      VALUES ($1, $2, $3, NOW())
      ON CONFLICT (driver_id) DO UPDATE SET data=$2, mime=$3, updated_at=NOW()
    `, [driverId, req.file.buffer, req.file.mimetype]);
    res.json({ avatarUrl: `/api/drivers/${driverId}/avatar?v=${Date.now()}` });
  } catch (e) { next(e); }
});

router.delete("/", requireAuth, requireRole("DRIVER"), async (req, res, next) => {
  try {
    const driverId = await resolveOwnDriverId(req.user.id);
    await query("DELETE FROM driver_avatars WHERE driver_id=$1", [driverId]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

export default router;
