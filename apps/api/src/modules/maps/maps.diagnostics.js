import { env } from "../../config/env.js";
import { redis } from "../../db/redis.js";

const TEST_ROUTE = {
  from: { lat: 40.844435, lng: 68.509021 },
  to: { lat: 40.666108, lng: 68.54309 }
};

function configured(value) {
  const text = String(value || "").trim();
  if (!text) return false;
  return !/PASTE_|YOUR_|CHANGE_ME|\$\{MAPTILER_API_KEY\}/i.test(text);
}

function redactedUrl(value) {
  if (!value) return "";
  try {
    const url = new URL(value);
    if (url.searchParams.has("key")) url.searchParams.set("key", "configured");
    return url.toString();
  } catch {
    return String(value).replace(/key=[^&]+/i, "key=configured");
  }
}

async function fetchWithTimeout(url, timeoutMs = 1800) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

// Проба маршрутизатора — это настоящий запрос наружу, а не чтение памяти.
//
// На проде ROUTING_BASE_URL смотрит на общий демо-сервер OSRM, у которого
// есть предел вежливости. Диагностику дёргают без входа и без ограничений,
// health опрашивает платформа, — и каждый такой вызов уходил во внешний
// сервис. Заблокируют по IP — останутся без цены и без времени подачи все
// пассажиры сразу, потому что расчёт поездки идёт через тот же OSRM.
//
// Держим один ответ на всех в течение окна: сто одновременных проверок
// здоровья стоят одного запроса наружу, а не ста.
const PROBE_TTL_MS = 30_000;
let probeCache = { at: 0, value: null };
let probeInFlight = null;

export async function checkOsrm() {
  const now = Date.now();
  if (probeCache.value && now - probeCache.at < PROBE_TTL_MS) return probeCache.value;
  // Пока один запрос летит, остальные ждут его, а не шлют свои.
  if (probeInFlight) return probeInFlight;
  probeInFlight = probeOsrm()
    .then((value) => {
      probeCache = { at: Date.now(), value };
      return value;
    })
    .finally(() => {
      probeInFlight = null;
    });
  return probeInFlight;
}

// Только для тестов: следующая проверка должна снова сходить наружу.
export function resetOsrmProbeCache() {
  probeCache = { at: 0, value: null };
  probeInFlight = null;
}

async function probeOsrm() {
  const base = String(env.ROUTING_BASE_URL || env.OSRM_BASE_URL || "").replace(/\/$/, "");
  if (!base) {
    return {
      status: "disabled",
      reachable: false,
      baseUrl: "",
      testRoute: "not_configured"
    };
  }

  const url = `${base}/route/v1/driving/${TEST_ROUTE.from.lng},${TEST_ROUTE.from.lat};${TEST_ROUTE.to.lng},${TEST_ROUTE.to.lat}?overview=false`;
  try {
    const response = await fetchWithTimeout(url);
    const payload = await response.json().catch(() => ({}));
    const ok = response.ok && (payload.code === "Ok" || Array.isArray(payload.routes));
    return {
      status: ok ? "ok" : "fail",
      reachable: ok,
      baseUrl: base,
      testRoute: ok ? "ok" : `http_${response.status}`,
      providerCode: payload.code || null
    };
  } catch (error) {
    return {
      status: "fail",
      reachable: false,
      baseUrl: base,
      testRoute: error?.name === "AbortError" ? "timeout" : "network_error"
    };
  }
}

export async function buildMapsDiagnostics() {
  const osrm = await checkOsrm();
  const maptilerKeyConfigured = configured(env.MAPTILER_API_KEY);
  const styleUrlConfigured = configured(env.MAPTILER_STYLE_URL) && (!String(env.MAPTILER_STYLE_URL).includes("key=") || maptilerKeyConfigured);
  const geocodingUrlConfigured = configured(env.MAPTILER_GEOCODING_URL);

  return {
    ok: osrm.status !== "fail" || env.NODE_ENV !== "production",
    time: new Date().toISOString(),
    providers: {
      search: env.MAP_SEARCH_PROVIDER,
      reverse: env.MAP_REVERSE_PROVIDER,
      route: env.ROUTING_BASE_URL || env.OSRM_BASE_URL ? "osrm" : "disabled"
    },
    maptiler: {
      key: maptilerKeyConfigured ? "configured" : "not_configured",
      styleUrl: styleUrlConfigured ? "configured" : "not_configured",
      geocodingUrl: geocodingUrlConfigured ? "configured" : "not_configured",
      publicStyleUrl: redactedUrl(env.MAPTILER_STYLE_URL)
    },
    osmTiles: {
      url: env.OSM_TILE_URL,
      attribution: env.MAP_ATTRIBUTION_TEXT
    },
    osrm,
    cache: {
      redis: redis.isOpen ? "ok" : "memory_fallback"
    }
  };
}
