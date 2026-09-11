// Live speed-camera and speed-limit lookups sourced from OpenStreetMap's
// free public Overpass API. There is no public API for Kazakhstan's actual
// camera network ("Sergek") — it's a closed government/operator system with
// no documented developer access — so this is the closest real, legal,
// zero-cost data source: community-tagged `highway=speed_camera` nodes and
// `maxspeed` way tags. Coverage depends entirely on what OSM contributors
// have mapped; it's genuinely populated in big cities (Shymkent, Almaty,
// Tashkent) and sparse-to-empty in small towns, which is an honest
// reflection of OSM data, not a bug here.
// A single hardcoded endpoint means one mirror having a bad day takes the
// entire camera/sign/speed-limit layer dark for every driver at once — these
// are the Overpass project's own published public mirrors, tried in order
// so one instance being overloaded or rate-limiting us doesn't sink the
// whole feature.
const OVERPASS_URLS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.openstreetmap.ru/api/interpreter"
];
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes — Overpass's public
// instance is shared infrastructure; polling it every driver-app refresh
// would be both slow and a bad citizen. A coarse grid cache keeps repeat
// lookups from the same neighbourhood free.
const GRID_DEGREES = 0.02; // ~2.2km per cell at these latitudes

const cache = new Map();

function cacheKey(kind, lat, lng) {
  const gLat = Math.round(lat / GRID_DEGREES) * GRID_DEGREES;
  const gLng = Math.round(lng / GRID_DEGREES) * GRID_DEGREES;
  return `${kind}:${gLat.toFixed(3)}:${gLng.toFixed(3)}`;
}

function getCached(key) {
  const hit = cache.get(key);
  if (!hit) return undefined;
  if (Date.now() - hit.at > CACHE_TTL_MS) {
    cache.delete(key);
    return undefined;
  }
  return hit.value;
}

function setCached(key, value) {
  cache.set(key, { value, at: Date.now() });
  // Bound the cache instead of letting it grow forever across regions/days.
  if (cache.size > 500) {
    const oldestKey = cache.keys().next().value;
    cache.delete(oldestKey);
  }
}

// OSM's `direction`/`camera:direction` tags are either a plain compass
// bearing in degrees or one of the 16 compass-point abbreviations — map
// covers both so the app can draw an arrow showing which way the camera
// actually looks, not just where it sits.
const COMPASS_POINTS = {
  N: 0, NNE: 22.5, NE: 45, ENE: 67.5,
  E: 90, ESE: 112.5, SE: 135, SSE: 157.5,
  S: 180, SSW: 202.5, SW: 225, WSW: 247.5,
  W: 270, WNW: 292.5, NW: 315, NNW: 337.5
};

function parseHeading(tags) {
  const raw = tags?.direction ?? tags?.["camera:direction"];
  if (raw == null) return null;
  const numeric = Number(raw);
  if (Number.isFinite(numeric)) return ((numeric % 360) + 360) % 360;
  const point = COMPASS_POINTS[String(raw).trim().toUpperCase()];
  return point == null ? null : point;
}

// OSM tags roadside signs with their Vienna-Convention reference code, e.g.
// `traffic_sign=RU:3.24[40]` (speed limit 40) or `traffic_sign=RU:2.4` (give
// way). Kazakhstan/Uzbekistan traffic codes use the same sign designs as the
// "RU:" catalogue, so contributors tag them under that prefix too — this
// dictionary only covers the common, high-value-to-a-driver signs, not the
// full catalogue; anything else falls back to a generic "Дорожный знак"
// label instead of pretending to know what it is.
const SIGN_LABELS = {
  "1.23": "Дети",
  "1.25": "Дорожные работы",
  "1.33": "Опасность",
  "2.1": "Главная дорога",
  "2.4": "Уступите дорогу",
  "2.5": "Движение без остановки запрещено",
  "3.1": "Въезд запрещён",
  "3.20": "Обгон запрещён",
  "3.24": "Ограничение скорости",
  "3.27": "Остановка запрещена",
  "3.28": "Стоянка запрещена",
  "5.19.1": "Пешеходный переход",
  "5.19.2": "Пешеходный переход",
  "1.22": "Пешеходный переход впереди",
  "1.21": "Дорога с двусторонним движением",
  "5.15.5": "Полоса разгона/торможения"
};

function parseTrafficSign(tags) {
  const raw = tags?.traffic_sign;
  if (!raw) return null;
  // A handful of OSM contributors tag `traffic_sign=no` as an explicit
  // "checked, there is no sign here" assertion rather than a real sign —
  // treating it as one would make the navigator call out a phantom.
  if (String(raw).trim().toLowerCase() === "no") return null;
  // Multiple signs can be listed on one post separated by commas — take the
  // first, which OSM convention lists as the most prominent.
  const first = String(raw).split(",")[0].trim();
  const match = first.match(/^(?:[A-Z]{2}:)?([0-9.]+)(?:\[(-?\d+(?:\.\d+)?)\])?/i);
  if (!match) return { code: first, label: "Дорожный знак", value: null };
  const code = match[1];
  const value = match[2] != null ? Number(match[2]) : null;
  return { code, label: SIGN_LABELS[code] || "Дорожный знак", value };
}

function haversineMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// Every driver's request is proxied through this one backend, so as far as
// Overpass's public instance is concerned there is exactly one client — a
// fleet with hundreds of drivers polling at once must not turn into
// hundreds of concurrent Overpass connections from this server's IP, or the
// whole fleet gets rate-limited (or banned) together. Cap concurrency and
// queue the rest; the cache above already keeps repeat neighbourhood
// lookups from reaching Overpass at all.
const MAX_CONCURRENT_OVERPASS_REQUESTS = 2;
let activeOverpassRequests = 0;
const overpassWaitQueue = [];

async function acquireOverpassSlot() {
  if (activeOverpassRequests < MAX_CONCURRENT_OVERPASS_REQUESTS) {
    activeOverpassRequests += 1;
    return;
  }
  await new Promise((resolve) => overpassWaitQueue.push(resolve));
  activeOverpassRequests += 1;
}

function releaseOverpassSlot() {
  activeOverpassRequests -= 1;
  const next = overpassWaitQueue.shift();
  if (next) next();
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// One full pass tries every mirror in OVERPASS_URLS once each. Confirmed live
// (2026-07-21): a fresh query against a coordinate with real, verified OSM
// camera data came back empty on the first attempt, then succeeded moments
// later against the exact same point with no code change in between — a
// transient blip (mirror overloaded/rate-limiting) on public shared
// infrastructure, not a real "no data here". A single failed pass used to be
// the end of it (empty result handed straight to the driver); one retried
// pass after a short pause gives a genuine transient failure a real second
// chance without turning a live navigation query into a many-second stall.
const OVERPASS_PASS_ATTEMPTS = 2;
const OVERPASS_RETRY_DELAY_MS = 1200;

// When Overpass is not merely busy but unreachable, every lookup burns six
// doomed fetches and writes another line to the log. Observed on Railway
// 2026-08-05: all three mirrors returning `fetch failed` — a connect/DNS
// failure, not an HTTP status — on a ~45s loop for as long as a driver had
// the navigator open. Thousands of identical log lines, and six pointless
// connection attempts on every single request.
//
// After enough consecutive total failures, stop trying for a while and hand
// back an empty result immediately. The window is deliberately short: the
// far more common case is one mirror having a bad ten minutes, and cameras
// should come back on their own without needing a redeploy.
const OVERPASS_BREAKER_THRESHOLD = 3;
const OVERPASS_BREAKER_COOLDOWN_MS = 5 * 60 * 1000;
let overpassConsecutiveFailures = 0;
let overpassBreakerOpenUntil = 0;

async function overpassQuery(ql) {
  if (Date.now() < overpassBreakerOpenUntil) return [];
  await acquireOverpassSlot();
  try {
    let lastError = null;
    for (let attempt = 1; attempt <= OVERPASS_PASS_ATTEMPTS; attempt++) {
      for (const url of OVERPASS_URLS) {
        const controller = new AbortController();
        // Each query string below asks Overpass for `[timeout:10]` (its own
        // 10s processing budget) — the client abort must sit above that or
        // we'd cut the connection before the server's own deadline had a
        // chance to fire, discarding an answer that was about to arrive.
        const timeout = setTimeout(() => controller.abort(), 11000);
        try {
          const response = await fetch(url, {
            method: "POST",
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
              "Accept": "*/*",
              "User-Agent": "SmartTaxi-Driver-App/1.0 (+https://smarttaxi.kz)"
            },
            body: `data=${encodeURIComponent(ql)}`,
            signal: controller.signal
          });
          if (!response.ok) throw new Error(`Overpass HTTP ${response.status}`);
          const data = await response.json();
          overpassConsecutiveFailures = 0;
          return Array.isArray(data.elements) ? data.elements : [];
        } catch (error) {
          lastError = error;
          // Try the next mirror instead of failing the whole lookup.
        } finally {
          clearTimeout(timeout);
        }
      }
      if (attempt < OVERPASS_PASS_ATTEMPTS) await delay(OVERPASS_RETRY_DELAY_MS);
    }
    overpassConsecutiveFailures += 1;
    if (overpassConsecutiveFailures >= OVERPASS_BREAKER_THRESHOLD) {
      overpassBreakerOpenUntil = Date.now() + OVERPASS_BREAKER_COOLDOWN_MS;
      overpassConsecutiveFailures = 0;
      console.warn(
        `[osm-navigation] every mirror unreachable ${OVERPASS_BREAKER_THRESHOLD}x in a row; ` +
        `pausing lookups for ${OVERPASS_BREAKER_COOLDOWN_MS / 60000} min`
      );
    }
    throw lastError ?? new Error("All Overpass mirrors failed");
  } finally {
    releaseOverpassSlot();
  }
}

