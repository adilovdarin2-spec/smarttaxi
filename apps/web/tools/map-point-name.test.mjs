import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const read = (path) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8");
const client = read("../src/features/client/ClientApp.jsx");

test("a point with no address asks the rider to name it", () => {
  // It used to be a dead end: "Адрес не найден. Передвиньте карту к
  // ближайшему дому" — advice about a house that does not exist. Four of the
  // twelve regions have no named streets in OSM at all.
  // The picker is where a rider deliberately places a point, and it no longer
  // refuses one it cannot name.
  const picker = client.slice(client.indexOf("async function updateMapCandidate("));
  assert.ok(!picker.includes('title: "Адрес не найден"'));
  assert.ok(client.includes("setNeedsPointName(true)"));
  assert.ok(client.includes("Как называется это место?"));
  assert.ok(client.includes('placeholder="Например: синие ворота за мечетью"'));

  // A resolved or cached answer must take the question back down again.
  assert.equal(client.match(/setNeedsPointName\(false\)/g).length, 3);
});

test("the typed name is what the order carries", () => {
  // onSelect feeds chooseAddress → normalizeAddress → pickup/destination,
  // and the title is sent as pickupText/dropoffText.
  assert.ok(client.includes("title: trimmedPointName.slice(0, 120)"));
  assert.ok(client.includes("riderNamed: true"));
  // The server takes 2..180 characters after trimming.
  assert.ok(client.includes("trimmedPointName.length >= 2"));
});

test("the geocoder guards do not reject a name the rider typed", () => {
  // Those guards exist to throw out what a geocoder returned — a bare street,
  // a settlement name, a road code. A rider standing at the gate knows better
  // than the geocoder, so "улица Абая" from them is an address, not noise.
  assert.ok(client.includes("const riderNamed = address.riderNamed === true;"));
  assert.ok(client.includes("if (!riderNamed &&"));
  // The coordinate and empty-title checks still apply to everyone.
  assert.ok(client.includes("if (!title) return null;"));
  assert.ok(client.includes("if (!isResolvedAddressPoint(address)) return null;"));
});

test("the home map points at the picker rather than a house that is not there", () => {
  // It used to send the rider to "the nearest house or object". In Бирлик,
  // Жана Жол, Фирдоуси and Ынтымак OSM has no named streets at all.
  assert.ok(!client.includes("Передвиньте карту к ближайшему дому или объекту"));
  assert.ok(client.includes("Откройте «Откуда» и выберите точку на карте — там можно дать ей название"));
});
