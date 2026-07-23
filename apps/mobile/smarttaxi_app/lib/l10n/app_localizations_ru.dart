// ignore: unused_import
import 'package:intl/intl.dart' as intl;
import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for Russian (`ru`).
class AppLocalizationsRu extends AppLocalizations {
  AppLocalizationsRu([String locale = 'ru']) : super(locale);

  @override
  String get appName => 'SmartTaxi';

  @override
  String get continueLabel => 'Продолжить';

  @override
  String get cancel => 'Отмена';

  @override
  String get save => 'Сохранить';

  @override
  String get close => 'Закрыть';

  @override
  String get retry => 'Повторить';

  @override
  String get logIn => 'Войти';

  @override
  String get logOut => 'Выйти';

  @override
  String get loading => 'Загрузка...';

  @override
  String get pullToRetry => 'Потяните экран вниз, чтобы попробовать снова.';

  @override
  String get settings => 'Настройки';

  @override
  String get language => 'Язык';

  @override
  String get languageRussian => 'Русский';

  @override
  String get languageKazakh => 'Қазақша';

  @override
  String get languageChangedNote =>
      'Язык интерфейса изменён. Часть экранов пока переведена только частично.';

  @override
  String get passengerSettingsTitle => 'Настройки';

  @override
  String get passengerSettingsSubtitle =>
      'Аккаунт, поездки и информация о приложении';

  @override
  String get passengerSettingsAccountGroup => 'Аккаунт';

  @override
  String get passengerSettingsPhoneLabel => 'Номер телефона';

  @override
  String get passengerSettingsPhoneMissing => 'Не указан';

  @override
  String get passengerSettingsPhoneCopied => 'Номер скопирован';

  @override
  String get passengerSettingsRegionLabel => 'Регион';

  @override
  String get passengerSettingsRegionNotSelected => 'Не выбран';

  @override
  String get passengerSettingsLogoutTitle => 'Выход из аккаунта';

  @override
  String get passengerSettingsLogoutText => 'Завершить текущую сессию';

  @override
  String get passengerSettingsInterfaceGroup => 'Интерфейс';

  @override
  String get passengerSettingsLanguageLabel => 'Язык';

  @override
  String get passengerSettingsThemeLabel => 'Тема';

  @override
  String get passengerSettingsThemeDark => 'Тёмная';

  @override
  String get passengerSettingsThemeSystem => 'Как в системе';

  @override
  String get passengerSettingsThemeLight => 'Светлая';

  @override
  String get passengerSettingsPermissionsGroup => 'Разрешения';

  @override
  String get passengerSettingsPushLabel => 'Push-уведомления';

  @override
  String get passengerSettingsPushEnabled =>
      'Включены — нажмите, чтобы открыть настройки';

  @override
  String get passengerSettingsPushDisabled => 'Отключены в настройках телефона';

  @override
  String get passengerSettingsPushNotRequested => 'Не запрошены';

  @override
  String get passengerSettingsPushCheckError =>
      'Появляются в приложении при изменении заказа';

  @override
  String get passengerSettingsPushChecking => 'Проверяем статус...';

  @override
  String get passengerSettingsLocationLabel => 'Геолокация';

  @override
  String get passengerSettingsLocationText =>
      'Открыть настройки геолокации телефона';

  @override
  String get passengerSettingsAboutGroup => 'О приложении';

  @override
  String get passengerSettingsVersionLabel => 'Версия приложения';

  @override
  String get passengerSettingsLegalTitle => 'Правовая информация';

  @override
  String get passengerSettingsLegalText =>
      'Условия использования, оплата, отмена, безопасность';

  @override
  String get home => 'Главная';

  @override
  String get trips => 'Поездки';

  @override
  String get profile => 'Профиль';

  @override
  String get notifications => 'Уведомления';

  @override
  String get support => 'Поддержка';

  @override
  String get passengerDrawerTrips => 'Мои поездки';

  @override
  String get passengerDrawerPromoCodes => 'Промокоды';

  @override
  String get passengerDrawerRecurringBookings => 'Регулярные поездки';

  @override
  String get passengerDrawerFavoriteAddresses => 'Избранные адреса';

  @override
  String get passengerDrawerDrivers => 'Водители';

  @override
  String get passengerDrawerReferrals => 'Пригласить друзей';

  @override
  String get passengerDrawerBecomeDriver => 'Стать водителем';

  @override
  String get passengerDrawerHelpSection => 'Помощь';

  @override
  String get passengerDrawerFaq => 'FAQ';

  @override
  String get passengerDrawerAboutSection => 'О сервисе';

  @override
  String get passengerDrawerAboutUs => 'О нас';

  @override
  String get passengerDrawerRegionalBadge => 'Региональное такси';

  @override
  String get passengerFaqSubtitle => 'Ответы на частые вопросы';

  @override
  String get passengerFaqSearchHint => 'Поиск по вопросам';

  @override
  String get passengerFaqClearSearch => 'Очистить поиск';

  @override
  String get passengerFaqNoResultsTitle => 'Ничего не найдено';

  @override
  String get passengerFaqNoResultsText =>
      'Попробуйте изменить запрос или напишите нам в поддержку.';

  @override
  String get passengerFaqQ1 => 'Как заказать поездку?';

  @override
  String get passengerFaqA1 =>
      'Выберите точку подачи и адрес назначения на карте, выберите тариф, дождитесь расчёта и нажмите «Заказать».';

  @override
  String get passengerFaqQ2 =>
      'Почему сервис работает только в выбранном регионе?';

  @override
  String get passengerFaqA2 =>
      'SmartTaxi запускается по регионам, которые включены администратором. Так поездки остаются контролируемыми и честными.';

  @override
  String get passengerFaqQ3 => 'Как считается цена?';

  @override
  String get passengerFaqA3 =>
      'Цена рассчитывается сервером по маршруту, тарифу, расстоянию и времени поездки.';

  @override
  String get passengerFaqQ4 => 'Как стать водителем?';

  @override
  String get passengerFaqA4 =>
      'Откройте раздел «Стать водителем», заполните данные автомобиля и дождитесь проверки администратора.';

  @override
  String get passengerFaqQ5 => 'Что делать, если водитель не приехал?';

  @override
  String get passengerFaqA5 =>
      'Откройте поддержку и выберите тему «Водитель не приехал».';

  @override
  String get passengerFaqQ6 => 'Как отменить заказ?';

  @override
  String get passengerFaqA6 =>
      'Откройте «Мои поездки» и нажмите «Отменить поездку», если заказ ещё можно отменить.';

  @override
  String get passengerFaqQ7 => 'Почему нужна геолокация?';

  @override
  String get passengerFaqA7 =>
      'Геолокация помогает выбрать точку посадки и строить честный маршрут.';

  @override
  String get passengerFaqQ8 => 'Как связаться с поддержкой?';

  @override
  String get passengerFaqA8 =>
      'Откройте раздел «Поддержка» в меню и напишите сообщение.';

  @override
  String get passengerSupportSubtitle => 'Опишите проблему, мы поможем';

  @override
  String get passengerSupportUrgentTitle => 'Срочный вопрос?';

  @override
  String passengerSupportCallDirectly(String phone) {
    return 'Позвоните напрямую: $phone';
  }

  @override
  String get callButton => 'Позвонить';

  @override
  String get passengerSupportTopicSectionTitle => 'Тема обращения';

  @override
  String get passengerSupportTopicSectionText => 'Выберите, с чем нужна помощь';

  @override
  String get passengerSupportTopicTripIssue => 'Проблема с поездкой';

  @override
  String get passengerSupportTopicNoShow => 'Водитель не приехал';

  @override
  String get passengerSupportTopicLostItem => 'Забыл вещь';

  @override
  String get passengerSupportTopicPayment => 'Оплата';

  @override
  String get passengerSupportTopicOther => 'Другое';

  @override
  String get passengerSupportChooseTopicFirst =>
      'Выберите тему выше, чтобы продолжить.';

  @override
  String get messageLabel => 'Сообщение';

  @override
  String get passengerSupportMessageHint => 'Напишите сообщение…';

