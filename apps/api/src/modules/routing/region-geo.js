// Canonical centre and working radius per launch region.
//
// Shared by the address harvester and the address loader so they cannot
// disagree. They must not: the harvester's bounding boxes overlap heavily
// (Ынтымак's 12 km box sits inside Мырзакент's 22 km one), so the same OSM
// object is collected into several regions' files. `addresses` is keyed on
// (osm_type, osm_id), which means one row can belong to exactly one region —
// and without a rule, that region is simply whichever file loaded last.
//
// Measured in production on 2026-08-06, before this existed: every house on
// улица Бектасова in Мырзакент was filed under Ынтымак, because Ынтымак's
// file happened to load two seconds later. A rider searching in Мырзакент
// found none of them.
//
// The rule is nearest centre wins. It is deterministic, independent of load
// order, and matches what a person would say — a street belongs to the
// settlement it is actually in.
export const REGION_GEO = [
  { code: "ATAKENT", name: "Атакент", lat: 40.844435, lng: 68.509021, radiusKm: 14 },
  { code: "MYRZAKENT", name: "Мырзакент", lat: 40.665495, lng: 68.549994, radiusKm: 22 },
  { code: "ZHETYSAY", name: "Жетысай", lat: 40.777134, lng: 68.324677, radiusKm: 16 },
  { code: "SHYMKENT", name: "Шымкент", lat: 42.314696, lng: 69.588328, radiusKm: 34 },
  { code: "KIROV", name: "Киров", lat: 40.7869, lng: 68.5344, radiusKm: 12 },
  { code: "ASYKATA", name: "Асыката", lat: 40.8947, lng: 68.3635, radiusKm: 12 },
  { code: "DOSTYK", name: "Достык", lat: 40.8072, lng: 68.4592, radiusKm: 12 },
  { code: "YNTYMAK", name: "Ынтымак", lat: 40.7606, lng: 68.4979, radiusKm: 12 },
  { code: "BIRLIK", name: "Бирлик", lat: 40.8225, lng: 68.4018, radiusKm: 12 },
  { code: "FIRDOUSI", name: "Фирдоуси", lat: 40.7231, lng: 68.5016, radiusKm: 12 },
  // ZHANA_ZHOL, with the underscore, because that is the code migrations.js
  // creates the region under and the loader looks it up by. Spelled without
  // one, every address nearest to Жана Жол was harvested, filed under
  // "ZHANAZHOL", matched no region and was dropped: the settlement had zero
  // addresses in the database.
  { code: "ZHANA_ZHOL", name: "Жана Жол", lat: 40.7567, lng: 68.5661, radiusKm: 12 },
  // "Мақтаарал", with қ — the spelling the regions table stores and therefore
  // the one the address-search API is called with. This read "Мактаарал" with
  // a plain к, which matches nothing: regionRadiusKmByName() fell through to
  // its 25 km default, so Мақтаарал searched a box twice its working radius
  // and filled the 96-candidate page with Мырзакент and Жетысай before the
  // polygon filter ever saw a local row.
  { code: "MAKTAARAL", name: "Мақтаарал", lat: 40.7358, lng: 68.5364, radiusKm: 12 },
  // Was 40.8121, 68.5839 — a point in Uzbekistan, 1 km from Paxtakor jom'e
  // masjidi and 2.4 km outside Атамекен's own service area. Nearest-centre
  // ownership was therefore measured from a foreign village. This is the
  // median of the Kazakh cluster inside the boundary below (улица Абая,
  // улица Сатпаева, улица Жамбыла, школа № 35, сш им Болашақ).
  { code: "ATAMEKEN", name: "Атамекен", lat: 40.8155, lng: 68.5488, radiusKm: 12 }
];

