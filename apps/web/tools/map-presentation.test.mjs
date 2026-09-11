import assert from 'node:assert/strict';
import test from 'node:test';
import { libertyPaintForLayer, applyLibertyPresentation, hideDuplicateBuildings } from '../src/features/map/mapPresentation.mjs';

test('Liberty colors retain road geometry, widths, arrows and labels', () => {
  for (const id of ['background', 'water', 'building', 'landuse_residential', 'park', 'landuse_school', 'road_minor', 'bridge_trunk_primary', 'tunnel_motorway_casing', 'waterway_river', 'label_city', 'poi_r1']) {
    const paint = libertyPaintForLayer(id);
    assert(paint);
    assert(Object.keys(paint).every(key => key.endsWith('color') || key === 'text-halo-width'));
  }
  for (const id of ['smarttaxi-route', 'road_one_way_arrow', 'road_major_rail', 'road_shield_us', 'waterway_line_label', 'custom-layer']) assert.equal(libertyPaintForLayer(id), null);
  assert.equal(libertyPaintForLayer('road_minor_casing')['line-color'], '#d2deed');
  assert.equal(libertyPaintForLayer('road_minor')['line-color'], '#ffffff');
  assert.equal(libertyPaintForLayer('water')['fill-color'], '#b9d8f5');
  assert.equal(libertyPaintForLayer('label_city')['text-color'], '#50627a');
});

test('Custom styles are not recolored by a matching background id alone', () => {
  applyLibertyPresentation({ getStyle: () => ({layers: [{id: 'background'}]}), setPaintProperty: () => assert.fail('custom provider mutation') });
});

test('Duplicate extrusion is hidden only after its replacement exists', () => {
  const layers = [
    {id: 'building-3d', type: 'fill-extrusion', source: 'tiles', 'source-layer': 'building'},
    {id: 'other-volume', type: 'fill-extrusion', source: 'tiles', 'source-layer': 'other'},
    {id: 'smarttaxi-3d-buildings', type: 'fill-extrusion', source: 'tiles', 'source-layer': 'building'},
  ];
  const changes = [];
  const map = { getStyle: () => ({layers}), getLayer: () => assert.fail('Runtime StyleLayer is not a style-spec object'), setLayoutProperty: (...args) => changes.push(args) };
  hideDuplicateBuildings(map, 'absent');
  assert.equal(changes.length, 0);
  hideDuplicateBuildings(map, 'smarttaxi-3d-buildings');
  assert.deepEqual(changes, [['building-3d', 'visibility', 'none']]);
});
