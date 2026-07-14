import React, { useEffect, useMemo, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { Icon } from "../../core/icons.jsx";

const DEFAULT_CENTER = { lat: 40.844435, lng: 68.509021 };
const DEFAULT_ZOOM = 15;
const OSM_TILE_URL = import.meta.env.VITE_OSM_TILE_URL || "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const MAPTILER_KEY = import.meta.env.VITE_MAPTILER_API_KEY || "";
const MAPTILER_STYLE_URL = import.meta.env.VITE_MAPTILER_STYLE_URL || "";
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
  return {
    version: 8,
    sources: {
      osm: {
        type: "raster",
        tiles: [OSM_TILE_URL],
        tileSize: 256,
        attribution: FALLBACK_ATTRIBUTION
      }
    },
    layers: [
      {
        id: "osm",
        type: "raster",
        source: "osm",
        paint: {
          "raster-saturation": -0.08,
          "raster-contrast": 0.04,
          "raster-brightness-min": 0.08,
          "raster-brightness-max": 0.98
        }
      }
    ]
  };
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

function markerElement(type) {
  const element = document.createElement("span");
  element.className = `map-marker ${type} ${type}-marker`;
  const image = document.createElement("img");
  image.alt = "";
  image.decoding = "async";
  image.loading = "eager";
  if (type === "pickup") {
    image.src = "/map/user_location_marker_cropped.png";
    element.setAttribute("aria-label", "Точка подачи");
  } else if (type === "driver") {
    element.className = "car-marker maplibre-car-marker";
    element.setAttribute("aria-label", "Водитель");
    element.innerHTML = `<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M10 28l4.1-10.3A6 6 0 0 1 19.7 14h8.6a6 6 0 0 1 5.6 3.7L38 28v8a2 2 0 0 1-2 2h-2.7a4.5 4.5 0 0 1-8.6 0h-9.4a4.5 4.5 0 0 1-8.6 0H4a2 2 0 0 1-2-2v-4a4 4 0 0 1 4-4h4Zm7.8-8-2.4 6h17.2l-2.4-6a2 2 0 0 0-1.9-1.3h-8.6a2 2 0 0 0-1.9 1.3Z" fill="currentColor"/></svg>`;
    return element;
  } else {
    element.setAttribute("aria-label", "Точка назначения");
    element.innerHTML = `<svg viewBox="0 0 44 54" aria-hidden="true">
      <defs>
        <linearGradient id="destinationMarkerBlue" x1="8" y1="4" x2="36" y2="42" gradientUnits="userSpaceOnUse">
          <stop stop-color="#63A0FF"/>
          <stop offset="1" stop-color="#0B4FD1"/>
        </linearGradient>
      </defs>
      <path d="M22 51s17-16.4 17-30.2C39 10.7 31.4 3 22 3S5 10.7 5 20.8C5 34.6 22 51 22 51Z" fill="url(#destinationMarkerBlue)" stroke="#fff" stroke-width="3"/>
      <circle cx="22" cy="20.5" r="7" fill="#fff"/>
      <circle cx="22" cy="20.5" r="3.5" fill="#1D6FFF"/>
    </svg>`;
    return element;
  }
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

function smartTaxiMarkerElement() {
  const element = document.createElement("span");
  element.className = "smarttaxi-map-marker";
  element.setAttribute("aria-label", "Точка на карте SmartTaxi");
  const image = document.createElement("img");
  image.src = "/ui/auth-clean-photo/svg/brand/smarttaxi_s_mark.svg";
  image.alt = "";
  image.decoding = "async";
  image.loading = "eager";
  element.appendChild(image);
  const dot = document.createElement("i");
  dot.setAttribute("aria-hidden", "true");
  element.appendChild(dot);
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
      padding: compact ? 52 : { top: 90, right: 46, bottom: 110, left: 46 },
      maxZoom: 16,
      duration: 650
    });
    return;
  }
  if (valid[0]) {
    map.easeTo({ center: [valid[0].lng, valid[0].lat], zoom: compact ? 14 : DEFAULT_ZOOM, duration: 550 });
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
  const mapRef = useRef(null);
  const centerMarkerElRef = useRef(null);
  const pickupMarkerElRef = useRef(null);
  const destinationMarkerElRef = useRef(null);
  const driverMarkerElRef = useRef(null);
  const driverMarkerPointRef = useRef(null);
  const onCenterChangeRef = useRef(onCenterChange);
  const onCenterChangingRef = useRef(onCenterChanging);
  const [expanded, setExpanded] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState("");

  const pickupPoint = validPoint(pickup);
  const destinationPoint = validPoint(destination);
  const driverPoint = validPoint(driver);
  const centerPoint = validPoint(center) || pickupPoint || destinationPoint || DEFAULT_CENTER;
  const routePoints = routeCoordinates(route);
  const style = useMemo(() => mapStyle(), []);

  useEffect(() => {
    onCenterChangeRef.current = onCenterChange;
    onCenterChangingRef.current = onCenterChanging;
  }, [onCenterChange, onCenterChanging]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return undefined;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style,
      center: [centerPoint.lng, centerPoint.lat],
      zoom: compact ? 14 : DEFAULT_ZOOM,
      attributionControl: false,
      logoPosition: "bottom-left",
      dragRotate: false,
      pitchWithRotate: false
    });
    mapRef.current = map;
    map.touchZoomRotate.disableRotation();

    const onLoad = () => {
      setMapReady(true);
      setMapError("");
      map.resize();
      fitMap(map, routePoints.length ? routePoints : [pickupPoint, destinationPoint, driverPoint, centerPoint], compact);
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
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return undefined;
    const clickHandler = event => {
      if (centerMarker) {
        map.easeTo({ center: [event.lngLat.lng, event.lngLat.lat], duration: 240 });
      }
      if (!onMapPick) return;
      const preview = featurePreview(map, event.point);
      onMapPick({
        lat: Number(event.lngLat.lat.toFixed(6)),
        lng: Number(event.lngLat.lng.toFixed(6)),
        preview
      });
    };
    map.on("click", clickHandler);
    return () => map.off("click", clickHandler);
  }, [centerMarker, onMapPick]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !centerMarker || (!onCenterChangeRef.current && !onCenterChangingRef.current)) return undefined;
    let timer = 0;
    let fallbackTimer = 0;
    const emitCenter = () => {
      const onChange = onCenterChangeRef.current;
      if (!onChange) return;
      window.clearTimeout(fallbackTimer);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        const centerNow = map.getCenter();
        onChange({
          lat: Number(centerNow.lat.toFixed(6)),
          lng: Number(centerNow.lng.toFixed(6))
        });
      }, 120);
    };
    const markChanging = () => {
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
    if (!map || !mapReady) return;
    const data = routeGeoJson(routePoints);
    if (!map.getSource("smarttaxi-route")) {
      map.addSource("smarttaxi-route", { type: "geojson", data });
      map.addLayer({
        id: "smarttaxi-route-shadow",
        type: "line",
        source: "smarttaxi-route",
        paint: {
          "line-color": "rgba(29, 111, 255, 0.18)",
          "line-width": 8,
          "line-blur": 3
        }
      });
      map.addLayer({
        id: "smarttaxi-route",
        type: "line",
        source: "smarttaxi-route",
        paint: {
          "line-color": "#1D6FFF",
          "line-width": 4,
          "line-opacity": 0.96
        }
      });
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
    syncStaticMarker(pickupMarkerElRef, pickupPoint, "center", () => markerElement("pickup"));
    syncStaticMarker(destinationMarkerElRef, destinationPoint, "bottom", () => markerElement("destination"));

    if (!driverPoint) {
      driverMarkerElRef.current?.remove();
      driverMarkerElRef.current = null;
      driverMarkerPointRef.current = null;
    } else if (!driverMarkerElRef.current) {
      driverMarkerElRef.current = new maplibregl.Marker({ element: markerElement("driver"), anchor: "center" })
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
  }, [mapReady, centerMarker, pickupPoint?.lat, pickupPoint?.lng, destinationPoint?.lat, destinationPoint?.lng, driverPoint?.lat, driverPoint?.lng, centerPoint.lat, centerPoint.lng, routePoints.length, compact]);

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
        <div className="smarttaxi-center-picker" aria-hidden="true">
          <span><img src="/ui/auth-clean-photo/svg/brand/smarttaxi_s_mark.svg" alt="" /></span>
          <i />
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
