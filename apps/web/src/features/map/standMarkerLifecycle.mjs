// The registry stores { marker }, not raw MapLibre Marker instances.
export function clearStandMarkers(registry) {
  for (const { marker } of registry.values()) marker.remove();
  registry.clear();
}
