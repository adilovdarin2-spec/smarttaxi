import assert from 'node:assert/strict';
import test from 'node:test';
import { sessionGuard } from '../src/lib/sessionGuard.js';
import { readFileSync } from 'node:fs';

test('only a mounted operation with its original non-empty token remains current', () => {
  let token = 'session-a';
  let alive = true;
  const current = sessionGuard(token, () => token, () => alive);
  assert(current());
  alive = false;
  assert(!current());
  alive = true;
  token = '';
  assert(!current());
  token = 'session-b';
  assert(!current());
  for (const anonymous of ['', null, undefined]) assert(!sessionGuard(anonymous, () => anonymous)());
});

test('a late superseded response cannot clear the replacement session', async () => {
  let token = 'old-login';
  const current = sessionGuard(token, () => token);
  token = 'new-login';
  let expireEvents = 0;
  await Promise.resolve();
  if (current()) { token = ''; expireEvents++; }
  assert.equal(token, 'new-login');
  assert.equal(expireEvents, 0);
});

test('supersession of the actual current session still expires it once', () => {
  let token = 'current-login';
  const first = sessionGuard(token, () => token);
  const second = sessionGuard(token, () => token);
  let expireEvents = 0;
  for (const current of [first, second]) {
    if (current()) { token = ''; expireEvents++; }
  }
  assert.equal(token, '');
  assert.equal(expireEvents, 1);
});

test('old success, error and finally callbacks cannot change the next driver screen', async () => {
  let token = 'old-login';
  const current = sessionGuard(token, () => token);
  const state = { driver: 'new-driver', error: '', loading: 'new-action' };
  token = 'new-login';
  await Promise.resolve();
  if (current()) state.driver = 'old-driver';
  if (current()) state.error = 'old-request-error';
  if (current()) state.loading = '';
  assert.deepEqual(state, { driver: 'new-driver', error: '', loading: 'new-action' });
});

test("a token that simply expired ends the session like any other dead token", () => {
  // Tokens last seven days. Handling only SESSION_SUPERSEDED left a returning
  // rider on a signed-in home screen whose every request failed with 401 and
  // nothing on screen said so — their active trip silently disappeared.
  const source = readFileSync(new URL("../src/lib/api.js", import.meta.url), "utf8");
  assert.match(source, /const DEAD_TOKEN_CODES = new Set\(\[/);
  for (const code of ["SESSION_SUPERSEDED", "INVALID_TOKEN", "TOKEN_EXPIRED", "UNAUTHORIZED"]) {
    assert.ok(source.includes(`"${code}"`), `${code} must end the session`);
  }
  assert.match(source, /response\.status === 401 && DEAD_TOKEN_CODES\.has\(data\.error\) && requestIsCurrent\(\)/);
  // A late response for a previous token must still never evict a newer login.
  assert.match(source, /requestIsCurrent\(\)/);
});

test('a bare web preview uses the temporary public API, while local QA documents port 4001', () => {
  const apiSource = readFileSync(new URL('../src/lib/api.js', import.meta.url), 'utf8');
  const envExample = readFileSync(new URL('../.env.example', import.meta.url), 'utf8');
  assert.match(apiSource, /fallbackApiUrl = "https:\/\/smarttaxi-api-production-c518\.up\.railway\.app"/);
  assert.doesNotMatch(apiSource, /127\.0\.0\.1:4000/);
  assert.match(envExample, /VITE_API_URL=http:\/\/127\.0\.0\.1:4001/);
  assert.match(envExample, /VITE_SOCKET_URL=http:\/\/127\.0\.0\.1:4001/);
});
