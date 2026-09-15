import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const workflow = readFileSync(
  new URL("../../../.github/workflows/basic-check.yml", import.meta.url),
  "utf8",
);
const officialActions = [
  ...workflow.matchAll(/uses:\s+actions\/(checkout|setup-node)@v(\d+)/g),
];

assert(officialActions.length >= 2, "CI must use the official checkout and setup-node actions");
for (const [, name, major] of officialActions) {
  assert(
    Number(major) >= 7,
    `actions/${name}@v${major} uses a deprecated action runtime`,
  );
}
assert.match(
  workflow,
  /^permissions:\s*\n\s+contents:\s+read$/m,
  "CI must default to read-only repository permissions",
);

console.log(`CI action policy: ${officialActions.length + 1} passed.`);
