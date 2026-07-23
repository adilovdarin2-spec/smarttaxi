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
