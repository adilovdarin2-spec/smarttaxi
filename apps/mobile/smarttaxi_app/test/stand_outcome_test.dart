import 'package:flutter_test/flutter_test.dart';
import 'package:smarttaxi_app/features/shared/stand_outcome.dart';
import 'package:smarttaxi_app/l10n/app_localizations_ru.dart';

void main() {
  test(
      'personal terminal reasons distinguish closure, expiry, cancellation and departure',
      () {
    StandOutcomeNotice? notice(String status, String? reason,
            {bool driver = false}) =>
        standOutcomeNotice(
            StandOutcome(id: 'own', status: status, reason: reason), 'own',
            driver: driver);
    expect(notice('CANCELLED', 'STAND_CLOSED'), StandOutcomeNotice.closedRider);
    expect(notice('EXPIRED', 'STAND_CLOSED', driver: true),
        StandOutcomeNotice.closedDriver);
    expect(notice('EXPIRED', null), StandOutcomeNotice.expired);
    expect(notice('DECLINED', null), StandOutcomeNotice.declined);
    expect(notice('BOARDED', null), StandOutcomeNotice.boarded);
    expect(notice('CANCELLED', 'DEPARTED'), StandOutcomeNotice.carLeft);
    expect(notice('CANCELLED', null), StandOutcomeNotice.cancelled);
    expect(
        notice('LEFT', 'LEFT_AREA', driver: true), StandOutcomeNotice.leftArea);
    expect(notice('EXPIRED', 'NO_SIGNAL', driver: true),
        StandOutcomeNotice.noSignal);
    expect(notice('LEFT', 'GAVE_TURN', driver: true),
        StandOutcomeNotice.handedOver);
    expect(notice('LEFT', 'ACCEPTED_ORDER', driver: true),
        StandOutcomeNotice.acceptedOrder);
    for (final status in ['WAITING', 'BOARDING', 'PENDING', 'CONFIRMED']) {
      expect(notice(status, null), isNull);
    }
    expect(
        standOutcomeNotice(null, 'own'), StandOutcomeNotice.riderUnavailable);
    expect(
        standOutcomeNotice(
            const StandOutcome(
                id: 'other', status: 'CANCELLED', reason: 'STAND_CLOSED'),
            'own'),
        StandOutcomeNotice.riderUnavailable);
    final l10n = AppLocalizationsRu();
    for (final type in StandOutcomeNotice.values) {
      expect(type.text(l10n), isNotEmpty);
    }
    expect(
        StandOutcomeNotice.boarded.text(l10n), isNot(contains('Бронь снята')));
  });
}
