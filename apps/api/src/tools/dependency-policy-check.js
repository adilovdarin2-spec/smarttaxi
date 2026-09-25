import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const readJson = (relativePath) => JSON.parse(readFileSync(new URL(relativePath, import.meta.url), "utf8"));
const api = readJson("../../package.json");
const rootUrl = new URL("../../../../package.json", import.meta.url);
const root = existsSync(rootUrl) ? readJson("../../../../package.json") : null;
const workspace = root?.workspaces?.includes("apps/api");
const lock = readJson(workspace ? "../../../../package-lock.json" : "../../package-lock.json");

// npm only honors the install root's overrides: Compose uses the workspace
// root, while the legacy Railway API build uses apps/api as its root.
assert.equal(api.overrides?.qs, "6.16.0");
if (workspace) {
  assert.equal(root.overrides?.qs, api.overrides.qs);
}
const qsEntries = Object.entries(lock.packages).filter(([path]) => path.endsWith("node_modules/qs"));
assert.ok(qsEntries.length > 0);
for (const [path, dependency] of qsEntries) {
  assert.equal(dependency.version, api.overrides.qs, `${path} must match the patched override`);
}

console.log(workspace
  ? "Dependency policy: root/API qs overrides and tracked lock agree."
  : "Dependency policy: standalone API override and generated lock agree (workspace mirror unavailable).");
