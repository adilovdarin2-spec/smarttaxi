import assert from 'node:assert/strict';
import { env } from '../config/env.js';
import { pool } from '../db/pool.js';
import { searchAddresses } from '../modules/routing/routing.service.js';

// Real PostgreSQL query, local development only, no geocoder requests. The
// collision fixtures use a connection-local temporary table; persistent
// addresses and accounts are never changed.
assert.equal(env.NODE_ENV, 'development');
assert(['localhost', '127.0.0.1', '[::1]', 'postgres'].includes(new URL(env.DATABASE_URL).hostname));
const client = await pool.connect();
const noRemote = async () => ({ ok: false, json: async () => ({}) });
const execute = (sql, params) => client.query(sql, params);
let checked = 0;
try {
  const { rows } = await client.query(`
    SELECT DISTINCT ON (r.id) r.name AS region, a.*
    FROM regions r JOIN addresses a ON a.region_id = r.id
    WHERE r.is_active AND a.kind IN ('housenumber','poi')
    ORDER BY r.id, CASE a.kind WHEN 'housenumber' THEN 0 ELSE 1 END, md5(a.id::text)
  `);
  assert.equal(rows.length, 13);
  for (const row of rows) {
    const words = row.label.match(/[\p{L}\p{N}]+/gu);
    for (const q of [row.label, words.join(' '), [...words].reverse().join(' ')]) {
      const hits = await searchAddresses({ q, region: row.region, limit: 12 }, noRemote, execute);
      assert(hits.some(hit => hit.label === row.label && hit.source === 'gazetteer'),
        `${row.region}: catalogue lost ${JSON.stringify(q)}`);
      checked++;
    }
    console.log(`Address search passed: ${row.region}`);
  }
  await client.query('BEGIN');
  await client.query('CREATE TEMP TABLE addresses ON COMMIT DROP AS SELECT * FROM public.addresses WITH NO DATA');
  const regionId = rows.find(row => row.region === 'Атакент').region_id;
  for (const number of ['29', '129', '290', '29 А']) {
    const label = `Амангелды улица, ${number}`;
    await client.query(`INSERT INTO addresses(region_id,label,search_text,kind,lat,lng)
      VALUES($1,$2,$2,'housenumber',40.844363,68.509146)`, [regionId, label]);
  }
  for (const q of ['Амангелды 29', '29 Амангелды', 'ул. Амангелды, д. 29']) {
    const hits = await searchAddresses({ q, region: 'Атакент', limit: 8 }, noRemote, execute);
    assert(hits.some(hit => hit.label === 'Амангелды улица, 29'));
    assert(!hits.some(hit => /129|290/.test(hit.label)), 'House number substring leaked');
    checked++;
  }
  console.log(`Regional address search passed: ${checked} queries, 13 regions, providers unavailable`);
} finally {
  await client.query('ROLLBACK');
  client.release();
  await pool.end();
}
