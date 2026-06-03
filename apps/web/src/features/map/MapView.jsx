import React, { useMemo } from "react";
import { Icon, VehicleIcon } from "../../core/icons.jsx";

const DEFAULT_CENTER = { lat: 42.314696, lng: 69.588328 };
const DEFAULT_ZOOM = 14;

function validPoint(point) {
  const lat = Number(point?.lat);
  const lng = Number(point?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

function routeCoordinates(route) {
  const coordinates = route?.geometry?.coordinates;
  if (!Array.isArray(coordinates)) return [];
  return coordinates
    .map(item => Array.isArray(item) && item.length >= 2 ? { lng: Number(item[0]), lat: Number(item[1]) } : null)
    .filter(point => point && Number.isFinite(point.lat) && Number.isFinite(point.lng));
}

function lonToTileX(lng, zoom) {
  return ((lng + 180) / 360) * (2 ** zoom);
}

function latToTileY(lat, zoom) {
  const radians = (lat * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(radians) + (1 / Math.cos(radians))) / Math.PI) / 2) * (2 ** zoom);
}

function buildTileWindow(points, center, zoom) {
  const source = points.filter(Boolean);
  if (!source.length) source.push(center);
  const projected = source.map(point => ({
    x: lonToTileX(point.lng, zoom),
    y: latToTileY(point.lat, zoom)
  }));
  const minPointX = Math.min(...projected.map(point => point.x));
  const maxPointX = Math.max(...projected.map(point => point.x));
  const minPointY = Math.min(...projected.map(point => point.y));
  const maxPointY = Math.max(...projected.map(point => point.y));
  const centerX = (minPointX + maxPointX) / 2;
  const centerY = (minPointY + maxPointY) / 2;
  const spanX = Math.max(3.4, (maxPointX - minPointX) + 1.1);
  const spanY = Math.max(4.25, (maxPointY - minPointY) + 1.25);
  return {
    zoom,
    minX: centerX - spanX / 2,
    minY: centerY - spanY / 2,
    spanX,
    spanY
  };
}

function buildTiles(window) {
  const maxIndex = 2 ** window.zoom;
  const fromX = Math.floor(window.minX);
  const toX = Math.ceil(window.minX + window.spanX);
  const fromY = Math.floor(window.minY);
  const toY = Math.ceil(window.minY + window.spanY);
  const tiles = [];
  for (let x = fromX; x <= toX; x += 1) {
    for (let y = fromY; y <= toY; y += 1) {
      if (y < 0 || y >= maxIndex) continue;
      const wrappedX = ((x % maxIndex) + maxIndex) % maxIndex;
      tiles.push({
        key: `${window.zoom}-${wrappedX}-${y}`,
        src: `https://tile.openstreetmap.org/${window.zoom}/${wrappedX}/${y}.png`,
        left: `${((x - window.minX) / window.spanX) * 100}%`,
        top: `${((y - window.minY) / window.spanY) * 100}%`,
        width: `${100 / window.spanX}%`,
        height: `${100 / window.spanY}%`
      });
    }
  }
  return tiles;
}

function projectOnTiles(point, window) {
  if (!point) return null;
  const left = ((lonToTileX(point.lng, window.zoom) - window.minX) / window.spanX) * 100;
  const top = ((latToTileY(point.lat, window.zoom) - window.minY) / window.spanY) * 100;
  return {
    left: `${Math.min(96, Math.max(4, left))}%`,
    top: `${Math.min(96, Math.max(4, top))}%`
  };
}

function projectedPath(points, window) {
  if (points.length < 2) return "";
  return points
    .map((point, index) => {
      const projected = projectOnTiles(point, window);
      const x = Number.parseFloat(projected.left);
      const y = Number.parseFloat(projected.top);
      return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");
}

export default function MapView({
  pickup,
  destination,
  driver,
  route,
  center,
  status = "",
  compact = false,
  onUseLocation,
  onRetry
}) {
  const pickupPoint = validPoint(pickup);
  const destinationPoint = validPoint(destination);
  const driverPoint = validPoint(driver);
  const centerPoint = validPoint(center) || pickupPoint || destinationPoint || DEFAULT_CENTER;
  const routePoints = routeCoordinates(route);
  const tileWindow = useMemo(
    () => buildTileWindow([pickupPoint, destinationPoint, driverPoint, ...routePoints], centerPoint, compact ? 13 : DEFAULT_ZOOM),
    [pickupPoint?.lat, pickupPoint?.lng, destinationPoint?.lat, destinationPoint?.lng, driverPoint?.lat, driverPoint?.lng, routePoints.length, centerPoint.lat, centerPoint.lng, compact]
  );
  const tiles = useMemo(
    () => buildTiles(tileWindow),
    [tileWindow.minX, tileWindow.minY, tileWindow.spanX, tileWindow.spanY, tileWindow.zoom]
  );
  const path = projectedPath(routePoints, tileWindow);

  return (
    <section className={`map-view live-osm ${compact ? "compact" : ""}`}>
      <div className="map-tile-layer" aria-label="Карта SmartTaxi">
        {tiles.map(tile => (
          <img
            key={tile.key}
            src={tile.src}
            alt=""
            loading="eager"
            referrerPolicy="no-referrer"
            style={{ left: tile.left, top: tile.top, width: tile.width, height: tile.height }}
          />
        ))}
      </div>
      <div className="map-vignette" />
      {path && (
        <svg className="route-svg" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          <path d={path} />
        </svg>
      )}
      {pickupPoint && <span className="map-marker pickup" style={projectOnTiles(pickupPoint, tileWindow)}>A</span>}
      {destinationPoint && <span className="map-marker destination" style={projectOnTiles(destinationPoint, tileWindow)}>B</span>}
      {driverPoint && <span className="car-marker" style={projectOnTiles(driverPoint, tileWindow)}><VehicleIcon /></span>}
      <div className="map-controls">
        {onUseLocation && <button type="button" aria-label="Моё местоположение" onClick={onUseLocation}><Icon name="pin" /></button>}
        {onRetry && <button type="button" aria-label="Повторить загрузку карты" onClick={onRetry}><Icon name="search" /></button>}
      </div>
      {status && <div className="map-badge">{status}</div>}
      <small className="map-attribution">© OpenStreetMap</small>
    </section>
  );
}
