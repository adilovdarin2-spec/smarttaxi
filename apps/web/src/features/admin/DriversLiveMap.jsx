import React, { useEffect, useMemo, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

// A separate, admin-only map component rather than reusing
// features/map/MapView.jsx — that component is built around exactly one
// driver marker (order tracking), and retrofitting it for an arbitrary,
// changing set of markers risked regressing the passenger/driver apps'
// live order tracking for a feature that only needed a handful of the
// same building blocks (tile style, marker element, fit-bounds).
const DEFAULT_CENTER = { lat: 40.844435, lng: 68.509021 };
const OSM_TILE_URL = import.meta.env.VITE_OSM_TILE_URL || "https://tile.openstreetmap.org/{z}/{x}/{y}.png";

function mapStyle() {
  return {
    version: 8,
    sources: {
      osm: {
        type: "raster",
        tiles: [OSM_TILE_URL],
        tileSize: 256,
        attribution: "© OpenStreetMap contributors"
      }
    },
    layers: [{ id: "osm", type: "raster", source: "osm" }]
  };
}

function driverMarkerElement(driver) {
  const element = document.createElement("div");
  element.className = `admin-map-driver-marker ${driver.status === "BUSY" ? "busy" : "free"}`;
  element.title = `${driver.name} · ${driver.status === "BUSY" ? "Занят" : "Свободен"}`;
  return element;
}

export default function DriversLiveMap({ drivers }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef(new Map());
  const hasFittedRef = useRef(false);
  const [mapReady, setMapReady] = useState(false);
  const style = useMemo(() => mapStyle(), []);

  const points = drivers
    .map(driver => ({
      id: driver.id,
      lat: Number(driver.lat),
      lng: Number(driver.lng),
      driver
    }))
    .filter(point => Number.isFinite(point.lat) && Number.isFinite(point.lng));

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return undefined;
    const center = points[0] || DEFAULT_CENTER;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style,
      center: [center.lng, center.lat],
      zoom: 12,
      attributionControl: false
    });
    mapRef.current = map;
    map.on("load", () => {
      setMapReady(true);
      map.resize();
    });
    return () => {
      markersRef.current.forEach(marker => marker.remove());
      markersRef.current.clear();
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const seen = new Set();
    points.forEach(point => {
      seen.add(point.id);
      const existing = markersRef.current.get(point.id);
      if (existing) {
        existing.setLngLat([point.lng, point.lat]);
      } else {
        const marker = new maplibregl.Marker({ element: driverMarkerElement(point.driver) })
          .setLngLat([point.lng, point.lat])
          .addTo(map);
        markersRef.current.set(point.id, marker);
      }
    });
    markersRef.current.forEach((marker, id) => {
      if (!seen.has(id)) {
        marker.remove();
        markersRef.current.delete(id);
      }
    });
    // Only auto-fit the camera the first time real driver positions show
    // up, not on every 15s poll -- `points` is a fresh array every render
    // (recomputed from the `drivers` prop, itself a fresh array every
    // poll tick), so this effect used to re-run fitBounds/easeTo on every
    // single refresh regardless of whether anything moved. A dispatcher
    // who manually pans/zooms to watch one area was getting forcibly
    // re-centered/re-zoomed every 15 seconds, defeating the point of a
    // dispatcher tool they can navigate themselves. Marker positions above
    // still update live every poll either way.
    if (!hasFittedRef.current && points.length > 0) {
      hasFittedRef.current = true;
      if (points.length > 1) {
        const bounds = points.reduce(
          (acc, point) => acc.extend([point.lng, point.lat]),
          new maplibregl.LngLatBounds([points[0].lng, points[0].lat], [points[0].lng, points[0].lat])
        );
        map.fitBounds(bounds, { padding: 60, maxZoom: 15, duration: 500 });
      } else {
        map.easeTo({ center: [points[0].lng, points[0].lat], zoom: 13, duration: 400 });
      }
    }
  }, [mapReady, points]);

  return (
    <div className="admin-live-map-wrap">
      <div ref={containerRef} className="admin-live-map-canvas" aria-label="Карта водителей на линии" />
      {!mapReady && <div className="admin-live-map-loading">Загружаем карту...</div>}
      <div className="admin-live-map-legend">
        <span><i className="admin-live-map-dot free" /> Свободен</span>
        <span><i className="admin-live-map-dot busy" /> Занят</span>
      </div>
    </div>
  );
}