  @override
  String get passengerSupportMessageTooShort =>
      'Опишите проблему подробнее: минимум 8 символов.';

  @override
  String get passengerSupportLostItemNeedsTrip =>
      'Укажите поездку, в которой оставили вещь — иначе водителя не получится уведомить.';

  @override
  String get sendButton => 'Отправить';

  @override
  String get sendingButton => 'Отправляем...';

  @override
  String get passengerSupportLostItemSent =>
      'Обращение отправлено, водитель уведомлён.';

  @override
  String get passengerSupportMessageSent =>
      'Обращение отправлено. Мы ответим здесь и, если нужно, позвоним.';

  @override
  String get passengerSupportDialFailed => 'Не удалось открыть набор номера';

  @override
  String get passengerSupportYourRequests => 'Ваши обращения';

  @override
  String get passengerSupportLoadError => 'Не удалось загрузить обращения';

  @override
  String get passengerAboutDescription =>
      'SmartTaxi — региональный сервис такси для быстрых, понятных и честных поездок внутри активных регионов.';

  @override
  String get passengerAboutRegionalModelTitle => 'Региональная модель';

  @override
  String get passengerAboutRegionalModelText =>
      'Поездки доступны только внутри регионов, включённых администратором. Межгород не поддерживается.';

  @override
  String get passengerAboutContactTitle => 'Связь';

  @override
  String get passengerAboutContactText =>
      'Если нужна помощь, откройте поддержку в левом меню.';

  @override
  String get passengerAboutSupportSubtitle => 'Есть вопрос? Мы ответим';

  @override
  String get passengerAboutLegalSubtitle =>
      'Условия, оплата, отмена, безопасность';

  @override
  String passengerAboutVersionLabel(String version) {
    return 'SmartTaxi · версия $version';
  }

  @override
  String get loadFailedTitle => 'Не удалось загрузить';

  @override
  String get passengerRecurringSubtitle =>
      'Школьный маршрут и другие поездки по расписанию';

  @override
  String get passengerRecurringNewRoute => 'Новый маршрут';

  @override
  String get passengerRecurringEmptyTitle => 'Пока нет регулярных поездок';

  @override
  String get passengerRecurringEmptyText =>
      'Создайте маршрут — например, отвозить ребёнка в школу — и водитель будет приезжать по расписанию в выбранные дни.';

  @override
  String get passengerRecurringCancelTitle => 'Отменить регулярную поездку?';

  @override
  String passengerRecurringCancelText(String route, String days, String time) {
    return '$route, $days в $time. Это действие нельзя отменить.';
  }

  @override
  String get passengerRecurringCancelConfirm => 'Отменить поездку';

  @override
  String get passengerFavoritesAddAddressTitle => 'Какой адрес добавить?';

  @override
  String get passengerFavoritesDeleteTitle => 'Удалить адрес из избранного?';

  @override
  String passengerFavoritesDeleteText(String title, String address) {
    return '$title — $address.';
  }

  @override
  String get deleteButton => 'Удалить';

  @override
  String get passengerFavoritesSubtitle =>
      'Дом, работа и другие частые точки — быстрее вводить заказ';

  @override
  String get passengerFavoritesAddButton => 'Добавить адрес';

  @override
  String get passengerFavoritesEmptyTitle => 'Пока нет избранных адресов';

  @override
  String get passengerFavoritesEmptyText =>
      'Добавьте дом, работу или любое место, куда часто ездите — они появятся здесь для быстрого доступа.';

  @override
  String get passengerDriverAppSubtitle =>
      'Зарабатывайте на своём авто в удобном графике';

  @override
  String get passengerDriverStep1Title => 'Заполните заявку';

  @override
  String get passengerDriverStep1Text =>
      'Имя, телефон и данные автомобиля — это займёт минуту';

  @override
  String get passengerDriverStep2Title => 'Дождитесь проверки';

  @override
  String get passengerDriverStep2Text =>
      'Администратор рассматривает заявки обычно за 1–2 дня';

  @override
  String get passengerDriverStep3Title => 'Выходите на линию';

  @override
  String get passengerDriverStep3Text =>
      'После одобрения сразу доступны заказы в вашем регионе';

  @override
  String get passengerDriverAppSubmittedTitle => 'Заявка отправлена';

  @override
  String get passengerDriverAppQuestionBanner =>
      'Есть вопрос по заявке — напишите в поддержку.';

  @override
  String get passengerDriverPersonalDataGroup => 'Личные данные';

  @override
  String get passengerDriverFullNameLabel => 'Имя и фамилия';

  @override
  String get phoneLabel => 'Телефон';

  @override
  String get passengerDriverCarGroup => 'Автомобиль';

  @override
  String get passengerDriverCarModelLabel => 'Марка и модель авто';

  @override
  String get passengerDriverCarColorLabel => 'Цвет авто';

  @override
  String get passengerDriverPlateLabel => 'Госномер';

  @override
  String get passengerDriverYearLabel => 'Год выпуска';

  @override
  String get passengerDriverCommentLabel => 'Комментарий (необязательно)';

  @override
  String get passengerDriverAgreePrefix => 'Я согласен с ';

  @override
  String get passengerDriverTermsLink => 'Условиями использования';

  @override
  String get passengerDriverSafetyRulesLink => 'Правилами безопасности';

  @override
  String get passengerDriverSubmitButton => 'Отправить заявку';

  @override
  String get passengerDriverPrefsSubtitle =>
      'Отмечайте любимых водителей и блокируйте нежелательных';

  @override
  String get passengerDriverPrefsAddButton => 'Добавить из истории поездок';

  @override
  String get passengerDriverPrefsEmptyTitle => 'Пока нет отметок';

  @override
  String get passengerDriverPrefsEmptyText =>
      'Отметьте водителя из истории поездок как избранного или заблокируйте нежелательного.';

  @override
  String get passengerDriverPrefsFavoritesTitle => 'Избранные';

  @override
  String get passengerDriverPrefsFavoritesText =>
      'Регулярные поездки предложат их в первую очередь';

  @override
  String get passengerDriverPrefsBlockedTitle => 'Заблокированные';

  @override
  String get passengerDriverPrefsBlockedText =>
      'Не будут предложены на регулярные поездки';

  @override
  String get passengerReferralsSubtitle =>
      'Делитесь кодом и получайте бонусы за каждого друга';

  @override
  String get passengerReferralsYourCode => 'Ваш код';

  @override
  String get copyButton => 'Скопировать';

  @override
  String get passengerReferralsCodeCopied => 'Код скопирован';

  @override
  String get passengerReferralsShareCode => 'Поделиться кодом';

  @override
  String passengerReferralsShareMessage(String code) {
    return 'Заказывай такси в SmartTaxi по моему коду $code и получи бонус на первую поездку!';
  }

  @override
  String get passengerReferralsInvited => 'Приглашено';

  @override
  String get passengerReferralsEarned => 'Заработано';

  @override
  String get passengerReferralsHowItWorksTitle => 'Как это работает';

  @override
  String get passengerReferralsHowItWorksText =>
      'Друг вводит ваш код при регистрации. После его первой поездки вам начисляется бонус на баланс.';

  @override
  String get passengerPromoSubtitle =>
      'Проверьте промокод и узнайте размер скидки';

  @override
  String get passengerPromoHaveCode => 'Есть промокод?';

  @override
  String get passengerPromoHint =>
      'Введите его, чтобы проверить, действует ли он в вашем регионе, и увидеть размер скидки.';

  @override
  String get passengerPromoFieldHint => 'Например, SMART500';

  @override
  String get checkButton => 'Проверить';

  @override
  String get checkingButton => 'Проверяем...';

  @override
  String get passengerPromoNoRegionError =>
      'Сначала выберите регион на главном экране';

  @override
  String passengerPromoActiveTitle(String code) {
    return 'Промокод «$code» действует';
  }

  @override
  String passengerPromoDiscountSummary(
      String discount, String previewPrice, String finalPrice) {
    return 'Скидка $discount · например, на поездке за $previewPrice вы заплатите $finalPrice';
  }

  @override
  String get passengerPromoHowToApplyTitle => 'Как применить скидку';

