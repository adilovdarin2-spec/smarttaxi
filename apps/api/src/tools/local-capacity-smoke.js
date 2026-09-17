import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { pool } from '../db/pool.js';

// Read-only capacity smoke for the owned local development stack. Distinct,
// signed identities model independent users without creating accounts and keep
// the distributed per-user limiter in the request path. They are accepted only
// as rate-limit identities: both exercised endpoints are public and never trust
// the token as an application account.
assert.equal(env.NODE_ENV, 'development');
const base = new URL(process.env.CAPACITY_BASE_URL || 'http://127.0.0.1:4000');
assert(['localhost', '127.0.0.1', '[::1]', 'api'].includes(base.hostname));
const total = boundedInt('CAPACITY_REQUESTS', 5000, 100, 20_000);
const concurrency = boundedInt('CAPACITY_CONCURRENCY', 100, 1, 500);
const timeoutMs = boundedInt('CAPACITY_TIMEOUT_MS', 10_000, 1000, 60_000);

function boundedInt(name, fallback, min, max) {
  const value = Number(process.env[name] || fallback);
  assert(Number.isInteger(value) && value >= min && value <= max, `${name} must be ${min}..${max}`);
  return value;
}

function percentile(sorted, fraction) {
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)];
}

const samples = (await pool.query(`
  SELECT DISTINCT ON (r.id) r.name AS region, a.label
  FROM regions r JOIN addresses a ON a.region_id=r.id
  WHERE r.is_active AND a.kind='housenumber'
  ORDER BY r.id, md5(a.id::text)
`)).rows;
assert(samples.length > 0, 'Capacity smoke requires real local house catalogue samples');
await pool.end();

const tokens = Array.from({ length: total }, (_, index) => jwt.sign(
  { id: `capacity-virtual-user-${index}`, role: 'CLIENT', baseRole: 'CLIENT' },
  env.JWT_SECRET,
  { expiresIn: '10m' }
));
const timings = [];
const statuses = new Map();
let failures = 0;
let firstFailure = null;
let cursor = 0;
const started = performance.now();

async function worker() {
  while (true) {
    const index = cursor++;
    if (index >= total) return;
    const sample = samples[index % samples.length];
    const path = index % 2 === 0
      ? `/api/routes/addresses/search?q=${encodeURIComponent(sample.label)}&region=${encodeURIComponent(sample.region)}&limit=5`
      : '/api/regions/active';
    const requestStarted = performance.now();
    let status = 0;
    try {
      const response = await fetch(new URL(path, base), {
        headers: { Authorization: `Bearer ${tokens[index]}` },
        signal: AbortSignal.timeout(timeoutMs),
      });
      status = response.status;
      const body = await response.json();
      if (path.includes('/addresses/search')) {
        assert(Array.isArray(body.addresses) && body.addresses.some(row => row.label === sample.label),
          `${sample.region}: exact catalogue result missing under load`);
      } else {
        assert.equal(body.regions?.length, 13, 'Active region snapshot changed under load');
      }
    } catch (error) {
      if (!status) status = error?.name === 'TimeoutError' ? -1 : -2;
      failures++;
      firstFailure ??= error?.message || String(error);
    }
    timings.push(performance.now() - requestStarted);
    statuses.set(status, (statuses.get(status) || 0) + 1);
  }
}

await Promise.all(Array.from({ length: Math.min(concurrency, total) }, worker));
timings.sort((a, b) => a - b);
const elapsedMs = performance.now() - started;
const report = {
  scope: 'local read-only API/PostgreSQL baseline; not a production or routing-provider certification',
  requests: total,
  virtualUsers: total,
  concurrency,
  elapsedMs: Math.round(elapsedMs),
  requestsPerSecond: Number((total / (elapsedMs / 1000)).toFixed(1)),
  latencyMs: {
    p50: Math.round(percentile(timings, 0.50)),
    p95: Math.round(percentile(timings, 0.95)),
    p99: Math.round(percentile(timings, 0.99)),
    max: Math.round(timings.at(-1)),
  },
  statuses: Object.fromEntries([...statuses.entries()].sort(([a], [b]) => a - b)),
  validationFailures: failures,
  ...(firstFailure ? { firstFailure } : {}),
};
console.log(JSON.stringify(report, null, 2));
assert.equal(failures, 0, 'Capacity smoke returned invalid data or transport failures');
assert.deepEqual(report.statuses, { 200: total }, 'Capacity smoke had timeout, transport, rate-limit or HTTP failures');
