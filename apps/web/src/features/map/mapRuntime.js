import * as maplibregl from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import 'maplibre-gl/dist/maplibre-gl.css';

// Bundle the worker AND its shared imports. A plain ?url import appears to
// work in Vite dev mode, but leaves vector maps blank in the production build.
// Keep this in the lazy map entry used by both the taxi and dispatch maps.
maplibregl.setWorkerUrl(workerUrl);

export { maplibregl };
