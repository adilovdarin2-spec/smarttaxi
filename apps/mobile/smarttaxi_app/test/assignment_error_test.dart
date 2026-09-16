import 'package:flutter_test/flutter_test.dart';
import 'package:smarttaxi_app/features/shared/assignment_error.dart';
import 'package:smarttaxi_app/l10n/app_localizations_ru.dart';

void main() {
  test(
      'assignment refusals preserve audience privacy and do not blame connectivity',
      () {
    final l10n = AppLocalizationsRu();
    for (final code in [
      'DRIVER_DEBT_LIMIT',
      'ORDER_REGION_MISMATCH',
      'DRIVER_PREVIOUSLY_CANCELLED_ORDER',
      'DRIVER_BLOCKED_BY_CLIENT',
      'CLIENT_BLOCKED_BY_DRIVER'
    ]) {
      expect(
          assignmentErrorMessage(code, l10n), l10n.assignmentRiderUnavailable);
      expect(assignmentErrorMessage(code, l10n, driver: true), isNotEmpty);
    }
    expect(assignmentErrorMessage('DRIVER_DEBT_LIMIT', l10n, driver: true),
        l10n.driverErrorDebtLimit);
    expect(
        assignmentErrorMessage('DRIVER_PREVIOUSLY_CANCELLED_ORDER', l10n,
            driver: true),
        l10n.assignmentDriverCancelled);
    for (final code in [null, 'UNKNOWN', 'UNAUTHORIZED']) {
      expect(assignmentErrorMessage(code, l10n), isNull);
    }
  });
}
