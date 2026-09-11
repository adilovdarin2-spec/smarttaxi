import fs from "node:fs";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function read(path) {
  return fs.readFileSync(new URL(path, import.meta.url), "utf8");
}

const migrations = read("../db/migrations.js");
const schema = read("../db/schema.sql");
const publicSettings = read("../modules/regions/regions.routes.js");

for (const source of [migrations, schema]) {
  assert(
    !source.includes("support_phone TEXT NOT NULL DEFAULT '+77000000000'"),
    "Support phone must not default to a generated placeholder"
  );
  assert(
    !source.includes("sos_phone TEXT NOT NULL DEFAULT '+77000000000'"),
    "SOS phone must not default to a generated placeholder"
  );
}

assert(
  migrations.includes("UPDATE service_settings SET support_phone='' WHERE support_phone='+77000000000'"),
  "Existing generated support phones must be removed during migration"
);
assert(
  migrations.includes("UPDATE service_settings SET sos_phone='112' WHERE sos_phone='+77000000000'"),
  "Existing generated SOS phones must be replaced with 112 during migration"
);
assert(
  publicSettings.includes('router.get("/service-settings"'),
  "Clients need the public, configured service settings endpoint"
);

console.log("Service contact safety checks ok");
