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
  String get languageUzbek => 'Узбекский';

  @override
  String get languageChinese => 'Китайский';

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
  String get passengerDrawerWallet => 'Кошелёк';

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
  String get passengerDrawerDriverMode => 'Режим водителя';

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
      'Поездки доступны в активных регионах. Межгород доступен только по направлениям, включённым оператором.';

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
  String get passengerHomeGreeting => 'Здравствуйте!';

  @override
  String get passengerQuickHome => 'Дом';

  @override
  String get passengerQuickWork => 'Работа';

  @override
  String get passengerQuickFavorites => 'Избранное';

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
  String get passengerCancelTripShortButton => 'Отменить';

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
  String get passengerQueuedOffersTitle => 'Другие предложения водителей';

  @override
  String get passengerChooseOfferButton => 'Выбрать';

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
  String passengerNearbyCarsCount(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: 'машин',
      many: 'машин',
      few: 'машины',
      one: 'машина',
    );
    return '$count $_temp0 рядом';
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
  String get passengerPickupDestinationSameError =>
      'Точка назначения совпадает с точкой подачи. Выберите другой адрес.';

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
  String get driverRouteFallbackNotice => 'приблизительно';

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
  String get errorIntercityNotSupported =>
      'Выбранное направление межгорода временно недоступно';

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
  String get passengerWalletMenuSubtitle => 'Баланс и привязанные карты';

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
  String get passengerFavoriteAddressesSectionTitle => 'Избранные адреса';

  @override
  String get passengerDriversMenuSubtitle =>
      'Избранные и заблокированные водители';

  @override
  String get passengerReferralsMenuSubtitle =>
      'Ваш код и бонусы за приглашения';

  @override
  String get passengerWalletTitle => 'Кошелёк';

  @override
  String get passengerWalletSubtitle =>
      'Баланс, пополнение и привязанные карты';

  @override
  String get passengerWalletBalanceLabel => 'Баланс';

  @override
  String get passengerWalletTopUpButton => 'Пополнить';

  @override
  String get passengerWalletLoadError => 'Не удалось загрузить кошелёк';

  @override
  String get passengerWalletTopUpRequestsTitle => 'Заявки на пополнение';

  @override
  String get passengerWalletCardsTitle => 'Привязанные карты';

  @override
  String get passengerWalletNoCards => 'Нет привязанных карт';

  @override
  String get passengerWalletAddCardButton => 'Добавить карту';

  @override
  String get passengerWalletAddCardSubtitle =>
      'Карта сохраняется только для последующей оплаты — сейчас с неё ничего не списывается.';

  @override
  String get passengerWalletDefaultBadge => 'Основная';

  @override
  String get passengerWalletSetDefaultAction => 'Сделать основной';

  @override
  String get passengerWalletRemoveAction => 'Удалить';

  @override
  String get passengerWalletRemoveCardConfirmTitle => 'Удалить карту?';

  @override
  String passengerWalletRemoveCardConfirmText(String last4) {
    return 'Карта $last4 будет удалена.';
  }

  @override
  String get passengerCardNumberLabel => 'Номер карты';

  @override
  String get passengerCardHolderNameLabel => 'Имя владельца (необязательно)';

  @override
  String get passengerErrorInvalidCardNumber =>
      'Введите корректный номер карты';

  @override
  String get passengerErrorCardTypo =>
      'Похоже, в номере карты опечатка — проверьте и попробуйте снова';

  @override
  String get passengerWalletTopUpSheetTitle => 'Пополнение баланса';

  @override
  String get passengerWalletTopUpAmountLabel => 'Сумма пополнения';

  @override
  String passengerWalletTopUpMinNote(String amount) {
    return 'Минимальная сумма — $amount';
  }

  @override
  String get passengerWalletTopUpPendingNote =>
      'Оплата через Kaspi Pay появится в приложении позже — заявка сохранена и будет обработана автоматически, как только это станет доступно.';

  @override
  String get passengerWalletTopUpSubmitButton => 'Создать заявку';

  @override
  String get passengerWalletTopupStatusPending => 'Ожидает';

  @override
  String get passengerWalletTopupStatusCompleted => 'Выполнено';

  @override
  String get passengerWalletTopupStatusFailed => 'Не удалось';

  @override
  String get passengerWalletTopupStatusCancelled => 'Отменено';

  @override
  String get passengerSettingsMenuSubtitle => 'Язык, разрешения, аккаунт';

  @override
  String get passengerAccountGroup => 'Аккаунт';

  @override
  String get passengerProfileSubtitle =>
      'Аккаунт, поездки и настройки SmartTaxi';

  @override
  String get passengerAddressEmptyHintTitle => 'Начните вводить адрес';

  @override
  String get passengerAddressEmptyHintText =>
      'Напишите улицу, район или название места.';

  @override
  String get passengerEnableLocationTitle => 'Включите геолокацию';

  @override
  String get passengerNoLocationAccessTitle => 'Нет доступа к геолокации';

  @override
  String get passengerEnableLocationText =>
      'Чтобы находить ближайших водителей и точно определять место подачи, включите GPS на телефоне.';

  @override
  String get passengerNoLocationAccessText =>
      'SmartTaxi нужен доступ к геолокации, чтобы находить водителей рядом с вами. Разрешите доступ в настройках телефона.';

  @override
  String get passengerOpenSettingsButton => 'Открыть настройки';

  @override
  String get passengerPickPointOnMapManualButton =>
      'Выбрать точку на карте вручную';

  @override
  String get passengerLocationSheetTitle => 'Геолокация для подачи';

  @override
  String get passengerLocationSheetText =>
      'Используем ваше местоположение только для точки подачи и расчёта маршрута. Можно выбрать точку на карте вручную.';

  @override
  String get passengerAllowLocationButton => 'Разрешить геолокацию';

  @override
  String get passengerPickPointOnMapButton => 'Выбрать точку на карте';

  @override
  String get passengerPriceHintFaster => 'Быстрее найдём водителя';

  @override
  String get passengerPriceHintSlower => 'Может занять больше времени';

  @override
  String get passengerPriceHintNormal => 'Обычная скорость подачи';

  @override
  String passengerYourRegionQuestion(String region) {
    return 'Ваш регион: $region?';
  }

  @override
  String get passengerRegionDetectedText =>
      'Мы определили регион по геолокации. Проверьте, чтобы заказы работали правильно.';

  @override
  String get passengerChangeButton => 'Изменить';

  @override
  String get passengerYesCorrectButton => 'Да, верно';

  @override
  String get passengerFindCityHint => 'Найти город или район';

  @override
  String get passengerNoRegionFoundText =>
      'Уточните название региона или посёлка.';

  @override
  String get passengerPaymentCashDescription => 'Оплата водителю после поездки';

  @override
  String get passengerPaymentCardDescription => 'Оплата картой через Kaspi Pay';

  @override
  String get passengerChoosePaymentText =>
      'Выберите, как расплатиться за поездку';

  @override
  String get passengerMyLocationLabel => 'Моё местоположение';

  @override
  String get passengerChooseDropoffLabel => 'Выберите пункт назначения';

  @override
  String get passengerAddressOutsideServiceZoneError =>
      'Этот адрес вне зоны обслуживания. Выберите другой.';

  @override
  String get passengerMapPointLabel => 'Точка на карте';

  @override
  String get passengerResolvingAddressLabel => 'Определяем адрес...';

  @override
  String get passengerRegionNotServedYetLabel =>
      'Пока не работаем в этом районе';

  @override
  String get passengerPointOutsideRegionError =>
      'Эта точка вне выбранного региона. Смените регион или выберите точку внутри зоны SmartTaxi.';

  @override
  String get passengerMapLoadingTitle => 'Карта загружается';

  @override
  String get passengerMapLoadingSubtitle => 'Подключаем карту города';

  @override
  String get passengerMapUnavailableTitle => 'Карта временно недоступна';

  @override
  String get passengerMapUnavailableText =>
      'Маршрут и заказ можно выбрать вручную. Карта восстановится после подключения.';

  @override
  String get passengerAllowGeolocationTooltip => 'Разрешить геолокацию';

  @override
  String get passengerCalculatingRouteText => 'Считаем маршрут...';

  @override
  String get passengerRouteReadyText => 'Маршрут готов';

  @override
  String get passengerVerifiedDriversSubtitle =>
      'Проверенные водители · Безопасные поездки';

  @override
  String get passengerAddressNotePlaceholder =>
      'Описать место (дверь, подъезд, этаж)';

  @override
  String get passengerMapMarkerDragHint =>
      'Подвиньте карту так, чтобы маркер стоял над нужным входом.';

  @override
  String get passengerOrderNoteSheetTitle => 'Описать место';

  @override
  String get passengerOrderNoteSheetSubtitle =>
      'Например: домофон 45, второй подъезд, встретить у шлагбаума';

  @override
  String get passengerOrderNoteFieldLabel => 'Комментарий для водителя';

  @override
  String get passengerOrderNoteFieldHint => 'Где вас найти или куда ехать...';

  @override
  String get passengerDeleteNoteButton => 'Удалить комментарий';

  @override
  String get passengerConfirmAddressButton => 'Подтвердить адрес';

  @override
  String get passengerRecurringStatusActive => 'Активна';

  @override
  String get passengerRecurringStatusPaused => 'На паузе';

  @override
  String get passengerRecurringStatusCancelled => 'Отменена';

  @override
  String get passengerRecurringStatusAwaitingDriver => 'Ждём водителя';

  @override
  String get passengerRecurringStatusSkippedToday => 'Пропущена сегодня';

  @override
  String get passengerRecurringSkippedTodayText =>
      'Сегодня поездка не состоялась: не нашлось свободного водителя. В следующий раз по расписанию всё сработает как обычно.';

  @override
  String get passengerRecurringPauseButton => 'Пауза';

  @override
  String get passengerRecurringResumeButton => 'Возобновить';

  @override
  String get passengerRecurringAwaitingDriverConfirmationText =>
      'Ждём подтверждения от водителя';

  @override
  String get passengerRecurringCancelButton => 'Отменить';

  @override
  String get passengerDriverArrivedWaitingBanner =>
      'Водитель приехал и ждёт вас';

  @override
  String passengerCopiedValueToast(String value) {
    return 'Скопировано: $value';
  }

  @override
  String passengerCopyLabelSemantics(String label) {
    return 'Скопировать $label';
  }

  @override
  String get passengerDriverAppSubmittedMessage =>
      'Заявка отправлена. Администратор проверит данные.';

  @override
  String get passengerServerUnavailableError =>
      'Сервер временно недоступен. Можно выбрать маршрут, когда подключение восстановится.';

  @override
  String get passengerRecurringSentToDriverToast =>
      'Заявка отправлена водителю, ждём подтверждения';

  @override
  String get passengerRecurringCancelledToast => 'Регулярная поездка отменена';

  @override
  String get passengerRecurringPausedToast =>
      'Регулярная поездка приостановлена';

  @override
  String get passengerRecurringResumedToast =>
      'Регулярная поездка возобновлена';

  @override
  String get passengerAddressAddedToFavoritesToast =>
      'Адрес добавлен в избранное';

  @override
  String get passengerAddressRemovedFromFavoritesToast =>
      'Адрес удалён из избранного';

  @override
  String get passengerDriverBlockedToast => 'Водитель заблокирован';

  @override
  String get passengerDriverAddedToFavoritesToast =>
      'Водитель добавлен в избранное';

  @override
  String get passengerEntryDeletedToast => 'Запись удалена';

  @override
  String get passengerActiveRegionsNotLoadedError =>
      'Активные регионы пока не загружены';

  @override
  String get passengerDriverFoundExclamation => 'Водитель найден!';

  @override
  String passengerDriverFoundNamedText(String name) {
    return 'Водитель найден: $name едет к вам';
  }

  @override
  String get passengerDriverCancelledSearchingAnotherToast =>
      'Водитель отменил поездку — ищем для вас другого';

  @override
  String get passengerPaymentInitiateFailedError =>
      'Не удалось начать оплату. Проверьте соединение.';

  @override
  String get passengerLoginRequiredForOrderError =>
      'Для заказа войдите по номеру телефона.';

  @override
  String passengerAcceptedNewPriceToast(String amount) {
    return 'Вы согласились на новую цену: $amount';
  }

  @override
  String get passengerDeclinedOfferedPriceToast =>
      'Вы отклонили предложенную цену';

  @override
  String passengerCounterOfferSentToast(String amount) {
    return 'Ваше предложение отправлено водителю: $amount';
  }

  @override
  String passengerQueuedOfferArrivedToast(String amount) {
    return 'Ещё один водитель предложил цену: $amount';
  }

  @override
  String get passengerLegalHubTitle => 'Правовая информация';

  @override
  String get passengerLegalHubSubtitle =>
      'Официальные документы SmartTaxi, редакция от 6 июля 2026 года';

  @override
  String get passengerAllDocumentsButton => 'Все документы';

  @override
  String get passengerSupportStatusResolved => 'Отвечено';

  @override
  String get passengerSupportStatusPending => 'В обработке';

  @override
  String get passengerSupportResponseLabel => 'Ответ поддержки';

  @override
  String get passengerPickupPointSemanticLabel => 'Точка подачи';

  @override
  String get passengerDropoffPointSemanticLabel => 'Точка назначения';

  @override
  String passengerNearbyFreeDriverSemanticLabel(int eta) {
    return 'Свободный водитель рядом, $eta мин';
  }

  @override
  String get passengerDriverCarSemanticLabel => 'Автомобиль водителя';

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
  String get sessionExpiredOtherDevice =>
      'Вы вышли из аккаунта, так как был выполнен вход с другого устройства';

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
  String get referralCodeFieldLabel => 'Код приглашения (необязательно)';

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
  String get driverWalletTopUpButton => 'Пополнить баланс';

  @override
  String get driverWalletTopupRequestsTitle => 'Заявки на пополнение';

  @override
  String get driverWalletNoTopupRequests => 'Заявок пока нет';

  @override
  String get driverTopupStatusPending => 'Ожидает зачисления';

  @override
  String get driverTopupSheetTitle => 'Пополнить баланс';

  @override
  String get driverTopupSheetHint =>
      'Укажите сумму. Менеджер свяжется с вами, чтобы принять перевод и зачислить средства';

  @override
  String get driverTopupAmountLabel => 'Сумма, ₸';

  @override
  String driverTopupErrorBelowMin(String amount) {
    return 'Минимальная сумма — $amount';
  }

  @override
  String get driverTopupErrorGeneric =>
      'Не удалось создать заявку. Попробуйте ещё раз';

  @override
  String get driverTopupSubmitButton => 'Отправить заявку';

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
  String get driverSupportHistoryTitle => 'Ваши обращения';

  @override
  String get driverSupportStatusResolved => 'Отвечено';

  @override
  String get driverSupportStatusPending => 'В обработке';

  @override
  String get driverSupportResponseLabel => 'Ответ поддержки';

  @override
  String get driverSupportLoadError => 'Не удалось загрузить обращения';

  @override
  String get driverTripHistoryLoadError =>
      'Не удалось загрузить историю поездок';

  @override
  String get driverSupportEmptyTitle => 'Обращений пока нет';

  @override
  String get driverSupportEmptyText =>
      'Здесь появятся ваши обращения в поддержку и ответы на них';

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

  @override
  String get driverManeuverTurnLeft => 'Поворот налево';

  @override
  String get driverManeuverTurnRight => 'Поворот направо';

  @override
  String get driverManeuverSlightLeft => 'Держитесь левее';

  @override
  String get driverManeuverSlightRight => 'Держитесь правее';

  @override
  String get driverManeuverSharpLeft => 'Крутой поворот налево';

  @override
  String get driverManeuverSharpRight => 'Крутой поворот направо';

  @override
  String get driverManeuverUturn => 'Разворот';

  @override
  String get driverManeuverStraight => 'Двигайтесь прямо';

  @override
  String get driverManeuverMergeLeft => 'Перестройтесь влево';

  @override
  String get driverManeuverMergeRight => 'Перестройтесь вправо';

  @override
  String get driverManeuverOnRamp => 'Съезд на трассу';

  @override
  String get driverManeuverOffRamp => 'Съезд с трассы';

  @override
  String driverManeuverRoundaboutWithExit(int exit) {
    return 'Круговое движение, $exit-й съезд';
  }

  @override
  String get driverManeuverRoundabout => 'Круговое движение';

  @override
  String get driverManeuverExitRoundabout => 'Съезд с кругового движения';

  @override
  String get driverManeuverArrive => 'Вы почти на месте';

  @override
  String get driverManeuverFollowRoute => 'Двигайтесь по маршруту';

  @override
  String get driverPaymentCashback => 'Бонусы';

  @override
  String get driverPaymentMixed => 'Смешанная';

  @override
  String driverRouteMetaLabel(String details) {
    return 'Маршрут: $details';
  }

  @override
  String get driverOrderStatusNew => 'Новый';

  @override
  String get driverOrderStatusAccepted => 'Принят';

  @override
  String get driverOrderStatusGoingToClient => 'Едет к клиенту';

  @override
  String get driverOrderStatusWaiting => 'Ожидание';

  @override
  String get driverOrderStatusCompleted => 'Завершено';

  @override
  String get driverOrderStatusPaymentPending => 'Ожидает оплату';

  @override
  String get driverOrderStatusRated => 'Оценено';

  @override
  String get driverOrderStatusCancelledByDriver => 'Отменён водителем';

  @override
  String get driverOrderStatusCancelledByClient => 'Отменён клиентом';

  @override
  String get driverOrderStatusCancelledByOperator => 'Отменён оператором';

  @override
  String get driverOrderStatusCancelled => 'Отменён';

  @override
  String get driverErrorRegionNotSelected => 'Выберите рабочий регион';

  @override
  String get driverErrorRegionInactive => 'Регион временно отключён';

  @override
  String get driverErrorRegionNotApproved => 'Вы не одобрены для этого региона';

  @override
  String get driverErrorRegionBlocked => 'Работа в этом регионе заблокирована';

  @override
  String get driverErrorDriverBlocked => 'Водитель заблокирован';

  @override
  String get driverErrorDocumentsNotApproved =>
      'Сервер ещё требует проверку документов — обратитесь в поддержку';

  @override
  String get driverErrorHasActiveOrder => 'У вас уже есть активный заказ';

  @override
  String get driverErrorOrderAlreadyAccepted =>
      'Заказ уже принят другим водителем';

  @override
  String get driverErrorInvalidStatusTransition =>
      'Этот шаг уже недоступен для заказа';

  @override
  String get driverErrorForbiddenOrder =>
      'Этот заказ назначен другому водителю';

  @override
  String get driverErrorOrderRegionMismatch =>
      'Заказ вне вашего рабочего региона';

  @override
  String get driverErrorOrderNotFound => 'Заказ не найден';

  @override
  String get driverErrorDebtLimit =>
      'Превышен лимит долга. Свяжитесь с оператором';

  @override
  String get driverErrorLocationOutsideRegion =>
      'Геолокация вне рабочего региона';

  @override
  String get driverErrorLocationUnavailable => 'Ожидаем геолокацию водителя';

  @override
  String get driverErrorOrderNotCompleted =>
      'Оплата поездки ещё не подтверждена оператором.';

  @override
  String get driverErrorOrderAlreadyRated => 'Вы уже оценили этого пассажира';

  @override
  String get driverPassengerFallback => 'Пассажир';

  @override
  String get driverStepperAccepted => 'Принят';

  @override
  String get driverStepperGoing => 'Едет';

  @override
  String get driverStepperArrived => 'Прибыл';

  @override
  String get driverStepperWaiting => 'Ждём';

  @override
  String get driverStepperInTransit => 'В пути';

  @override
  String get driverStepperFinish => 'Финиш';

  @override
  String get driverNewOrderTitle => 'Новый заказ';

  @override
  String get driverWorkingRegionLabel => 'Рабочий регион';

  @override
  String driverTariffLabel(String tariff) {
    return 'Тариф $tariff';
  }

  @override
  String get driverPriceAfterCalculation => 'Цена после расчёта';

  @override
  String get driverCustomPriceBadge => 'Своя цена';

  @override
  String get driverSkippingButton => 'Пропускаем...';

  @override
  String get driverSkipButton => 'Пропустить';

  @override
  String get driverAcceptingButton => 'Принимаем...';

  @override
  String get driverAcceptButton => 'Принять';

  @override
  String get driverDeclineButton => 'Отказаться';

  @override
  String get driverRespondingButton => 'Отвечаем...';

  @override
  String driverClientOfferedCustomPrice(String price) {
    return 'Клиент предложил $price';
  }

  @override
  String get driverClientOfferedCustomPriceGeneric => 'свою цену';

  @override
  String get driverAwaitingClientResponse => 'Ожидаем ответа клиента';

  @override
  String driverAwaitingClientResponseWithPrice(String price) {
    return 'Ожидаем ответа: $price';
  }

  @override
  String get driverOfferCustomPriceButton => 'Предложить свою цену';

  @override
  String get driverPaidWaitingLabel => 'Платное ожидание';

  @override
  String get driverFreeWaitingLabel => 'Бесплатное ожидание';

  @override
  String get driverTripDistanceCoveredLabel => 'Пройдено в этой поездке';

  @override
  String get driverTripCompletedTitle => 'Поездка завершена';

  @override
  String get driverTripCostLabel => 'Стоимость поездки';

  @override
  String get driverServiceCommissionLabel => 'Комиссия сервиса';

  @override
  String get driverYouReceiveLabel => 'Вы получите';

  @override
  String get driverConfirmPaymentTitle => 'Клиент оплатил поездку?';

  @override
  String get driverConfirmPaymentHint =>
      'Подтвердите получение оплаты, чтобы продолжить и оценить пассажира';

  @override
  String get driverConfirmPaymentButton => 'Оплата получена';

  @override
  String get driverConfirmingPaymentButton => 'Подтверждаем...';

  @override
  String get driverRatePassengerTitle => 'Оцените пассажира';

  @override
  String get driverRatingTagPolitePassenger => 'Вежливый пассажир';

  @override
  String get driverRatingTagWaitedAtPickup => 'Ждал в точке посадки';

  @override
  String get driverRatingTagExactAddress => 'Точный адрес';

  @override
  String get driverRatingTagOnTimeExit => 'Вышел вовремя';

  @override
  String get driverRatingTagLongNoShow => 'Долго не выходил';

  @override
  String get driverRatingTagRudeCommunication => 'Грубое общение';

  @override
  String get driverRatingTagWrongAddress => 'Неточный адрес';

  @override
  String get driverRatingTagDirtyInterior => 'Испачкал салон';

  @override
  String get driverCommentOptionalHint => 'Комментарий (необязательно)';

  @override
  String get driverSendingRatingButton => 'Отправляем...';

  @override
  String get driverSubmitRatingButton => 'Отправить оценку';

  @override
  String get driverRatingThanksMessage => 'Спасибо, оценка отправлена';

  @override
  String get driverRatingSkippedMessage => 'Оценка пропущена';

  @override
  String get driverFavoriteAddedLabel => 'В избранном';

  @override
  String get driverFavoriteAddButton => 'В избранные';

  @override
  String get driverBlockedLabel => 'Заблокирован';

  @override
  String get driverBlockButton => 'Не принимать';

  @override
  String get doneButton => 'Готово';

  @override
  String driverStarRatingSemanticLabel(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: 'звёзд',
      many: 'звёзд',
      few: 'звезды',
      one: 'звезда',
    );
    return 'Оценка: $count $_temp0';
  }

  @override
  String get driverUpdatingGeneric => 'Обновляем...';

  @override
  String get driverEmergencyHelpTitle => 'Экстренная помощь';

  @override
  String driverEmergencyCallButton(String phone) {
    return 'Позвонить $phone';
  }

  @override
  String get driverEmergencyLineSubtitle =>
      'Экстренная линия SmartTaxi, если что-то пошло не так';

  @override
  String get driverSupportWillReceiveSignal => 'Поддержка получит сигнал';

  @override
  String get driverSupportSignalDescription =>
      'Заявка с вашими координатами и номером поездки (если есть) уходит в поддержку одновременно со звонком';

  @override
  String get driverChooseRegionButton => 'Выбрать регион';

  @override
  String get driverTodayLabel => 'Сегодня';

  @override
  String get driverGoOfflineButton => 'Уйти с линии';

  @override
  String get driverGoOnlineButton => 'Выйти на линию';

  @override
  String get driverDemandHigh => 'Высокий';

  @override
  String get driverDemandAboveNormal => 'Выше';

  @override
  String get driverDemandNormal => 'Норма';

  @override
  String get driverTripsTodayLabel => 'Поездок сегодня';

  @override
  String get driverNewOrdersLabel => 'Новых заказов';

  @override
  String get driverDemandNearbyLabel => 'Спрос рядом';

  @override
  String get driverLocationOnlineHint =>
      'Геолокация отправляется только во время работы на линии.';

  @override
  String get driverUpdatingStatusButton => 'Обновляем статус...';

  @override
  String get driverPayoutMethodTitle => 'Способ выплаты';

  @override
  String driverPayoutCardSummary(String last4) {
    return 'Карта •• •• •• $last4';
  }

  @override
  String driverPayoutKaspiSummary(String phone) {
    return 'Kaspi-перевод: $phone';
  }

  @override
  String get driverPayoutMethodNotSet =>
      'Не указан — добавьте, чтобы выводить средства';

  @override
  String get driverPayoutMethodSubtitle =>
      'Куда переводить деньги при выводе средств';

  @override
  String get driverPayoutMethodKaspiOption => 'Kaspi-перевод';

  @override
  String get driverPayoutMethodCardOption => 'Карта';

  @override
  String get driverCardNumberLabel => 'Номер карты';

  @override
  String get driverPhoneNumberKaspiLabel => 'Номер телефона (Kaspi)';

  @override
  String get driverSavingButton => 'Сохраняем...';

  @override
  String get driverErrorInvalidCardNumber => 'Введите корректный номер карты';

  @override
  String get driverErrorPhoneRequiredGeneric => 'Введите номер телефона';

  @override
  String get driverErrorCardTypo =>
      'Похоже, в номере карты опечатка — проверьте и попробуйте снова';

  @override
  String get driverErrorSaveFailedGeneric =>
      'Не удалось сохранить. Проверьте данные и попробуйте снова.';

  @override
  String get driverPayoutMethodNotSetShort => 'Способ выплаты не указан';

  @override
  String get addButton => 'Добавить';

  @override
  String driverReviewsCountLabel(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: 'отзывов',
      many: 'отзывов',
      few: 'отзыва',
      one: 'отзыв',
    );
    return '$count $_temp0';
  }

  @override
  String driverTopTagLabel(String tag, int count) {
    return '$tag · $count';
  }

  @override
  String driverClientAcceptedPriceToast(String price) {
    return 'Клиент принял вашу цену: $price';
  }

  @override
  String get driverClientDeclinedOfferToast =>
      'Клиент отклонил ваше предложение цены';

  @override
  String driverClientCounterOfferToast(String price) {
    return 'Клиент предложил свою цену: $price';
  }

  @override
  String driverSpeedLimitAnnouncement(int limit) {
    return 'Ограничение скорости $limit';
  }

  @override
  String get driverCameraIn500mVoice => 'Через 500 метров камера';

  @override
  String driverCameraIn500mBanner(String heading) {
    return 'Камера через 500 м$heading';
  }

  @override
  String get driverCameraIn200mVoice => 'Через 200 метров камера';

  @override
  String driverCameraIn200mBanner(String heading) {
    return 'Камера через 200 м$heading';
  }

  @override
  String get driverCameraNowVoice => 'Камера';

  @override
  String driverCameraNowBanner(String heading) {
    return 'Камера$heading';
  }

  @override
  String driverSignBannerLabel(String sign) {
    return 'Знак: $sign';
  }

  @override
  String get driverSpeedingVoiceWarning => 'Превышение скорости';

  @override
  String driverManeuverIn200mVoice(String maneuver, String street) {
    return 'Через 200 метров $maneuver$street';
  }

  @override
  String driverStreetSuffix(String street) {
    return ' на $street';
  }

  @override
  String get driverPriceOfferSentToast => 'Предложение цены отправлено клиенту';

  @override
  String get driverAcceptedClientPriceToast =>
      'Вы приняли цену клиента — заказ ваш';

  @override
  String get driverDeclinedClientOfferToast =>
      'Вы отклонили предложение клиента';

  @override
  String get driverSettingsPayoutsGroup => 'Выплаты';

  @override
  String get driverLogoutConfirmText =>
      'Придётся снова войти по номеру телефона, чтобы продолжить работу в SmartTaxi.';

  @override
  String get driverMustGoOfflineToChangeRegion =>
      'Чтобы сменить регион, сначала уйдите с линии';

  @override
  String get driverQuickMessageToClientButton => 'Быстрое сообщение клиенту';

  @override
  String get driverNoShowConfirmTitle => 'Клиент не вышел?';

  @override
  String get driverNoShowConfirmText =>
      'Поездка будет отмечена как неявка клиента — убедитесь, что вы дождались бесплатное время ожидания.';

  @override
  String get driverNoShowConfirmButton => 'Подтвердить неявку';

  @override
  String get driverCancelTripConfirmTitle => 'Отменить поездку?';

  @override
  String get driverCancelTripConfirmText =>
      'Заказ вернётся в поиск для других водителей. Частые отмены могут повлиять на ваш рейтинг.';

  @override
  String get back => 'Назад';

  @override
  String get pressBackAgainToExit => 'Нажмите «Назад» ещё раз, чтобы выйти';

  @override
  String get driverNoApprovedRegionsTitle => 'Нет одобренных регионов';

  @override
  String get driverChooseWorkingRegionTitle => 'Выберите рабочий регион';

  @override
  String get driverRegionTemporarilyDisabledTitle => 'Регион временно отключён';

  @override
  String get driverRegionWorkBlockedTitle =>
      'Работа в этом регионе заблокирована';

  @override
  String get driverRegionNotApprovedTitle => 'Вы не одобрены для этого региона';

  @override
  String get driverNoRegionsMessage =>
      'Чтобы выйти на линию, нужен хотя бы один одобренный регион. Напишите в поддержку, чтобы вам открыли доступ к региону.';

  @override
  String get driverContactSupportAction => 'Написать в поддержку';

  @override
  String get driverChooseRegionMessage =>
      'У вас есть одобренные регионы — выберите один, чтобы начать принимать заказы.';

  @override
  String driverRegionPausedMessage(String region) {
    return 'Работа в регионе «$region» сейчас приостановлена. ';
  }

  @override
  String get driverTryLaterOrChangeRegion =>
      'Попробуйте позже или выберите другой регион.';

  @override
  String get driverTryLater => 'Попробуйте позже.';

  @override
  String get driverChangeRegionAction => 'Сменить регион';

  @override
  String get driverAccessBlockedTitle => 'Доступ заблокирован';

  @override
  String driverRegionBlockedByAdminMessage(String region) {
    return 'Работа в регионе «$region» заблокирована администратором.';
  }

  @override
  String get driverApplicationUnderReviewTitle => 'Заявка на рассмотрении';

  @override
  String driverApplicationUnderReviewMessage(String region) {
    return 'Мы проверяем ваш доступ к региону «$region». Обычно это занимает немного времени.';
  }

  @override
  String get driverStatusUnavailableByRegion => 'Недоступен по региону';

  @override
  String get driverRegionStatusDisabled => 'Отключён';

  @override
  String get driverRegionStatusBlocked => 'Заблокирован';

  @override
  String get driverRegionStatusApproved => 'Одобрен';

  @override
  String get driverRegionStatusUnderReview => 'На рассмотрении';

  @override
  String get driverFreeModeLabel => 'Свободный режим';

  @override
  String get driverActiveOrderLabel => 'Активный заказ';

  @override
  String get driverYourCarSemanticLabel => 'Ваш автомобиль';

  @override
  String get driverDisableVoiceHints => 'Выключить голосовые подсказки';

  @override
  String get driverEnableVoiceHints => 'Включить голосовые подсказки';

  @override
  String get driverReportRoadEventSemanticLabel =>
      'Сообщить о дорожном событии';

  @override
  String get driverRecenterSemanticLabel => 'Вернуться к текущей позиции';

  @override
  String get driverSpeedLabel => 'Скорость';

  @override
  String get driverNavigatorNoRouteLabel => 'Маршрут не выбран';

  @override
  String get driverLimitLabel => 'Лимит';

  @override
  String get driverSearchingGpsSignal => 'Ищу сигнал GPS…';

  @override
  String get driverRouteWillAppearAfterCalc => 'Маршрут появится после расчёта';

  @override
  String get driverRouteToPickupPoint => 'Маршрут до точки посадки';

  @override
  String get driverQuickMessageArrived => 'Я приехал';

  @override
  String get driverQuickMessageWaitingAtEntrance => 'Жду у входа';

  @override
  String get driverQuickMessageRunningLate2Min => 'Опаздываю на 2 минуты';

  @override
  String get driverQuickMessagePleaseComeOut => 'Пожалуйста, выходите';

  @override
  String get driverQuickMessageOnMyWay => 'Уже еду к вам';

  @override
  String driverQuickMessageSentToast(String text) {
    return 'Отправлено: $text';
  }

  @override
  String get driverQuickMessageSheetTitle => 'Быстрое сообщение';

  @override
  String get driverPriceOfferRangeError => 'Введите цену от 200 до 1 000 000 ₸';

  @override
  String get driverPriceOfferSheetTitle => 'Предложить свою цену';

  @override
  String get driverPriceOfferSheetSubtitle =>
      'Клиент увидит вашу цену и сможет согласиться или отказаться';

  @override
  String driverCurrentOrderPriceLabel(String price) {
    return 'Текущая цена заказа: $price';
  }

  @override
  String get driverPriceFieldLabel => 'Цена, ₸';

  @override
  String get driverSendOfferButton => 'Отправить предложение';

  @override
  String get driverRouteAcceptedToast => 'Маршрут принят';

  @override
  String get driverRouteDeclinedToast => 'Маршрут отклонён';

  @override
  String get driverRecurringTitle => 'Регулярные поездки';

  @override
  String get driverRecurringSubtitle =>
      'Входящие заявки и ваши активные маршруты';

  @override
  String get driverRecurringEmptyTitle => 'Пока нет заявок';

  @override
  String get driverRecurringEmptyText =>
      'Клиенты смогут предложить вам регулярный маршрут после совместной поездки.';

  @override
  String get driverRecurringNewRequestsTitle => 'Новые заявки';

  @override
  String get driverRecurringNewRequestsText =>
      'Примите, если готовы возить по расписанию';

  @override
  String get driverRecurringYourRoutesTitle => 'Ваши маршруты';

  @override
  String get driverRecurringNewRequestLabel => 'Новая заявка';

  @override
  String get driverRejectButton => 'Отклонить';

  @override
  String get driverEnableLocationOrPickOnMap =>
      'Включите геолокацию или выберите точку на карте.';

  @override
  String get driverAllowLocationOrPickOnMap =>
      'Разрешите геолокацию или выберите точку на карте.';

  @override
  String get driverCoordinatesFromGps => 'Координаты выбраны из GPS.';

  @override
  String get driverFailedToGetLocation => 'Не удалось получить геолокацию.';

  @override
  String get driverChooseAlertPointOnMapOrGps =>
      'Выберите точку события на карте или через GPS.';

  @override
  String get driverEnterSpeedLimitNumber =>
      'Укажите ограничение скорости числом.';

  @override
  String get driverAlertSubmittedForSafety =>
      'Событие отправлено для безопасности движения.';

  @override
  String get driverAlertConfirmedThanks =>
      'Спасибо. Подтверждение поможет другим водителям.';

  @override
  String get driverAlertHiddenFromList => 'Событие скрыто из активного списка.';

  @override
  String get driverRoadAlertsTitle => 'Дорожные события';

  @override
  String get driverRoadAlertsSubtitle =>
      'Отмеченные камеры и опасные участки сразу видны другим водителям на навигаторе — это помогает всем на дороге.';

  @override
  String get refreshButton => 'Обновить';

  @override
  String get driverPointSelectedOnMap => 'Координаты выбраны на карте.';

  @override
  String get driverNewAlertSectionTitle => 'Новое событие';

  @override
  String get driverNewAlertSectionText =>
      'Выберите тип и точку. Сообщение увидят водители в регионе.';

  @override
  String get driverAlertCommentLabel => 'Комментарий';

  @override
  String get driverAlertCommentHint => 'Например: правая полоса закрыта';

  @override
  String get driverAlertSpeedLimitLabel => 'Ограничение, км/ч';

  @override
  String get driverAlertSpeedLimitHint => 'Только если указано знаком';

  @override
  String driverPointSelectedCoordinates(String lat, String lng) {
    return 'Точка выбрана: $lat, $lng';
  }

  @override
  String get driverNearbyAlertsTitle => 'События рядом';

  @override
  String get driverNearbyAlertsSubtitle =>
      'Показываем только сохранённые активные сообщения.';

  @override
  String get driverLoadingAlerts => 'Загружаем события...';

  @override
  String get driverAlertsLoadFailedTitle => 'Не удалось загрузить события';

  @override
  String get driverCheckConnectionRetry =>
      'Проверьте связь и попробуйте ещё раз.';

  @override
  String get driverNoNearbyAlertsTitle => 'Пока нет дорожных событий рядом';

  @override
  String get driverNoNearbyAlertsText =>
      'Когда водитель отправит сообщение, оно появится здесь.';

  @override
  String get driverTapMapToSelectAlertPoint =>
      'Нажмите на карту, чтобы выбрать точку события';

  @override
  String get driverMapUnavailableUseGps =>
      'Карта временно недоступна. Выберите точку через GPS или повторите позже.';

  @override
  String get roadAlertHazard => 'Дорожная опасность';

  @override
  String get roadAlertAccident => 'ДТП';

  @override
  String get roadAlertRoadWork => 'Ремонт дороги';

  @override
  String get roadAlertSpeedCamera => 'Камера скорости';

  @override
  String get roadAlertPolice => 'Контроль движения';

  @override
  String get roadAlertTrafficJam => 'Пробка';

  @override
  String get roadAlertRoadClosed => 'Закрытая дорога';

  @override
  String get roadAlertBadRoad => 'Плохая дорога';

  @override
  String get roadAlertPothole => 'Яма';

  @override
  String get roadAlertSpeedBump => 'Лежачий полицейский';

  @override
  String get roadAlertIcyRoad => 'Скользкая дорога';

  @override
  String get roadAlertSchoolZone => 'Школьная зона';

  @override
  String get roadAlertTemporarySpeedLimit => 'Временное ограничение';

  @override
  String get roadAlertDangerousTurn => 'Опасный поворот';

  @override
  String get roadAlertRailroadCrossing => 'Ж/д переезд';

  @override
  String get roadAlertPedestrianCrossing => 'Пешеходный переход';

  @override
  String get roadAlertOther => 'Другое';

  @override
  String driverAlertConfidenceLabel(int score, int count) {
    return 'Доверие: $score% · подтверждений: $count';
  }

  @override
  String driverAlertSpeedLimitDetail(int limit) {
    return 'Ограничение: $limit км/ч';
  }

  @override
  String driverAlertHeadingDetail(String direction) {
    return 'Смотрит: $direction';
  }

  @override
  String get driverConfirmAlertButton => 'На месте';

  @override
  String get noButton => 'Нет';

  @override
  String driverInDistanceLabel(String distance) {
    return 'Через $distance';
  }

  @override
  String get roadAlertShortAccident => 'ДТП';

  @override
  String get roadAlertShortRoadWork => 'Р';

  @override
  String get roadAlertShortSpeedCamera => 'К';

  @override
  String get roadAlertShortPolice => 'КД';

  @override
  String get roadAlertShortTrafficJam => 'П';

  @override
  String get roadAlertShortBadRoad => 'БД';

  @override
  String get roadAlertShortPothole => 'Я';

  @override
  String get roadAlertShortSpeedBump => 'ЛП';

  @override
  String get roadAlertShortIcyRoad => 'Л';

  @override
  String get roadAlertShortSchoolZone => 'Ш';

  @override
  String get roadAlertShortTemporarySpeedLimit => 'ЛИМ';

  @override
  String get roadAlertShortDangerousTurn => 'ПВ';

  @override
  String get roadAlertShortRailroadCrossing => 'ЖД';

  @override
  String get roadAlertShortPedestrianCrossing => 'ПЕШ';

  @override
  String get driverRegionsLoadFailedTitle => 'Не удалось загрузить регионы';

  @override
  String get driverRegionsLoadFailedMessage =>
      'Проверьте связь и потяните экран вниз, чтобы обновить. Ваш доступ к регионам никуда не делся.';

  @override
  String get driverRegionsRetryAction => 'Обновить';

  @override
  String get authTagline => 'ГОРОДСКОЕ ТАКСИ';

  @override
  String get passengerMapPointNoAddressHint =>
      'Передвиньте точку к ближайшему дому или объекту';
}
