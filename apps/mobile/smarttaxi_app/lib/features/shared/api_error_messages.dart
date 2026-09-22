import '../../l10n/app_localizations.dart';

/// Причина отказа сервера словами, понятными человеку.
///
/// У API 95 кодов ошибок, до которых приложение может дотянуться; знало оно
/// 36. Всё остальное превращалось в "что-то пошло не так" -- человек упирался
/// в стену и не понимал, что сделать. Здесь собраны коды, которые ни один
/// экран не разбирал отдельно: место в очереди закрылось, бронь просрочена,
/// цена вне допустимых границ, код из SMS устарел.
///
/// Экраны сначала смотрят в свои карты -- там формулировки под контекст, --
/// и только потом сюда. Поэтому добавление кода сюда ничего не переопределяет.
///
/// Возвращает null для незнакомого кода: общий текст лучше выдуманного.
String? apiErrorMessage(String? code, AppLocalizations l10n) {
  if (code == null || code.isEmpty) return null;
  final messages = <String, String>{
    'CANNOT_CONFIRM_OWN_ALERT': l10n.apiErrorCannotConfirmOwnAlert,
    'CLIENT_CARD_NOT_FOUND': l10n.apiErrorClientCardNotFound,
    'CLIENT_NOT_FOUND': l10n.apiErrorClientNotFound,
    'CLIENT_PREFERENCE_NOT_FOUND': l10n.apiErrorPreferenceNotFound,
    'COORDINATES_REQUIRED': l10n.apiErrorCoordinatesRequired,
    'DRIVER_IS_THE_RIDER': l10n.apiErrorDriverIsTheRider,
    'DRIVER_NOT_ASSIGNED': l10n.apiErrorDriverNotAssigned,
    'DRIVER_NOT_FOUND': l10n.apiErrorDriverNotFound,
    'DRIVER_PREFERENCE_NOT_FOUND': l10n.apiErrorPreferenceNotFound,
    'FAVORITE_ADDRESS_NOT_FOUND': l10n.apiErrorFavoriteAddressNotFound,
    'FILE_REQUIRED': l10n.apiErrorFileRequired,
    'FORBIDDEN_RECURRING_BOOKING': l10n.apiErrorForbiddenRecurringBooking,
    'FORBIDDEN_STAND_ENTRY': l10n.apiErrorForbiddenStandEntry,
    'FORBIDDEN_STAND_RESERVATION': l10n.apiErrorForbiddenStandReservation,
    'INSUFFICIENT_CASHBACK': l10n.apiErrorInsufficientCashback,
    'INVALID_COORDINATES': l10n.apiErrorInvalidCoordinates,
    'INVALID_PAYOUT_METHOD': l10n.apiErrorInvalidPayoutMethod,
    'INVALID_SMS_CODE': l10n.apiErrorInvalidSmsCode,
    'NOTIFICATION_NOT_FOUND': l10n.apiErrorNotificationNotFound,
    'NO_PENDING_PRICE_OFFER': l10n.apiErrorNoPendingPriceOffer,
    'OFFERED_PRICE_OUT_OF_BOUNDS': l10n.apiErrorOfferedPriceOutOfBounds,
    'ORDER_CLIENT_MISSING': l10n.apiErrorOrderClientMissing,
    'ORDER_DRIVER_MISSING': l10n.apiErrorOrderClientMissing,
    'ORDER_NOT_AWAITING_PAYMENT': l10n.apiErrorOrderNotAwaitingPayment,
    'ORDER_NOT_PAID': l10n.apiErrorOrderNotPaid,
    'PAYOUT_REQUEST_NOT_FOUND': l10n.apiErrorPayoutRequestNotFound,
    'PAYOUT_REQUEST_NOT_PENDING': l10n.apiErrorPayoutRequestNotPending,
    'REGION_NOT_FOUND': l10n.apiErrorRegionNotFound,
    'QUEUED_PRICE_OFFER_NOT_FOUND': l10n.apiErrorQueuedPriceOfferNotFound,
    'QUICK_MESSAGE_NOT_ALLOWED': l10n.apiErrorQuickMessageNotAllowed,
    'RECURRING_BOOKING_ALREADY_RESPONDED': l10n.apiErrorRecurringBookingAlreadyResponded,
    'RECURRING_BOOKING_CANCELLED': l10n.apiErrorRecurringBookingCancelled,
    'RECURRING_BOOKING_NOT_FOUND': l10n.apiErrorRecurringBookingNotFound,
    'RECURRING_BOOKING_PENDING': l10n.apiErrorRecurringBookingPending,
    'ROAD_ALERT_ALREADY_ANSWERED': l10n.apiErrorRoadAlertAlreadyAnswered,
    'ROAD_ALERT_EXPIRED': l10n.apiErrorRoadAlertExpired,
    'ROAD_ALERT_NOT_FOUND': l10n.apiErrorRoadAlertNotFound,
    'ROAD_ALERT_OUTSIDE_REGION': l10n.apiErrorRoadAlertOutsideRegion,
    'SMS_CODE_ATTEMPTS_EXCEEDED': l10n.apiErrorSmsAttemptsExceeded,
    'SMS_CODE_EXPIRED': l10n.apiErrorSmsCodeExpired,
    'SMS_CODE_TOO_SOON': l10n.apiErrorSmsCodeTooSoon,
    'SMS_DAILY_LIMIT_REACHED': l10n.apiErrorSmsDailyLimit,
    'STAND_ALREADY_QUEUED': l10n.apiErrorStandAlreadyQueued,
    'STAND_ENTRY_NOT_BOARDING': l10n.apiErrorStandEntryNotBoarding,
    'STAND_ENTRY_NOT_FOUND': l10n.apiErrorStandEntryNotFound,
    'STAND_ENTRY_NOT_LIVE': l10n.apiErrorStandEntryNotFound,
    'STAND_HANDOVER_HAS_SEATS': l10n.apiErrorStandHandoverHasSeats,
    'STAND_HANDOVER_OTHER_STAND': l10n.apiErrorStandHandoverOtherStand,
    'STAND_HANDOVER_SELF': l10n.apiErrorStandHandoverSelf,
    'STAND_INACTIVE': l10n.apiErrorStandInactive,
    'STAND_NOT_ENOUGH_SEATS': l10n.apiErrorStandNotEnoughSeats,
    'STAND_NO_TAKEN_SEATS': l10n.apiErrorStandNoTakenSeats,
    'STAND_QUEUED_ELSEWHERE': l10n.apiErrorStandQueuedElsewhere,
    'STAND_RESERVATION_EXISTS': l10n.apiErrorStandReservationExists,
    'STAND_RESERVATION_EXPIRED': l10n.apiErrorStandReservationExpired,
    'STAND_RESERVATION_NOT_FOUND': l10n.apiErrorStandReservationNotFound,
    'STAND_RESERVATION_RESOLVED': l10n.apiErrorStandReservationResolved,
    'STAND_RIDER_IS_THE_DRIVER': l10n.apiErrorStandRiderIsTheDriver,
    'STAND_SEATS_BELOW_TAKEN': l10n.apiErrorStandSeatsBelowTaken,
    'SUPPORT_MESSAGE_NOT_FOUND': l10n.apiErrorSupportMessageNotFound,
    'TARIFF_NOT_FOUND': l10n.apiErrorTariffNotFound,
    'USER_NOT_FOUND': l10n.apiErrorUserNotFound,
  };
  return messages[code];
}
