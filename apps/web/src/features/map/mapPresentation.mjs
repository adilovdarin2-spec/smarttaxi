// Shared art direction with Flutter core/utils/map_layers.dart. These are
// paint-only changes: preserve route/road geometry, widths and label ordering.
export function libertyPaintForLayer(id) {
  if (id === 'background') return { 'background-color': '#f4f7fb' };
  if (id === 'water') return { 'fill-color': '#c4ddf7' };
  if (id === 'building') return { 'fill-color': '#e4ebf6', 'fill-outline-color': '#d6dfec' };
  if (id === 'landuse_residential') return { 'fill-color': '#eef2f7' };
  if (['park', 'landcover_wood', 'landcover_grass', 'landuse_pitch', 'landuse_track', 'landuse_cemetery'].includes(id)) return { 'fill-color': '#dcebe3' };
  if (['landuse_hospital', 'landuse_school', 'landcover_sand', 'aeroway_fill'].includes(id)) return { 'fill-color': '#edf0f6' };
  if (id.startsWith('waterway_') && !id.includes('label')) return { 'line-color': '#b8d4f0' };
  if (/^(road|tunnel|bridge)_/.test(id) && !/rail|arrow|shield|area/.test(id)) {
    return { 'line-color': id.endsWith('_casing') ? '#d9e2ef' : /motorway|trunk/.test(id) ? '#eef4fc' : '#ffffff' };
  }
  if (id.startsWith('label_') || id.startsWith('highway-name-') || id.startsWith('poi_')) {
    return { 'text-color': '#64748b', 'text-halo-color': '#ffffff', 'text-halo-width': 1.2 };
  }
  return null;
}

export function applyLibertyPresentation(map) {
  const layers = map.getStyle()?.layers || [];
  const ids = new Set(layers.map(layer => layer.id));
  if (!['landuse_residential', 'road_one_way_arrow', 'building-3d'].every(id => ids.has(id))) return;
  for (const layer of layers) {
    for (const [key, value] of Object.entries(libertyPaintForLayer(layer.id) || {})) {
      try { map.setPaintProperty(layer.id, key, value); } catch { /* optional provider paint */ }
    }
  }
}

export function hideDuplicateBuildings(map, replacementId) {
  // getLayer returns a runtime StyleLayer (sourceLayer), not the serialized
  // style-spec object (source-layer). Compare like-for-like from getStyle.
  const layers = map.getStyle()?.layers || [];
  const replacement = layers.find(layer => layer.id === replacementId);
  if (!replacement) return;
  for (const layer of layers) {
    if (layer.id !== replacementId && layer.type === 'fill-extrusion' &&
        layer.source === replacement.source && layer['source-layer'] === replacement['source-layer']) {
      map.setLayoutProperty(layer.id, 'visibility', 'none');
    }
  }
}
