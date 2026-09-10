# SmartTaxi web post-refresh visual pass — 2026-09-10

## Scope

Live browser regression against the rebuilt local Docker web at
`http://127.0.0.1:5175` and development API at `http://127.0.0.1:4001` after
the compatible React/runtime dependency refresh. No production account,
payment, SMS or order creation was used.

## Verified flow

- Driver offline home and driver account directory render correctly in the
  narrow application frame, with the account returned to driver mode afterward.
- Driver → passenger mode switch retained the local test account and opened the
  passenger map/home without a stale driver screen.
- Passenger pickup search returned the real local POI `Базар Атакент`.
- The unresolved query `Абая 12` returned zero results instead of inventing a
  house/address that is absent from the available registry.
- Destination selection used the real POI `Районная больница «Атакент»`.
- The server route rendered as a road-shaped blue line with the address marker
  and finish flag above the map scene. Visible route summary: 3 minutes,
  0.4 kilometres.
- Tariff selection rendered both enabled products with KZT pricing: Economy
  700 ₸ and Delivery 800 ₸. Price controls, cash method and the primary order
  action remained aligned and readable; no order was submitted.
- Returning to driver mode restored the offline driver home without stale
  passenger data.

## Map presentation

The live fallback style used actual OpenStreetMap/OpenMapTiles building
footprints. Low/unmeasured houses stayed as calm plan-view polygons rather than
fabricated identical 3D boxes. Measured extrusions and the route are inserted
below the first text-symbol layer, while address/current-location/car/finish
markers remain above the map scene. Street and city labels stayed readable.

The open driver tab briefly displayed `Failed to fetch` while its previous
bundle was alive during the intentional Docker container replacement. A normal
reload loaded the new immutable bundle and the message did not recur. This is
the expected deploy-boundary recovery path, not a persistent runtime failure.
