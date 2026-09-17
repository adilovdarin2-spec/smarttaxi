# The routing engine for SmartTaxi, carrying its own map.
#
# The public OSRM demo is a shared courtesy service: it refused a Достык route
# outright during the regional audit, and a paying dispatch should not depend on
# it. This is the same engine with the difference that matters — the graph is
# clipped to the area this service actually drives, so it is small, fast, and
# nobody else's traffic can take it down.
#
# The graph is built here rather than committed: it is a derived artifact of a
# public extract, it would be tens of megabytes of binary in every clone, and
# building it costs about 80 MB of memory and a few minutes.

# --- 1. Cut the service area out of the country extract -------------------
FROM debian:bookworm-slim AS clip
RUN apt-get update \
 && apt-get install -y --no-install-recommends osmium-tool ca-certificates curl \
 && rm -rf /var/lib/apt/lists/*
# The bounding box of every active service region, with a margin so a route
# that leaves a region polygon by a street still has road under it.
ARG BBOX="68.0,40.4,70.1,42.7"
RUN curl -fsSL -o /kazakhstan.osm.pbf https://download.geofabrik.de/asia/kazakhstan-latest.osm.pbf \
 && osmium extract --bbox "${BBOX}" --overwrite -o /region.osm.pbf /kazakhstan.osm.pbf \
 && rm -f /kazakhstan.osm.pbf

# --- 2. Prepare the routing graph ----------------------------------------
FROM ghcr.io/project-osrm/osrm-backend:latest AS build
COPY --from=clip /region.osm.pbf /data/region.osm.pbf
RUN osrm-extract -p /opt/car.lua /data/region.osm.pbf \
 && osrm-partition /data/region.osrm \
 && osrm-customize /data/region.osrm \
 && rm -f /data/region.osm.pbf

# --- 3. Serve it ----------------------------------------------------------
FROM ghcr.io/project-osrm/osrm-backend:latest
COPY --from=build /data/ /data/
EXPOSE 5000
# MLD is the algorithm the graph above was customised for; starting with any
# other would refuse the data outright.
CMD ["osrm-routed", "--algorithm", "mld", "--max-viaroute-size", "100", \
     "--port", "5000", "--ip", "0.0.0.0", "/data/region.osrm"]
