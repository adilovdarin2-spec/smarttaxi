function coordinates(location) {
  if (location?.lat == null || location?.lng == null || location.lat === '' || location.lng === '') return null;
  const lat = Number(location.lat);
  const lng = Number(location.lng);
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180
    ? { ...location, lat, lng } : null;
}

// GPS can update the local marker immediately, but server-backed routing must
// observe only acknowledged coordinates. Keep the latest throttled fix and
// serialize writes so an older HTTP request cannot overwrite a newer one.
export function createDriverLocationPublisher({
  publish,
  onPublished,
  isCurrent = () => true,
  now = Date.now,
  setTimer = setTimeout,
  clearTimer = clearTimeout,
  intervalMs = 15000
}) {
  let latest = null;
  let revision = 0;
  let timer = null;
  let request = null;
  let lastStarted = -Infinity;
  let disposed = false;

  function dispose() {
    disposed = true;
    if (timer !== null) clearTimer(timer);
    timer = null;
    latest = null;
    request?.abort();
  }

  function current() {
    if (disposed) return false;
    if (!isCurrent()) { dispose(); return false; }
    return true;
  }

  function schedule() {
    if (!current() || !latest || request || timer !== null) return;
    const delay = Math.max(0, intervalMs - (now() - lastStarted));
    if (delay === 0) run();
    else timer = setTimer(() => { timer = null; run(); }, delay);
  }

  function run() {
    if (!current() || !latest || request) return;
    const location = latest;
    const sentRevision = revision;
    const controller = new AbortController();
    request = controller;
    lastStarted = now();
    Promise.resolve()
      .then(() => current() ? publish(location, { signal: controller.signal }) : null)
      .then(payload => {
        if (!current()) return;
        const confirmed = coordinates(payload?.location);
        if (!confirmed) return; // No acknowledgement: retry, do not invent one.
        if (revision === sentRevision) latest = null;
        onPublished(confirmed);
      })
      .catch(() => {
        // A failed write keeps the newest fix queued. Never mark it published
        // or require another GPS event just to recover a transient failure.
      })
      .finally(() => {
        request = null;
        schedule();
      });
  }

  return {
    update(location) {
      if (!current()) return;
      const next = coordinates(location);
      if (!next) return;
      latest = next;
      revision++;
      schedule();
    },
    dispose
  };
}
