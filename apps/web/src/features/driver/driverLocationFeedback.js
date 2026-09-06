// Operational feedback only: never change the driver's server status or trip
// because a browser permission or a location publication failed.
export function driverLocationFeedback(error, source = 'browser') {
  if (source === 'publication') {
    const messages = {
      DRIVER_LOCATION_OUTSIDE_REGION: ['Вы вне рабочего региона', 'Координаты не приняты. Вернитесь в рабочий регион или выберите доступный регион на вкладке «Линия».'],
      DRIVER_REGION_INACTIVE: ['Регион временно отключён', 'Координаты не приняты. Проверьте рабочий регион на вкладке «Линия».'],
      DRIVER_REGION_BLOCKED: ['Работа в регионе заблокирована', 'Координаты не приняты. Обратитесь в поддержку сервиса.'],
      DRIVER_REGION_NOT_APPROVED: ['Регион не подтверждён', 'Координаты не приняты. Выберите одобренный рабочий регион на вкладке «Линия».'],
      DRIVER_OFFLINE: ['Вы не на линии', 'Сервис не принимает координаты. Проверьте статус смены на вкладке «Линия».']
    };
    const [title, description] = messages[error?.code] || ['Координаты не отправлены',
      'Положение машины и маршрут могут быть устаревшими. Проверьте соединение — отправка повторится автоматически.'];
    return { source, title, description };
  }
  const messages = {
    1: ['Разрешите геолокацию', 'Доступ к местоположению запрещён. Разрешите его в настройках этого сайта, затем повторите GPS.'],
    2: ['Местоположение недоступно', 'Включите определение местоположения на устройстве и проверьте сигнал GPS.'],
    3: ['Не удалось определить местоположение', 'Ожидание GPS затянулось. Проверьте сигнал и повторите попытку.'],
    unsupported: ['Геолокация недоступна в браузере', 'Откройте приложение в браузере с поддержкой геолокации через HTTPS или localhost.']
  };
  const [title, description] = messages[error?.code] || messages[2];
  return { source, title, description };
}
