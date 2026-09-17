export const standOutcomeMessages = {
  closedDriver: 'Стоянку закрыли. Ваше место в очереди снято. Выберите другую стоянку.',
  closedRider: 'Стоянку закрыли. Бронь снята. Выберите другую стоянку или закажите поездку.',
  expired: 'Время ожидания подтверждения истекло. Бронь снята — можно выбрать другую машину.',
  declined: 'Водитель не подтвердил бронь. Выберите другую машину.',
  cancelled: 'Бронь отменена. Место больше не занято.',
  boarded: 'Посадка завершена. Машина отправилась.',
  carLeft: 'Машина больше не набирает пассажиров. Бронь снята — выберите другую машину.',
  leftArea: 'Вы покинули зону стоянки. Место в очереди снято. Чтобы вернуться, подъедьте к стоянке.',
  noSignal: 'Давно не было координат от вашего устройства. Место снято. Проверьте GPS и встаньте в очередь заново.',
  handedOver: 'Ваше место передано другому водителю.',
  acceptedOrder: 'Вы приняли заказ. Место на стоянке освобождено.',
  driverLeft: 'Ваше место в очереди освобождено.',
  riderUnavailable: 'Эта бронь больше не активна. Обновите данные или выберите другую машину.',
};

export function standOutcomeNotice(outcome, id, driver = false) {
  const fallback = driver ? 'driverLeft' : 'riderUnavailable';
  if (!outcome || outcome.id !== id || typeof outcome.status !== 'string') return fallback;
  if (['WAITING', 'BOARDING', 'PENDING', 'CONFIRMED'].includes(outcome.status)) return null;
  if (driver) {
    if (outcome.reason === 'STAND_CLOSED') return 'closedDriver';
    if (outcome.reason === 'LEFT_AREA') return 'leftArea';
    if (outcome.reason === 'NO_SIGNAL') return 'noSignal';
    if (outcome.reason === 'GAVE_TURN') return 'handedOver';
    if (outcome.reason === 'ACCEPTED_ORDER') return 'acceptedOrder';
    return outcome.status === 'DEPARTED' ? 'boarded' : fallback;
  }
  if (outcome.status === 'EXPIRED') return 'expired';
  if (outcome.status === 'DECLINED') return 'declined';
  if (outcome.status === 'BOARDED') return 'boarded';
  if (outcome.status !== 'CANCELLED') return fallback;
  if (outcome.reason === 'STAND_CLOSED') return 'closedRider';
  return outcome.reason ? 'carLeft' : 'cancelled';
}
