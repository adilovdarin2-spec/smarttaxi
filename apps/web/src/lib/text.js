// A handful of historical orders have pickup/dropoff text that was corrupted
// server-side by a since-fixed bug (multi-byte Cyrillic split across a TCP
// chunk boundary landed as literal U+FFFD replacement characters, and that's
// what got stored -- the original bytes are gone, not just misencoded, so
// there's nothing to recover). Showing a run of "�" reads as broken; a plain
// fallback label reads as intentional.
export function sanitizeAddressText(value, fallback) {
  const text = value == null ? "" : String(value);
  return !text || text.includes("�") ? fallback : text;
}
