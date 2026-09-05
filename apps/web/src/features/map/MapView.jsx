import React, { useEffect, useMemo, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { Icon } from "../../core/icons.jsx";

const DEFAULT_CENTER = { lat: 40.844435, lng: 68.509021 };
const DEFAULT_ZOOM = 16;
const OSM_TILE_URL = import.meta.env.VITE_OSM_TILE_URL || "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const MAPTILER_KEY = import.meta.env.VITE_MAPTILER_API_KEY || "";
const MAPTILER_STYLE_URL = import.meta.env.VITE_MAPTILER_STYLE_URL || "";
const OPEN_FREE_MAP_STYLE_URL = import.meta.env.VITE_OPENFREEMAP_STYLE_URL || "https://tiles.openfreemap.org/styles/liberty";
const FALLBACK_ATTRIBUTION = "© OpenStreetMap contributors";

function validPoint(point) {
  const lat = Number(point?.lat);
  const lng = Number(point?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

function routeCoordinates(route) {
  const coordinates = route?.geometry?.coordinates || route?.route?.geometry?.coordinates;
  if (!Array.isArray(coordinates)) return [];
  return coordinates
    .map(item => Array.isArray(item) && item.length >= 2 ? { lng: Number(item[0]), lat: Number(item[1]) } : null)
    .filter(point => point && Number.isFinite(point.lat) && Number.isFinite(point.lng));
}

function mapStyle() {
  const styleUrl = MAPTILER_STYLE_URL || (MAPTILER_KEY ? `https://api.maptiler.com/maps/openstreetmap/style.json?key=${MAPTILER_KEY}` : "");
  if (styleUrl && MAPTILER_KEY) return styleUrl.replace("${MAPTILER_API_KEY}", MAPTILER_KEY);
  if (styleUrl && !styleUrl.includes("api.maptiler.com")) return styleUrl;
  if (styleUrl && /[?&]key=[^&]+/.test(styleUrl)) return styleUrl;
  // The former fallback was a flat raster OSM layer.  It made the real map
  // visibly different from the approved 3D reference whenever no MapTiler
  // key was configured.  OpenFreeMap serves an OpenMapTiles-compatible vector
  // style without an API key, so add3dBuildings() below can keep the same
  // pitched, blue-white city scene for local and production previews.
  return OPEN_FREE_MAP_STYLE_URL;
}

// The id of the lowest label layer, which is the anchor everything drawn onto
// the map has to sit under. Street/city/POI names stay legible only if the
// scene is built below them — the 3D buildings, and the route line, which is
// 4px of near-opaque blue plus an 8px blurred shadow laid along exactly the
// streets the rider is reading.
function firstLabelLayerId(map) {
  const layers = map.getStyle()?.layers || [];
  return layers.find((layer) => layer.type === "symbol" && layer.layout?.["text-field"])?.id;
}

function add3dBuildings(map) {
  // A configured MapTiler/vector style exposes building source layers. When
  // present, turn its building fills into an extrusion layer. The public OSM
  // raster fallback intentionally skips this step but keeps the same pitched
  // camera and all map interactions working.
  try {
    const layers = map.getStyle()?.layers || [];
    const buildingLayer = layers.find(layer => layer.type === "fill" && layer.source && layer["source-layer"] && /building/i.test(`${layer.id} ${layer["source-layer"]}`));
    if (!buildingLayer || map.getLayer("smarttaxi-3d-buildings")) return;
    map.addLayer({
      id: "smarttaxi-3d-buildings",
      type: "fill-extrusion",
      source: buildingLayer.source,
      "source-layer": buildingLayer["source-layer"],
      minzoom: 13,
      paint: {
        "fill-extrusion-color": "#dceaff",
        // Most OSM building footprints do not declare a height. A subtle
        // default keeps those blocks dimensional at navigation zoom without
        // turning the city into exaggerated towers.
        "fill-extrusion-height": ["coalesce", ["get", "render_height"], ["get", "height"], 5],
        "fill-extrusion-base": ["coalesce", ["get", "render_min_height"], ["get", "min_height"], 0],
        "fill-extrusion-opacity": 0.78
      }
    }, firstLabelLayerId(map));
  } catch {
    // Styles without vector building layers are still valid map styles.
  }
}

// OpenFreeMap's otherwise excellent free vector style uses a handful of
// data-driven POI sprite names that are not present in every deployed sprite
// sheet (for example `office` and `sports_centre`).  Leaving them unresolved
// makes MapLibre warn for every tile and creates visibly empty POI slots.
// Supply one tiny neutral fallback locally: it is intentionally generic, but
// always renders crisply and never adds another network request while a rider
// is moving the map.
function missingPoiImage() {
  const size = 32;
  const data = new Uint8Array(size * size * 4);
  const center = (size - 1) / 2;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const distance = Math.hypot(x - center, y - center);
      if (distance > 13) continue;
      const offset = (y * size + x) * 4;
      const ring = distance > 9;
      data[offset] = ring ? 29 : 255;
      data[offset + 1] = ring ? 111 : 255;
      data[offset + 2] = ring ? 255 : 255;
      data[offset + 3] = 255;
    }
  }
  return { width: size, height: size, data };
}

function installMissingPoiFallbacks(map) {
  const onMissing = event => {
    const id = event?.id;
    // A style reload removes custom images. `hasImage` is therefore the
    // authoritative guard; a remembered id would accidentally suppress the
    // fallback on the next style instance.
    if (!id || map.hasImage(id)) return;
    try {
      map.addImage(id, missingPoiImage(), { pixelRatio: 2 });
    } catch {
      // A style reload can race with this callback; it is safe to leave that
      // particular icon to the next request instead of interrupting the map.
    }
  };
  map.on("styleimagemissing", onMissing);
  return () => map.off("styleimagemissing", onMissing);
}

function routeGeoJson(routePoints) {
  return {
    type: "FeatureCollection",
    features: routePoints.length >= 2 ? [
      {
        type: "Feature",
        properties: {},
        geometry: {
          type: "LineString",
          coordinates: routePoints.map(point => [point.lng, point.lat])
        }
      }
    ] : []
  };
}

// The only raster marker left. Every other pin on the map is inline SVG:
// smartTaxiMarkerElement for an address point and the picker cursor,
// currentLocationMarkerElement for the rider's own position,
// finishFlagMarkerElement for a confirmed destination.
//
// This used to be markerElement(type) with branches for "pickup" and
// "destination" and a guard returning the approved marker for anything that
// was not a driver. Both branches were unreachable - the sole call site passes
// "driver" - so all the guard protected was two PNGs of retired pins that
// nothing could render. Those are gone with it.
function driverMarkerElement() {
  const element = document.createElement("span");
  element.className = "car-marker maplibre-car-marker native-map-marker driver-marker";
  element.setAttribute("aria-label", "Водитель");
  const image = document.createElement("img");
  image.alt = "";
  image.decoding = "async";
  image.loading = "eager";
  image.src = "/map/driver_car_topview_white.png";
  element.appendChild(image);
  return element;
}

// Cancels any in-flight tween on this marker before starting a new one, and
// snaps straight to the target when there's no prior point to animate from
// (first placement, or the marker was just re-created after being removed).
function animateMarkerTo(marker, fromPoint, toPoint, durationMs = 900) {
  if (marker._smartTaxiTweenFrame) {
    cancelAnimationFrame(marker._smartTaxiTweenFrame);
    marker._smartTaxiTweenFrame = null;
  }
  if (!fromPoint) {
    marker.setLngLat([toPoint.lng, toPoint.lat]);
    return;
  }
  const start = performance.now();
  const step = now => {
    const t = Math.min(1, (now - start) / durationMs);
    const eased = 1 - (1 - t) * (1 - t);
    marker.setLngLat([
      fromPoint.lng + (toPoint.lng - fromPoint.lng) * eased,
      fromPoint.lat + (toPoint.lat - fromPoint.lat) * eased
    ]);
    if (t < 1) marker._smartTaxiTweenFrame = requestAnimationFrame(step);
    else marker._smartTaxiTweenFrame = null;
  };
  marker._smartTaxiTweenFrame = requestAnimationFrame(step);
}

const approvedAddressMarkerMarkup = `<span class="approved-address-marker-badge" aria-hidden="true"><svg viewBox="0 0 64 64" fill="none"><rect x="2" y="2" width="60" height="60" rx="20" fill="url(#smartTaxiMarkerGradient)"/><rect x="6" y="6" width="52" height="52" rx="16" fill="#fff" fill-opacity=".9"/><path d="M10 22C10 14 16.5 8 24 6.5" stroke="#fff" stroke-opacity=".55" stroke-width="2.5" stroke-linecap="round"/><rect x="14" y="24" width="7" height="7" fill="#63A0FF" fill-opacity=".55"/><rect x="23" y="24" width="7" height="7" fill="#1D6FFF" fill-opacity=".9"/><rect x="18" y="33" width="7" height="7" fill="#63A0FF" fill-opacity=".35"/><text x="42" y="35" text-anchor="middle" dominant-baseline="central" font-family="Manrope, sans-serif" font-weight="800" font-size="29" fill="url(#smartTaxiMarkerGradient)">S</text><defs><linearGradient id="smartTaxiMarkerGradient" x1="4" y1="2" x2="60" y2="60" gradientUnits="userSpaceOnUse"><stop stop-color="#63A0FF"/><stop offset="1" stop-color="#0B4FD1"/></linearGradient></defs></svg><svg class="approved-address-marker-tail" viewBox="0 0 64 22" preserveAspectRatio="none"><path d="M26 0H38V6L32 22L26 6Z" fill="#0B4FD1"/></svg></span>`;

const currentLocationMarkerMarkup = `<span class="current-location-marker-badge" aria-hidden="true"><i></i><b></b></span>`;

const finishFlagMarkerMarkup = `<span class="finish-flag-marker-badge" aria-hidden="true"><svg viewBox="0 0 58 76" fill="none"><path d="M17 68.5V9.5" stroke="#0B4FD1" stroke-width="5" stroke-linecap="round"/><path d="M19 11.5C28 5.5 37 16.5 47 10.5V43.5C37 49.5 28 38.5 19 44.5V11.5Z" fill="#fff" stroke="#0B4FD1" stroke-width="3" stroke-linejoin="round"/><path d="M21 14.5H27V21H21V14.5ZM33 14.5H39V21H33V14.5ZM27 21H33V27.5H27V21ZM39 21H45V27.5H39V21ZM21 27.5H27V34H21V27.5ZM33 27.5H39V34H33V27.5ZM27 34H33V40.5H27V34ZM39 34H45V40.5H39V34Z" fill="#1D6FFF"/><circle cx="17" cy="69" r="6.5" fill="#fff" stroke="#0B4FD1" stroke-width="3"/><circle cx="17" cy="69" r="2.5" fill="#1D6FFF"/></svg></span>`;

function smartTaxiMarkerElement() {
  const element = document.createElement("span");
  element.className = "smarttaxi-map-marker native-address-pick-marker";
  element.setAttribute("aria-label", "Точка на карте SmartTaxi");
  element.innerHTML = approvedAddressMarkerMarkup;
  return element;
}

function currentLocationMarkerElement() {
  const element = document.createElement("span");
  element.className = "current-location-map-marker";
  element.setAttribute("aria-label", "Моё местоположение");
  element.innerHTML = currentLocationMarkerMarkup;
  return element;
}

function finishFlagMarkerElement() {
  const element = document.createElement("span");
  element.className = "finish-flag-map-marker";
  element.setAttribute("aria-label", "Точка назначения");
  element.innerHTML = finishFlagMarkerMarkup;
  return element;
}

function featurePreview(map, point) {
  try {
    const box = [
      [point.x - 8, point.y - 8],
      [point.x + 8, point.y + 8]
    ];
    const feature = map.queryRenderedFeatures(box).find(item => {
      const props = item.properties || {};
      return props.name || props.name_ru || props["addr:housenumber"] || props["addr:street"] || props.class;
    });
    if (!feature) return null;
    const props = feature.properties || {};
    const street = props["addr:street"] || props.street || props.name_ru || props.name || "";
    const house = props["addr:housenumber"] || props.housenumber || "";
    const title = [street, house].filter(Boolean).join(", ") || props.name_ru || props.name || "";
    return title ? { title, source: "map_feature" } : null;
  } catch {
    return null;
  }
}

function fitMap(map, points, compact) {
  const valid = points.filter(Boolean);
  if (valid.length >= 2) {
    const bounds = valid.reduce(
      (acc, point) => acc.extend([point.lng, point.lat]),
      new maplibregl.LngLatBounds([valid[0].lng, valid[0].lat], [valid[0].lng, valid[0].lat])
    );
    map.fitBounds(bounds, {
      padding: compact ? { top: 82, right: 52, bottom: 52, left: 52 } : { top: 90, right: 46, bottom: 110, left: 46 },
      maxZoom: 16,
      duration: 650
    });
    return;
  }
  if (valid[0]) {
    map.easeTo({ center: [valid[0].lng, valid[0].lat], zoom: DEFAULT_ZOOM, duration: 550 });
  }
}

export default function MapView({
  pickup,
  destination,
  driver,
  route,
  center,
  status = "",
  compact = false,
  addressControls = false,
  onUseLocation,
  onRetry,
  onMapPick,
  centerMarker = false,
  onCenterChange,
  onCenterChanging
}) {
  const containerRef = useRef(null);
  const pickerOverlayRef = useRef(null);
  const mapRef = useRef(null);
  const centerMarkerElRef = useRef(null);
  const pickupMarkerElRef = useRef(null);
  const destinationMarkerElRef = useRef(null);
  const driverMarkerElRef = useRef(null);
  const driverMarkerPointRef = useRef(null);
  const onCenterChangeRef = useRef(onCenterChange);
  const onCenterChangingRef = useRef(onCenterChanging);
  const onMapPickRef = useRef(onMapPick);
  const [expanded, setExpanded] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState("");

  const pickupPoint = validPoint(pickup);
  const destinationPoint = validPoint(destination);
  const driverPoint = validPoint(driver);
  const centerPoint = validPoint(center) || pickupPoint || destinationPoint || DEFAULT_CENTER;
  const routePoints = routeCoordinates(route);
  const style = useMemo(() => mapStyle(), []);

  function pickerScreenPoint() {
    const bounds = containerRef.current?.getBoundingClientRect();
    const tail = pickerOverlayRef.current?.querySelector(".approved-address-marker-tail")?.getBoundingClientRect();
    if (!bounds) return [0, 0];
    if (!tail?.width) return [bounds.width / 2, bounds.height / 2];
    // The sheet covers the lower map, so the visible pin sits above the camera
    // centre. Reverse-geocode its actual tip, not an invisible point below it.
    return [tail.left + tail.width / 2 - bounds.left, tail.bottom - bounds.top];
  }

  function pickerCoordinate(map) {
    const point = map.unproject(pickerScreenPoint());
    return { lat: Number(point.lat.toFixed(6)), lng: Number(point.lng.toFixed(6)) };
  }

  function centerUnderPicker(map, point, duration = 0) {
    const tip = pickerScreenPoint();
    const canvas = map.getCanvas();
    map.easeTo({
      center: [point.lng, point.lat],
      offset: [tip[0] - canvas.clientWidth / 2, tip[1] - canvas.clientHeight / 2],
      duration
    });
  }

  useEffect(() => {
    onCenterChangeRef.current = onCenterChange;
    onCenterChangingRef.current = onCenterChanging;
    onMapPickRef.current = onMapPick;
  }, [onCenterChange, onCenterChanging, onMapPick]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return undefined;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style,
      center: [centerPoint.lng, centerPoint.lat],
      zoom: DEFAULT_ZOOM,
      // Slightly more perspective on the rider's map matches the approved
      // navigation reference while retaining enough top-down context to pick
      // an exact entrance or house.
      pitch: compact ? 50 : 42,
      bearing: compact ? -12 : -8,
      attributionControl: false,
      logoPosition: "bottom-left",
      // A courier map must react to the first gesture, even while tiles are
      // still arriving. Keep the cache bounded on low-memory phones and do
      // not spend the first interaction animating stale vector tiles.
      renderWorldCopies: false,
      fadeDuration: 0,
      refreshExpiredTiles: false,
      maxTileCacheSize: 64,
      dragRotate: false,
      pitchWithRotate: false
    });
    mapRef.current = map;
    const removeMissingPoiFallbacks = installMissingPoiFallbacks(map);
    map.touchZoomRotate.disableRotation();

    const onLoad = () => {
      setMapReady(true);
      setMapError("");
      map.resize();
      if (centerMarker) centerUnderPicker(map, centerPoint);
      else fitMap(map, routePoints.length ? routePoints : [pickupPoint, destinationPoint, driverPoint, centerPoint], compact);
      // A map opened in address-picker mode can already be centred correctly,
      // in which case MapLibre does not emit `moveend`. Publish that initial
      // point explicitly so the sheet resolves a real address instead of
      // remaining on the technical "Определяем адрес" placeholder.
      if (centerMarker && onCenterChangeRef.current) {
        onCenterChangeRef.current(pickerCoordinate(map));
      }
      // Building extrusion is visually important, but parsing thousands of
      // polygons during the first paint made address selection feel frozen.
      // Wait until the base map is interactive; the 3D layer then appears
      // progressively without blocking pan, pinch or the location control.
      map.once("idle", () => add3dBuildings(map));
    };
    const onError = () => setMapError("Карта загружается нестабильно. Проверьте интернет или повторите позже.");
    map.on("load", onLoad);
    map.on("error", onError);

    return () => {
      [centerMarkerElRef, pickupMarkerElRef, destinationMarkerElRef, driverMarkerElRef].forEach(ref => {
        ref.current?.remove();
        ref.current = null;
      });
      driverMarkerPointRef.current = null;
      removeMissingPoiFallbacks();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return undefined;
    const clickHandler = event => {
      if (centerMarker) {
        centerUnderPicker(map, event.lngLat, 240);
        // `moveend` publishes the final centre. Calling reverse-geocoding
        // here as well caused a second request for the same tap and made the
        // sheet flicker between two loading states.
        return;
      }
      const onPick = onMapPickRef.current;
      if (!onPick) return;
      const preview = featurePreview(map, event.point);
      onPick({
        lat: Number(event.lngLat.lat.toFixed(6)),
        lng: Number(event.lngLat.lng.toFixed(6)),
        preview
      });
    };
    map.on("click", clickHandler);
    return () => map.off("click", clickHandler);
  }, [centerMarker]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !centerMarker || (!onCenterChangeRef.current && !onCenterChangingRef.current)) return undefined;
    let timer = 0;
    let fallbackTimer = 0;
    let lastPublishedCenter = "";
    const emitCenter = () => {
      const onChange = onCenterChangeRef.current;
      if (!onChange) return;
      window.clearTimeout(fallbackTimer);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        if (map.isMoving()) {
          // The recovery timer must not enable confirmation during a long
          // drag, kinetic pan or zoom animation. Wait for the camera to settle.
          fallbackTimer = window.setTimeout(emitCenter, 180);
          return;
        }
        const next = pickerCoordinate(map);
        // Both `moveend` and `zoomend` are emitted for a pinch. Emit exactly
        // one semantic address lookup for the resulting coordinate.
        const key = `${next.lat}:${next.lng}`;
        if (key === lastPublishedCenter) return;
        lastPublishedCenter = key;
        onChange(next);
      }, 180);
    };
    const markChanging = () => {
      // A new gesture must settle even when zooming leaves the centre
      // unchanged. Deduplication only applies to its paired end events.
      lastPublishedCenter = "";
      window.clearTimeout(timer);
      onCenterChangingRef.current?.();
      window.clearTimeout(fallbackTimer);
      fallbackTimer = window.setTimeout(emitCenter, 760);
    };
    map.on("movestart", markChanging);
    map.on("zoomstart", markChanging);
    map.on("moveend", emitCenter);
    map.on("zoomend", emitCenter);
    return () => {
      window.clearTimeout(timer);
      window.clearTimeout(fallbackTimer);
      map.off("movestart", markChanging);
      map.off("zoomstart", markChanging);
      map.off("moveend", emitCenter);
      map.off("zoomend", emitCenter);
    };
  }, [centerMarker]);

  useEffect(() => {
    const map = mapRef.current;
    if (map && mapReady && centerMarker) {
      // A new region or explicit GPS selection must move the map as well as
      // its label. Passive reverse results must not be passed as this centre.
      centerUnderPicker(map, centerPoint);
    }
  }, [mapReady, centerMarker, centerPoint.lat, centerPoint.lng]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const data = routeGeoJson(routePoints);
    if (!map.getSource("smarttaxi-route")) {
      map.addSource("smarttaxi-route", { type: "geojson", data });
      // Under the labels, like the buildings. Both route layers went on top
      // of the whole style before, so the blue line covered the street names
      // along the route — the one part of the map a rider following it is
      // actually trying to read.
      const beforeId = firstLabelLayerId(map);
      map.addLayer({
        id: "smarttaxi-route-shadow",
        type: "line",
        source: "smarttaxi-route",
        paint: {
          "line-color": "rgba(29, 111, 255, 0.18)",
          "line-width": 8,
          "line-blur": 3
        }
      }, beforeId);
      map.addLayer({
        id: "smarttaxi-route",
        type: "line",
        source: "smarttaxi-route",
        paint: {
          "line-color": "#1D6FFF",
          "line-width": 4,
          "line-opacity": 0.96
        }
      }, beforeId);
    } else {
      map.getSource("smarttaxi-route").setData(data);
    }
  }, [mapReady, routePoints.length, route]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    // Pickup/destination/center pins are placed once and repositioned in
    // place rather than torn down and recreated on every render — recreating
    // the driver pin on each GPS tick was the reason it used to jump instead
    // of glide (a fresh marker has no prior position to animate from).
    function syncStaticMarker(ref, point, anchor, buildElement) {
      if (!point) {
        ref.current?.remove();
        ref.current = null;
        return;
      }
      if (!ref.current) {
        ref.current = new maplibregl.Marker({ element: buildElement(), anchor })
          .setLngLat([point.lng, point.lat])
          .addTo(map);
      } else {
        ref.current.setLngLat([point.lng, point.lat]);
      }
    }

    const showCenterMarker = addressControls && !pickupPoint && !destinationPoint && !centerMarker;
    syncStaticMarker(centerMarkerElRef, showCenterMarker ? centerPoint : null, "bottom", smartTaxiMarkerElement);
    // The same approved blue square-and-tail pin represents both route
    // endpoints and the address-selection cursor. Its tail is the actual
    // geographic point, so MapLibre must anchor it from the bottom.
    syncStaticMarker(
      pickupMarkerElRef,
      pickupPoint,
      // The live-location glyph is a concentric dot, whose centre is the
      // coordinate. The approved address marker has a downward tail: anchor
      // that tail instead, otherwise every selected house is visibly shifted
      // north once the marker grows to its final square-and-tail design.
      pickup?.markerKind === "current-location" ? "center" : "bottom",
      pickup?.markerKind === "current-location" ? currentLocationMarkerElement : smartTaxiMarkerElement
    );
    syncStaticMarker(destinationMarkerElRef, destinationPoint, "bottom", finishFlagMarkerElement);

    if (!driverPoint) {
      driverMarkerElRef.current?.remove();
      driverMarkerElRef.current = null;
      driverMarkerPointRef.current = null;
    } else if (!driverMarkerElRef.current) {
      driverMarkerElRef.current = new maplibregl.Marker({ element: driverMarkerElement(), anchor: "center" })
        .setLngLat([driverPoint.lng, driverPoint.lat])
        .addTo(map);
      driverMarkerPointRef.current = driverPoint;
    } else {
      animateMarkerTo(driverMarkerElRef.current, driverMarkerPointRef.current, driverPoint);
      driverMarkerPointRef.current = driverPoint;
    }
  }, [mapReady, addressControls, centerMarker, pickupPoint?.lat, pickupPoint?.lng, destinationPoint?.lat, destinationPoint?.lng, driverPoint?.lat, driverPoint?.lng, centerPoint.lat, centerPoint.lng]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    if (centerMarker && !routePoints.length && !pickupPoint && !destinationPoint && !driverPoint) return;
    fitMap(map, routePoints.length ? routePoints : [pickupPoint, destinationPoint, driverPoint, centerPoint], compact);
  }, [mapReady, centerMarker, pickupPoint?.lat, pickupPoint?.lng, destinationPoint?.lat, destinationPoint?.lng, driverPoint?.lat, driverPoint?.lng, centerPoint.lat, centerPoint.lng, route, compact]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !containerRef.current) return undefined;
    const observer = new ResizeObserver(() => {
      map.resize();
      if (!centerMarker) {
        fitMap(map, routePoints.length ? routePoints : [pickupPoint, destinationPoint, driverPoint, centerPoint], compact);
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [mapReady, centerMarker, pickupPoint?.lat, pickupPoint?.lng, destinationPoint?.lat, destinationPoint?.lng, driverPoint?.lat, driverPoint?.lng, centerPoint.lat, centerPoint.lng, route, compact]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const timer = window.setTimeout(() => map.resize(), 180);
    return () => window.clearTimeout(timer);
  }, [expanded]);

  function zoom(delta) {
    const map = mapRef.current;
    if (!map) return;
    if (delta > 0) map.zoomIn({ duration: 220 });
    else map.zoomOut({ duration: 220 });
  }

  return (
    <section className={`map-view live-osm maplibre-view ${compact ? "compact" : ""} ${expanded ? "expanded-map" : ""} ${onMapPick ? "pickable" : ""} ${centerMarker ? "center-pick-mode" : ""}`}>
      <div ref={containerRef} className="maplibre-canvas-host" aria-label="Карта SmartTaxi" />
      <div className="map-vignette" />
      {centerMarker && (
        <div ref={pickerOverlayRef} className="smarttaxi-center-picker native-address-picker" aria-hidden="true">
          <span className="smarttaxi-map-marker" dangerouslySetInnerHTML={{ __html: approvedAddressMarkerMarkup }} />
        </div>
      )}
      {!mapReady && <div className="map-loading-chip">Загружаем карту...</div>}
      {addressControls ? (
        <div className="map-address-controls">
          <div className="map-zoom-stack" aria-label="Масштаб карты">
            <button type="button" aria-label="Приблизить карту" onClick={() => zoom(1)}>
              <img src="/ui/address-selection/icons/zoom_plus.svg" alt="" />
            </button>
            <i />
            <button type="button" aria-label="Отдалить карту" onClick={() => zoom(-1)}>
              <img src="/ui/address-selection/icons/zoom_minus.svg" alt="" />
            </button>
          </div>
          {onUseLocation && (
            <button type="button" className="map-address-locate" aria-label="Моё местоположение" onClick={onUseLocation}>
              <Icon name="pin" />
            </button>
          )}
        </div>
      ) : (
        <div className="map-controls">
          <button
            type="button"
            className="map-expand-button"
            aria-label={expanded ? "Свернуть карту" : "Развернуть карту"}
            onClick={() => setExpanded(value => !value)}
          >
            <Icon name={expanded ? "close" : "expand"} />
          </button>
          {onUseLocation && <button type="button" aria-label="Моё местоположение" onClick={onUseLocation}><Icon name="pin" /></button>}
          {onRetry && <button type="button" aria-label="Повторить загрузку карты" onClick={onRetry}><Icon name="search" /></button>}
        </div>
      )}
      {mapError && (
        <div className="map-error-chip">
          {mapError}
        </div>
      )}
      {status && <div className="map-badge">{status}</div>}
      <small className="map-attribution">{FALLBACK_ATTRIBUTION}</small>
    </section>
  );
}
