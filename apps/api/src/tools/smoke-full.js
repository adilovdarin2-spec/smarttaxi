import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const scripts = [
  "smoke-health.js",
  "smoke-maps.js",
  "stage2-smoke.js",
  "stage3-client-flow-smoke.js",
  "stage9-payment-rating-smoke.js",
  "stage11-driver-core-smoke.js",
  "driver-documents-smoke.js"
];

for (const script of scripts) {
  console.log(`\n> node ${script}`);
  const result = spawnSync(process.execPath, [fileURLToPath(new URL(`./${script}`, import.meta.url))], {
    stdio: "inherit",
    shell: false,
    env: process.env
  });
  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

console.log("\nSmoke full ok");
