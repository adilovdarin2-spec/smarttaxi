# Building geometry coverage — 2026-09-07

## Current delivery

The mobile and web maps render the building polygons and `render_height` /
`height` attributes supplied by the active OpenFreeMap/OpenMapTiles vector
source.  SmartTaxi does not replace a missing height with a uniform artificial
box.  MapLibre's vertical extrusion gradient is enabled so actual roof and
facade surfaces remain distinguishable at a pitched navigation camera.

The building layer stays below street, city and POI labels; route style layers
also stay below labels, while address, destination, location and vehicle
markers remain above buildings.

## External data limit

OpenStreetMap/OpenMapTiles generally provides a real footprint and, where
mapped, an approximate building height or level count.  It does not provide
licensed architectural models, roof meshes, facade textures, or verified
height data for every house in every operating region.  Therefore the product
can truthfully show source-backed 2.5D footprints, but cannot promise an exact
visual model of every physical building without a separately licensed and
authorised 3D geodata source.

No unlicensed imagery, third-party 3D models, or fabricated geometry is used
as a substitute.  Supplying such a source is an external data/licensing
decision, not an app-code task.