// Harvesting needs the same service polygons that are enforced by the API,
// but it runs without a database.  Keep this compact code-keyed mirror next
// to the harvest centres rather than letting broad collection circles decide
// which country a rider-visible address belongs to.
const SERVICE_BOUNDARIES = {
  ATAKENT: [[68.475, 40.82], [68.535, 40.82], [68.535, 40.875], [68.475, 40.875]],
  MYRZAKENT: [[68.47, 40.6], [68.6, 40.6], [68.6, 40.73], [68.47, 40.73]],
  ZHETYSAY: [[68.28, 40.735], [68.37, 40.735], [68.37, 40.815], [68.28, 40.815]],
  SHYMKENT: [[69.3, 42.1], [69.85, 42.1], [69.85, 42.48], [69.3, 42.48]],
  KIROV: [[68.5, 40.75], [68.57, 40.75], [68.57, 40.82], [68.5, 40.82]],
  ASYKATA: [[68.32, 40.86], [68.41, 40.86], [68.41, 40.93], [68.32, 40.93]],
  DOSTYK: [[68.42, 40.78], [68.49, 40.78], [68.49, 40.84], [68.42, 40.84]],
  YNTYMAK: [[68.46, 40.73], [68.53, 40.73], [68.53, 40.79], [68.46, 40.79]],
  BIRLIK: [[68.37, 40.79], [68.435, 40.79], [68.435, 40.855], [68.37, 40.855]],
  FIRDOUSI: [[68.47, 40.69], [68.535, 40.69], [68.535, 40.755], [68.47, 40.755]],
  ZHANA_ZHOL: [[68.53, 40.725], [68.6, 40.725], [68.6, 40.79], [68.53, 40.79]],
  MAKTAARAL: [[68.505, 40.705], [68.57, 40.705], [68.57, 40.765], [68.505, 40.765]],
  // Eastern edge is the Kazakhstan/Uzbekistan border, not a round number.
  // This box used to reach 68.62 and so lay mostly inside Uzbekistan: 40% of
  // everything harvested inside it was Uzbek ("Sirdaryo tumani 10-maktab",
  // "Paxtakor jom'e masjidi", "Marxamat ko'chasi"), against 0-2% in every
  // other region. A rider selecting Атамекен was being offered destinations
  // in another country, which no driver can serve.
  //
  // The border is located from the harvest itself — the two customs pairs it
  // contains. At 40.836 "Customs Kazakhstan" sits at 68.5604 and "Customs
  // Uzbekistan" at 68.5644; at 40.79 "Сырдария шекаралық кеден бекеті" sits
  // at 68.5769 and "Malik chegara bojxona posti" at 68.5814. 68.562 is east
  // of the Kazakh post at the northern crossing and west of every Uzbek
  // object in the box, and the Kazakh cluster it must keep (улица Абая,
  // улица Сатпаева, школа № 35) ends at 68.5551. The line slopes east going
  // south, so a straight edge here gives up ~1 km of empty Kazakh land in
  // the south rather than risk claiming Uzbek streets.
  //
  // Script alone cannot be the test: "махалла" (68.5735) and "Заправка"
  // (68.5955) are Cyrillic labels on the Uzbek side.
  ATAMEKEN: [[68.545, 40.78], [68.562, 40.78], [68.562, 40.845], [68.545, 40.845]]
};

export function serviceBoundaryForCode(code) {
  return SERVICE_BOUNDARIES[String(code || "").trim().toUpperCase()] || null;
}

/// The rows the `regions` table is seeded with, joined from the two tables
/// above so the database cannot disagree with the code that reads it.
///
/// These used to be a second, hand-written copy inside migrations.js, and
/// they had already drifted: Мырзакент's centre differed by 600 m, and the
/// name mismatch above meant the search radius for Мақтаарал was wrong in
/// production. One border edit had to be made in two files by hand.
///
/// `boundary` is closed here (first point repeated) because that is the form
/// the column has always held; pointInPolygon accepts either.
export const REGION_SEED = REGION_GEO.map((region) => {
  const ring = SERVICE_BOUNDARIES[region.code];
  if (!ring) throw new Error(`region ${region.code} has no service boundary`);
  return {
    code: region.code,
    name: region.name,
    boundary: [...ring, ring[0]],
    centerLat: region.lat,
    centerLng: region.lng,
    currency: "KZT",
    isActive: true
  };
});