  @override
  String get passengerPromoHowToApplyText =>
      'Промокод из этой проверки нужно будет ещё раз ввести на шаге выбора тарифа — тогда скидка сразу пересчитает итоговую цену вашей реальной поездки.';

  @override
  String get passengerHomeWhereToTitle => 'Куда едем?';

  @override
  String get passengerHomeWhereToSubtitle =>
      'Выберите точку подачи и адрес назначения';

  @override
  String get passengerHomeSetDestination => 'Указать куда';

  @override
  String get passengerHomeRouteIssueTitle => 'Уточните маршрут';

  @override
  String get passengerHomeRouteIssueText =>
      'Не удалось построить маршрут. Измените адрес или выберите точку на карте.';

  @override
  String get passengerHomePickupQuestion => 'Откуда?';

  @override
  String get passengerAddressSearchError =>
      'Поиск адреса временно недоступен. Выберите точку на карте.';

  @override
  String get passengerAddressNoResultsText =>
      'Уточните улицу, район или название места.';

  @override
  String get passengerAddressPickOnMapTitle => 'Указать на карте';

  @override
  String get passengerAddressPickOnMapSubtitle => 'Выберите точку на карте';

  @override
  String get tariffEconomyTitle => 'Эконом';

  @override
  String get tariffComfortTitle => 'Комфорт';

  @override
  String get tariffBusinessTitle => 'Бизнес';

  @override
  String get tariffDeliveryTitle => 'Доставка';

  @override
  String get passengerTariffSectionTitle => 'Выберите тариф';

  @override
  String get passengerTariffSectionText =>
      'Фиксированная цена, время и расстояние показаны для ориентира';

  @override
  String get passengerTariffFixedPriceBadge => 'Фикс. цена';

  @override
  String get passengerTariffNotConfiguredTitle => 'Тарифы пока не настроены';

  @override
  String get passengerTariffNotConfiguredText =>
      'Администратор должен добавить тариф для активного региона.';

  @override
  String get passengerTariffUnavailableTitle => 'Тарифы недоступны';

  @override
  String get passengerTariffUnavailableText =>
      'Для этого региона нужен тариф Эконом или Доставка.';

  @override
  String get passengerTariffBestValueBadge => 'Выгодно';

  @override
  String get paymentCash => 'Наличные';

  @override
  String get paymentKaspi => 'Kaspi';

  @override
  String get paymentCard => 'Картой';

  @override
  String get tariffLabel => 'Тариф';

  @override
  String get paymentMethodLabel => 'Оплата';

  @override
  String get paymentMethodFullLabel => 'Способ оплаты';

  @override
  String get passengerTripInTransitLabel => 'В пути';

  @override
  String get passengerCtaCreatingOrder => 'Создаём заказ...';

  @override
  String get passengerCtaPickPickup => 'Выбрать точку подачи';

  @override
  String get passengerCtaPickDropoff => 'Выбрать адрес назначения';

  @override
  String get passengerCtaCalculate => 'Рассчитать';

  @override
  String get passengerCtaOrderDelivery => 'Оформить доставку';

  @override
  String passengerCtaOrderWithLabel(String label) {
    return 'Заказать $label';
  }

  @override
  String get passengerCtaOrder => 'Заказать';

  @override
  String get passengerTripsSubtitle =>
      'Активный заказ, статус поездки и детали маршрута';

  @override
  String get passengerTripsLoadErrorTitle => 'Не удалось загрузить историю';

  @override
  String get passengerTripsEmptyTitle => 'Активной поездки нет';

  @override
  String get passengerTripsLoadErrorText =>
      'Проверьте связь и потяните экран вниз, чтобы попробовать снова.';

  @override
  String get passengerTripsEmptyText =>
      'Создайте заказ, и SmartTaxi откроет статус поездки здесь.';

  @override
  String get passengerGoHomeAction => 'На главную';

  @override
  String get passengerDriverSearchingLabel => 'Ищем водителя';

  @override
  String get passengerDriverWaitingLocationLabel =>
      'Ожидаем геолокацию водителя';

  @override
  String get passengerDriverConnectedLabel => 'Водитель на связи';

  @override
  String get passengerTripDetailTitle => 'Поездка';

  @override
  String get passengerTripShareTooltip => 'Поделиться чеком';

  @override
  String get passengerTripDistanceLabel => 'Расстояние';

  @override
  String get passengerTripTotalLabel => 'Итого';

  @override
  String get passengerTripDriverGroupLabel => 'Водитель';

  @override
  String get passengerTripContactSupportButton =>
      'Написать в поддержку по этой поездке';

  @override
  String get passengerTripDateUnknown => 'Дата неизвестна';

  @override
  String get passengerTripDateToday => 'Сегодня';

  @override
  String get passengerTripDateYesterday => 'Вчера';

  @override
  String get passengerTripShareTextPrefix => 'Поездка SmartTaxi';

  @override
  String passengerSearchingSubtitleWithCount(int count) {
    return 'Показываем $count ближайших свободных водителей';
  }

  @override
  String get passengerSearchingSubtitleGeneric =>
      'Проверяем свободных водителей рядом';

  @override
  String get passengerDriverOfferDescription =>
      'Предлагаем заказ ближайшим водителям.';

  @override
  String get passengerDriverRouteDescription =>
      'Показываем статус поездки и маршрут в реальном времени.';

  @override
  String get passengerTripInProgressTitle => 'Поездка в пути';

  @override
  String get passengerCancellingLabel => 'Отменяем...';

  @override
  String get passengerCancelSearchButton => 'Отменить поиск';

  @override
  String passengerTripWithIdTitle(String id) {
    return 'Поездка $id';
  }

  @override
  String get passengerDriverFoundTitle => 'Водитель найден';

  @override
  String get passengerNewTripButton => 'Новая поездка';

  @override
  String get passengerCancelTripButton => 'Отменить поездку';

  @override
  String get passengerRateDriverFallbackName => 'водителем';

  @override
  String passengerRateDriverQuestion(String name) {
    return 'Как прошла поездка с $name?';
  }

  @override
  String get passengerSubmitRatingButton => 'Отправить оценку';

  @override
  String get passengerSubmittingRatingButton => 'Отправляем...';

  @override
  String get passengerSkipButton => 'Пропустить';

  @override
  String get passengerRatedThankYouTitle => 'Спасибо за оценку!';

  @override
  String get passengerRatedThankYouText =>
      'Ваш отзыв помогает нам поддерживать качество поездок';

  @override
  String get passengerOrderAgainButton => 'Заказать снова';

  @override
  String get passengerTripCompletedTitle => 'Поездка завершена';

  @override
  String get passengerTripReceiptSubtitle => 'Чек поездки';

  @override
  String get passengerRateTripButton => 'Оценить поездку';

  @override
  String get passengerCardPaymentFailedText =>
      'Не удалось провести оплату картой';

  @override
  String get passengerRetryPaymentButton => 'Повторить оплату';

  @override
  String get passengerPaymentSlowText =>
      'Оплата занимает больше времени, чем обычно';

  @override
  String get passengerPaymentProcessingText => 'Обрабатываем оплату картой...';

  @override
  String get passengerPaymentAwaitingText => 'Ожидаем подтверждение оплаты';

  @override
  String get ratingTagPoliteDriver => 'Вежливый водитель';

  @override
  String get ratingTagCleanCar => 'Чисто в машине';

  @override
  String get ratingTagSafeDriving => 'Ехал безопасно';

  @override
  String get ratingTagOnTime => 'Приехал вовремя';

  @override
  String get ratingTagLate => 'Опоздал';

  @override
  String get ratingTagRude => 'Грубое общение';

  @override
  String get ratingTagUnsafeDriving => 'Небезопасная езда';

  @override
  String get ratingTagDirtyCar => 'Грязно в машине';

  @override
  String get passengerNoDriversTitle => 'Водителей рядом нет';

  @override
  String get passengerNoDriversText =>
      'Сейчас нет свободных водителей поблизости. Попробуйте повторить поиск через минуту или отмените заказ.';

  @override
  String get passengerRetrySearchButton => 'Повторить поиск';

