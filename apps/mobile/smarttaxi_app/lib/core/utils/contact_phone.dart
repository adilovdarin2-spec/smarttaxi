/// Returns a configured service phone only when it looks usable.
///
/// Seed data and incomplete deployments may contain obvious placeholder
/// numbers. Never render or dial those numbers: emergency widgets retain
/// their local fallback (112) and support remains available in-app.
String? usableServicePhone(String? raw) {
  final phone = (raw ?? '').trim();
  final digits = phone.replaceAll(RegExp(r'\D'), '');
  if (digits.length < 7) return null;

  final isRepeatedDigit = RegExp(r'^(\d)\1+$').hasMatch(digits);
  final hasPlaceholderSequence = _hasObviousSequence(digits);
  return isRepeatedDigit || hasPlaceholderSequence ? null : phone;
}

bool _hasObviousSequence(String digits) {
  const runLength = 6;
  for (var start = 0; start <= digits.length - runLength; start += 1) {
    final first = digits.codeUnitAt(start);
    var ascending = true;
    var descending = true;
    var repeated = true;
    for (var offset = 1; offset < runLength; offset += 1) {
      final current = digits.codeUnitAt(start + offset);
      ascending &= current == first + offset;
      descending &= current == first - offset;
      repeated &= current == first;
    }
    if (ascending || descending || repeated) return true;
  }
  return false;
}
