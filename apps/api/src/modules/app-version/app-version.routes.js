import { Router } from "express";
import { env } from "../../config/env.js";

const router = Router();

function parseVersion(value) {
  return String(value || "0")
    .trim()
    .split(".")
    .map(part => Number.parseInt(part, 10) || 0);
}

// True if `a` is strictly older than `b` (dotted-integer compare, e.g.
// "1.2.10" > "1.2.9" — not a plain string compare, which would get that
// case backwards).
export function isOlderVersion(a, b) {
  const left = parseVersion(a);
  const right = parseVersion(b);
  const length = Math.max(left.length, right.length);
  for (let i = 0; i < length; i += 1) {
    const l = left[i] || 0;
    const r = right[i] || 0;
    if (l !== r) return l < r;
  }
  return false;
}

router.get("/", (req, res) => {
  const clientVersion = String(req.query.version || "").trim();
  const latest = env.APP_LATEST_VERSION;
  const minSupported = env.APP_MIN_SUPPORTED_VERSION;
  res.json({
    latestVersion: latest,
    minSupportedVersion: minSupported,
    updateUrl: env.APP_UPDATE_URL || null,
    updateNotes: env.APP_UPDATE_NOTES || null,
    updateRequired: clientVersion ? isOlderVersion(clientVersion, minSupported) : false,
    updateAvailable: clientVersion ? isOlderVersion(clientVersion, latest) : false
  });
});

export default router;