/**
 * Speed cameras within radiusM of (lat, lng), shaped like the road_alerts
 * API's publicAlert() output so the mobile app can merge them into the same
 * list it already renders — these are synthetic, read-only entries (id
 * prefixed "osm-") and are never written to the road_alerts table.
 */
export async function nearbyOsmCameras(lat, lng, radiusM = 3000) {
  const boundedRadius = Math.min(radiusM, 8000);
  // Radius is part of the cache key — a coarse cell cached for a 1500m
  // lookup must never be handed back to a caller asking for 8000m, which
  // would silently drop cameras that exist outside the smaller radius.
  const key = cacheKey(`cam:${boundedRadius}`, lat, lng);
  const cached = getCached(key);
  if (cached) return cached;

  let elements = [];
  try {
    elements = await overpassQuery(
      `[out:json][timeout:10];node["highway"="speed_camera"](around:${boundedRadius},${lat},${lng});out body;`
    );
  } catch (error) {
    console.warn("[osm-navigation] camera query failed:", error.message);
    return [];
  }

  const cameras = elements
    .filter((el) => typeof el.lat === "number" && typeof el.lon === "number")
    .map((el) => ({
      id: `osm-${el.id}`,
      regionId: null,
      driverId: null,
      type: "SPEED_CAMERA",
      comment: "Камера (OpenStreetMap)",
      lat: el.lat,
      lng: el.lon,
      status: "ACTIVE",
      confirmationsCount: 0,
      dismissalsCount: 0,
      confidenceScore: 100,
      speedLimit: el.tags?.maxspeed ? parseInt(el.tags.maxspeed, 10) || null : null,
      heading: parseHeading(el.tags),
      createdAt: null,
      expiresAt: null,
      source: "OSM"
    }));

  setCached(key, cameras);
  return cameras;
}

/**
 * Posted speed limit for the road nearest to (lat, lng), read from OSM's
 * `maxspeed` way tag. Returns null when no tagged road is close enough or
 * none carries a maxspeed — common outside cities.
 */
export async function nearestSpeedLimit(lat, lng) {
  const key = cacheKey("limit", lat, lng);
  const cached = getCached(key);
  if (cached !== undefined) return cached;

  let elements = [];
  try {
    elements = await overpassQuery(
      `[out:json][timeout:10];way(around:80,${lat},${lng})["highway"]["maxspeed"];out tags center;`
    );
  } catch (error) {
    console.warn("[osm-navigation] speed-limit query failed:", error.message);
    return null;
  }

  let nearest = null;
  let nearestDistance = Infinity;
  for (const way of elements) {
    const raw = way.tags?.maxspeed;
    const parsed = raw ? parseInt(raw, 10) : NaN;
    if (!Number.isFinite(parsed) || parsed <= 0) continue;
    const center = way.center;
    const distance = center
      ? haversineMeters(lat, lng, center.lat, center.lon)
      : 0;
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearest = parsed;
    }
  }

  setCached(key, nearest);
  return nearest;
}

/**
 * Mapped roadside signs (`traffic_sign=*`) within radiusM of (lat, lng) —
 * used so the navigator can call out what a driver is passing ("Впереди:
 * Уступите дорогу"), same free/legal OSM source as cameras. Coverage is
 * exactly as sparse as camera coverage and for the same reason: it's whatever
 * the OSM community has mapped, not an official sign registry.
 */
export async function nearbyOsmTrafficSigns(lat, lng, radiusM = 1500) {
  const boundedRadius = Math.min(radiusM, 4000);
  const key = cacheKey(`sign:${boundedRadius}`, lat, lng);
  const cached = getCached(key);
  if (cached) return cached;

  let elements = [];
  try {
    elements = await overpassQuery(
      `[out:json][timeout:10];node["traffic_sign"](around:${boundedRadius},${lat},${lng});out body;`
    );
  } catch (error) {
    console.warn("[osm-navigation] traffic-sign query failed:", error.message);
    return [];
  }

  const signs = elements
    .filter((el) => typeof el.lat === "number" && typeof el.lon === "number")
    .map((el) => {
      const parsed = parseTrafficSign(el.tags);
      if (!parsed) return null;
      return {
        id: `osm-sign-${el.id}`,
        lat: el.lat,
        lng: el.lon,
        code: parsed.code,
        label: parsed.label,
        speedLimit: parsed.value ?? (el.tags?.maxspeed ? parseInt(el.tags.maxspeed, 10) || null : null),
        heading: parseHeading(el.tags)
      };
    })
    .filter(Boolean);

  setCached(key, signs);
  return signs;
}
