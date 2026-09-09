import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

// Isolated guard tests: no Docker database, real login, SMS or trip mutation.
const run = promisify(execFile);
const cli = fileURLToPath(new URL('./physical-device-qa.js', import.meta.url));
const requests = [];
const server = createServer((request, response) => {
  requests.push(request.url);
  response.setHeader('Content-Type', 'application/json');
  response.end(JSON.stringify({ status: 'ok', env: 'production' }));
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const local = `http://127.0.0.1:${server.address().port}`;
async function rejects(base, args) {
  await assert.rejects(run(process.execPath, [cli, ...args], {
    env: { ...process.env, API_URL: base }, timeout: 5000
  }), error => error.code === 1 && /AssertionError/.test(error.stderr));
}
try {
  await rejects('https://api.smarttaxi.kz', ['inspect']);
  await rejects(local, ['unsupported']);
  await rejects(local, ['step', 'not-a-uuid', 'accept']);
  await rejects(local, ['step', '00000000-0000-0000-0000-000000000000', 'delete']);
  assert.deepEqual(requests, [], 'Invalid inputs must fail before any request');
  await rejects(local, ['inspect']);
  assert.deepEqual(requests, ['/api/health/ready'], 'Non-development health must fail before login');
  console.log('Physical-device QA guards: 5 passed; no real login or mutation.');
} finally {
  await new Promise(resolve => server.close(resolve));
}