  @override
  String get passengerRetryingSearchButton => 'Ищем снова...';

  @override
  String get passengerCancelOrderButton => 'Отменить заказ';

  @override
  String get passengerYourPriceLabel => 'Ваша цена';

  @override
  String get passengerDriverPriceLabel => 'Цена водителя';

  @override
  String get passengerAcceptOfferButton => 'Согласиться';

  @override
  String get passengerSendingResponseButton => 'Отправляем ответ...';

  @override
  String get passengerCounterOfferPrompt => 'Или предложите свою цену';

  @override
  String get passengerSubmitOfferButton => 'Отправить предложение';

  @override
  String get passengerDeclineOfferButton => 'Отказаться';

  @override
  String get passengerWaitingDriverResponseTitle => 'Ждём ответа водителя';

  @override
  String get passengerOfferSentText => 'Ваше предложение отправлено';

  @override
  String passengerYouOfferedText(String amount) {
    return 'Вы предложили $amount';
  }

  @override
  String get passengerCancelledByDriverTitle => 'Водитель отменил поездку';

  @override
  String get passengerCancelledByDriverText =>
      'Найдём вам другого водителя за пару секунд';

  @override
  String get passengerCancelledByOperatorTitle => 'Поездка отменена оператором';

  @override
  String get passengerCancelledByOperatorText =>
      'Если это ошибка — напишите в поддержку';

  @override
  String get passengerNoShowTitle => 'Поездка не состоялась';

  @override
  String get passengerNoShowText => 'Водитель не дождался вас на месте посадки';

  @override
  String get passengerCancelledGenericTitle => 'Поездка отменена';

  @override
  String get passengerCancelledGenericText =>
      'Вы можете заказать новую поездку в любой момент';

  @override
  String get passengerCancelTripConfirmTitle => 'Отменить поездку?';

  @override
  String get passengerCancelSearchConfirmTitle => 'Отменить поиск водителя?';

  @override
  String get passengerCancelTripConfirmText =>
      'Водитель уже направляется к вам. При частой отмене после назначения водителя может взиматься небольшая плата.';

  @override
  String get passengerCancelSearchConfirmText =>
      'Мы прекратим поиск, и заказ будет снят.';

  @override
  String get passengerCancelConfirmYesButton => 'Да, отменить';

  @override
  String get passengerCancelConfirmNoButton => 'Нет, продолжить';

  @override
  String get passengerHeadingToDropoffTitle => 'Едем к месту назначения';

  @override
  String get passengerEnRouteLowercase => 'в пути';

  @override
  String get passengerJustStartedLowercase => 'только начали';

  @override
  String passengerMinutesEnRoute(int minutes) {
    return '$minutes мин в пути';
  }

  @override
  String get passengerJustStartedCapitalized => 'Только начали';

  @override
  String get passengerShareTripTooltipEnabled =>
      'Поделиться отслеживанием поездки';

  @override
  String get passengerShareTripTooltipDisabled =>
      'Ссылка появится, как только найдётся водитель';

  @override
  String passengerShareTripMessage(String routeSuffix, String link) {
    return 'Слежу за поездкой SmartTaxi$routeSuffix. Статус: $link';
  }

  @override
  String get passengerSafetyTitle => 'Безопасность поездки';

  @override
  String passengerCallPhoneLabel(String phone) {
    return 'Позвонить $phone';
  }

  @override
  String get passengerSosEmergencyLineText =>
      'Экстренная линия SmartTaxi, если что-то пошло не так';

  @override
  String get passengerSupportWillBeNotifiedTitle => 'Поддержка получит сигнал';

  @override
  String get passengerSupportWillBeNotifiedText =>
      'Заявка с номером поездки и вашими координатами уходит в поддержку одновременно со звонком';

  @override
  String get quickMessageArrived => 'Я приехал';

  @override
  String get quickMessageWaitingAtEntrance => 'Жду у входа';

  @override
  String get quickMessageRunningLate2Min => 'Опаздываю на 2 минуты';

  @override
  String get quickMessagePleaseComeOut => 'Пожалуйста, выходите';

  @override
  String get quickMessageOnMyWay => 'Уже еду к вам';

  @override
  String get passengerChatFallbackTitle => 'Чат';

  @override
  String get passengerChatQuickPhrasesNotice =>
      'Быстрые фразы — свободный текст пока недоступен';

  @override
  String get passengerChatEmptyText => 'Сообщений пока нет';

  @override
  String get passengerChatSendFailedError => 'Не удалось отправить сообщение';

  @override
  String get messageButton => 'Написать';

  @override
  String get passengerSearchStepCheckingDrivers => 'Проверяем водителей рядом';

  @override
  String get passengerSearchStepWaitingConfirmation =>
      'Ждём подтверждение заказа';

  @override
  String get passengerSearchStepLockingFirst => 'Закрепим первого принявшего';

  @override
  String get passengerFromLabel => 'Откуда';

  @override
  String get passengerToLabel => 'Куда';

  @override
  String get passengerNotifLoadError => 'Не удалось загрузить уведомления';

  @override
  String get passengerNotifSubtitle =>
      'Статусы поездок и важные сообщения SmartTaxi';

  @override
  String get passengerNotifCategoryOrders => 'Заказы';

  @override
  String get passengerNotifCategoryService => 'Сервис';

  @override
  String get passengerNotifCategoryBonus => 'Бонусы';

  @override
  String get passengerNotifLoadErrorTitle => 'Не удалось загрузить';

  @override
  String get passengerNotifEmptyTitle => 'Новых уведомлений нет';

  @override
  String get passengerNotifEmptyCategoryTitle => 'Здесь пока пусто';

  @override
  String get passengerNotifEmptyText =>
      'Когда водитель примет заказ или поездка изменит статус, мы покажем это здесь и в статусе поездки.';

  @override
  String get passengerNotifEmptyCategoryText =>
      'В этой категории пока нет уведомлений.';

  @override
  String get passengerBonusBalanceLabel => 'Баланс кешбэка и бонусов';

  @override
  String get passengerBonusNotEnoughText =>
      'Пока не хватит на поездку по минимальному тарифу';

