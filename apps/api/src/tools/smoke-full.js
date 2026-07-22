import { spawnSync } from "node:child_process";

const scripts = [
  "smoke:health",
  "smoke:maps",
  "smoke:stage2",
  "smoke:stage3",
  "smoke:stage9"
];

const npm = process.platform === "win32" ? "npm.cmd" : "npm";

for (const script of scripts) {
  console.log(`\n> npm run ${script}`);
  const result = spawnSync(npm, ["run", script], {
    stdio: "inherit",
    shell: false,
    env: process.env
  });
  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

console.log("\nSmoke full ok");
