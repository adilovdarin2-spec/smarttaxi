// What the person cancelling says happened. Shared by the rider and driver web
// apps because the two halves of the same problem sit on opposite sides of it:
// a driver who cancels after pulling up, and a rider who cancels because that
// driver asked them to. Neither is visible to the server any other way.
//
// Nothing here charges anybody. The answer is recorded with the cancellation
// and read later by a person on the review screen.

/// Must match the server's DRIVER_CANCEL_REASONS.
export const DRIVER_CANCEL_REASONS = [
  { code: "CLIENT_NO_SHOW", label: "Пассажир не вышел" },
  { code: "CLIENT_ASKED", label: "Пассажир попросил отменить" },
  { code: "WRONG_ADDRESS", label: "Неверный адрес" },
  { code: "CAR_PROBLEM", label: "Поломка машины" },
  { code: "TOO_FAR", label: "Слишком далеко ехать" },
  { code: "OTHER", label: "Другая причина" },
];

/// Must match the server's CLIENT_CANCEL_REASONS.
export const CLIENT_CANCEL_REASONS = [
  { code: "CHANGED_MIND", label: "Передумал ехать" },
  { code: "DRIVER_ASKED_TO_CANCEL", label: "Водитель попросил отменить" },
  { code: "WAITED_TOO_LONG", label: "Долго жду машину" },
  { code: "FOUND_ANOTHER_CAR", label: "Нашёл другую машину" },
  { code: "WRONG_ADDRESS", label: "Ошибся с адресом" },
  { code: "OTHER", label: "Другая причина" },
];

export const DRIVER_CANCEL_NOTICE =
  "Отмены после подачи машины проверяет диспетчер.";

export const CLIENT_CANCEL_NOTICE =
  "Если водитель просит отменить заказ — отметьте это здесь. Такие случаи проверяет диспетчер.";

/// A rider cancelling before anybody is assigned has nobody to explain
/// themselves to, so nothing is asked. Once a driver is on the way, the reason
/// is the only fact review cannot reconstruct afterwards.
export function riderMustGiveReason(order) {
  return Boolean(order?.driver_id);
}
