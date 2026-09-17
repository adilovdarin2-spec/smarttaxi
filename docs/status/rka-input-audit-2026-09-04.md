# Address-source audit — 2026-09-04

Reviewed input: `C:\Users\User\Downloads\s_buildings-data.xlsx`.

## Result

This file is **not importable** into SmartTaxi's active-region address
catalogue.

- It contains 100 property-address rows for Pavlodar, not the current launch
  regions.
- The worksheet has 20 RKA/property columns, including an RKA identifier,
  building number and Kazakh/Russian full address.
- It has no latitude/longitude columns. SmartTaxi's official importer requires
  `rka`, `label`, `lat` and `lng`, and rejects coordinates outside the active
  service polygon.

## Why it was not imported

Loading it would not improve address coverage in the launch geography and it
would bypass the immutable, region-scoped source passport required by
`apps/api/data/official-addresses/README.md`. The file is useful only as a
schema example for a future official RKA acquisition that includes a coordinate
source or a reviewed geocoding stage.

## Required input for the real import

For each active SmartTaxi region, provide a reviewed export with:

```text
rka,label,lat,lng
```

and a same-named `.meta.json` passport containing source version, source and
accepted record counts, timestamp and SHA-256 checksum. Do not use a generic
national extract without first clipping it to the real service polygon and
validating every coordinate.
