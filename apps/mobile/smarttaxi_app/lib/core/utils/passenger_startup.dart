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

bool shouldConfirmDetectedRegion({
  required int activeRegionCount,
  required String detectedRegionId,
  String? confirmedRegionId,
}) {
  if (activeRegionCount <= 1) return false;
  return confirmedRegionId?.trim() != detectedRegionId.trim();
}
