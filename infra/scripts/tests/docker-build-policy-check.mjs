import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root = new URL('../../../', import.meta.url);
const read = name => readFileSync(new URL(name, root), 'utf8');
for (const file of ['infra/docker/Dockerfile', 'apps/api/Dockerfile']) {
  const source = read(file);
  assert.match(source, /^ARG NPM_STRICT_SSL=true\s*$/m,
    `${file}: dependency TLS verification must be enabled by default`);
  assert.doesNotMatch(source, /npm\s+config\s+set\s+strict-ssl\s+false/,
    `${file}: never hardcode disabled npm certificate validation`);
  assert.doesNotMatch(source, /NODE_TLS_REJECT_UNAUTHORIZED\s*=\s*["']?0/,
    `${file}: do not bypass Node TLS validation globally`);
}
assert.match(read('docker-compose.yml'), /NPM_STRICT_SSL:\s*\$\{NPM_STRICT_SSL:-true\}/,
  'Compose must not turn a missing TLS configuration into false');
assert.match(read('.env.example'), /^NPM_STRICT_SSL=true\s*$/m);
console.log('Docker build policy: npm TLS verification defaults to true in both API build contexts and Compose.');