  @override
  String passengerBonusRidesLeft(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: 'поездок',
      many: 'поездок',
      few: 'поездки',
      one: 'поездку',
    );
    return 'Хватит ещё на $count $_temp0';
  }

  @override
  String get passengerTimeAgoJustNow => 'только что';

  @override
  String passengerTimeAgoMinutes(int minutes) {
    return '$minutes мин назад';
  }

  @override
  String passengerTimeAgoHours(int hours) {
    return '$hours ч назад';
  }

  @override
  String passengerTimeAgoDays(int days) {
    return '$days дн назад';
  }

  @override
  String get passengerMarkDriverTitle => 'Отметить водителя';

  @override
  String get passengerNoTripDriversText =>
      'Нет водителей из истории поездок, которых ещё можно отметить.';

  @override
  String get passengerChooseDriverHint => 'Выберите водителя';

  @override
  String get passengerAddToFavoritesChip => 'В избранное';

  @override
  String get passengerBlockDriverChip => 'Заблокировать';

  @override
  String get passengerAddToFavoritesTitle => 'Добавить в избранное';

  @override
  String get passengerFavoriteLabelHome => 'Дом';

  @override
  String get passengerFavoriteLabelWork => 'Работа';

  @override
  String get passengerFavoriteLabelOther => 'Другое';

  @override
  String get passengerFavoriteNameLabel => 'Название';

  @override
  String get passengerFavoriteNameHint => 'Например, «Дача» или «Спортзал»';

  @override
  String get passengerAddressSearchNotFoundError => 'Не удалось найти адрес';

  @override
  String get passengerAddressSearchHint => 'Улица, дом или место';

  @override
  String get passengerClearAction => 'Очистить';

  @override
  String get passengerSearchErrorTitle => 'Ошибка поиска';

  @override
  String get passengerEnterAddressTitle => 'Введите адрес';

  @override
  String get passengerStartTypingStreetText =>
      'Начните вводить название улицы или места';

  @override
  String get passengerTryDifferentQueryText => 'Попробуйте изменить запрос';

  @override
  String get passengerNewRecurringRouteTitle => 'Новый регулярный маршрут';

  @override
  String get passengerRecurringRouteExampleText =>
      'Например, отвозить ребёнка в школу по будням';

  @override
  String get passengerNoAvailableDriversTitle => 'Нет доступных водителей';

  @override
  String get passengerNoAvailableDriversText =>
      'Водителя можно выбрать только из тех, с кем у вас уже была поездка. Совершите хотя бы одну поездку, чтобы предложить регулярный маршрут.';

  @override
  String get passengerDayMon => 'Пн';

  @override
  String get passengerDayTue => 'Вт';

  @override
  String get passengerDayWed => 'Ср';

  @override
  String get passengerDayThu => 'Чт';

  @override
  String get passengerDayFri => 'Пт';

  @override
  String get passengerDaysOfWeekLabel => 'Дни недели';

  @override
  String get passengerPickupTimeLabel => 'Время подачи';

  @override
  String get passengerChooseTimeButton => 'Выбрать время';

  @override
  String get passengerPriceLabelTenge => 'Цена, ₸';

  @override
  String get passengerRecurringErrorChooseDriver => 'Выберите водителя';

  @override
  String get passengerRecurringErrorAddresses =>
      'Укажите точки посадки и назначения';

  @override
  String get passengerRecurringErrorDays => 'Выберите хотя бы один день недели';

  @override
  String get passengerRecurringErrorTime => 'Укажите время подачи';

  @override
  String get passengerRecurringErrorPrice =>
      'Укажите цену от 200 до 1 000 000 ₸';

  @override
  String get passengerSendToDriverButton => 'Отправить водителю';

  @override
  String get passengerSendingButton => 'Отправляем...';

  @override
  String get passengerPickupPointTitle => 'Точка посадки';

  @override
  String get passengerDropoffPointTitle => 'Точка назначения';

  @override
  String get passengerChooseAddressText => 'Выбрать адрес';

  @override
  String get passengerRecentAddressesTitle => 'Недавние адреса';

  @override
  String get passengerLocationFailedPickManuallyError =>
      'Не удалось получить геолокацию. Выберите точку подачи на карте.';

  @override
  String get statusStepSearching => 'Поиск';

  @override
  String get statusStepGoing => 'Едет';

  @override
  String get statusStepWaiting => 'Ждёт';

  @override
  String get statusStepInTransit => 'В пути';

  @override
  String get statusLabelSearching => 'Ищем водителя';

  @override
  String get statusLabelDriverFound => 'Водитель найден';

  @override
  String get statusLabelDriverGoingToClient => 'Водитель едет к вам';

  @override
  String get statusLabelDriverArrived => 'Водитель прибыл';

  @override
  String get statusLabelWaitingClient => 'Ожидание клиента';

  @override
  String get statusLabelPaymentPending => 'Ожидает оплату';

  @override
  String get statusLabelPaid => 'Оплачено';

  @override
  String get statusLabelRated => 'Спасибо за оценку';

  @override
  String get statusLabelCancelled => 'Отменён';

  @override
  String get statusLabelCancelledByDriver => 'Отменён водителем';

  @override
  String get statusLabelCancelledByOperator => 'Отменён оператором';

  @override
  String get statusLabelNoShow => 'Клиент не вышел';

  @override
  String get statusLabelUpdating => 'Статус обновляется';

  @override
  String get driverPickupMetaToDropoff => 'До места назначения';

  @override
  String get driverPickupMetaToPickup => 'До точки посадки';

  @override
  String driverPickupMetaText(String label, String distance, int minutes) {
    return '$label: $distance км · $minutes мин';
  }

  @override
  String get routeErrorWaitingLocation => 'Ожидаем геолокацию водителя.';

  @override
  String get routeErrorDriverRouteUnavailable =>
      'Маршрут водителя временно недоступен.';

  @override
  String get errorClientHasActiveOrder =>
      'У вас уже есть активный заказ. Откройте поездку или отмените её.';

  @override
  String get errorValidation => 'Проверьте адреса и попробуйте ещё раз.';

  @override
  String get errorUnauthorized => 'Сессия устарела. Войдите в аккаунт ещё раз.';

  @override
  String get errorForbidden => 'Недостаточно прав для этого действия.';

  @override
  String get errorRateLimited =>
      'Слишком много запросов. Попробуйте чуть позже.';

  @override
  String get errorPickupRegionInactive => 'В этом месте сервис пока недоступен';

  @override
  String get errorDropoffRegionInactive =>
      'Точка назначения вне активного региона';

  @override
  String get errorIntercityNotSupported => 'Межгород пока не поддерживается';

  @override
  String get errorTariffInactive => 'Этот тариф временно недоступен';

  @override
  String get errorTariffRegionMismatch =>
      'Тариф недоступен для выбранного региона';

  @override
  String get errorRouteUnavailable => 'Маршрут временно недоступен.';

  @override
  String get errorPromoCodeRequired => 'Введите промокод.';

  @override
  String get errorPromoNotFound => 'Такой промокод не найден. Проверьте код.';

  @override
  String get errorPromoNotStarted => 'Этот промокод ещё не начал действовать.';

  @override
  String get errorPromoExpired => 'Срок действия промокода истёк.';

  @override
  String get errorPromoMinOrderNotMet =>
      'Сумма заказа меньше минимальной для этого промокода.';

  @override
  String get errorPromoLimitReached =>
      'Лимит использования этого промокода исчерпан.';

  @override
  String get errorPromoAlreadyUsed => 'Вы уже использовали этот промокод.';

  @override
  String get errorServerUnavailable =>
      'Сервер недоступен. Проверьте подключение.';

  @override
  String get errorDriverNameRequired => 'Введите имя и фамилию';

  @override
  String get errorDriverPhoneRequired => 'Введите телефон';

  @override
  String get errorDriverCarRequired => 'Введите марку и модель авто';

  @override
  String get errorDriverPlateRequired => 'Введите госномер';

  @override
  String get errorDriverTermsRequired =>
      'Подтвердите согласие с условиями, чтобы отправить заявку';

  @override
  String get errorGenericRequestFailed => 'Не удалось выполнить запрос';

  @override
  String get passengerGpsOrMapHintText =>
      'Можно включить GPS для точной подачи или выбрать точку на карте.';

  @override
  String get passengerThemeLight => 'Светлая';

  @override
  String get passengerThemeDark => 'Тёмная';

  @override
  String get passengerThemeSystem => 'Как в системе';

  @override
  String get passengerLogoutConfirmTitle => 'Выйти из аккаунта?';

  @override
  String get passengerLogoutConfirmText =>
      'Придётся снова войти по номеру телефона, чтобы продолжить пользоваться SmartTaxi.';

  @override
  String get passengerCancelButton => 'Отмена';

  @override
  String get passengerLogoutButton => 'Выйти';

  @override
  String get passengerAccountLabelFallback => 'Пользователь';

  @override
  String get passengerClientOfSmartTaxi => 'Клиент SmartTaxi';

  @override
  String get passengerStatTripsLabel => 'Поездок';

  @override
  String get passengerStatSpentLabel => 'Потрачено';

  @override
  String get passengerStatRatedLabel => 'С оценкой';

  @override
  String get passengerAccountNumberLabel => '№ аккаунта';

  @override
  String get passengerPhoneLabel => 'Телефон';

  @override
  String get passengerQuickActionsGroup => 'Быстрые действия';

  @override
  String get passengerMyTripsMenuSubtitle => 'История и статус текущей поездки';

  @override
  String get passengerPromoMenuSubtitle => 'Проверить и применить скидку';

  @override
  String get passengerNotificationsMenuSubtitle =>
      'Статусы поездок и сообщения';

  @override
  String get passengerSupportMenuSubtitle => 'Напишите нам, если нужна помощь';

  @override
  String get passengerFavoriteAddressesSubtitle =>
      'Дом, работа и другие частые точки';

  @override
  String get passengerDriversMenuSubtitle =>
      'Избранные и заблокированные водители';

  @override
  String get passengerReferralsMenuSubtitle =>
      'Ваш код и бонусы за приглашения';

  @override
  String get passengerSettingsMenuSubtitle => 'Язык, разрешения, аккаунт';

  @override
  String get passengerAccountGroup => 'Аккаунт';

  @override
  String get passengerProfileSubtitle =>
      'Аккаунт, поездки и настройки SmartTaxi';

  @override
  String get passengerLocationServiceDisabledError =>
      'Геолокация выключена. Включите её в настройках или выберите точку на карте.';

  @override
  String get passengerChooseRegionTitle => 'Выберите регион';

  @override
  String get passengerChooseRegionSubtitle =>
      'Выберите регион, где хотите заказать такси.';

  @override
  String get passengerLocationSkippedManualPickText =>
      'Можно выбрать точку подачи на карте без доступа к геолокации.';

  @override
  String get passengerLocationDeniedManualPickError =>
      'Геолокация не включена. Выберите точку подачи на карте вручную.';

  @override
  String get passengerLocationOutsideRegionError =>
      'Ваше местоположение вне выбранного региона. Выберите точку подачи на карте или смените регион.';

  @override
  String get passengerCurrentLocationLabel => 'Текущее местоположение';

  @override
  String get passengerSectionUnavailableTitle => 'Раздел недоступен';

  @override
  String get passengerSectionUnavailableText =>
      'Вернитесь на главный экран и попробуйте открыть раздел ещё раз.';

  @override
  String get passengerMonthJan => 'янв';

  @override
  String get passengerMonthFeb => 'фев';

  @override
  String get passengerMonthMar => 'мар';

  @override
  String get passengerMonthApr => 'апр';

  @override
  String get passengerMonthMay => 'мая';

  @override
  String get passengerMonthJun => 'июн';

  @override
  String get passengerMonthJul => 'июл';

  @override
  String get passengerMonthAug => 'авг';

  @override
  String get passengerMonthSep => 'сен';

  @override
  String get passengerMonthOct => 'окт';

  @override
  String get passengerMonthNov => 'ноя';

  @override
  String get passengerMonthDec => 'дек';

  @override
  String get passengerNoTripsForLostItem =>
      'Нет доступных поездок, к которым можно привязать эту заявку. Опишите поездку в сообщении ниже, мы найдём водителя вручную.';

  @override
  String get passengerWhichTripLabel => 'Какая поездка?';

  @override
  String get passengerWhichTripText =>
      'Нужна для того, чтобы уведомить водителя';

  @override
  String get passengerChooseTripHint => 'Выберите поездку';

  @override
  String get authWelcomeTitle => 'Вход и регистрация';

  @override
  String get authWelcomeSubtitle => 'Введите номер телефона, чтобы продолжить';

  @override
  String get phoneNumberLabel => 'Номер телефона';

  @override
  String get authSmsConsentNotice =>
      'Мы отправим SMS с кодом подтверждения. Это быстро и безопасно.';

  @override
  String get authLegalConsentPrefix => 'Продолжая, вы принимаете';

  @override
  String get authLegalConsentJoiner => 'и';

  @override
  String get termsOfUseLink => 'Условия использования';

  @override
  String get privacyPolicyLink => 'Политику конфиденциальности';

  @override
  String get smsEnterCodeTitle => 'Введите SMS-код';

  @override
  String get smsCodeSentSubtitle => 'Код подтверждения отправлен';

  @override
  String get smsCodeHint => 'Код из 6 цифр';

  @override
  String get smsNeverShareCode => 'Никому не сообщайте код.';

  @override
  String get smsStaffNeverAsk =>
      'Сотрудники SmartTaxi никогда не попросят его.';

  @override
  String get smsCodeValidity =>
      'Код действует 5 минут. Повторная отправка доступна после таймера.';

  @override
  String get smsTermsConsent =>
      'Продолжая, вы соглашаетесь с условиями сервиса.';

  @override
  String get smsResendCode => 'Отправить код повторно';

  @override
  String get smsResendCountdown => 'Повторная отправка через';

  @override
  String get authCheckingLabel => 'Проверяем...';

  @override
  String get offlineTitle => 'Нет подключения к интернету';

  @override
  String get offlineBody =>
      'Проверьте Wi-Fi или мобильные данные. Как только связь появится, приложение продолжит работу автоматически.';

  @override
  String get offlineRetryLabel => 'Проверить снова';

  @override
  String get runtimeFallbackBody =>
      'Не удалось открыть экран. Перезапустите приложение или попробуйте войти снова.';

  @override
  String get runtimeFallbackAction => 'Вернуться на главную';

  @override
  String devCodeLabel(String devCode) {
    return 'Код для локального теста: $devCode';
  }

  @override
  String get validateEnterName => 'Введите имя';

  @override
  String get validateEnterPhone => 'Введите номер телефона';

  @override
  String get validateCorrectPhone => 'Введите корректный номер';

  @override
  String get validateSmsCode => 'Введите 6 цифр из SMS';

  @override
  String get validateConfirmPhoneFirst => 'Сначала подтвердите номер телефона';

  @override
  String get validateEnterPassword => 'Введите пароль';

  @override
  String get validateEnterNewPassword => 'Введите новый пароль';

  @override
  String get passwordHintMinChars => 'Минимум 8 символов, буквы и цифры';

  @override
  String get passwordAddLettersDigits => 'Добавьте буквы и цифры';

  @override
  String get repeatPasswordLabel => 'Повторите пароль';

  @override
  String get passwordsMismatch => 'Пароли не совпадают';

  @override
  String get invalidSmsCode => 'Неверный код. Попробуйте ещё раз.';

  @override
  String get serverUnavailable =>
      'Сервер недоступен. Проверьте интернет и попробуйте ещё раз.';

  @override
  String get smsConfirmFailed =>
      'Не удалось подтвердить код. Попробуйте ещё раз.';

  @override
  String get invalidPhoneOrPassword => 'Неверный номер или пароль';

  @override
  String get phoneAlreadyRegistered => 'Этот номер уже зарегистрирован';

  @override
  String get driverAccountBlocked => 'Аккаунт водителя заблокирован';

  @override
  String get passwordMinLength => 'Пароль должен быть не короче 6 символов';

  @override
  String get checkFilledData => 'Проверьте заполненные данные';

  @override
  String get createPasswordTitle => 'Придумайте пароль';

  @override
  String get createPasswordSubtitle =>
      'Осталось указать имя и создать пароль для входа.';

  @override
  String get createAccountButton => 'Создать аккаунт';

  @override
  String get creatingLabel => 'Создаём...';

  @override
  String get nameFieldLabel => 'Имя';

  @override
  String get passwordFieldLabel => 'Пароль';

  @override
  String get hidePasswordTooltip => 'Скрыть пароль';

  @override
  String get showPasswordTooltip => 'Показать пароль';

  @override
  String get backToSmsCode => 'Назад к SMS-коду';

  @override
  String get publicOfferTitle => 'Публичная оферта';

  @override
  String get legalDocPendingNotice =>
      'Документ ещё не готов и появится здесь после юридической проверки.';

  @override
  String get personalDataConsentTitle =>
      'Согласие на обработку персональных данных';

  @override
  String get understoodLabel => 'Понятно';

  @override
  String get closingLabel => 'Закрываем...';

  @override
  String get privacyPolicyTitle => 'Политика конфиденциальности';

  @override
  String get passwordLoginSubtitle => 'Введите пароль для входа в аккаунт';

  @override
  String get passwordLoginWelcome =>
      'Добро пожаловать! Введите пароль для входа в аккаунт';

  @override
  String get forgotPasswordLabel => 'Забыли пароль?';

  @override
  String get loggingInLabel => 'Входим...';

  @override
  String get newPasswordFieldLabel => 'Новый пароль';

  @override
  String get newPasswordSubtitle =>
      'Придумайте новый пароль для входа в аккаунт';

  @override
  String get repeatPasswordHint => 'Введите пароль ещё раз';

  @override
  String get savePasswordButton => 'Сохранить пароль';

  @override
  String get savingLabel => 'Сохраняем...';

  @override
  String get strongPasswordTitle => 'Надёжный пароль';

  @override
  String get strongPasswordHint =>
      'Используйте минимум 8 символов, буквы и цифры';

  @override
  String get secureTitle => 'Это безопасно';

  @override
  String get secureHint =>
      'Ваш пароль надёжно защищён и не передаётся третьим лицам';

  @override
  String get defaultAccountLabel => 'Аккаунт SmartTaxi';

  @override
  String get appTagline => 'Ваш комфорт. Наша забота';

  @override
  String get driverDrawerWallet => 'Кошелёк';

  @override
  String get driverDrawerDocuments => 'Документы';

  @override
  String get driverDrawerRating => 'Рейтинг';

  @override
  String get driverDrawerNotifications => 'Уведомления';

  @override
  String get driverDrawerMenuTooltip => 'Меню';

  @override
  String get driverDrawerNameFallback => 'Водитель SmartTaxi';

  @override
  String get driverDrawerWorkSection => 'Работа';

  @override
  String get driverDrawerNavigatorBrand => 'Smart Navigator';

  @override
  String get driverDrawerServiceSection => 'Сервис';

  @override
  String get driverDrawerRoadAlerts => 'Дорожные события';

  @override
  String get driverDrawerPassengerMode => 'Режим пассажира';

  @override
  String get driverWalletTitle => 'Кошелёк';

  @override
  String get driverWalletSubtitle => 'Баланс, задолженность и выплаты';

  @override
  String get driverWalletLoadError => 'Не удалось загрузить кошелёк';

  @override
  String get driverWalletBalanceLabel => 'Баланс';

  @override
  String driverWalletDebtLabel(String amount) {
    return 'Задолженность: $amount';
  }

  @override
  String driverWalletPendingLabel(String amount) {
    return 'В обработке: $amount';
  }

  @override
  String get driverWalletRequestPayoutButton => 'Запросить выплату';

  @override
  String driverWalletMinPayoutNote(String amount) {
    return 'Минимальная сумма выплаты — $amount';
  }

  @override
  String get driverWalletPayoutRequestsTitle => 'Заявки на выплату';

  @override
  String get driverWalletNoPayoutRequests => 'Заявок пока нет';

  @override
  String get driverWalletTransactionsTitle => 'Операции';

  @override
  String get driverWalletNoTransactions => 'Пока нет завершённых поездок';

  @override
  String get driverWalletTxCashCommission => 'Комиссия за наличную поездку';

  @override
  String get driverWalletTxAdjustment => 'Корректировка';

  @override
  String get driverWalletTxEarning => 'Поступление за поездку';

  @override
  String get driverPayoutStatusPending => 'На рассмотрении';

  @override
  String get driverPayoutStatusApproved => 'Одобрено';

  @override
  String get driverPayoutStatusPaid => 'Выплачено';

  @override
  String get driverPayoutStatusRejected => 'Отклонено';

  @override
  String get driverPayoutStatusCancelled => 'Отменено';

  @override
  String get driverPayoutSheetTitle => 'Запросить выплату';

  @override
  String driverPayoutSheetAvailable(String amount) {
    return 'Доступно к выводу: $amount';
  }

  @override
  String get driverPayoutAmountLabel => 'Сумма, ₸';

  @override
  String get driverPayoutPhoneLabel => 'Номер Kaspi для перевода';

  @override
  String driverPayoutErrorBelowMin(String amount) {
    return 'Минимальная сумма — $amount';
  }

  @override
  String get driverPayoutErrorExceedsBalance =>
      'Сумма превышает доступный баланс';

  @override
  String get driverPayoutErrorPhoneRequired =>
      'Укажите номер для перевода Kaspi';

  @override
  String get driverPayoutErrorGeneric =>
      'Не удалось создать заявку. Попробуйте ещё раз';

  @override
  String get driverPayoutSubmitButton => 'Отправить заявку';

  @override
  String get driverDocumentsTitle => 'Документы';

  @override
  String get driverDocumentsSubtitle =>
      'Загрузите документы для проверки администратором SmartTaxi';

  @override
  String get driverDocumentsLoadError => 'Не удалось загрузить документы';

  @override
  String get driverDocumentStatusMissing => 'Не загружен';

  @override
  String get driverDocumentStatusApproved => 'Проверен';

  @override
  String get driverDocumentStatusRejected => 'Отклонён';

  @override
  String get driverDocumentStatusPending => 'На проверке';

  @override
  String get driverDocumentUploadButton => 'Загрузить';

  @override
  String get driverDocumentReuploadButton => 'Загрузить заново';

  @override
  String get driverDocumentUploadHint => 'JPG, PNG или PDF, до 8 МБ';

  @override
  String get driverDocumentUploadError =>
      'Не удалось загрузить файл. Проверьте формат (JPG, PNG, PDF) и попробуйте снова';

  @override
  String get driverDocumentPickCamera => 'Сделать фото';

  @override
  String get driverDocumentPickFile => 'Выбрать файл';

  @override
  String get driverDocumentPickCameraShort => 'Фото';

  @override
  String get driverDocumentPickFileShort => 'Файл';

  @override
  String get driverDocumentTypeLicenseFront =>
      'Водительское удостоверение (лицевая)';

  @override
  String get driverDocumentTypeLicenseBack =>
      'Водительское удостоверение (оборот)';

  @override
  String get driverDocumentTypeIdCardFront =>
      'Удостоверение личности (лицевая)';

  @override
  String get driverDocumentTypeIdCardBack => 'Удостоверение личности (оборот)';

  @override
  String get driverDocumentTypeVehicleRegistration => 'Техпаспорт автомобиля';

  @override
  String get driverDocumentTypeInsurancePolicy => 'Страховой полис';

  @override
  String get driverDocumentTypeProfilePhoto => 'Фото профиля';

  @override
  String get driverDocumentTypeOther => 'Документ';

  @override
  String get driverApplicationDocumentsTitle => 'Документы';

  @override
  String get driverApplicationDocumentsIntro =>
      'Заявка отправлена. Чтобы ускорить проверку, загрузите документы сейчас';

  @override
  String get driverApplicationDocumentsDone => 'Готово';

  @override
  String get driverApplicationDocumentsLater => 'Продолжить позже';

  @override
  String get driverApplicationDocumentUploaded => 'Загружено';

  @override
  String get driverRatingTitle => 'Рейтинг';

  @override
  String get driverRatingSubtitle => 'Оценки и отзывы пассажиров';

  @override
  String get driverRatingLoadError => 'Не удалось загрузить рейтинг';

  @override
  String get driverRatingEmptyTitle => 'Отзывов пока нет';

  @override
  String get driverRatingEmptyText =>
      'Как только пассажиры оценят поездки, отзывы появятся здесь';

  @override
  String get driverRatingTopTagsTitle => 'Чаще всего отмечают';

  @override
  String get driverRatingRecentTitle => 'Последние отзывы';

  @override
  String get driverNotificationsTitle => 'Уведомления';

  @override
  String get driverNotificationsSubtitle =>
      'Статусы выплат, документов и заказов';

  @override
  String get driverNotificationsLoadError => 'Не удалось загрузить уведомления';

  @override
  String get driverNotificationsEmptyTitle => 'Новых уведомлений нет';

  @override
  String get driverNotificationsEmptyText =>
      'Здесь появятся статусы выплат, проверки документов и поездок';

  @override
  String get driverProfileTitle => 'Профиль водителя';

  @override
  String get driverProfileSubtitle => 'Данные аккаунта и текущей смены';

  @override
  String get driverProfileNameFallback => 'Водитель';

  @override
  String get driverProfilePhoneMissing => 'Телефон не указан';

  @override
  String get driverProfileRegionLabel => 'Рабочий регион';

  @override
  String get driverProfileRegionNotSelected => 'Не выбран';

  @override
  String get driverProfileLineStatusLabel => 'Статус линии';

  @override
  String get driverProfileOrdersTodayLabel => 'Заказов сегодня';

  @override
  String get driverProfileEarnedTodayLabel => 'Заработано сегодня';

  @override
  String get driverProfileDebtLabel => 'Задолженность';

  @override
  String get driverProfileDocumentsNote =>
      'Документы автомобиля и допуск к регионам проверяет администратор SmartTaxi.';

  @override
  String get driverProfileTripHistoryTitle => 'История поездок';

  @override
  String get driverAvatarUpdated => 'Фото обновлено';

  @override
  String get driverAvatarUploadError => 'Не удалось загрузить фото';

  @override
  String get driverSupportTitle => 'Поддержка';

  @override
  String get driverSupportSubtitle => 'Опишите проблему, мы поможем';

  @override
  String get driverSupportTopicSectionTitle => 'Тема обращения';

  @override
  String get driverSupportTopicSectionText => 'Выберите, с чем нужна помощь';

  @override
  String get driverSupportTopicOrder => 'Проблема с заказом';

  @override
  String get driverSupportTopicRegion => 'Вопрос по региону';

  @override
  String get driverSupportTopicBilling => 'Начисления и долг';

  @override
  String get driverSupportTopicOther => 'Другое';

  @override
  String get driverSupportMessageLabel => 'Сообщение';

  @override
  String get driverSupportMessageHint => 'Напишите сообщение...';

  @override
  String get driverSupportMessageTooShort =>
      'Опишите проблему подробнее: минимум 8 символов.';

  @override
  String get driverSupportMessageSent =>
      'Обращение отправлено. Администратор ответит в ближайшее время.';

  @override
  String get driverSupportSendingButton => 'Отправляем...';

  @override
  String get driverSupportSendButton => 'Отправить';

  @override
  String get driverFaqTitle => 'FAQ';

  @override
  String get driverFaqSubtitle => 'Ответы на частые вопросы водителей';

  @override
  String get driverFaqQ1 => 'Как принять заказ?';

  @override
  String get driverFaqA1 =>
      'На вкладке «Заказы» откройте карточку заказа и нажмите «Принять». Заказы с более высокой ценой от клиента показываются выше.';

  @override
  String get driverFaqQ2 => 'Почему не видно заказов?';

  @override
  String get driverFaqA2 =>
      'Проверьте, что вы на линии (вкладка «Линия»), выбран рабочий регион и включена геолокация.';

  @override
  String get driverFaqQ3 => 'Как считается задолженность?';

  @override
  String get driverFaqA3 =>
      'При оплате наличными или переводом комиссия сервиса добавляется в долг. При электронной оплате комиссия списывается автоматически.';

  @override
  String get driverFaqQ4 => 'Что означает «Своя цена»?';

  @override
  String get driverFaqA4 =>
      'Клиент может предложить цену выше или ниже расчётной. Такие заказы отмечены бейджем и показываются в списке первыми.';

  @override
  String get driverFaqQ5 => 'Как сменить рабочий регион?';

  @override
  String get driverFaqA5 =>
      'Регион выбирается на вкладке «Линия». Доступны только регионы, подтверждённые администратором.';

  @override
  String get driverFaqQ6 => 'Куда пропадают заказы, которые я пропустил?';

  @override
  String get driverFaqA6 =>
      'Пропущенный заказ остаётся доступным другим водителям в регионе, пока его не примут.';

  @override
  String get driverAboutDescription =>
      'SmartTaxi — региональный сервис такси. Водительское приложение показывает заказы только из активных регионов, подтверждённых администратором.';

  @override
  String get driverAboutVersionLabel => 'Версия приложения';

  @override
  String get driverSettingsTitle => 'Настройки';

  @override
  String get driverSettingsSubtitle => 'Аккаунт и информация о приложении';

  @override
  String get driverSettingsAccountGroup => 'Аккаунт';

  @override
  String get driverSettingsPhoneLabel => 'Номер телефона';

  @override
  String get driverSettingsPhoneMissing => 'Не указан';

  @override
  String get driverSettingsPhoneCopied => 'Номер скопирован';

  @override
  String get driverSettingsLogoutTitle => 'Выход из аккаунта';

  @override
  String get driverSettingsLogoutText => 'Завершить текущую сессию';

  @override
  String get driverSettingsInterfaceGroup => 'Интерфейс';

  @override
  String get driverSettingsLanguageLabel => 'Язык';

  @override
  String get driverSettingsAboutGroup => 'О приложении';

  @override
  String get driverSettingsTermsTitle => 'Условия использования';

  @override
  String get driverSettingsTermsText =>
      'Правила поездок, заказов и ответственности сторон';

  @override
  String get driverSettingsPrivacyTitle => 'Политика конфиденциальности';

  @override
  String get driverSettingsPrivacyText =>
      'Как используются телефон, геолокация и история поездок';

  @override
  String get driverTabLine => 'Линия';

  @override
  String get driverTabOrders => 'Заказы';

  @override
  String get driverTabTrip => 'Поездка';

  @override
  String get driverTabNavigator => 'Навигатор';

  @override
  String get driverLineRegionSectionTitle => 'Рабочий регион';

  @override
  String get driverLineRegionSectionText =>
      'Заказы поступают только из выбранного региона';

  @override
  String get driverLineRegionsLoading => 'Загружаем регионы...';

  @override
  String get driverLineNoRegionsTitle => 'Нет одобренных регионов';

  @override
  String get driverLineNoRegionsText =>
      'Администратор должен одобрить вас для работы.';

  @override
  String get driverLineLocationSectionTitle => 'Геолокация';

  @override
  String get driverLineLocationSectionText =>
      'Позиция отправляется только во время работы на линии';

  @override
  String get driverOrdersTitle => 'Заказы в регионе';

  @override
  String get driverOrdersSubtitle =>
      'Показываем заказы только в вашем рабочем регионе.';

  @override
  String get driverOrdersUpdating => 'Обновляем заказы...';

  @override
  String get driverOrdersGoOnlineTitle =>
      'Выйдите на линию, чтобы получать заказы';

  @override
  String get driverOrdersGoOnlineText =>
      'После выхода на линию заказы появятся здесь.';

  @override
  String get driverOrdersEmptyTitle => 'Заказов в вашем регионе пока нет';

  @override
  String get driverOrdersEmptyText =>
      'Новые заказы появятся здесь, когда пассажиры создадут поездку.';

  @override
  String get driverTripTitle => 'Активная поездка';

  @override
  String get driverTripSubtitle => 'Следующий шаг по поездке';

  @override
  String get driverTripEmptyTitle => 'Активной поездки нет';

  @override
  String get driverTripEmptyText => 'Примите заказ, и поездка появится здесь.';

  @override
  String driverTripTariffLabel(String tariff) {
    return 'Тариф: $tariff';
  }

  @override
  String get driverTripSavingButton => 'Сохраняем...';

  @override
  String get driverTripDoneButton => 'Готово, к новым заказам';

  @override
  String get driverTripNoShowButton => 'Клиент не вышел';

  @override
  String get driverTripCancelButton => 'Отменить';

  @override
  String get driverActionGoingToClient => 'Выехал к клиенту';

  @override
  String get driverActionArrived => 'Прибыл';

  @override
  String get driverActionStartWaiting => 'Начать ожидание';

  @override
  String get driverActionStartTrip => 'Начать поездку';

  @override
  String get driverActionCompleteTrip => 'Завершить поездку';

  @override
  String get driverStatusBusy => 'Занят';

  @override
  String get driverStatusOnline => 'На линии';

  @override
  String get driverStatusOffline => 'Не на линии';

  @override
  String get driverLocationChecking => 'Проверяем геолокацию...';

  @override
  String get driverLocationRequiredError =>
      'Для работы на линии нужна геолокация';

  @override
  String get driverLocationSendFailed =>
      'Не удалось отправить геолокацию. Попробуйте снова.';

  @override
  String get driverLocationFetchFailed =>
      'Не удалось получить геолокацию. Попробуйте снова.';

  @override
  String get driverLocationActive => 'Геолокация активна';

  @override
  String get driverGoOnlineRequiredError =>
      'Выйдите на линию, чтобы принимать заказы.';

  @override
  String get driverGoOnlineRequiredRejectError =>
      'Выйдите на линию, чтобы пропускать заказы.';

  @override
  String get driverUpdatesUnavailableNote =>
      'Связь с сервером обновлений временно недоступна. Экран продолжит работать через API.';
}
