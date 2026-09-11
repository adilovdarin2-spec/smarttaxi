# railway-deploy-cache-bust: 2026-07-15
FROM node:22-bookworm-slim
WORKDIR /app
# Keep registry certificate verification enabled in service-local builds too.
ARG NPM_STRICT_SSL=true
RUN npm config set strict-ssl ${NPM_STRICT_SSL}
COPY package*.json ./
# Messaging does not need Firebase's optional Firestore/Storage SDKs. This
# context uses the mirrored qs override in apps/api/package.json.
RUN npm install --omit=dev --omit=optional
COPY src ./src
# The harvested address gazetteer (~1.8 MB gzipped, 80 611 rows). It has to
# ship inside the image: the container cannot reach Overpass to fetch it, so
# this is the only way street-level addresses exist in production at all.
# Without this line the loader finds no directory and every address search
# falls back to returning the settlement centre and nothing else.
# See src/tools/harvest-addresses.js.
COPY data ./data
EXPOSE 4000
CMD ["npm", "start"]
