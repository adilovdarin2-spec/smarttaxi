// Keep punctuation and the order of words out of address lookup. The longest
// token remains a plain ILIKE predicate so the existing trigram index applies.
const streetWords = new Set(['ул', 'улица', 'дом', 'д', 'көшесі', 'көше', 'street', 'st']);

export function addressSearchQuery(value) {
  const words = String(value || '').toLocaleLowerCase('ru-KZ')
    .match(/[\p{L}\p{N}]+/gu) || [];
  const meaningful = words.filter(word => !streetWords.has(word));
  const tokens = [...new Set(meaningful.length ? meaningful : words)];
  const anchor = [...tokens].sort((a, b) => b.length - a.length)[0] || '';
  return {
    tokens,
    anchor: `%${anchor}%`,
    patterns: tokens.map(token => `%${token}%`),
    // 29 must not match 129 or 290. Letter suffixes remain suggestions (29А),
    // and full compound numbers still require every token from the query.
    numbers: tokens.filter(token => /^\d+$/.test(token))
      .map(token => `(^|[^[:digit:]])${token}([^[:digit:]]|$)`),
  };
}
