const driverMessages = {
  DRIVER_DEBT_LIMIT: 'Превышен лимит долга. Свяжитесь с оператором.',
  ORDER_REGION_MISMATCH: 'Заказ относится к другому региону.',
  DRIVER_PREVIOUSLY_CANCELLED_ORDER: 'Вы уже отменили этот заказ. Выберите другой.',
  DRIVER_BLOCKED_BY_CLIENT: 'Этот заказ недоступен для вас. Выберите другой.',
  CLIENT_BLOCKED_BY_DRIVER: 'Вы заблокировали этого пассажира. Выберите другой заказ.',
};

export function assignmentErrorMessage(code, driver = false) {
  if (!Object.hasOwn(driverMessages, code)) return null;
  // Do not disclose a driver's debt or another person's block to the rider.
  return driver ? driverMessages[code]
    : 'Водитель больше не может принять этот заказ. Выберите другого водителя или отклоните предложение.';
}
