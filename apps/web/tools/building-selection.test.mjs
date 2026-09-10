import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeBuildingGeometry, pointInBuilding, buildingAtPoint, distanceToBuildingMeters } from '../../../packages/shared/src/building-selection.js';

// An L-shaped building with a courtyard: both differ from its bounding box.
const outline = [[68,40],[68.003,40],[68.003,40.001],[68.001,40.001],[68.001,40.003],[68,40.003],[68,40]];
const hole = [[68.0002,40.0002],[68.0008,40.0002],[68.0008,40.0008],[68.0002,40.0008],[68.0002,40.0002]];
const geometry = { type: 'Polygon', coordinates: [outline, hole] };
test('selected building excludes its bounding-box notch and courtyard', () => {
  assert(pointInBuilding({lat:40.002,lng:68.0005}, geometry));
  assert(!pointInBuilding({lat:40.002,lng:68.002}, geometry));
  assert(!pointInBuilding({lat:40.0005,lng:68.0005}, geometry));
  assert(pointInBuilding({lat:40.002,lng:68}, geometry), 'outer wall belongs to the footprint');
  assert.deepEqual(buildingAtPoint([{geometry}], {lat:40.002,lng:68.0005}), geometry);
});
test('only bounded, finite, closed polygon geometry is accepted', () => {
  assert.deepEqual(normalizeBuildingGeometry(geometry), geometry);
  for (const malformed of [null, {type:'Point',coordinates:[68,40]},
    {type:'Polygon',coordinates:[outline.slice(0,-1)]},
    {type:'Polygon',coordinates:[[[Infinity,40],[68,40],[68,40.1],[Infinity,40]]]}]) {
    assert.equal(normalizeBuildingGeometry(malformed), null);
  }
  const multi = {type:'MultiPolygon',coordinates:[geometry.coordinates]};
  assert(pointInBuilding({lat:40.002,lng:68.0005}, normalizeBuildingGeometry(multi)));
});

test('a tile merged MultiPolygon selects one building, not all its houses', () => {
  const other = [[[69,41],[69.001,41],[69.001,41.001],[69,41.001],[69,41]]];
  const merged = {type:'MultiPolygon',coordinates:[...Array(100).fill(other),geometry.coordinates]};
  assert.equal(normalizeBuildingGeometry(merged), null, 'the whole tile is too large for a selection');
  assert.deepEqual(buildingAtPoint([{geometry:merged}], {lat:40.002,lng:68.0005}), geometry);
});

test('distance to a footprint distinguishes a simplified edge from a neighbouring house', () => {
  assert.equal(distanceToBuildingMeters({lat:40.002,lng:68.0005}, geometry), 0);
  const justOutside = distanceToBuildingMeters({lat:40.002,lng:67.99996}, geometry);
  const neighbour = distanceToBuildingMeters({lat:40.002,lng:67.9998}, geometry);
  assert(justOutside > 3 && justOutside < 4, 'a four-degree-decimal tile gap is only a few metres');
  assert(neighbour > 16, 'a separate address across the yard stays well outside the tolerance');
});
