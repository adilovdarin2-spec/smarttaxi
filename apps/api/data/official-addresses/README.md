# Official address catalogues

This directory accepts reviewed exports from Kazakhstan's Address Register
(RKA) for SmartTaxi's active regions.  It is deliberately separate from the
OSM catalogue: official addresses are never replaced by a public-map refresh.

Add one file per region, named with its exact code, for example
`YNTYMAK.csv`, `KIROV.jsonl` or `SHYMKENT.geojson`.

Every data file must have an adjacent immutable snapshot passport with the
same region code, for example `YNTYMAK.meta.json`. The loader verifies its
SHA-256 before it applies a single address:

```json
{
  "region_code": "YNTYMAK",
  "source_dataset": "s_buildings + approved geocoding source",
  "source_version": "2026-09-02",
  "downloaded_at": "2026-09-02T08:30:00Z",
  "source_record_count": 12480,
  "accepted_record_count": 12341,
  "sha256": "<SHA-256 of YNTYMAK.csv>"
}
```

The source count may be larger than the accepted count only when rejected
rows are documented by the review process. Do not commit API keys,
certificates, or an unreviewed export to this directory.

Required fields are (with `rka` being the exact 16-digit Address Register
code):

```text
rka,label,lat,lng
```

Useful optional fields: `street`, `housenumber`, `name`, `kind` (one of
`housenumber`, `street`, `building`, `poi`) and `variants`.  CSV accepts `,`
or `;`; JSONL uses one object per line; GeoJSON expects Point features with
the same fields in `properties`.

The loader rejects invalid RKA values, missing coordinates and points outside
the configured service polygon.  It also preserves the previous official
catalogue if a file is missing or empty.
