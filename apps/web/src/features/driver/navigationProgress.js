// Same road-distance model as Flutter's navigation_progress.dart. No turns
// are invented from bends in a polyline or from a fallback straight line.
const radians = Math.PI / 180;
const numeric = value => typeof value === "number" && Number.isFinite(value);
const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
function validPoint(point) {
  return numeric(point?.lat) && numeric(point?.lng) && Math.abs(point.lat) <= 90 && Math.abs(point.lng) <= 180;
}
function meters(a, b) {
  const h = Math.sin((b.lat - a.lat) * radians / 2) ** 2 +
    Math.cos(a.lat * radians) * Math.cos(b.lat * radians) * Math.sin((b.lng - a.lng) * radians / 2) ** 2;
  return 12742000 * Math.asin(Math.sqrt(clamp(h, 0, 1)));
}
function project(line, point, expectedAlong = null, minimumAlong = 0) {
  let total = 0, bestAlong = 0, bestDistance = Infinity;
  const cos = Math.cos(point.lat * radians);
  for (let i = 0; i < line.length - 1; i++) {
    const a = line[i], b = line[i + 1];
    const length = meters(a, b);
    const dx = (b.lng - a.lng) * cos, dy = b.lat - a.lat;
    const px = (point.lng - a.lng) * cos, py = point.lat - a.lat;
    const length2 = dx * dx + dy * dy;
    const t = length2 ? clamp((px * dx + py * dy) / length2, 0, 1) : 0;
    const along = total + length * t;
    const distance = meters(point, { lat: a.lat + dy * t, lng: a.lng + (b.lng - a.lng) * t });
    const tied = Math.abs(distance - bestDistance) < 0.5;
    if (along >= minimumAlong - 0.5 && (distance < bestDistance - 0.5 ||
        (tied && expectedAlong !== null && Math.abs(along - expectedAlong) < Math.abs(bestAlong - expectedAlong)))) {
      bestDistance = distance;
      bestAlong = along;
    }
    total += length;
  }
  return { along: bestAlong, distance: bestDistance, total };
}

export function navigationFixIsFresh(timestamp, now = Date.now()) {
  return numeric(timestamp) && now - timestamp >= -5000 && now - timestamp <= 12000;
}

export function browserNavigationFix(position, previousTimestamp = null, now = Date.now()) {
  const point = { lat: position?.coords?.latitude, lng: position?.coords?.longitude };
  const timestamp = position?.timestamp;
  if (!validPoint(point) || !navigationFixIsFresh(timestamp, now) ||
      (numeric(previousTimestamp) && timestamp <= previousTimestamp)) return null;
  const { heading, speed, accuracy } = position.coords;
  return { ...point, timestamp,
    heading: numeric(heading) && heading >= 0 && heading <= 360 ? heading % 360 : null,
    speed: numeric(speed) && speed >= 0 && speed <= 120 ? speed : null,
    accuracy: numeric(accuracy) && accuracy >= 0 ? accuracy : null
  };
}

export function navigationProgress(route, position) {
  if (!route || route.fallback || route.providerStatus === "Fallback" || !validPoint(position) ||
      !numeric(route.distanceMeters) || route.distanceMeters < 0 ||
      !numeric(route.durationSeconds) || route.durationSeconds < 0) return null;
  const coordinates = route.geometry?.type === "LineString" && route.geometry.coordinates;
  if (!Array.isArray(coordinates) || coordinates.length < 2) return null;
  const line = coordinates.map(p => Array.isArray(p) ? { lng: p[0], lat: p[1] } : null);
  if (!line.every(validPoint)) return null;
  const projection = project(line, position);
  if (projection.distance > 60 || projection.total <= 0) return null;
  const fraction = clamp((projection.total - projection.along) / projection.total, 0, 1);
  return { alongMeters: projection.along, totalMeters: projection.total,
    distanceFromRoute: projection.distance, distanceMeters: route.distanceMeters * fraction,
    durationSeconds: route.durationSeconds * fraction, line };
}

export function nextNavigationStep(route, progress) {
  if (!progress || route?.fallback || !Array.isArray(route?.steps)) return null;
  const steps = route.steps.filter(step => validPoint(step) && numeric(step.distanceMeters) && step.distanceMeters >= 0);
  const stepTotal = steps.reduce((sum, step) => sum + step.distanceMeters, 0);
  let traversed = 0, previousAnchor = 0;
  for (const step of steps) {
    const expected = step.type === "arrive" ? progress.totalMeters : stepTotal > 0 ? traversed / stepTotal * progress.totalMeters : null;
    const anchor = project(progress.line, step, expected, previousAnchor);
    traversed += step.distanceMeters;
    if (!Number.isFinite(anchor.distance) || anchor.distance > 30) continue;
    previousAnchor = anchor.along;
    if (step.type === "depart" || anchor.along < progress.alongMeters - 5) continue;
    return { step, distanceMeters: Math.max(0, anchor.along - progress.alongMeters) * route.distanceMeters / progress.totalMeters };
  }
  return null;
}

export function navigationInstruction(step) {
  if (!step) return { text: "Следуйте по маршруту", icon: "route" };
  const modifier = step.modifier;
  if (step.type === "arrive") return { text: "Точка назначения", icon: "finish" };
  if (["roundabout", "rotary", "roundabout turn"].includes(step.type)) return {
    text: Number.isInteger(step.exit) && step.exit > 0 ? `Круговое движение · ${step.exit}-й съезд` : "Круговое движение", icon: "roundabout"
  };
  if (["exit roundabout", "exit rotary"].includes(step.type)) return { text: "Съезд с кругового движения", icon: "right" };
  if (modifier === "uturn") return { text: "Развернитесь", icon: "uturn" };
  const direction = modifier?.includes("left") ? "left" : modifier?.includes("right") ? "right" : "straight";
  const side = direction === "left" ? "левее" : "правее";
  if (step.type === "fork" && direction !== "straight") return { text: `Держитесь ${side}`, icon: direction };
  if (step.type === "merge") return { text: "Перестройтесь в основной поток", icon: direction };
  if (step.type === "off ramp") return { text: direction === "straight" ? "Двигайтесь к съезду" : `Съезд ${direction === "left" ? "налево" : "направо"}`, icon: direction };
  if (step.type === "on ramp") return { text: "Выезд на дорогу", icon: direction };
  if (modifier === "slight left" || modifier === "slight right") return { text: `Плавно ${side}`, icon: direction };
  if (modifier === "sharp left" || modifier === "sharp right") return { text: `Резко ${direction === "left" ? "налево" : "направо"}`, icon: direction };
  if (direction !== "straight") return { text: `Поверните ${direction === "left" ? "налево" : "направо"}`, icon: direction };
  return { text: "Продолжайте движение", icon: "straight" };
}

export function navigationDistance(value) {
  if (!numeric(value)) return "—";
  return value < 1000 ? `${Math.max(0, Math.round(value / 10) * 10)} м` : `${(value / 1000).toLocaleString("ru-RU", { maximumFractionDigits: 1 })} км`;
}
