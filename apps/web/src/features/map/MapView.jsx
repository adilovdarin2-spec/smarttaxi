import React from "react";
import { Icon, VehicleIcon } from "../../core/icons.jsx";

export default function MapView({ pickup, destination, driver, status = "route", compact = false }) {
  const hasRoute = Boolean(destination);
  return (
    <section className={`map-view ${compact ? "compact" : ""}`}>
      <div className="osm-tiles" />
      <div className="map-vignette" />
      {pickup && <span className="map-marker pickup" style={{ left: "28%", top: "38%" }}>A</span>}
      {destination && <span className="map-marker destination" style={{ left: "67%", top: "24%" }}>B</span>}
      {driver && <span className="car-marker" style={{ left: "48%", top: "58%" }}><VehicleIcon /></span>}
      {hasRoute && (
        <svg className="route-svg" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          <path d={driver ? "M48 58 C45 48 39 43 28 38" : "M28 38 C40 48 50 50 58 42 S65 31 67 24"} />
        </svg>
      )}
      <div className="map-controls">
        <button type="button" aria-label="Моё местоположение"><Icon name="pin" /></button>
        <button type="button" aria-label="Масштаб"><Icon name="plus" /></button>
      </div>
      {status && <div className="map-badge">{status}</div>}
    </section>
  );
}
