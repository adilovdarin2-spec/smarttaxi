import '../../l10n/app_localizations.dart';

String? assignmentErrorMessage(String? code, AppLocalizations l10n,
    {bool driver = false}) {
  final messages = {
    'DRIVER_DEBT_LIMIT': l10n.driverErrorDebtLimit,
    'ORDER_REGION_MISMATCH': l10n.driverErrorOrderRegionMismatch,
    'DRIVER_PREVIOUSLY_CANCELLED_ORDER': l10n.assignmentDriverCancelled,
    'DRIVER_BLOCKED_BY_CLIENT': l10n.assignmentDriverUnavailable,
    'CLIENT_BLOCKED_BY_DRIVER': l10n.assignmentDriverBlockedRider,
  };
  if (!messages.containsKey(code)) return null;
  // Financial details and another person's block are not passenger copy.
  return driver ? messages[code] : l10n.assignmentRiderUnavailable;
}
