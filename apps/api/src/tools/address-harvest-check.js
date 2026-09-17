import assert from "node:assert/strict";

import { labelFor, nameVariants, queriesFor } from "./harvest-addresses.js";

const queries = queriesFor("40.0,68.0,41.0,69.0");
assert.deepEqual(
  queries.map((query) => query.kind),
  ["poi", "building", "housenumber", "street"],
  "named destinations must win identity de-duplication before plain addresses"
);

const poiQuery = queries[0].body;
for (const key of [
  "amenity", "shop", "tourism", "office", "leisure", "healthcare",
  "craft", "public_transport", "railway", "aeroway", "historic",
  "emergency", "government", "man_made"
]) {
  assert(poiQuery.includes(`["${key}"`), `POI harvest must include ${key}`);
}
assert.match(
  queries[1].body,
  /nwr\["building"\]\["name"\]/,
  "named multipolygon buildings must be harvested"
);
assert.match(
  queries[2].body,
  /nwr\["addr:housenumber"\]/,
  "relation-based addresses must be harvested"
);

const clinic = {
  name: "Aq Niet",
  "name:ru": "Ак Ниет",
  official_name: "Медицинский центр Aq Niet",
  healthcare: "clinic",
  "addr:street": "улица Абая",
  "addr:housenumber": "17"
};
assert.equal(
  labelFor("poi", clinic),
  "Aq Niet (улица Абая, 17)",
  "a named POI must keep its name and full address in the visible label"
);
const variants = nameVariants(clinic);
for (const expected of ["Aq Niet", "Ак Ниет", "Медицинский центр Aq Niet", "поликлиника", "емхана"]) {
  assert(variants.includes(expected), `search variants must contain ${expected}`);
}

assert.equal(
  labelFor("housenumber", {
    name: "ЖК Сапар",
    "addr:street": "улица Толе би",
    "addr:housenumber": "12А"
  }),
  "улица Толе би, 12А"
);

console.log("Address harvest checks ok");
