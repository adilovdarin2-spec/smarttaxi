// A neutral local icon for POI sprite names absent from the provider's sheet.
// It does not pretend to identify the business or require another network call.
function missingPoiImage() {
  const size = 32;
  const data = new Uint8Array(size * size * 4);
  const center = (size - 1) / 2;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const distance = Math.hypot(x - center, y - center);
      if (distance > 13) continue;
      const offset = (y * size + x) * 4;
      const ring = distance > 9;
      data[offset] = ring ? 29 : 255;
      data[offset + 1] = ring ? 111 : 255;
      data[offset + 2] = 255;
      data[offset + 3] = 255;
    }
  }
  return { width: size, height: size, data };
}

export function installMissingPoiFallbacks(map) {
  const resolveMissing = id => {
    // A style reload removes custom images; consult the current style rather
    // than remembering IDs from a previous instance.
    if (!id || map.hasImage(id)) return;
    try {
      map.addImage(id, missingPoiImage(), { pixelRatio: 2 });
    } catch {
      // Style teardown may race an image request. Let a future request retry.
    }
  };
  // MapLibre 6's styleimagemissing event only reports unresolved requests;
  // the resolver participates in the current tile request.
  map.setMissingStyleImageResolver(resolveMissing);
  return () => map.setMissingStyleImageResolver(null);
}
