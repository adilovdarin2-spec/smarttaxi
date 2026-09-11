# Design reference

## The approved address-picker marker

**`web-approved/assets/map-initial-square-tail-marker.svg`** — confirmed by the
owner on 2026-09-04 as the correct artwork.

A rounded square badge with a blue gradient rim, a near-white inner face, three
square speed marks, a gradient "S", a white highlight arc across the top-left
corner, and a wide tapering tail. `map-initial-square-tail-marker.html` is the
same thing as a runnable preview and is what
`docs/status/web-mobile-parity-and-hardening.md` points at.

Both clients draw from it, and neither should be adjusted by eye:

- web — `approvedAddressMarkerMarkup` in `apps/web/src/features/map/MapView.jsx`
  inlines the SVG verbatim;
- Flutter — `_ApprovedMapPickerMarker` in `passenger_shell.dart` states the same
  64-unit viewBox coordinates and scales them once through a single `_unit`.

`widget_test.dart` pins the three details that had already drifted apart, against
both this file and the web markup.

Related markers, per `web-mobile-parity-and-hardening.md`: a live phone location
is a blue GPS dot, a confirmed destination is a checkered flag, and drivers use
the car marker. The pick marker itself is deliberately identical for pickup and
destination — the field label carries that meaning, not the pin.

## rejected/

`map-address-picker-speedlines.png` is a **different** marker: three tapering
speed lines instead of the three squares, and a thin needle tail instead of the
wide one. It sat in `web-approved/assets/` next to the real thing, which is how
one client ended up part-way between the two. Kept for history, out of the
approved folder so it cannot be mistaken for the specification again.
