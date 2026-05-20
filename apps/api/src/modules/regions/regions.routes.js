import { Router } from "express";
import { listActiveRegions, publicRegion } from "./regions.service.js";

const router = Router();

router.get("/active", async (_req, res, next) => {
  try {
    const regions = await listActiveRegions();
    res.json({ regions: regions.map(publicRegion) });
  } catch (error) {
    next(error);
  }
});

export default router;

