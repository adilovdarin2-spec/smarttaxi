import { Router } from "express";
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

export default router;
