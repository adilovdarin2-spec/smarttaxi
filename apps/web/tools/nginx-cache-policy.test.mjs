import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";

const configPath = fileURLToPath(new URL("../nginx.conf", import.meta.url));

test("web shell is revalidated while hashed assets are immutable and never use SPA fallback", async () => {
  const config = await readFile(configPath, "utf8");

  assert.match(
    config,
    /location\s*=\s*\/index\.html\s*\{[\s\S]*?Cache-Control\s+"no-cache, no-store, must-revalidate"[\s\S]*?try_files\s+\$uri\s+=404;/,
    "index.html must be revalidated so it cannot import chunks from a previous deploy"
  );
  assert.match(
    config,
    /location\s+\^~\s+\/assets\/\s*\{[\s\S]*?try_files\s+\$uri\s+=404;[\s\S]*?Cache-Control\s+"public, max-age=31536000, immutable"/,
    "a stale hashed asset must return 404 instead of SPA HTML"
  );
});
