/// Location/region prompts must wait for the active-order response, even
/// when GPS is faster. A restored trip owns its pickup, not startup GPS.
Future<bool> mayLocatePassenger({
  required Future<void> orderRestoration,
  required bool Function() isMounted,
  required bool Function() hasOrder,
}) async {
  await orderRestoration;
  return isMounted() && !hasOrder();
}
