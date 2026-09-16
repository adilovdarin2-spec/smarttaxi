import '../../l10n/app_localizations.dart';

class StandOutcome {
  const StandOutcome({required this.id, required this.status, this.reason});
  final String id;
  final String status;
  final String? reason;

  factory StandOutcome.fromJson(Map<String, dynamic> json) {
    if (json['id'] is! String ||
        json['status'] is! String ||
        (json['reason'] != null && json['reason'] is! String)) {
      throw const FormatException('Invalid stand outcome');
    }
    return StandOutcome(
        id: json['id'] as String,
        status: json['status'] as String,
        reason: json['reason'] as String?);
  }
}

enum StandOutcomeNotice {
  closedDriver,
  closedRider,
  expired,
  declined,
  cancelled,
  boarded,
  carLeft,
  leftArea,
  noSignal,
  handedOver,
  acceptedOrder,
  driverLeft,
  riderUnavailable;

  String text(AppLocalizations l10n) => switch (this) {
        closedDriver => l10n.standOutcomeClosedDriver,
        closedRider => l10n.standOutcomeClosedRider,
        expired => l10n.standOutcomeExpired,
        declined => l10n.standOutcomeDeclined,
        cancelled => l10n.standOutcomeCancelled,
        boarded => l10n.standOutcomeBoarded,
        carLeft => l10n.standOutcomeCarLeft,
        leftArea => l10n.standOutcomeLeftArea,
        noSignal => l10n.standOutcomeNoSignal,
        handedOver => l10n.standOutcomeHandedOver,
        acceptedOrder => l10n.standOutcomeAcceptedOrder,
        driverLeft => l10n.standOutcomeDriverLeft,
        riderUnavailable => l10n.standOutcomeRiderUnavailable,
      };
}

StandOutcomeNotice? standOutcomeNotice(StandOutcome? outcome, String id,
    {bool driver = false}) {
  final fallback = driver
      ? StandOutcomeNotice.driverLeft
      : StandOutcomeNotice.riderUnavailable;
  if (outcome == null || outcome.id != id) return fallback;
  if (['WAITING', 'BOARDING', 'PENDING', 'CONFIRMED']
      .contains(outcome.status)) {
    return null;
  }
  if (driver) {
    return switch (outcome.reason) {
      'STAND_CLOSED' => StandOutcomeNotice.closedDriver,
      'LEFT_AREA' => StandOutcomeNotice.leftArea,
      'NO_SIGNAL' => StandOutcomeNotice.noSignal,
      'GAVE_TURN' => StandOutcomeNotice.handedOver,
      'ACCEPTED_ORDER' => StandOutcomeNotice.acceptedOrder,
      _ => outcome.status == 'DEPARTED' ? StandOutcomeNotice.boarded : fallback,
    };
  }
  if (outcome.status == 'EXPIRED') return StandOutcomeNotice.expired;
  if (outcome.status == 'DECLINED') return StandOutcomeNotice.declined;
  if (outcome.status == 'BOARDED') return StandOutcomeNotice.boarded;
  if (outcome.status != 'CANCELLED') return fallback;
  if (outcome.reason == 'STAND_CLOSED') return StandOutcomeNotice.closedRider;
  return outcome.reason != null
      ? StandOutcomeNotice.carLeft
      : StandOutcomeNotice.cancelled;
}
