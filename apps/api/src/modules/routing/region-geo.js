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
  { code: "KIROV", name: "Киров", lat: 40.7869, lng: 68.5344, radiusKm: 12 },
  { code: "ASYKATA", name: "Асыката", lat: 40.8947, lng: 68.3635, radiusKm: 12 },
  { code: "DOSTYK", name: "Достык", lat: 40.8072, lng: 68.4592, radiusKm: 12 },
  { code: "YNTYMAK", name: "Ынтымак", lat: 40.7606, lng: 68.4979, radiusKm: 12 },
  { code: "BIRLIK", name: "Бирлик", lat: 40.8225, lng: 68.4018, radiusKm: 12 },
  { code: "FIRDOUSI", name: "Фирдоуси", lat: 40.7231, lng: 68.5016, radiusKm: 12 },
  { code: "ZHANAZHOL", name: "Жана жол", lat: 40.7567, lng: 68.5661, radiusKm: 12 },
  { code: "MAKTAARAL", name: "Мактаарал", lat: 40.7358, lng: 68.5364, radiusKm: 12 },
  { code: "ATAMEKEN", name: "Атамекен", lat: 40.8121, lng: 68.5839, radiusKm: 12 }
];

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
