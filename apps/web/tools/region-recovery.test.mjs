import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const clientSource = fs.readFileSync(
  new URL('../src/features/client/ClientApp.jsx', import.meta.url),
  'utf8',
);
const stylesSource = fs.readFileSync(
  new URL('../src/styles.css', import.meta.url),
  'utf8',
);

test('passenger region catalogue can be retried after an initial outage', () => {
  assert.match(clientSource, /const \[regionsReloadKey, setRegionsReloadKey\] = useState\(0\)/);
  assert.match(clientSource, /getActiveRegions\(\)[\s\S]*?\}, \[regionsReloadKey\]\);/);
  assert.match(clientSource, /setRegionsReloadKey\(value => value \+ 1\)/);
});

test('region outage recovery stays visible in every address entry path', () => {
  assert.match(clientSource, /function RegionConnectionNotice\(/);
  assert.match(clientSource, /role="alert" aria-live="assertive"/);
  assert.match(clientSource, /function AddressPicker\(\{[^}]*regionsError[^}]*onRetryRegions/);
  assert.match(clientSource, /function RegionSection\(\{[^}]*regionsError[^}]*onRetryRegions/);
  assert.match(clientSource, /<ReferenceHomeSection[\s\S]*?regionsError=\{regionsError\}[\s\S]*?onRetryRegions=\{retryRegions\}/);
  assert.match(stylesSource, /\.taxi-client-shell \.region-connection-notice \{/);
  assert.match(stylesSource, /\.region-connection-notice button:disabled/);
});