/// Working radius for a region given its display name, for callers that only
/// have the name (the address search API takes one). Falls back to the
/// widest radius in use, so an unknown name searches generously rather than
/// returning nothing.
export function regionRadiusKmByName(name) {
  const wanted = String(name || "").trim().toLocaleLowerCase("ru-KZ");
  if (!wanted) return null;
  const match = REGION_GEO.find(
    (region) => region.name.toLocaleLowerCase("ru-KZ") === wanted
  );
  return match ? match.radiusKm : 25;
}

const EARTH_RADIUS_KM = 6371;
const toRadians = (degrees) => (degrees * Math.PI) / 180;

export function distanceKm(aLat, aLng, bLat, bLng) {
  const dLat = toRadians(bLat - aLat);
  const dLng = toRadians(bLng - aLng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(aLat)) * Math.cos(toRadians(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

function pointInBoundary(lat, lng, boundary) {
  let inside = false;
  for (let index = 0, previous = boundary.length - 1; index < boundary.length; previous = index++) {
    const [x, y] = boundary[index];
    const [previousX, previousY] = boundary[previous];
    const crosses = (y > lat) !== (previousY > lat)
      && lng < ((previousX - x) * (lat - y)) / (previousY - y) + x;
    if (crosses) inside = !inside;
  }
  return inside;
}

/// Returns the configured service area that physically contains a point.
/// Collection circles overlap and reach outside Kazakhstan, so they cannot
/// be used for rider-visible address ownership.  Border overlaps are resolved
/// by the nearest configured centre to keep the result deterministic.
export function serviceRegionCode(lat, lng) {
  const candidates = REGION_GEO.filter((region) => pointInBoundary(lat, lng, SERVICE_BOUNDARIES[region.code]));
  if (!candidates.length) return null;
  candidates.sort((a, b) => distanceKm(lat, lng, a.lat, a.lng) - distanceKm(lat, lng, b.lat, b.lng));
  return candidates[0].code;
}

/// The region whose centre is closest to this point, or null when the point
/// is implausibly far from every one of them.
///
/// Deliberately NOT gated on each region's own `radiusKm`. These settlements
/// sit 4–6 km apart with 12 km radii, so the circles overlap enormously and
/// a point can easily be nearest to one region while lying outside its
/// radius — under a radius gate it then belongs to nobody. Measured: gating
/// on radius discarded 63 807 of 81 603 harvested rows, including three
/// quarters of Мырзакент. Nearest centre alone keeps them and still assigns
/// each object to exactly one place.
///
/// The outer bound only rejects coordinates that cannot be a harvest result
/// at all — a parsing accident, or a bounding box computed without the
/// cosine-of-latitude correction.
/// Beyond this, a point is outside the service area even if some region is
/// technically nearest to it. Мырзакент sits on the Uzbek border and its
/// 22 km harvest box reaches well across: of its rows more than 25 km from
/// the centre, 95% carry Latin-script Uzbek names ("Guliston shahar
/// 1-maktab", "Nosir Mahmudov ko'chasi"), against 20% within 25 km. The
/// service does not cross the border, and a rider should not be offered a
/// street in another country.
///
/// The floor is a floor, not a replacement: a region with a wider radius
/// keeps its own. Applying the radius alone as the cutoff is what discarded
/// three quarters of the data on the first attempt — these settlements are
/// 4-6 km apart with 12 km radii, so a point is routinely nearest to a
/// region and outside its radius.
const SERVICE_AREA_FLOOR_KM = 25;

export function nearestRegionCode(lat, lng) {
  let best = null;
  let bestDistance = Infinity;
  for (const region of REGION_GEO) {
    const distance = distanceKm(lat, lng, region.lat, region.lng);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = region;
    }
  }
  if (!best) return null;
  return bestDistance <= Math.max(best.radiusKm, SERVICE_AREA_FLOOR_KM)
    ? best.code
    : null;
}
