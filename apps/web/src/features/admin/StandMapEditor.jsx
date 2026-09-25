import React, { useEffect, useMemo, useRef, useState } from "react";
import { maplibregl } from "../map/mapRuntime.js";
import { circlePolygon, featureCollection } from "./standGeometry.mjs";

// A stand is a place, so it is chosen as a place: drop the pin where the cars
// actually stand and drag the edge out until the circle covers the line. The
// two numbers the API stores (point, radius) are never typed — they are read
// back off the map, which is also exactly what the driver's phone is checked
// against when they take a place in the queue.
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

function pinElement(kind, active) {
  const element = document.createElement("div");
  element.className = `stand-map-pin ${kind === "INTERCITY" ? "intercity" : "city"}${active ? " editing" : ""}`;
  return element;
}

export default function StandMapEditor({
  center,
  draft,
  otherStands = [],
  onMove,
  onRadiusChange,
  disabled = false
}) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const otherMarkersRef = useRef(new Map());
  const [ready, setReady] = useState(false);
  const style = useMemo(() => mapStyle(), []);
  // The drag handler is registered once on the marker, but must always call
  // the latest onMove — a ref keeps it current without re-creating the marker
  // (which would drop the drag mid-gesture).
  const onMoveRef = useRef(onMove);
  onMoveRef.current = onMove;

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return undefined;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style,
      center: [center.lng, center.lat],
      zoom: 14,
      attributionControl: false
    });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    map.on("load", () => {
      map.addSource("stand-radius", { type: "geojson", data: featureCollection([]) });
      map.addLayer({
        id: "stand-radius-fill",
        type: "fill",
        source: "stand-radius",
        paint: { "fill-color": "#2563eb", "fill-opacity": 0.16 }
      });
      map.addLayer({
        id: "stand-radius-line",
        type: "line",
        source: "stand-radius",
        paint: { "line-color": "#1d4ed8", "line-width": 2 }
      });
      map.addSource("stand-others", { type: "geojson", data: featureCollection([]) });
      map.addLayer({
        id: "stand-others-fill",
        type: "fill",
        source: "stand-others",
        paint: { "fill-color": "#64748b", "fill-opacity": 0.1 }
      });
      map.addLayer({
        id: "stand-others-line",
        type: "line",
        source: "stand-others",
        paint: { "line-color": "#64748b", "line-width": 1, "line-dasharray": [2, 2] }
      });
      setReady(true);
      map.resize();
    });
    return () => {
      otherMarkersRef.current.forEach((marker) => marker.remove());
      otherMarkersRef.current.clear();
      markerRef.current?.remove();
      markerRef.current = null;
      map.remove();
      mapRef.current = null;
      setReady(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Tapping the map is the primary way to place a stand; dragging the pin is
  // the way to nudge it. Both end at the same callback.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return undefined;
    const handler = (event) => {
      if (disabled) return;
      onMoveRef.current?.({ lat: Number(event.lngLat.lat.toFixed(6)), lng: Number(event.lngLat.lng.toFixed(6)) });
    };
    map.on("click", handler);
    return () => map.off("click", handler);
  }, [ready, disabled]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    if (!draft?.lat || !draft?.lng) {
      map.getSource("stand-radius")?.setData(featureCollection([]));
      markerRef.current?.remove();
      markerRef.current = null;
      return;
    }
    const point = { lat: Number(draft.lat), lng: Number(draft.lng), radiusM: Number(draft.radiusM || 120) };
    map.getSource("stand-radius")?.setData(featureCollection([circlePolygon(point)]));
    if (!markerRef.current) {
      const marker = new maplibregl.Marker({ element: pinElement(draft.kind, true), draggable: !disabled })
        .setLngLat([point.lng, point.lat])
        .addTo(map);
      marker.on("dragend", () => {
        const position = marker.getLngLat();
        onMoveRef.current?.({
          lat: Number(position.lat.toFixed(6)),
          lng: Number(position.lng.toFixed(6))
        });
      });
      markerRef.current = marker;
    } else {
      markerRef.current.setLngLat([point.lng, point.lat]);
      markerRef.current.setDraggable(!disabled);
    }
  }, [ready, draft?.lat, draft?.lng, draft?.radiusM, draft?.kind, disabled]);

  // Every other stand in the region stays visible as a dashed circle, so two
  // stands are never accidentally drawn on top of each other.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const visible = otherStands.filter((stand) => Number.isFinite(Number(stand.lat)));
    map.getSource("stand-others")?.setData(featureCollection(visible.map((stand) => circlePolygon({
      lat: Number(stand.lat),
      lng: Number(stand.lng),
      radiusM: Number(stand.radiusM)
    }))));
    const seen = new Set();
    visible.forEach((stand) => {
      seen.add(stand.id);
      const existing = otherMarkersRef.current.get(stand.id);
      if (existing) {
        existing.setLngLat([Number(stand.lng), Number(stand.lat)]);
        return;
      }
      const marker = new maplibregl.Marker({ element: pinElement(stand.kind, false) })
        .setLngLat([Number(stand.lng), Number(stand.lat)])
        .setPopup(new maplibregl.Popup({ offset: 18 }).setText(`${stand.name} · ${stand.radiusM} м`))
        .addTo(map);
      otherMarkersRef.current.set(stand.id, marker);
    });
    otherMarkersRef.current.forEach((marker, id) => {
      if (!seen.has(id)) {
        marker.remove();
        otherMarkersRef.current.delete(id);
      }
    });
  }, [ready, otherStands]);

  // Recentre when the owner switches region or opens an existing stand, but
  // never while they are dragging the radius slider.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !center) return;
    map.easeTo({ center: [center.lng, center.lat], duration: 400 });
  }, [ready, center?.lat, center?.lng]);

  return (
    <div className="stand-map-wrap">
      <div ref={containerRef} className="stand-map-canvas" aria-label="Карта для выбора места стоянки" />
      {!ready && <div className="stand-map-loading">Загружаем карту…</div>}
      {ready && (
        <div className="stand-map-hint">
          {draft?.lat
            ? "Перетащите метку или нажмите на карту, чтобы переставить стоянку"
            : "Нажмите на карту, чтобы поставить стоянку"}
        </div>
      )}
      {draft?.lat && (
        <div className="stand-map-radius">
          <label htmlFor="stand-radius-input">Радиус стоянки</label>
          <input
            id="stand-radius-input"
            type="range"
            min="20"
            max="600"
            step="10"
            value={Number(draft.radiusM || 120)}
            disabled={disabled}
            onChange={(event) => onRadiusChange?.(Number(event.target.value))}
          />
          <output>{Number(draft.radiusM || 120)} м</output>
        </div>
      )}
    </div>
  );
}
