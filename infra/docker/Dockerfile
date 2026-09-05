# Compose builds use the repository root so npm consumes the same tracked lock
# as CI. The service-local Dockerfiles remain compatible with Railway's current
# subdirectory build contexts; see docs/DOCKER_BUILDS.md before migrating them.
FROM node:22-bookworm-slim AS workspace-manifests
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/package.json
COPY apps/web/package.json ./apps/web/package.json
COPY packages/shared/package.json ./packages/shared/package.json

FROM workspace-manifests AS api-dependencies
# Preserve the existing local proxy override. Deployments can pass true, as
# .env.example already does; no TLS setting is changed as part of lock adoption.
ARG NPM_STRICT_SSL=false
# Firebase is used only for Messaging; omit its unused optional Firestore and
# Storage SDKs (including their legacy UUID dependency tree).
RUN npm config set strict-ssl ${NPM_STRICT_SSL} \
    && npm ci --omit=dev --omit=optional --workspace=apps/api --include-workspace-root=false

FROM api-dependencies AS api
COPY apps/api/src ./apps/api/src
COPY apps/api/data ./apps/api/data
COPY packages/shared/src ./packages/shared/src
WORKDIR /app/apps/api
# Keep the existing upload location/mount compatible while retaining npm's
# workspace layout (including any nested dependencies introduced in the lock).
RUN mkdir -p /app/uploads && ln -s /app/uploads uploads
EXPOSE 4000
CMD ["npm", "start"]

FROM workspace-manifests AS web-builder
RUN npm ci --workspace=apps/web --include-workspace-root=false
ARG VITE_API_URL
ARG VITE_SOCKET_URL
ARG VITE_MAPTILER_API_KEY
ARG VITE_MAPTILER_STYLE_URL
ARG VITE_OSM_TILE_URL
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_SOCKET_URL=$VITE_SOCKET_URL
ENV VITE_MAPTILER_API_KEY=$VITE_MAPTILER_API_KEY
ENV VITE_MAPTILER_STYLE_URL=$VITE_MAPTILER_STYLE_URL
ENV VITE_OSM_TILE_URL=$VITE_OSM_TILE_URL
COPY apps/web ./apps/web
COPY packages/shared/src ./packages/shared/src
RUN npm --prefix apps/web run build

FROM nginx:alpine AS web
COPY --from=web-builder /app/apps/web/dist /usr/share/nginx/html
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
