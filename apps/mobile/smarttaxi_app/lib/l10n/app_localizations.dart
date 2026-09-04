import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:intl/intl.dart' as intl;

import 'app_localizations_kk.dart';
import 'app_localizations_ru.dart';
import 'app_localizations_uz.dart';
import 'app_localizations_zh.dart';

// ignore_for_file: type=lint

/// Callers can lookup localized strings with an instance of AppLocalizations
/// returned by `AppLocalizations.of(context)`.
///
/// Applications need to include `AppLocalizations.delegate()` in their app's
/// `localizationDelegates` list, and the locales they support in the app's
/// `supportedLocales` list. For example:
///
/// ```dart
/// import 'l10n/app_localizations.dart';
///
/// return MaterialApp(
///   localizationsDelegates: AppLocalizations.localizationsDelegates,
///   supportedLocales: AppLocalizations.supportedLocales,
///   home: MyApplicationHome(),
/// );
/// ```
///
/// ## Update pubspec.yaml
///
/// Please make sure to update your pubspec.yaml to include the following
/// packages:
///
/// ```yaml
/// dependencies:
///   # Internationalization support.
///   flutter_localizations:
///     sdk: flutter
///   intl: any # Use the pinned version from flutter_localizations
///
///   # Rest of dependencies
/// ```
///
/// ## iOS Applications
///
/// iOS applications define key application metadata, including supported
/// locales, in an Info.plist file that is built into the application bundle.
/// To configure the locales supported by your app, you’ll need to edit this
/// file.
///
/// First, open your project’s ios/Runner.xcworkspace Xcode workspace file.
/// Then, in the Project Navigator, open the Info.plist file under the Runner
/// project’s Runner folder.
///
/// Next, select the Information Property List item, select Add Item from the
/// Editor menu, then select Localizations from the pop-up menu.
///
/// Select and expand the newly-created Localizations item then, for each
/// locale your application supports, add a new item and select the locale
/// you wish to add from the pop-up menu in the Value field. This list should
/// be consistent with the languages listed in the AppLocalizations.supportedLocales
/// property.
abstract class AppLocalizations {
  AppLocalizations(String locale)
      : localeName = intl.Intl.canonicalizedLocale(locale.toString());

  final String localeName;

  static AppLocalizations of(BuildContext context) {
    return Localizations.of<AppLocalizations>(context, AppLocalizations)!;
  }

  static const LocalizationsDelegate<AppLocalizations> delegate =
      _AppLocalizationsDelegate();

  /// A list of this localizations delegate along with the default localizations
  /// delegates.
  ///
  /// Returns a list of localizations delegates containing this delegate along with
  /// GlobalMaterialLocalizations.delegate, GlobalCupertinoLocalizations.delegate,
  /// and GlobalWidgetsLocalizations.delegate.
  ///
  /// Additional delegates can be added by appending to this list in
  /// MaterialApp. This list does not have to be used at all if a custom list
  /// of delegates is preferred or required.
  static const List<LocalizationsDelegate<dynamic>> localizationsDelegates =
      <LocalizationsDelegate<dynamic>>[
    delegate,
    GlobalMaterialLocalizations.delegate,
    GlobalCupertinoLocalizations.delegate,
    GlobalWidgetsLocalizations.delegate,
  ];

  /// A list of this localizations delegate's supported locales.
  static const List<Locale> supportedLocales = <Locale>[
    Locale('kk'),
    Locale('ru'),
    Locale('uz'),
    Locale('zh')
  ];

  /// App name, shown in the OS task switcher
  ///
  /// In ru, this message translates to:
  /// **'SmartTaxi'**
  String get appName;

  /// No description provided for @continueLabel.
  ///
  /// In ru, this message translates to:
  /// **'Продолжить'**
  String get continueLabel;

  /// No description provided for @cancel.
  ///
  /// In ru, this message translates to:
  /// **'Отмена'**
  String get cancel;

  /// No description provided for @save.
  ///
  /// In ru, this message translates to:
  /// **'Сохранить'**
  String get save;

  /// No description provided for @close.
  ///
  /// In ru, this message translates to:
  /// **'Закрыть'**
  String get close;

  /// No description provided for @retry.
  ///
  /// In ru, this message translates to:
  /// **'Повторить'**
  String get retry;

  /// No description provided for @logIn.
  ///
  /// In ru, this message translates to:
  /// **'Войти'**
  String get logIn;

  /// No description provided for @logOut.
  ///
  /// In ru, this message translates to:
  /// **'Выйти'**
  String get logOut;

  /// No description provided for @loading.
  ///
  /// In ru, this message translates to:
  /// **'Загрузка...'**
  String get loading;

  /// No description provided for @pullToRetry.
  ///
  /// In ru, this message translates to:
  /// **'Потяните экран вниз, чтобы попробовать снова.'**
  String get pullToRetry;

  /// No description provided for @settings.
  ///
  /// In ru, this message translates to:
  /// **'Настройки'**
  String get settings;

  /// No description provided for @language.
  ///
  /// In ru, this message translates to:
  /// **'Язык'**
  String get language;

  /// No description provided for @languageRussian.
  ///
  /// In ru, this message translates to:
  /// **'Русский'**
  String get languageRussian;

  /// No description provided for @languageKazakh.
  ///
  /// In ru, this message translates to:
  /// **'Қазақша'**
  String get languageKazakh;

  /// No description provided for @languageUzbek.
  ///
  /// In ru, this message translates to:
  /// **'Узбекский'**
  String get languageUzbek;

  /// No description provided for @languageChinese.
  ///
  /// In ru, this message translates to:
  /// **'Китайский'**
  String get languageChinese;

  /// No description provided for @languageChangedNote.
  ///
  /// In ru, this message translates to:
  /// **'Язык интерфейса изменён. Часть экранов пока переведена только частично.'**
  String get languageChangedNote;

  /// No description provided for @passengerSettingsTitle.
  ///
  /// In ru, this message translates to:
  /// **'Настройки'**
  String get passengerSettingsTitle;

  /// No description provided for @passengerSettingsSubtitle.
  ///
  /// In ru, this message translates to:
  /// **'Аккаунт, поездки и информация о приложении'**
  String get passengerSettingsSubtitle;

  /// No description provided for @passengerSettingsAccountGroup.
  ///
  /// In ru, this message translates to:
  /// **'Аккаунт'**
  String get passengerSettingsAccountGroup;

  /// No description provided for @passengerSettingsPhoneLabel.
  ///
  /// In ru, this message translates to:
  /// **'Номер телефона'**
  String get passengerSettingsPhoneLabel;

  /// No description provided for @passengerSettingsPhoneMissing.
  ///
  /// In ru, this message translates to:
  /// **'Не указан'**
  String get passengerSettingsPhoneMissing;

  /// No description provided for @passengerSettingsPhoneCopied.
  ///
  /// In ru, this message translates to:
  /// **'Номер скопирован'**
  String get passengerSettingsPhoneCopied;

  /// No description provided for @passengerSettingsRegionLabel.
  ///
  /// In ru, this message translates to:
  /// **'Регион'**
  String get passengerSettingsRegionLabel;

  /// No description provided for @passengerSettingsRegionNotSelected.
  ///
  /// In ru, this message translates to:
  /// **'Не выбран'**
  String get passengerSettingsRegionNotSelected;

  /// No description provided for @passengerSettingsLogoutTitle.
  ///
  /// In ru, this message translates to:
  /// **'Выход из аккаунта'**
  String get passengerSettingsLogoutTitle;

  /// No description provided for @passengerSettingsLogoutText.
  ///
  /// In ru, this message translates to:
  /// **'Завершить текущую сессию'**
  String get passengerSettingsLogoutText;

  /// No description provided for @passengerSettingsInterfaceGroup.
  ///
  /// In ru, this message translates to:
  /// **'Интерфейс'**
  String get passengerSettingsInterfaceGroup;

  /// No description provided for @passengerSettingsLanguageLabel.
  ///
  /// In ru, this message translates to:
  /// **'Язык'**
  String get passengerSettingsLanguageLabel;

  /// No description provided for @passengerSettingsThemeLabel.
  ///
  /// In ru, this message translates to:
  /// **'Тема'**
  String get passengerSettingsThemeLabel;

  /// No description provided for @passengerSettingsThemeDark.
  ///
  /// In ru, this message translates to:
  /// **'Тёмная'**
  String get passengerSettingsThemeDark;

  /// No description provided for @passengerSettingsThemeSystem.
  ///
  /// In ru, this message translates to:
  /// **'Как в системе'**
  String get passengerSettingsThemeSystem;

  /// No description provided for @passengerSettingsThemeLight.
  ///
  /// In ru, this message translates to:
  /// **'Светлая'**
  String get passengerSettingsThemeLight;

  /// No description provided for @passengerSettingsPermissionsGroup.
  ///
  /// In ru, this message translates to:
  /// **'Разрешения'**
  String get passengerSettingsPermissionsGroup;

  /// No description provided for @passengerSettingsPushLabel.
  ///
  /// In ru, this message translates to:
  /// **'Push-уведомления'**
  String get passengerSettingsPushLabel;

  /// No description provided for @passengerSettingsPushEnabled.
  ///
  /// In ru, this message translates to:
  /// **'Включены — нажмите, чтобы открыть настройки'**
  String get passengerSettingsPushEnabled;

  /// No description provided for @passengerSettingsPushDisabled.
  ///
  /// In ru, this message translates to:
  /// **'Отключены в настройках телефона'**
  String get passengerSettingsPushDisabled;

  /// No description provided for @passengerSettingsPushNotRequested.
  ///
  /// In ru, this message translates to:
  /// **'Не запрошены'**
  String get passengerSettingsPushNotRequested;

  /// No description provided for @passengerSettingsPushCheckError.
  ///
  /// In ru, this message translates to:
  /// **'Появляются в приложении при изменении заказа'**
  String get passengerSettingsPushCheckError;

  /// No description provided for @passengerSettingsPushChecking.
  ///
  /// In ru, this message translates to:
  /// **'Проверяем статус...'**
  String get passengerSettingsPushChecking;

  /// No description provided for @passengerSettingsLocationLabel.
  ///
  /// In ru, this message translates to:
  /// **'Геолокация'**
  String get passengerSettingsLocationLabel;

  /// No description provided for @passengerSettingsLocationText.
  ///
  /// In ru, this message translates to:
  /// **'Открыть настройки геолокации телефона'**
  String get passengerSettingsLocationText;

  /// No description provided for @passengerSettingsAboutGroup.
  ///
  /// In ru, this message translates to:
  /// **'О приложении'**
  String get passengerSettingsAboutGroup;

  /// No description provided for @passengerSettingsVersionLabel.
  ///
  /// In ru, this message translates to:
  /// **'Версия приложения'**
  String get passengerSettingsVersionLabel;

  /// No description provided for @passengerSettingsLegalTitle.
  ///
  /// In ru, this message translates to:
  /// **'Правовая информация'**
  String get passengerSettingsLegalTitle;

  /// No description provided for @passengerSettingsLegalText.
  ///
  /// In ru, this message translates to:
  /// **'Условия использования, оплата, отмена, безопасность'**
  String get passengerSettingsLegalText;

  /// No description provided for @home.
  ///
  /// In ru, this message translates to:
  /// **'Главная'**
  String get home;

  /// No description provided for @trips.
  ///
  /// In ru, this message translates to:
  /// **'Поездки'**
  String get trips;

  /// No description provided for @profile.
  ///
  /// In ru, this message translates to:
  /// **'Профиль'**
  String get profile;

  /// No description provided for @notifications.
  ///
  /// In ru, this message translates to:
  /// **'Уведомления'**
  String get notifications;

  /// No description provided for @support.
  ///
  /// In ru, this message translates to:
  /// **'Поддержка'**
  String get support;

  /// No description provided for @passengerDrawerTrips.
  ///
  /// In ru, this message translates to:
  /// **'Мои поездки'**
  String get passengerDrawerTrips;

  /// No description provided for @passengerDrawerWallet.
  ///
  /// In ru, this message translates to:
  /// **'Кошелёк'**
  String get passengerDrawerWallet;

  /// No description provided for @passengerDrawerPromoCodes.
  ///
  /// In ru, this message translates to:
  /// **'Промокоды'**
  String get passengerDrawerPromoCodes;

  /// No description provided for @passengerDrawerRecurringBookings.
  ///
  /// In ru, this message translates to:
  /// **'Регулярные поездки'**
  String get passengerDrawerRecurringBookings;

  /// No description provided for @passengerDrawerFavoriteAddresses.
  ///
  /// In ru, this message translates to:
  /// **'Избранные адреса'**
  String get passengerDrawerFavoriteAddresses;

  /// No description provided for @passengerDrawerDrivers.
  ///
  /// In ru, this message translates to:
  /// **'Водители'**
  String get passengerDrawerDrivers;

  /// No description provided for @passengerDrawerReferrals.
  ///
  /// In ru, this message translates to:
  /// **'Пригласить друзей'**
  String get passengerDrawerReferrals;

  /// No description provided for @passengerDrawerBecomeDriver.
  ///
  /// In ru, this message translates to:
  /// **'Стать водителем'**
  String get passengerDrawerBecomeDriver;

  /// No description provided for @passengerDrawerHelpSection.
  ///
  /// In ru, this message translates to:
  /// **'Помощь'**
  String get passengerDrawerHelpSection;

  /// No description provided for @passengerDrawerFaq.
  ///
  /// In ru, this message translates to:
  /// **'FAQ'**
  String get passengerDrawerFaq;

  /// No description provided for @passengerDrawerAboutSection.
  ///
  /// In ru, this message translates to:
  /// **'О сервисе'**
  String get passengerDrawerAboutSection;

  /// No description provided for @passengerDrawerAboutUs.
  ///
  /// In ru, this message translates to:
  /// **'О нас'**
  String get passengerDrawerAboutUs;

  /// No description provided for @passengerDrawerRegionalBadge.
  ///
  /// In ru, this message translates to:
  /// **'Региональное такси'**
  String get passengerDrawerRegionalBadge;

  /// No description provided for @passengerFaqSubtitle.
  ///
  /// In ru, this message translates to:
  /// **'Ответы на частые вопросы'**
  String get passengerFaqSubtitle;

  /// No description provided for @passengerFaqSearchHint.
  ///
  /// In ru, this message translates to:
  /// **'Поиск по вопросам'**
  String get passengerFaqSearchHint;

  /// No description provided for @passengerFaqClearSearch.
  ///
  /// In ru, this message translates to:
  /// **'Очистить поиск'**
  String get passengerFaqClearSearch;

  /// No description provided for @passengerFaqNoResultsTitle.
  ///
  /// In ru, this message translates to:
  /// **'Ничего не найдено'**
  String get passengerFaqNoResultsTitle;

  /// No description provided for @passengerFaqNoResultsText.
  ///
  /// In ru, this message translates to:
  /// **'Попробуйте изменить запрос или напишите нам в поддержку.'**
  String get passengerFaqNoResultsText;

  /// No description provided for @passengerFaqQ1.
  ///
  /// In ru, this message translates to:
  /// **'Как заказать поездку?'**
  String get passengerFaqQ1;

  /// No description provided for @passengerFaqA1.
  ///
  /// In ru, this message translates to:
  /// **'Выберите точку подачи и адрес назначения на карте, выберите тариф, дождитесь расчёта и нажмите «Заказать».'**
  String get passengerFaqA1;

  /// No description provided for @passengerFaqQ2.
  ///
  /// In ru, this message translates to:
  /// **'Почему сервис работает только в выбранном регионе?'**
  String get passengerFaqQ2;

  /// No description provided for @passengerFaqA2.
  ///
  /// In ru, this message translates to:
  /// **'SmartTaxi запускается по регионам, которые включены администратором. Так поездки остаются контролируемыми и честными.'**
  String get passengerFaqA2;

  /// No description provided for @passengerFaqQ3.
  ///
  /// In ru, this message translates to:
  /// **'Как считается цена?'**
  String get passengerFaqQ3;

  /// No description provided for @passengerFaqA3.
  ///
  /// In ru, this message translates to:
  /// **'Цена рассчитывается сервером по маршруту, тарифу, расстоянию и времени поездки.'**
  String get passengerFaqA3;

  /// No description provided for @passengerFaqQ4.
  ///
  /// In ru, this message translates to:
  /// **'Как стать водителем?'**
  String get passengerFaqQ4;

  /// No description provided for @passengerFaqA4.
  ///
  /// In ru, this message translates to:
  /// **'Откройте раздел «Стать водителем», заполните данные автомобиля и дождитесь проверки администратора.'**
  String get passengerFaqA4;

  /// No description provided for @passengerFaqQ5.
  ///
  /// In ru, this message translates to:
  /// **'Что делать, если водитель не приехал?'**
  String get passengerFaqQ5;

  /// No description provided for @passengerFaqA5.
  ///
  /// In ru, this message translates to:
  /// **'Откройте поддержку и выберите тему «Водитель не приехал».'**
  String get passengerFaqA5;

  /// No description provided for @passengerFaqQ6.
  ///
  /// In ru, this message translates to:
  /// **'Как отменить заказ?'**
  String get passengerFaqQ6;

  /// No description provided for @passengerFaqA6.
  ///
  /// In ru, this message translates to:
  /// **'Откройте «Мои поездки» и нажмите «Отменить поездку», если заказ ещё можно отменить.'**
  String get passengerFaqA6;

  /// No description provided for @passengerFaqQ7.
  ///
  /// In ru, this message translates to:
  /// **'Почему нужна геолокация?'**
  String get passengerFaqQ7;

  /// No description provided for @passengerFaqA7.
  ///
  /// In ru, this message translates to:
  /// **'Геолокация помогает выбрать точку посадки и строить честный маршрут.'**
  String get passengerFaqA7;

  /// No description provided for @passengerFaqQ8.
  ///
  /// In ru, this message translates to:
  /// **'Как связаться с поддержкой?'**
  String get passengerFaqQ8;

  /// No description provided for @passengerFaqA8.
  ///
  /// In ru, this message translates to:
  /// **'Откройте раздел «Поддержка» в меню и напишите сообщение.'**
  String get passengerFaqA8;

  /// No description provided for @passengerSupportSubtitle.
  ///
  /// In ru, this message translates to:
  /// **'Опишите проблему, мы поможем'**
  String get passengerSupportSubtitle;

  /// No description provided for @passengerSupportUrgentTitle.
  ///
  /// In ru, this message translates to:
  /// **'Срочный вопрос?'**
  String get passengerSupportUrgentTitle;

  /// No description provided for @passengerSupportCallDirectly.
  ///
  /// In ru, this message translates to:
  /// **'Позвоните напрямую: {phone}'**
  String passengerSupportCallDirectly(String phone);

  /// No description provided for @callButton.
  ///
  /// In ru, this message translates to:
  /// **'Позвонить'**
  String get callButton;

  /// No description provided for @passengerSupportTopicSectionTitle.
  ///
  /// In ru, this message translates to:
  /// **'Тема обращения'**
  String get passengerSupportTopicSectionTitle;

  /// No description provided for @passengerSupportTopicSectionText.
  ///
  /// In ru, this message translates to:
  /// **'Выберите, с чем нужна помощь'**
  String get passengerSupportTopicSectionText;

  /// No description provided for @passengerSupportTopicTripIssue.
  ///
  /// In ru, this message translates to:
  /// **'Проблема с поездкой'**
  String get passengerSupportTopicTripIssue;

  /// No description provided for @passengerSupportTopicNoShow.
  ///
  /// In ru, this message translates to:
  /// **'Водитель не приехал'**
  String get passengerSupportTopicNoShow;

  /// No description provided for @passengerSupportTopicLostItem.
  ///
  /// In ru, this message translates to:
  /// **'Забыл вещь'**
  String get passengerSupportTopicLostItem;

  /// No description provided for @passengerSupportTopicPayment.
  ///
  /// In ru, this message translates to:
  /// **'Оплата'**
  String get passengerSupportTopicPayment;

  /// No description provided for @passengerSupportTopicOther.
  ///
  /// In ru, this message translates to:
  /// **'Другое'**
  String get passengerSupportTopicOther;

  /// No description provided for @passengerSupportChooseTopicFirst.
  ///
  /// In ru, this message translates to:
  /// **'Выберите тему выше, чтобы продолжить.'**
  String get passengerSupportChooseTopicFirst;

  /// No description provided for @messageLabel.
  ///
  /// In ru, this message translates to:
  /// **'Сообщение'**
  String get messageLabel;

  /// No description provided for @passengerSupportMessageHint.
  ///
  /// In ru, this message translates to:
  /// **'Напишите сообщение…'**
  String get passengerSupportMessageHint;

  /// No description provided for @passengerSupportMessageTooShort.
  ///
  /// In ru, this message translates to:
  /// **'Опишите проблему подробнее: минимум 8 символов.'**
  String get passengerSupportMessageTooShort;

  /// No description provided for @passengerSupportLostItemNeedsTrip.
  ///
  /// In ru, this message translates to:
  /// **'Укажите поездку, в которой оставили вещь — иначе водителя не получится уведомить.'**
  String get passengerSupportLostItemNeedsTrip;

  /// No description provided for @sendButton.
  ///
  /// In ru, this message translates to:
  /// **'Отправить'**
  String get sendButton;

  /// No description provided for @sendingButton.
  ///
  /// In ru, this message translates to:
  /// **'Отправляем...'**
  String get sendingButton;

  /// No description provided for @passengerSupportLostItemSent.
  ///
  /// In ru, this message translates to:
  /// **'Обращение отправлено, водитель уведомлён.'**
  String get passengerSupportLostItemSent;

  /// No description provided for @passengerSupportMessageSent.
  ///
  /// In ru, this message translates to:
  /// **'Обращение отправлено. Мы ответим здесь и, если нужно, позвоним.'**
  String get passengerSupportMessageSent;

  /// No description provided for @passengerSupportDialFailed.
  ///
  /// In ru, this message translates to:
  /// **'Не удалось открыть набор номера'**
  String get passengerSupportDialFailed;

  /// No description provided for @passengerSupportYourRequests.
  ///
  /// In ru, this message translates to:
  /// **'Ваши обращения'**
  String get passengerSupportYourRequests;

  /// No description provided for @passengerSupportLoadError.
  ///
  /// In ru, this message translates to:
  /// **'Не удалось загрузить обращения'**
  String get passengerSupportLoadError;

  /// No description provided for @passengerAboutDescription.
  ///
  /// In ru, this message translates to:
  /// **'SmartTaxi — региональный сервис такси для быстрых, понятных и честных поездок внутри активных регионов.'**
  String get passengerAboutDescription;

  /// No description provided for @passengerAboutRegionalModelTitle.
  ///
  /// In ru, this message translates to:
  /// **'Региональная модель'**
  String get passengerAboutRegionalModelTitle;

  /// No description provided for @passengerAboutRegionalModelText.
  ///
  /// In ru, this message translates to:
  /// **'Поездки доступны в активных регионах. Межгород доступен только по направлениям, включённым оператором.'**
  String get passengerAboutRegionalModelText;

  /// No description provided for @passengerAboutContactTitle.
  ///
  /// In ru, this message translates to:
  /// **'Связь'**
  String get passengerAboutContactTitle;

  /// No description provided for @passengerAboutContactText.
  ///
  /// In ru, this message translates to:
  /// **'Если нужна помощь, откройте поддержку в левом меню.'**
  String get passengerAboutContactText;

  /// No description provided for @passengerAboutSupportSubtitle.
  ///
  /// In ru, this message translates to:
  /// **'Есть вопрос? Мы ответим'**
  String get passengerAboutSupportSubtitle;

  /// No description provided for @passengerAboutLegalSubtitle.
  ///
  /// In ru, this message translates to:
  /// **'Условия, оплата, отмена, безопасность'**
  String get passengerAboutLegalSubtitle;

  /// No description provided for @passengerAboutVersionLabel.
  ///
  /// In ru, this message translates to:
  /// **'SmartTaxi · версия {version}'**
  String passengerAboutVersionLabel(String version);

  /// No description provided for @loadFailedTitle.
  ///
  /// In ru, this message translates to:
  /// **'Не удалось загрузить'**
  String get loadFailedTitle;

  /// No description provided for @passengerRecurringSubtitle.
  ///
  /// In ru, this message translates to:
  /// **'Школьный маршрут и другие поездки по расписанию'**
  String get passengerRecurringSubtitle;

  /// No description provided for @passengerRecurringNewRoute.
  ///
  /// In ru, this message translates to:
  /// **'Новый маршрут'**
  String get passengerRecurringNewRoute;

  /// No description provided for @passengerRecurringEmptyTitle.
  ///
  /// In ru, this message translates to:
  /// **'Пока нет регулярных поездок'**
  String get passengerRecurringEmptyTitle;

  /// No description provided for @passengerRecurringEmptyText.
  ///
  /// In ru, this message translates to:
  /// **'Создайте маршрут — например, отвозить ребёнка в школу — и водитель будет приезжать по расписанию в выбранные дни.'**
  String get passengerRecurringEmptyText;

  /// No description provided for @passengerRecurringCancelTitle.
  ///
  /// In ru, this message translates to:
  /// **'Отменить регулярную поездку?'**
  String get passengerRecurringCancelTitle;

  /// No description provided for @passengerRecurringCancelText.
  ///
  /// In ru, this message translates to:
  /// **'{route}, {days} в {time}. Это действие нельзя отменить.'**
  String passengerRecurringCancelText(String route, String days, String time);

  /// No description provided for @passengerRecurringCancelConfirm.
  ///
  /// In ru, this message translates to:
  /// **'Отменить поездку'**
  String get passengerRecurringCancelConfirm;

  /// No description provided for @passengerFavoritesAddAddressTitle.
  ///
  /// In ru, this message translates to:
  /// **'Какой адрес добавить?'**
  String get passengerFavoritesAddAddressTitle;

  /// No description provided for @passengerFavoritesDeleteTitle.
  ///
  /// In ru, this message translates to:
  /// **'Удалить адрес из избранного?'**
  String get passengerFavoritesDeleteTitle;

  /// No description provided for @passengerFavoritesDeleteText.
  ///
  /// In ru, this message translates to:
  /// **'{title} — {address}.'**
  String passengerFavoritesDeleteText(String title, String address);

  /// No description provided for @deleteButton.
  ///
  /// In ru, this message translates to:
  /// **'Удалить'**
  String get deleteButton;

  /// No description provided for @passengerFavoritesSubtitle.
  ///
  /// In ru, this message translates to:
  /// **'Дом, работа и другие частые точки — быстрее вводить заказ'**
  String get passengerFavoritesSubtitle;

  /// No description provided for @passengerFavoritesAddButton.
  ///
  /// In ru, this message translates to:
  /// **'Добавить адрес'**
  String get passengerFavoritesAddButton;

  /// No description provided for @passengerFavoritesEmptyTitle.
  ///
  /// In ru, this message translates to:
  /// **'Пока нет избранных адресов'**
  String get passengerFavoritesEmptyTitle;

  /// No description provided for @passengerFavoritesEmptyText.
  ///
  /// In ru, this message translates to:
  /// **'Добавьте дом, работу или любое место, куда часто ездите — они появятся здесь для быстрого доступа.'**
  String get passengerFavoritesEmptyText;

  /// No description provided for @passengerDriverAppSubtitle.
  ///
  /// In ru, this message translates to:
  /// **'Зарабатывайте на своём авто в удобном графике'**
  String get passengerDriverAppSubtitle;

  /// No description provided for @passengerDriverStep1Title.
  ///
  /// In ru, this message translates to:
  /// **'Заполните заявку'**
  String get passengerDriverStep1Title;

  /// No description provided for @passengerDriverStep1Text.
  ///
  /// In ru, this message translates to:
  /// **'Имя, телефон и данные автомобиля — это займёт минуту'**
  String get passengerDriverStep1Text;

  /// No description provided for @passengerDriverStep2Title.
  ///
  /// In ru, this message translates to:
  /// **'Дождитесь проверки'**
  String get passengerDriverStep2Title;

  /// No description provided for @passengerDriverStep2Text.
  ///
  /// In ru, this message translates to:
  /// **'Администратор рассматривает заявки обычно за 1–2 дня'**
  String get passengerDriverStep2Text;

  /// No description provided for @passengerDriverStep3Title.
  ///
  /// In ru, this message translates to:
  /// **'Выходите на линию'**
  String get passengerDriverStep3Title;

  /// No description provided for @passengerDriverStep3Text.
  ///
  /// In ru, this message translates to:
  /// **'После одобрения сразу доступны заказы в вашем регионе'**
  String get passengerDriverStep3Text;

  /// No description provided for @passengerDriverAppSubmittedTitle.
  ///
  /// In ru, this message translates to:
  /// **'Заявка отправлена'**
  String get passengerDriverAppSubmittedTitle;

  /// No description provided for @passengerDriverAppQuestionBanner.
  ///
  /// In ru, this message translates to:
  /// **'Есть вопрос по заявке — напишите в поддержку.'**
  String get passengerDriverAppQuestionBanner;

  /// No description provided for @passengerDriverPersonalDataGroup.
  ///
  /// In ru, this message translates to:
  /// **'Личные данные'**
  String get passengerDriverPersonalDataGroup;

  /// No description provided for @passengerDriverFullNameLabel.
  ///
  /// In ru, this message translates to:
  /// **'Имя и фамилия'**
  String get passengerDriverFullNameLabel;

  /// No description provided for @phoneLabel.
  ///
  /// In ru, this message translates to:
  /// **'Телефон'**
  String get phoneLabel;

  /// No description provided for @passengerDriverCarGroup.
  ///
  /// In ru, this message translates to:
  /// **'Автомобиль'**
  String get passengerDriverCarGroup;

  /// No description provided for @passengerDriverCarModelLabel.
  ///
  /// In ru, this message translates to:
  /// **'Марка и модель авто'**
  String get passengerDriverCarModelLabel;

  /// No description provided for @passengerDriverCarColorLabel.
  ///
  /// In ru, this message translates to:
  /// **'Цвет авто'**
  String get passengerDriverCarColorLabel;

  /// No description provided for @passengerDriverPlateLabel.
  ///
  /// In ru, this message translates to:
  /// **'Госномер'**
  String get passengerDriverPlateLabel;

  /// No description provided for @passengerDriverYearLabel.
  ///
  /// In ru, this message translates to:
  /// **'Год выпуска'**
  String get passengerDriverYearLabel;

  /// No description provided for @passengerDriverCommentLabel.
  ///
  /// In ru, this message translates to:
  /// **'Комментарий (необязательно)'**
  String get passengerDriverCommentLabel;

  /// No description provided for @passengerDriverAgreePrefix.
  ///
  /// In ru, this message translates to:
  /// **'Я согласен с '**
  String get passengerDriverAgreePrefix;

  /// No description provided for @passengerDriverTermsLink.
  ///
  /// In ru, this message translates to:
  /// **'Условиями использования'**
  String get passengerDriverTermsLink;

  /// No description provided for @passengerDriverSafetyRulesLink.
  ///
  /// In ru, this message translates to:
  /// **'Правилами безопасности'**
  String get passengerDriverSafetyRulesLink;

  /// No description provided for @passengerDriverSubmitButton.
  ///
  /// In ru, this message translates to:
  /// **'Отправить заявку'**
  String get passengerDriverSubmitButton;

  /// No description provided for @passengerDriverPrefsSubtitle.
  ///
  /// In ru, this message translates to:
  /// **'Отмечайте любимых водителей и блокируйте нежелательных'**
  String get passengerDriverPrefsSubtitle;

  /// No description provided for @passengerDriverPrefsAddButton.
  ///
  /// In ru, this message translates to:
  /// **'Добавить из истории поездок'**
  String get passengerDriverPrefsAddButton;

  /// No description provided for @passengerDriverPrefsEmptyTitle.
  ///
  /// In ru, this message translates to:
  /// **'Пока нет отметок'**
  String get passengerDriverPrefsEmptyTitle;

  /// No description provided for @passengerDriverPrefsEmptyText.
  ///
  /// In ru, this message translates to:
  /// **'Отметьте водителя из истории поездок как избранного или заблокируйте нежелательного.'**
  String get passengerDriverPrefsEmptyText;

  /// No description provided for @passengerDriverPrefsFavoritesTitle.
  ///
  /// In ru, this message translates to:
  /// **'Избранные'**
  String get passengerDriverPrefsFavoritesTitle;

  /// No description provided for @passengerDriverPrefsFavoritesText.
  ///
  /// In ru, this message translates to:
  /// **'Регулярные поездки предложат их в первую очередь'**
  String get passengerDriverPrefsFavoritesText;

  /// No description provided for @passengerDriverPrefsBlockedTitle.
  ///
  /// In ru, this message translates to:
  /// **'Заблокированные'**
  String get passengerDriverPrefsBlockedTitle;

  /// No description provided for @passengerDriverPrefsBlockedText.
  ///
  /// In ru, this message translates to:
  /// **'Не будут предложены на регулярные поездки'**
  String get passengerDriverPrefsBlockedText;

  /// No description provided for @passengerReferralsSubtitle.
  ///
  /// In ru, this message translates to:
  /// **'Делитесь кодом и получайте бонусы за каждого друга'**
  String get passengerReferralsSubtitle;

  /// No description provided for @passengerReferralsYourCode.
  ///
  /// In ru, this message translates to:
  /// **'Ваш код'**
  String get passengerReferralsYourCode;

  /// No description provided for @copyButton.
  ///
  /// In ru, this message translates to:
  /// **'Скопировать'**
  String get copyButton;

  /// No description provided for @passengerReferralsCodeCopied.
  ///
  /// In ru, this message translates to:
  /// **'Код скопирован'**
  String get passengerReferralsCodeCopied;

  /// No description provided for @passengerReferralsShareCode.
  ///
  /// In ru, this message translates to:
  /// **'Поделиться кодом'**
  String get passengerReferralsShareCode;

  /// No description provided for @passengerReferralsShareMessage.
  ///
  /// In ru, this message translates to:
  /// **'Заказывай такси в SmartTaxi по моему коду {code} и получи бонус на первую поездку!'**
  String passengerReferralsShareMessage(String code);

  /// No description provided for @passengerReferralsInvited.
  ///
  /// In ru, this message translates to:
  /// **'Приглашено'**
  String get passengerReferralsInvited;

  /// No description provided for @passengerReferralsEarned.
  ///
  /// In ru, this message translates to:
  /// **'Заработано'**
  String get passengerReferralsEarned;

  /// No description provided for @passengerReferralsHowItWorksTitle.
  ///
  /// In ru, this message translates to:
  /// **'Как это работает'**
  String get passengerReferralsHowItWorksTitle;

  /// No description provided for @passengerReferralsHowItWorksText.
  ///
  /// In ru, this message translates to:
  /// **'Друг вводит ваш код при регистрации. После его первой поездки вам начисляется бонус на баланс.'**
  String get passengerReferralsHowItWorksText;

  /// No description provided for @passengerPromoSubtitle.
  ///
  /// In ru, this message translates to:
  /// **'Проверьте промокод и узнайте размер скидки'**
  String get passengerPromoSubtitle;

  /// No description provided for @passengerPromoHaveCode.
  ///
  /// In ru, this message translates to:
  /// **'Есть промокод?'**
  String get passengerPromoHaveCode;

  /// No description provided for @passengerPromoHint.
  ///
  /// In ru, this message translates to:
  /// **'Введите его, чтобы проверить, действует ли он в вашем регионе, и увидеть размер скидки.'**
  String get passengerPromoHint;

  /// No description provided for @passengerPromoFieldHint.
  ///
  /// In ru, this message translates to:
  /// **'Например, SMART500'**
  String get passengerPromoFieldHint;

  /// No description provided for @checkButton.
  ///
  /// In ru, this message translates to:
  /// **'Проверить'**
  String get checkButton;

  /// No description provided for @checkingButton.
  ///
  /// In ru, this message translates to:
  /// **'Проверяем...'**
  String get checkingButton;

  /// No description provided for @passengerPromoNoRegionError.
  ///
  /// In ru, this message translates to:
  /// **'Сначала выберите регион на главном экране'**
  String get passengerPromoNoRegionError;

  /// No description provided for @passengerPromoActiveTitle.
  ///
  /// In ru, this message translates to:
  /// **'Промокод «{code}» действует'**
  String passengerPromoActiveTitle(String code);

  /// No description provided for @passengerPromoDiscountSummary.
  ///
  /// In ru, this message translates to:
  /// **'Скидка {discount} · например, на поездке за {previewPrice} вы заплатите {finalPrice}'**
  String passengerPromoDiscountSummary(
      String discount, String previewPrice, String finalPrice);

  /// No description provided for @passengerPromoHowToApplyTitle.
  ///
  /// In ru, this message translates to:
  /// **'Как применить скидку'**
  String get passengerPromoHowToApplyTitle;

  /// No description provided for @passengerPromoHowToApplyText.
  ///
  /// In ru, this message translates to:
  /// **'Промокод из этой проверки нужно будет ещё раз ввести на шаге выбора тарифа — тогда скидка сразу пересчитает итоговую цену вашей реальной поездки.'**
  String get passengerPromoHowToApplyText;

  /// No description provided for @passengerHomeWhereToTitle.
  ///
  /// In ru, this message translates to:
  /// **'Куда едем?'**
  String get passengerHomeWhereToTitle;

  /// No description provided for @passengerHomeWhereToSubtitle.
  ///
  /// In ru, this message translates to:
  /// **'Выберите точку подачи и адрес назначения'**
  String get passengerHomeWhereToSubtitle;

  /// No description provided for @passengerHomeGreeting.
  ///
  /// In ru, this message translates to:
  /// **'Здравствуйте!'**
  String get passengerHomeGreeting;

  /// No description provided for @passengerQuickHome.
  ///
  /// In ru, this message translates to:
  /// **'Дом'**
  String get passengerQuickHome;

  /// No description provided for @passengerQuickWork.
  ///
  /// In ru, this message translates to:
  /// **'Работа'**
  String get passengerQuickWork;

  /// No description provided for @passengerQuickFavorites.
  ///
  /// In ru, this message translates to:
  /// **'Избранное'**
  String get passengerQuickFavorites;

  /// No description provided for @passengerHomeSetDestination.
  ///
  /// In ru, this message translates to:
  /// **'Указать куда'**
  String get passengerHomeSetDestination;

  /// No description provided for @passengerHomeRouteIssueTitle.
  ///
  /// In ru, this message translates to:
  /// **'Уточните маршрут'**
  String get passengerHomeRouteIssueTitle;

  /// No description provided for @passengerHomeRouteIssueText.
  ///
  /// In ru, this message translates to:
  /// **'Не удалось построить маршрут. Измените адрес или выберите точку на карте.'**
  String get passengerHomeRouteIssueText;

  /// No description provided for @passengerHomePickupQuestion.
  ///
  /// In ru, this message translates to:
  /// **'Откуда?'**
  String get passengerHomePickupQuestion;

  /// No description provided for @passengerAddressSearchError.
  ///
  /// In ru, this message translates to:
  /// **'Поиск адреса временно недоступен. Выберите точку на карте.'**
  String get passengerAddressSearchError;

  /// No description provided for @passengerAddressNoResultsText.
  ///
  /// In ru, this message translates to:
  /// **'Уточните улицу, район или название места.'**
  String get passengerAddressNoResultsText;

  /// No description provided for @passengerAddressPickOnMapTitle.
  ///
  /// In ru, this message translates to:
  /// **'Указать на карте'**
  String get passengerAddressPickOnMapTitle;

  /// No description provided for @passengerAddressPickOnMapSubtitle.
  ///
  /// In ru, this message translates to:
  /// **'Выберите точку на карте'**
  String get passengerAddressPickOnMapSubtitle;

  /// No description provided for @tariffEconomyTitle.
  ///
  /// In ru, this message translates to:
  /// **'Эконом'**
  String get tariffEconomyTitle;

  /// No description provided for @tariffComfortTitle.
  ///
  /// In ru, this message translates to:
  /// **'Комфорт'**
  String get tariffComfortTitle;

  /// No description provided for @tariffBusinessTitle.
  ///
  /// In ru, this message translates to:
  /// **'Бизнес'**
  String get tariffBusinessTitle;

  /// No description provided for @tariffDeliveryTitle.
  ///
  /// In ru, this message translates to:
  /// **'Доставка'**
  String get tariffDeliveryTitle;

  /// No description provided for @passengerTariffSectionTitle.
  ///
  /// In ru, this message translates to:
  /// **'Выберите тариф'**
  String get passengerTariffSectionTitle;

  /// No description provided for @passengerTariffSectionText.
  ///
  /// In ru, this message translates to:
  /// **'Фиксированная цена, время и расстояние показаны для ориентира'**
  String get passengerTariffSectionText;

  /// No description provided for @passengerTariffFixedPriceBadge.
  ///
  /// In ru, this message translates to:
  /// **'Фикс. цена'**
  String get passengerTariffFixedPriceBadge;

  /// No description provided for @passengerTariffNotConfiguredTitle.
  ///
  /// In ru, this message translates to:
  /// **'Тарифы пока не настроены'**
  String get passengerTariffNotConfiguredTitle;

  /// No description provided for @passengerTariffNotConfiguredText.
  ///
  /// In ru, this message translates to:
  /// **'Администратор должен добавить тариф для активного региона.'**
  String get passengerTariffNotConfiguredText;

  /// No description provided for @passengerTariffUnavailableTitle.
  ///
  /// In ru, this message translates to:
  /// **'Тарифы недоступны'**
  String get passengerTariffUnavailableTitle;

  /// No description provided for @passengerTariffUnavailableText.
  ///
  /// In ru, this message translates to:
  /// **'Для этого региона нужен тариф Эконом или Доставка.'**
  String get passengerTariffUnavailableText;

  /// No description provided for @passengerTariffBestValueBadge.
  ///
  /// In ru, this message translates to:
  /// **'Выгодно'**
  String get passengerTariffBestValueBadge;

  /// No description provided for @paymentCash.
  ///
  /// In ru, this message translates to:
  /// **'Наличные'**
  String get paymentCash;

  /// No description provided for @paymentKaspi.
  ///
  /// In ru, this message translates to:
  /// **'Kaspi'**
  String get paymentKaspi;

  /// No description provided for @paymentCard.
  ///
  /// In ru, this message translates to:
  /// **'Картой'**
  String get paymentCard;

  /// No description provided for @tariffLabel.
  ///
  /// In ru, this message translates to:
  /// **'Тариф'**
  String get tariffLabel;

  /// No description provided for @paymentMethodLabel.
  ///
  /// In ru, this message translates to:
  /// **'Оплата'**
  String get paymentMethodLabel;

  /// No description provided for @paymentMethodFullLabel.
  ///
  /// In ru, this message translates to:
  /// **'Способ оплаты'**
  String get paymentMethodFullLabel;

  /// No description provided for @passengerTripInTransitLabel.
  ///
  /// In ru, this message translates to:
  /// **'В пути'**
  String get passengerTripInTransitLabel;

  /// No description provided for @passengerCtaCreatingOrder.
  ///
  /// In ru, this message translates to:
  /// **'Создаём заказ...'**
  String get passengerCtaCreatingOrder;

  /// No description provided for @passengerCtaPickPickup.
  ///
  /// In ru, this message translates to:
  /// **'Выбрать точку подачи'**
  String get passengerCtaPickPickup;

  /// No description provided for @passengerCtaPickDropoff.
  ///
  /// In ru, this message translates to:
  /// **'Выбрать адрес назначения'**
  String get passengerCtaPickDropoff;

  /// No description provided for @passengerCtaCalculate.
  ///
  /// In ru, this message translates to:
  /// **'Рассчитать'**
  String get passengerCtaCalculate;

  /// No description provided for @passengerCtaOrderDelivery.
  ///
  /// In ru, this message translates to:
  /// **'Оформить доставку'**
  String get passengerCtaOrderDelivery;

  /// No description provided for @passengerCtaOrderWithLabel.
  ///
  /// In ru, this message translates to:
  /// **'Заказать {label}'**
  String passengerCtaOrderWithLabel(String label);

  /// No description provided for @passengerCtaOrder.
  ///
  /// In ru, this message translates to:
  /// **'Заказать'**
  String get passengerCtaOrder;

  /// No description provided for @passengerTripsSubtitle.
  ///
  /// In ru, this message translates to:
  /// **'Активный заказ, статус поездки и детали маршрута'**
  String get passengerTripsSubtitle;

  /// No description provided for @passengerTripsLoadErrorTitle.
  ///
  /// In ru, this message translates to:
  /// **'Не удалось загрузить историю'**
  String get passengerTripsLoadErrorTitle;

  /// No description provided for @passengerTripsEmptyTitle.
  ///
  /// In ru, this message translates to:
  /// **'Активной поездки нет'**
  String get passengerTripsEmptyTitle;

  /// No description provided for @passengerTripsLoadErrorText.
  ///
  /// In ru, this message translates to:
  /// **'Проверьте связь и потяните экран вниз, чтобы попробовать снова.'**
  String get passengerTripsLoadErrorText;

  /// No description provided for @passengerTripsEmptyText.
  ///
  /// In ru, this message translates to:
  /// **'Создайте заказ, и SmartTaxi откроет статус поездки здесь.'**
  String get passengerTripsEmptyText;

  /// No description provided for @passengerGoHomeAction.
  ///
  /// In ru, this message translates to:
  /// **'На главную'**
  String get passengerGoHomeAction;

  /// No description provided for @passengerDriverSearchingLabel.
  ///
  /// In ru, this message translates to:
  /// **'Ищем водителя'**
  String get passengerDriverSearchingLabel;

  /// No description provided for @passengerDriverWaitingLocationLabel.
  ///
  /// In ru, this message translates to:
  /// **'Ожидаем геолокацию водителя'**
  String get passengerDriverWaitingLocationLabel;

  /// No description provided for @passengerDriverConnectedLabel.
  ///
  /// In ru, this message translates to:
  /// **'Водитель на связи'**
  String get passengerDriverConnectedLabel;

  /// No description provided for @passengerTripDetailTitle.
  ///
  /// In ru, this message translates to:
  /// **'Поездка'**
  String get passengerTripDetailTitle;

  /// No description provided for @passengerTripShareTooltip.
  ///
  /// In ru, this message translates to:
  /// **'Поделиться чеком'**
  String get passengerTripShareTooltip;

  /// No description provided for @passengerTripDistanceLabel.
  ///
  /// In ru, this message translates to:
  /// **'Расстояние'**
  String get passengerTripDistanceLabel;

  /// No description provided for @passengerTripTotalLabel.
  ///
  /// In ru, this message translates to:
  /// **'Итого'**
  String get passengerTripTotalLabel;

  /// No description provided for @passengerTripDriverGroupLabel.
  ///
  /// In ru, this message translates to:
  /// **'Водитель'**
  String get passengerTripDriverGroupLabel;

  /// No description provided for @passengerTripContactSupportButton.
  ///
  /// In ru, this message translates to:
  /// **'Написать в поддержку по этой поездке'**
  String get passengerTripContactSupportButton;

  /// No description provided for @passengerTripDateUnknown.
  ///
  /// In ru, this message translates to:
  /// **'Дата неизвестна'**
  String get passengerTripDateUnknown;

  /// No description provided for @passengerTripDateToday.
  ///
  /// In ru, this message translates to:
  /// **'Сегодня'**
  String get passengerTripDateToday;

  /// No description provided for @passengerTripDateYesterday.
  ///
  /// In ru, this message translates to:
  /// **'Вчера'**
  String get passengerTripDateYesterday;

  /// No description provided for @passengerTripShareTextPrefix.
  ///
  /// In ru, this message translates to:
  /// **'Поездка SmartTaxi'**
  String get passengerTripShareTextPrefix;

  /// No description provided for @passengerSearchingSubtitleWithCount.
  ///
  /// In ru, this message translates to:
  /// **'Показываем {count} ближайших свободных водителей'**
  String passengerSearchingSubtitleWithCount(int count);

  /// No description provided for @passengerSearchingSubtitleGeneric.
  ///
  /// In ru, this message translates to:
  /// **'Проверяем свободных водителей рядом'**
  String get passengerSearchingSubtitleGeneric;

  /// No description provided for @passengerDriverOfferDescription.
  ///
  /// In ru, this message translates to:
  /// **'Предлагаем заказ ближайшим водителям.'**
  String get passengerDriverOfferDescription;

  /// No description provided for @passengerDriverRouteDescription.
  ///
  /// In ru, this message translates to:
  /// **'Показываем статус поездки и маршрут в реальном времени.'**
  String get passengerDriverRouteDescription;

  /// No description provided for @passengerTripInProgressTitle.
  ///
  /// In ru, this message translates to:
  /// **'Поездка в пути'**
  String get passengerTripInProgressTitle;

  /// No description provided for @passengerCancellingLabel.
  ///
  /// In ru, this message translates to:
  /// **'Отменяем...'**
  String get passengerCancellingLabel;

  /// No description provided for @passengerCancelSearchButton.
  ///
  /// In ru, this message translates to:
  /// **'Отменить поиск'**
  String get passengerCancelSearchButton;

  /// No description provided for @passengerTripWithIdTitle.
  ///
  /// In ru, this message translates to:
  /// **'Поездка {id}'**
  String passengerTripWithIdTitle(String id);

  /// No description provided for @passengerDriverFoundTitle.
  ///
  /// In ru, this message translates to:
  /// **'Водитель найден'**
  String get passengerDriverFoundTitle;

  /// No description provided for @passengerNewTripButton.
  ///
  /// In ru, this message translates to:
  /// **'Новая поездка'**
  String get passengerNewTripButton;

  /// No description provided for @passengerCancelTripButton.
  ///
  /// In ru, this message translates to:
  /// **'Отменить поездку'**
  String get passengerCancelTripButton;

  /// No description provided for @passengerCancelTripShortButton.
  ///
  /// In ru, this message translates to:
  /// **'Отменить'**
  String get passengerCancelTripShortButton;

  /// No description provided for @passengerRateDriverFallbackName.
  ///
  /// In ru, this message translates to:
  /// **'водителем'**
  String get passengerRateDriverFallbackName;

  /// No description provided for @passengerRateDriverQuestion.
  ///
  /// In ru, this message translates to:
  /// **'Как прошла поездка с {name}?'**
  String passengerRateDriverQuestion(String name);

  /// No description provided for @passengerSubmitRatingButton.
  ///
  /// In ru, this message translates to:
  /// **'Отправить оценку'**
  String get passengerSubmitRatingButton;

  /// No description provided for @passengerSubmittingRatingButton.
  ///
  /// In ru, this message translates to:
  /// **'Отправляем...'**
  String get passengerSubmittingRatingButton;

  /// No description provided for @passengerSkipButton.
  ///
  /// In ru, this message translates to:
  /// **'Пропустить'**
  String get passengerSkipButton;

  /// No description provided for @passengerRatedThankYouTitle.
  ///
  /// In ru, this message translates to:
  /// **'Спасибо за оценку!'**
  String get passengerRatedThankYouTitle;

  /// No description provided for @passengerRatedThankYouText.
  ///
  /// In ru, this message translates to:
  /// **'Ваш отзыв помогает нам поддерживать качество поездок'**
  String get passengerRatedThankYouText;

  /// No description provided for @passengerOrderAgainButton.
  ///
  /// In ru, this message translates to:
  /// **'Заказать снова'**
  String get passengerOrderAgainButton;

  /// No description provided for @passengerTripCompletedTitle.
  ///
  /// In ru, this message translates to:
  /// **'Поездка завершена'**
  String get passengerTripCompletedTitle;

  /// No description provided for @passengerTripReceiptSubtitle.
  ///
  /// In ru, this message translates to:
  /// **'Чек поездки'**
  String get passengerTripReceiptSubtitle;

  /// No description provided for @passengerRateTripButton.
  ///
  /// In ru, this message translates to:
  /// **'Оценить поездку'**
  String get passengerRateTripButton;

  /// No description provided for @passengerCardPaymentFailedText.
  ///
  /// In ru, this message translates to:
  /// **'Не удалось провести оплату картой'**
  String get passengerCardPaymentFailedText;

  /// No description provided for @passengerRetryPaymentButton.
  ///
  /// In ru, this message translates to:
  /// **'Повторить оплату'**
  String get passengerRetryPaymentButton;

  /// No description provided for @passengerPaymentSlowText.
  ///
  /// In ru, this message translates to:
  /// **'Оплата занимает больше времени, чем обычно'**
  String get passengerPaymentSlowText;

  /// No description provided for @passengerPaymentProcessingText.
  ///
  /// In ru, this message translates to:
  /// **'Обрабатываем оплату картой...'**
  String get passengerPaymentProcessingText;

  /// No description provided for @passengerPaymentAwaitingText.
  ///
  /// In ru, this message translates to:
  /// **'Ожидаем подтверждение оплаты'**
  String get passengerPaymentAwaitingText;

  /// No description provided for @ratingTagPoliteDriver.
  ///
  /// In ru, this message translates to:
  /// **'Вежливый водитель'**
  String get ratingTagPoliteDriver;

  /// No description provided for @ratingTagCleanCar.
  ///
  /// In ru, this message translates to:
  /// **'Чисто в машине'**
  String get ratingTagCleanCar;

  /// No description provided for @ratingTagSafeDriving.
  ///
  /// In ru, this message translates to:
  /// **'Ехал безопасно'**
  String get ratingTagSafeDriving;

  /// No description provided for @ratingTagOnTime.
  ///
  /// In ru, this message translates to:
  /// **'Приехал вовремя'**
  String get ratingTagOnTime;

  /// No description provided for @ratingTagLate.
  ///
  /// In ru, this message translates to:
  /// **'Опоздал'**
  String get ratingTagLate;

  /// No description provided for @ratingTagRude.
  ///
  /// In ru, this message translates to:
  /// **'Грубое общение'**
  String get ratingTagRude;

  /// No description provided for @ratingTagUnsafeDriving.
  ///
  /// In ru, this message translates to:
  /// **'Небезопасная езда'**
  String get ratingTagUnsafeDriving;

  /// No description provided for @ratingTagDirtyCar.
  ///
  /// In ru, this message translates to:
  /// **'Грязно в машине'**
  String get ratingTagDirtyCar;

  /// No description provided for @passengerNoDriversTitle.
  ///
  /// In ru, this message translates to:
  /// **'Водителей рядом нет'**
  String get passengerNoDriversTitle;

  /// No description provided for @passengerNoDriversText.
  ///
  /// In ru, this message translates to:
  /// **'Сейчас нет свободных водителей поблизости. Попробуйте повторить поиск через минуту или отмените заказ.'**
  String get passengerNoDriversText;

  /// No description provided for @passengerRetrySearchButton.
  ///
  /// In ru, this message translates to:
  /// **'Повторить поиск'**
  String get passengerRetrySearchButton;

  /// No description provided for @passengerRetryingSearchButton.
  ///
  /// In ru, this message translates to:
  /// **'Ищем снова...'**
  String get passengerRetryingSearchButton;

  /// No description provided for @passengerCancelOrderButton.
  ///
  /// In ru, this message translates to:
  /// **'Отменить заказ'**
  String get passengerCancelOrderButton;

  /// No description provided for @passengerYourPriceLabel.
  ///
  /// In ru, this message translates to:
  /// **'Ваша цена'**
  String get passengerYourPriceLabel;

  /// No description provided for @passengerDriverPriceLabel.
  ///
  /// In ru, this message translates to:
  /// **'Цена водителя'**
  String get passengerDriverPriceLabel;

  /// No description provided for @passengerAcceptOfferButton.
  ///
  /// In ru, this message translates to:
  /// **'Согласиться'**
  String get passengerAcceptOfferButton;

  /// No description provided for @passengerSendingResponseButton.
  ///
  /// In ru, this message translates to:
  /// **'Отправляем ответ...'**
  String get passengerSendingResponseButton;

  /// No description provided for @passengerCounterOfferPrompt.
  ///
  /// In ru, this message translates to:
  /// **'Или предложите свою цену'**
  String get passengerCounterOfferPrompt;

  /// No description provided for @passengerSubmitOfferButton.
  ///
  /// In ru, this message translates to:
  /// **'Отправить предложение'**
  String get passengerSubmitOfferButton;

  /// No description provided for @passengerDeclineOfferButton.
  ///
  /// In ru, this message translates to:
  /// **'Отказаться'**
  String get passengerDeclineOfferButton;

  /// No description provided for @passengerQueuedOffersTitle.
  ///
  /// In ru, this message translates to:
  /// **'Другие предложения водителей'**
  String get passengerQueuedOffersTitle;

  /// No description provided for @passengerChooseOfferButton.
  ///
  /// In ru, this message translates to:
  /// **'Выбрать'**
  String get passengerChooseOfferButton;

  /// No description provided for @passengerWaitingDriverResponseTitle.
  ///
  /// In ru, this message translates to:
  /// **'Ждём ответа водителя'**
  String get passengerWaitingDriverResponseTitle;

  /// No description provided for @passengerOfferSentText.
  ///
  /// In ru, this message translates to:
  /// **'Ваше предложение отправлено'**
  String get passengerOfferSentText;

  /// No description provided for @passengerYouOfferedText.
  ///
  /// In ru, this message translates to:
  /// **'Вы предложили {amount}'**
  String passengerYouOfferedText(String amount);

  /// No description provided for @passengerCancelledByDriverTitle.
  ///
  /// In ru, this message translates to:
  /// **'Водитель отменил поездку'**
  String get passengerCancelledByDriverTitle;

  /// No description provided for @passengerCancelledByDriverText.
  ///
  /// In ru, this message translates to:
  /// **'Найдём вам другого водителя за пару секунд'**
  String get passengerCancelledByDriverText;

  /// No description provided for @passengerCancelledByOperatorTitle.
  ///
  /// In ru, this message translates to:
  /// **'Поездка отменена оператором'**
  String get passengerCancelledByOperatorTitle;

  /// No description provided for @passengerCancelledByOperatorText.
  ///
  /// In ru, this message translates to:
  /// **'Если это ошибка — напишите в поддержку'**
  String get passengerCancelledByOperatorText;

  /// No description provided for @passengerNoShowTitle.
  ///
  /// In ru, this message translates to:
  /// **'Поездка не состоялась'**
  String get passengerNoShowTitle;

  /// No description provided for @passengerNoShowText.
  ///
  /// In ru, this message translates to:
  /// **'Водитель не дождался вас на месте посадки'**
  String get passengerNoShowText;

  /// No description provided for @passengerCancelledGenericTitle.
  ///
  /// In ru, this message translates to:
  /// **'Поездка отменена'**
  String get passengerCancelledGenericTitle;

  /// No description provided for @passengerCancelledGenericText.
  ///
  /// In ru, this message translates to:
  /// **'Вы можете заказать новую поездку в любой момент'**
  String get passengerCancelledGenericText;

  /// No description provided for @passengerCancelTripConfirmTitle.
  ///
  /// In ru, this message translates to:
  /// **'Отменить поездку?'**
  String get passengerCancelTripConfirmTitle;

  /// No description provided for @passengerCancelSearchConfirmTitle.
  ///
  /// In ru, this message translates to:
  /// **'Отменить поиск водителя?'**
  String get passengerCancelSearchConfirmTitle;

  /// No description provided for @passengerCancelTripConfirmText.
  ///
  /// In ru, this message translates to:
  /// **'Водитель уже направляется к вам. При частой отмене после назначения водителя может взиматься небольшая плата.'**
  String get passengerCancelTripConfirmText;

  /// No description provided for @passengerCancelSearchConfirmText.
  ///
  /// In ru, this message translates to:
  /// **'Мы прекратим поиск, и заказ будет снят.'**
  String get passengerCancelSearchConfirmText;

  /// No description provided for @passengerCancelConfirmYesButton.
  ///
  /// In ru, this message translates to:
  /// **'Да, отменить'**
  String get passengerCancelConfirmYesButton;

  /// No description provided for @passengerCancelConfirmNoButton.
  ///
  /// In ru, this message translates to:
  /// **'Нет, продолжить'**
  String get passengerCancelConfirmNoButton;

  /// No description provided for @passengerHeadingToDropoffTitle.
  ///
  /// In ru, this message translates to:
  /// **'Едем к месту назначения'**
  String get passengerHeadingToDropoffTitle;

  /// No description provided for @passengerEnRouteLowercase.
  ///
  /// In ru, this message translates to:
  /// **'в пути'**
  String get passengerEnRouteLowercase;

  /// No description provided for @passengerJustStartedLowercase.
  ///
  /// In ru, this message translates to:
  /// **'только начали'**
  String get passengerJustStartedLowercase;

  /// No description provided for @passengerMinutesEnRoute.
  ///
  /// In ru, this message translates to:
  /// **'{minutes} мин в пути'**
  String passengerMinutesEnRoute(int minutes);

  /// No description provided for @passengerJustStartedCapitalized.
  ///
  /// In ru, this message translates to:
  /// **'Только начали'**
  String get passengerJustStartedCapitalized;

  /// No description provided for @passengerShareTripTooltipEnabled.
  ///
  /// In ru, this message translates to:
  /// **'Поделиться отслеживанием поездки'**
  String get passengerShareTripTooltipEnabled;

  /// No description provided for @passengerShareTripTooltipDisabled.
  ///
  /// In ru, this message translates to:
  /// **'Ссылка появится, как только найдётся водитель'**
  String get passengerShareTripTooltipDisabled;

  /// No description provided for @passengerShareTripMessage.
  ///
  /// In ru, this message translates to:
  /// **'Слежу за поездкой SmartTaxi{routeSuffix}. Статус: {link}'**
  String passengerShareTripMessage(String routeSuffix, String link);

  /// No description provided for @passengerSafetyTitle.
  ///
  /// In ru, this message translates to:
  /// **'Безопасность поездки'**
  String get passengerSafetyTitle;

  /// No description provided for @passengerCallPhoneLabel.
  ///
  /// In ru, this message translates to:
  /// **'Позвонить {phone}'**
  String passengerCallPhoneLabel(String phone);

  /// No description provided for @passengerSosEmergencyLineText.
  ///
  /// In ru, this message translates to:
  /// **'Экстренная линия SmartTaxi, если что-то пошло не так'**
  String get passengerSosEmergencyLineText;

  /// No description provided for @passengerSupportWillBeNotifiedTitle.
  ///
  /// In ru, this message translates to:
  /// **'Поддержка получит сигнал'**
  String get passengerSupportWillBeNotifiedTitle;

  /// No description provided for @passengerSupportWillBeNotifiedText.
  ///
  /// In ru, this message translates to:
  /// **'Заявка с номером поездки и вашими координатами уходит в поддержку одновременно со звонком'**
  String get passengerSupportWillBeNotifiedText;

  /// No description provided for @quickMessageArrived.
  ///
  /// In ru, this message translates to:
  /// **'Я приехал'**
  String get quickMessageArrived;

  /// No description provided for @quickMessageWaitingAtEntrance.
  ///
  /// In ru, this message translates to:
  /// **'Жду у входа'**
  String get quickMessageWaitingAtEntrance;

  /// No description provided for @quickMessageRunningLate2Min.
  ///
  /// In ru, this message translates to:
  /// **'Опаздываю на 2 минуты'**
  String get quickMessageRunningLate2Min;

  /// No description provided for @quickMessagePleaseComeOut.
  ///
  /// In ru, this message translates to:
  /// **'Пожалуйста, выходите'**
  String get quickMessagePleaseComeOut;

  /// No description provided for @quickMessageOnMyWay.
  ///
  /// In ru, this message translates to:
  /// **'Уже еду к вам'**
  String get quickMessageOnMyWay;

  /// No description provided for @passengerChatFallbackTitle.
  ///
  /// In ru, this message translates to:
  /// **'Чат'**
  String get passengerChatFallbackTitle;

  /// No description provided for @passengerChatQuickPhrasesNotice.
  ///
  /// In ru, this message translates to:
  /// **'Быстрые фразы — свободный текст пока недоступен'**
  String get passengerChatQuickPhrasesNotice;

  /// No description provided for @passengerChatEmptyText.
  ///
  /// In ru, this message translates to:
  /// **'Сообщений пока нет'**
  String get passengerChatEmptyText;

  /// No description provided for @passengerChatSendFailedError.
  ///
  /// In ru, this message translates to:
  /// **'Не удалось отправить сообщение'**
  String get passengerChatSendFailedError;

  /// No description provided for @messageButton.
  ///
  /// In ru, this message translates to:
  /// **'Написать'**
  String get messageButton;

  /// No description provided for @passengerSearchStepCheckingDrivers.
  ///
  /// In ru, this message translates to:
  /// **'Проверяем водителей рядом'**
  String get passengerSearchStepCheckingDrivers;

  /// No description provided for @passengerSearchStepWaitingConfirmation.
  ///
  /// In ru, this message translates to:
  /// **'Ждём подтверждение заказа'**
  String get passengerSearchStepWaitingConfirmation;

  /// No description provided for @passengerSearchStepLockingFirst.
  ///
  /// In ru, this message translates to:
  /// **'Закрепим первого принявшего'**
  String get passengerSearchStepLockingFirst;

  /// No description provided for @passengerFromLabel.
  ///
  /// In ru, this message translates to:
  /// **'Откуда'**
  String get passengerFromLabel;

  /// No description provided for @passengerToLabel.
  ///
  /// In ru, this message translates to:
  /// **'Куда'**
  String get passengerToLabel;

  /// No description provided for @passengerNotifLoadError.
  ///
  /// In ru, this message translates to:
  /// **'Не удалось загрузить уведомления'**
  String get passengerNotifLoadError;

  /// No description provided for @passengerNotifSubtitle.
  ///
  /// In ru, this message translates to:
  /// **'Статусы поездок и важные сообщения SmartTaxi'**
  String get passengerNotifSubtitle;

  /// No description provided for @passengerNotifCategoryOrders.
  ///
  /// In ru, this message translates to:
  /// **'Заказы'**
  String get passengerNotifCategoryOrders;

  /// No description provided for @passengerNotifCategoryService.
  ///
  /// In ru, this message translates to:
  /// **'Сервис'**
  String get passengerNotifCategoryService;

  /// No description provided for @passengerNotifCategoryBonus.
  ///
  /// In ru, this message translates to:
  /// **'Бонусы'**
  String get passengerNotifCategoryBonus;

  /// No description provided for @passengerNotifLoadErrorTitle.
  ///
  /// In ru, this message translates to:
  /// **'Не удалось загрузить'**
  String get passengerNotifLoadErrorTitle;

  /// No description provided for @passengerNotifEmptyTitle.
  ///
  /// In ru, this message translates to:
  /// **'Новых уведомлений нет'**
  String get passengerNotifEmptyTitle;

  /// No description provided for @passengerNotifEmptyCategoryTitle.
  ///
  /// In ru, this message translates to:
  /// **'Здесь пока пусто'**
  String get passengerNotifEmptyCategoryTitle;

  /// No description provided for @passengerNotifEmptyText.
  ///
  /// In ru, this message translates to:
  /// **'Когда водитель примет заказ или поездка изменит статус, мы покажем это здесь и в статусе поездки.'**
  String get passengerNotifEmptyText;

  /// No description provided for @passengerNotifEmptyCategoryText.
  ///
  /// In ru, this message translates to:
  /// **'В этой категории пока нет уведомлений.'**
  String get passengerNotifEmptyCategoryText;

  /// No description provided for @passengerBonusBalanceLabel.
  ///
  /// In ru, this message translates to:
  /// **'Баланс кешбэка и бонусов'**
  String get passengerBonusBalanceLabel;

  /// No description provided for @passengerBonusNotEnoughText.
  ///
  /// In ru, this message translates to:
  /// **'Пока не хватит на поездку по минимальному тарифу'**
  String get passengerBonusNotEnoughText;

  /// No description provided for @passengerBonusRidesLeft.
  ///
  /// In ru, this message translates to:
  /// **'Хватит ещё на {count} {count, plural, one{поездку} few{поездки} many{поездок} other{поездок}}'**
  String passengerBonusRidesLeft(int count);

  /// No description provided for @passengerNearbyCarsCount.
  ///
  /// In ru, this message translates to:
  /// **'{count} {count, plural, one{машина} few{машины} many{машин} other{машин}} рядом'**
  String passengerNearbyCarsCount(int count);

  /// No description provided for @passengerTimeAgoJustNow.
  ///
  /// In ru, this message translates to:
  /// **'только что'**
  String get passengerTimeAgoJustNow;

  /// No description provided for @passengerTimeAgoMinutes.
  ///
  /// In ru, this message translates to:
  /// **'{minutes} мин назад'**
  String passengerTimeAgoMinutes(int minutes);

  /// No description provided for @passengerTimeAgoHours.
  ///
  /// In ru, this message translates to:
  /// **'{hours} ч назад'**
  String passengerTimeAgoHours(int hours);

  /// No description provided for @passengerTimeAgoDays.
  ///
  /// In ru, this message translates to:
  /// **'{days} дн назад'**
  String passengerTimeAgoDays(int days);

  /// No description provided for @passengerMarkDriverTitle.
  ///
  /// In ru, this message translates to:
  /// **'Отметить водителя'**
  String get passengerMarkDriverTitle;

  /// No description provided for @passengerNoTripDriversText.
  ///
  /// In ru, this message translates to:
  /// **'Нет водителей из истории поездок, которых ещё можно отметить.'**
  String get passengerNoTripDriversText;

  /// No description provided for @passengerChooseDriverHint.
  ///
  /// In ru, this message translates to:
  /// **'Выберите водителя'**
  String get passengerChooseDriverHint;

  /// No description provided for @passengerAddToFavoritesChip.
  ///
  /// In ru, this message translates to:
  /// **'В избранное'**
  String get passengerAddToFavoritesChip;

  /// No description provided for @passengerBlockDriverChip.
  ///
  /// In ru, this message translates to:
  /// **'Заблокировать'**
  String get passengerBlockDriverChip;

  /// No description provided for @passengerAddToFavoritesTitle.
  ///
  /// In ru, this message translates to:
  /// **'Добавить в избранное'**
  String get passengerAddToFavoritesTitle;

  /// No description provided for @passengerFavoriteLabelHome.
  ///
  /// In ru, this message translates to:
  /// **'Дом'**
  String get passengerFavoriteLabelHome;

  /// No description provided for @passengerFavoriteLabelWork.
  ///
  /// In ru, this message translates to:
  /// **'Работа'**
  String get passengerFavoriteLabelWork;

  /// No description provided for @passengerFavoriteLabelOther.
  ///
  /// In ru, this message translates to:
  /// **'Другое'**
  String get passengerFavoriteLabelOther;

  /// No description provided for @passengerFavoriteNameLabel.
  ///
  /// In ru, this message translates to:
  /// **'Название'**
  String get passengerFavoriteNameLabel;

  /// No description provided for @passengerFavoriteNameHint.
  ///
  /// In ru, this message translates to:
  /// **'Например, «Дача» или «Спортзал»'**
  String get passengerFavoriteNameHint;

  /// No description provided for @passengerAddressSearchNotFoundError.
  ///
  /// In ru, this message translates to:
  /// **'Не удалось найти адрес'**
  String get passengerAddressSearchNotFoundError;

  /// No description provided for @passengerAddressSearchHint.
  ///
  /// In ru, this message translates to:
  /// **'Улица, дом или место'**
  String get passengerAddressSearchHint;

  /// No description provided for @passengerClearAction.
  ///
  /// In ru, this message translates to:
  /// **'Очистить'**
  String get passengerClearAction;

  /// No description provided for @passengerSearchErrorTitle.
  ///
  /// In ru, this message translates to:
  /// **'Ошибка поиска'**
  String get passengerSearchErrorTitle;

  /// No description provided for @passengerEnterAddressTitle.
  ///
  /// In ru, this message translates to:
  /// **'Введите адрес'**
  String get passengerEnterAddressTitle;

  /// No description provided for @passengerStartTypingStreetText.
  ///
  /// In ru, this message translates to:
  /// **'Начните вводить название улицы или места'**
  String get passengerStartTypingStreetText;

  /// No description provided for @passengerTryDifferentQueryText.
  ///
  /// In ru, this message translates to:
  /// **'Попробуйте изменить запрос'**
  String get passengerTryDifferentQueryText;

  /// No description provided for @passengerNewRecurringRouteTitle.
  ///
  /// In ru, this message translates to:
  /// **'Новый регулярный маршрут'**
  String get passengerNewRecurringRouteTitle;

  /// No description provided for @passengerRecurringRouteExampleText.
  ///
  /// In ru, this message translates to:
  /// **'Например, отвозить ребёнка в школу по будням'**
  String get passengerRecurringRouteExampleText;

  /// No description provided for @passengerNoAvailableDriversTitle.
  ///
  /// In ru, this message translates to:
  /// **'Нет доступных водителей'**
  String get passengerNoAvailableDriversTitle;

  /// No description provided for @passengerNoAvailableDriversText.
  ///
  /// In ru, this message translates to:
  /// **'Водителя можно выбрать только из тех, с кем у вас уже была поездка. Совершите хотя бы одну поездку, чтобы предложить регулярный маршрут.'**
  String get passengerNoAvailableDriversText;

  /// No description provided for @passengerDayMon.
  ///
  /// In ru, this message translates to:
  /// **'Пн'**
  String get passengerDayMon;

  /// No description provided for @passengerDayTue.
  ///
  /// In ru, this message translates to:
  /// **'Вт'**
  String get passengerDayTue;

  /// No description provided for @passengerDayWed.
  ///
  /// In ru, this message translates to:
  /// **'Ср'**
  String get passengerDayWed;

  /// No description provided for @passengerDayThu.
  ///
  /// In ru, this message translates to:
  /// **'Чт'**
  String get passengerDayThu;

  /// No description provided for @passengerDayFri.
  ///
  /// In ru, this message translates to:
  /// **'Пт'**
  String get passengerDayFri;

  /// No description provided for @passengerDaysOfWeekLabel.
  ///
  /// In ru, this message translates to:
  /// **'Дни недели'**
  String get passengerDaysOfWeekLabel;

  /// No description provided for @passengerPickupTimeLabel.
  ///
  /// In ru, this message translates to:
  /// **'Время подачи'**
  String get passengerPickupTimeLabel;

  /// No description provided for @passengerChooseTimeButton.
  ///
  /// In ru, this message translates to:
  /// **'Выбрать время'**
  String get passengerChooseTimeButton;

  /// No description provided for @passengerPriceLabelTenge.
  ///
  /// In ru, this message translates to:
  /// **'Цена, ₸'**
  String get passengerPriceLabelTenge;

  /// No description provided for @passengerRecurringErrorChooseDriver.
  ///
  /// In ru, this message translates to:
  /// **'Выберите водителя'**
  String get passengerRecurringErrorChooseDriver;

  /// No description provided for @passengerRecurringErrorAddresses.
  ///
  /// In ru, this message translates to:
  /// **'Укажите точки посадки и назначения'**
  String get passengerRecurringErrorAddresses;

  /// No description provided for @passengerRecurringErrorDays.
  ///
  /// In ru, this message translates to:
  /// **'Выберите хотя бы один день недели'**
  String get passengerRecurringErrorDays;

  /// No description provided for @passengerRecurringErrorTime.
  ///
  /// In ru, this message translates to:
  /// **'Укажите время подачи'**
  String get passengerRecurringErrorTime;

  /// No description provided for @passengerRecurringErrorPrice.
  ///
  /// In ru, this message translates to:
  /// **'Укажите цену от 200 до 1 000 000 ₸'**
  String get passengerRecurringErrorPrice;

  /// No description provided for @passengerSendToDriverButton.
  ///
  /// In ru, this message translates to:
  /// **'Отправить водителю'**
  String get passengerSendToDriverButton;

  /// No description provided for @passengerSendingButton.
  ///
  /// In ru, this message translates to:
  /// **'Отправляем...'**
  String get passengerSendingButton;

  /// No description provided for @passengerPickupPointTitle.
  ///
  /// In ru, this message translates to:
  /// **'Точка посадки'**
  String get passengerPickupPointTitle;

  /// No description provided for @passengerDropoffPointTitle.
  ///
  /// In ru, this message translates to:
  /// **'Точка назначения'**
  String get passengerDropoffPointTitle;

  /// No description provided for @passengerChooseAddressText.
  ///
  /// In ru, this message translates to:
  /// **'Выбрать адрес'**
  String get passengerChooseAddressText;

  /// No description provided for @passengerRecentAddressesTitle.
  ///
  /// In ru, this message translates to:
  /// **'Недавние адреса'**
  String get passengerRecentAddressesTitle;

  /// No description provided for @passengerLocationFailedPickManuallyError.
  ///
  /// In ru, this message translates to:
  /// **'Не удалось получить геолокацию. Выберите точку подачи на карте.'**
  String get passengerLocationFailedPickManuallyError;

  /// No description provided for @statusStepSearching.
  ///
  /// In ru, this message translates to:
  /// **'Поиск'**
  String get statusStepSearching;

  /// No description provided for @statusStepGoing.
  ///
  /// In ru, this message translates to:
  /// **'Едет'**
  String get statusStepGoing;

  /// No description provided for @statusStepWaiting.
  ///
  /// In ru, this message translates to:
  /// **'Ждёт'**
  String get statusStepWaiting;

  /// No description provided for @statusStepInTransit.
  ///
  /// In ru, this message translates to:
  /// **'В пути'**
  String get statusStepInTransit;

  /// No description provided for @statusLabelSearching.
  ///
  /// In ru, this message translates to:
  /// **'Ищем водителя'**
  String get statusLabelSearching;

  /// No description provided for @statusLabelDriverFound.
  ///
  /// In ru, this message translates to:
  /// **'Водитель найден'**
  String get statusLabelDriverFound;

  /// No description provided for @statusLabelDriverGoingToClient.
  ///
  /// In ru, this message translates to:
  /// **'Водитель едет к вам'**
  String get statusLabelDriverGoingToClient;

  /// No description provided for @statusLabelDriverArrived.
  ///
  /// In ru, this message translates to:
  /// **'Водитель прибыл'**
  String get statusLabelDriverArrived;

  /// No description provided for @statusLabelWaitingClient.
  ///
  /// In ru, this message translates to:
  /// **'Ожидание клиента'**
  String get statusLabelWaitingClient;

  /// No description provided for @statusLabelPaymentPending.
  ///
  /// In ru, this message translates to:
  /// **'Ожидает оплату'**
  String get statusLabelPaymentPending;

  /// No description provided for @statusLabelPaid.
  ///
  /// In ru, this message translates to:
  /// **'Оплачено'**
  String get statusLabelPaid;

  /// No description provided for @statusLabelRated.
  ///
  /// In ru, this message translates to:
  /// **'Спасибо за оценку'**
  String get statusLabelRated;

  /// No description provided for @statusLabelCancelled.
  ///
  /// In ru, this message translates to:
  /// **'Отменён'**
  String get statusLabelCancelled;

  /// No description provided for @statusLabelCancelledByDriver.
  ///
  /// In ru, this message translates to:
  /// **'Отменён водителем'**
  String get statusLabelCancelledByDriver;

  /// No description provided for @statusLabelCancelledByOperator.
  ///
  /// In ru, this message translates to:
  /// **'Отменён оператором'**
  String get statusLabelCancelledByOperator;

  /// No description provided for @statusLabelNoShow.
  ///
  /// In ru, this message translates to:
  /// **'Клиент не вышел'**
  String get statusLabelNoShow;

  /// No description provided for @statusLabelUpdating.
  ///
  /// In ru, this message translates to:
  /// **'Статус обновляется'**
  String get statusLabelUpdating;

  /// No description provided for @driverPickupMetaToDropoff.
  ///
  /// In ru, this message translates to:
  /// **'До места назначения'**
  String get driverPickupMetaToDropoff;

  /// No description provided for @driverPickupMetaToPickup.
  ///
  /// In ru, this message translates to:
  /// **'До точки посадки'**
  String get driverPickupMetaToPickup;

  /// No description provided for @driverRouteFallbackNotice.
  ///
  /// In ru, this message translates to:
  /// **'приблизительно'**
  String get driverRouteFallbackNotice;

  /// No description provided for @driverPickupMetaText.
  ///
  /// In ru, this message translates to:
  /// **'{label}: {distance} км · {minutes} мин'**
  String driverPickupMetaText(String label, String distance, int minutes);

  /// No description provided for @routeErrorWaitingLocation.
  ///
  /// In ru, this message translates to:
  /// **'Ожидаем геолокацию водителя.'**
  String get routeErrorWaitingLocation;

  /// No description provided for @routeErrorDriverRouteUnavailable.
  ///
  /// In ru, this message translates to:
  /// **'Маршрут водителя временно недоступен.'**
  String get routeErrorDriverRouteUnavailable;

  /// No description provided for @errorClientHasActiveOrder.
  ///
  /// In ru, this message translates to:
  /// **'У вас уже есть активный заказ. Откройте поездку или отмените её.'**
  String get errorClientHasActiveOrder;

  /// No description provided for @errorValidation.
  ///
  /// In ru, this message translates to:
  /// **'Проверьте адреса и попробуйте ещё раз.'**
  String get errorValidation;

  /// No description provided for @errorUnauthorized.
  ///
  /// In ru, this message translates to:
  /// **'Сессия устарела. Войдите в аккаунт ещё раз.'**
  String get errorUnauthorized;

  /// No description provided for @errorForbidden.
  ///
  /// In ru, this message translates to:
  /// **'Недостаточно прав для этого действия.'**
  String get errorForbidden;

  /// No description provided for @errorRateLimited.
  ///
  /// In ru, this message translates to:
  /// **'Слишком много запросов. Попробуйте чуть позже.'**
  String get errorRateLimited;

  /// No description provided for @errorPickupRegionInactive.
  ///
  /// In ru, this message translates to:
  /// **'В этом месте сервис пока недоступен'**
  String get errorPickupRegionInactive;

  /// No description provided for @errorDropoffRegionInactive.
  ///
  /// In ru, this message translates to:
  /// **'Точка назначения вне активного региона'**
  String get errorDropoffRegionInactive;

  /// No description provided for @errorIntercityNotSupported.
  ///
  /// In ru, this message translates to:
  /// **'Выбранное направление межгорода временно недоступно'**
  String get errorIntercityNotSupported;

  /// No description provided for @errorTariffInactive.
  ///
  /// In ru, this message translates to:
  /// **'Этот тариф временно недоступен'**
  String get errorTariffInactive;

  /// No description provided for @errorTariffRegionMismatch.
  ///
  /// In ru, this message translates to:
  /// **'Тариф недоступен для выбранного региона'**
  String get errorTariffRegionMismatch;

  /// No description provided for @errorRouteUnavailable.
  ///
  /// In ru, this message translates to:
  /// **'Маршрут временно недоступен.'**
  String get errorRouteUnavailable;

  /// No description provided for @errorPromoCodeRequired.
  ///
  /// In ru, this message translates to:
  /// **'Введите промокод.'**
  String get errorPromoCodeRequired;

  /// No description provided for @errorPromoNotFound.
  ///
  /// In ru, this message translates to:
  /// **'Такой промокод не найден. Проверьте код.'**
  String get errorPromoNotFound;

  /// No description provided for @errorPromoNotStarted.
  ///
  /// In ru, this message translates to:
  /// **'Этот промокод ещё не начал действовать.'**
  String get errorPromoNotStarted;

  /// No description provided for @errorPromoExpired.
  ///
  /// In ru, this message translates to:
  /// **'Срок действия промокода истёк.'**
  String get errorPromoExpired;

  /// No description provided for @errorPromoMinOrderNotMet.
  ///
  /// In ru, this message translates to:
  /// **'Сумма заказа меньше минимальной для этого промокода.'**
  String get errorPromoMinOrderNotMet;

  /// No description provided for @errorPromoLimitReached.
  ///
  /// In ru, this message translates to:
  /// **'Лимит использования этого промокода исчерпан.'**
  String get errorPromoLimitReached;

  /// No description provided for @errorPromoAlreadyUsed.
  ///
  /// In ru, this message translates to:
  /// **'Вы уже использовали этот промокод.'**
  String get errorPromoAlreadyUsed;

  /// No description provided for @errorServerUnavailable.
  ///
  /// In ru, this message translates to:
  /// **'Сервер недоступен. Проверьте подключение.'**
  String get errorServerUnavailable;

  /// No description provided for @errorDriverNameRequired.
  ///
  /// In ru, this message translates to:
  /// **'Введите имя и фамилию'**
  String get errorDriverNameRequired;

  /// No description provided for @errorDriverPhoneRequired.
  ///
  /// In ru, this message translates to:
  /// **'Введите телефон'**
  String get errorDriverPhoneRequired;

  /// No description provided for @errorDriverCarRequired.
  ///
  /// In ru, this message translates to:
  /// **'Введите марку и модель авто'**
  String get errorDriverCarRequired;

  /// No description provided for @errorDriverPlateRequired.
  ///
  /// In ru, this message translates to:
  /// **'Введите госномер'**
  String get errorDriverPlateRequired;

  /// No description provided for @errorDriverTermsRequired.
  ///
  /// In ru, this message translates to:
  /// **'Подтвердите согласие с условиями, чтобы отправить заявку'**
  String get errorDriverTermsRequired;

  /// No description provided for @errorGenericRequestFailed.
  ///
  /// In ru, this message translates to:
  /// **'Не удалось выполнить запрос'**
  String get errorGenericRequestFailed;

  /// No description provided for @passengerGpsOrMapHintText.
  ///
  /// In ru, this message translates to:
  /// **'Можно включить GPS для точной подачи или выбрать точку на карте.'**
  String get passengerGpsOrMapHintText;

  /// No description provided for @passengerThemeLight.
  ///
  /// In ru, this message translates to:
  /// **'Светлая'**
  String get passengerThemeLight;

  /// No description provided for @passengerThemeDark.
  ///
  /// In ru, this message translates to:
  /// **'Тёмная'**
  String get passengerThemeDark;

  /// No description provided for @passengerThemeSystem.
  ///
  /// In ru, this message translates to:
  /// **'Как в системе'**
  String get passengerThemeSystem;

  /// No description provided for @passengerLogoutConfirmTitle.
  ///
  /// In ru, this message translates to:
  /// **'Выйти из аккаунта?'**
  String get passengerLogoutConfirmTitle;

  /// No description provided for @passengerLogoutConfirmText.
  ///
  /// In ru, this message translates to:
  /// **'Придётся снова войти по номеру телефона, чтобы продолжить пользоваться SmartTaxi.'**
  String get passengerLogoutConfirmText;

  /// No description provided for @passengerCancelButton.
  ///
  /// In ru, this message translates to:
  /// **'Отмена'**
  String get passengerCancelButton;

  /// No description provided for @passengerLogoutButton.
  ///
  /// In ru, this message translates to:
  /// **'Выйти'**
  String get passengerLogoutButton;

  /// No description provided for @passengerAccountLabelFallback.
  ///
  /// In ru, this message translates to:
  /// **'Пользователь'**
  String get passengerAccountLabelFallback;

  /// No description provided for @passengerClientOfSmartTaxi.
  ///
  /// In ru, this message translates to:
  /// **'Клиент SmartTaxi'**
  String get passengerClientOfSmartTaxi;

  /// No description provided for @passengerStatTripsLabel.
  ///
  /// In ru, this message translates to:
  /// **'Поездок'**
  String get passengerStatTripsLabel;

  /// No description provided for @passengerStatSpentLabel.
  ///
  /// In ru, this message translates to:
  /// **'Потрачено'**
  String get passengerStatSpentLabel;

  /// No description provided for @passengerStatRatedLabel.
  ///
  /// In ru, this message translates to:
  /// **'С оценкой'**
  String get passengerStatRatedLabel;

  /// No description provided for @passengerAccountNumberLabel.
  ///
  /// In ru, this message translates to:
  /// **'№ аккаунта'**
  String get passengerAccountNumberLabel;

  /// No description provided for @passengerPhoneLabel.
  ///
  /// In ru, this message translates to:
  /// **'Телефон'**
  String get passengerPhoneLabel;

  /// No description provided for @passengerQuickActionsGroup.
  ///
  /// In ru, this message translates to:
  /// **'Быстрые действия'**
  String get passengerQuickActionsGroup;

  /// No description provided for @passengerMyTripsMenuSubtitle.
  ///
  /// In ru, this message translates to:
  /// **'История и статус текущей поездки'**
  String get passengerMyTripsMenuSubtitle;

  /// No description provided for @passengerWalletMenuSubtitle.
  ///
  /// In ru, this message translates to:
  /// **'Баланс и привязанные карты'**
  String get passengerWalletMenuSubtitle;

  /// No description provided for @passengerPromoMenuSubtitle.
  ///
  /// In ru, this message translates to:
  /// **'Проверить и применить скидку'**
  String get passengerPromoMenuSubtitle;

  /// No description provided for @passengerNotificationsMenuSubtitle.
  ///
  /// In ru, this message translates to:
  /// **'Статусы поездок и сообщения'**
  String get passengerNotificationsMenuSubtitle;

  /// No description provided for @passengerSupportMenuSubtitle.
  ///
  /// In ru, this message translates to:
  /// **'Напишите нам, если нужна помощь'**
  String get passengerSupportMenuSubtitle;

  /// No description provided for @passengerFavoriteAddressesSubtitle.
  ///
  /// In ru, this message translates to:
  /// **'Дом, работа и другие частые точки'**
  String get passengerFavoriteAddressesSubtitle;

  /// No description provided for @passengerFavoriteAddressesSectionTitle.
  ///
  /// In ru, this message translates to:
  /// **'Избранные адреса'**
  String get passengerFavoriteAddressesSectionTitle;

  /// No description provided for @passengerDriversMenuSubtitle.
  ///
  /// In ru, this message translates to:
  /// **'Избранные и заблокированные водители'**
  String get passengerDriversMenuSubtitle;

  /// No description provided for @passengerReferralsMenuSubtitle.
  ///
  /// In ru, this message translates to:
  /// **'Ваш код и бонусы за приглашения'**
  String get passengerReferralsMenuSubtitle;

  /// No description provided for @passengerWalletTitle.
  ///
  /// In ru, this message translates to:
  /// **'Кошелёк'**
  String get passengerWalletTitle;

  /// No description provided for @passengerWalletSubtitle.
  ///
  /// In ru, this message translates to:
  /// **'Баланс, пополнение и привязанные карты'**
  String get passengerWalletSubtitle;

  /// No description provided for @passengerWalletBalanceLabel.
  ///
  /// In ru, this message translates to:
  /// **'Баланс'**
  String get passengerWalletBalanceLabel;

  /// No description provided for @passengerWalletTopUpButton.
  ///
  /// In ru, this message translates to:
  /// **'Пополнить'**
  String get passengerWalletTopUpButton;

  /// No description provided for @passengerWalletLoadError.
  ///
  /// In ru, this message translates to:
  /// **'Не удалось загрузить кошелёк'**
  String get passengerWalletLoadError;

  /// No description provided for @passengerWalletTopUpRequestsTitle.
  ///
  /// In ru, this message translates to:
  /// **'Заявки на пополнение'**
  String get passengerWalletTopUpRequestsTitle;

  /// No description provided for @passengerWalletCardsTitle.
  ///
  /// In ru, this message translates to:
  /// **'Привязанные карты'**
  String get passengerWalletCardsTitle;

  /// No description provided for @passengerWalletNoCards.
  ///
  /// In ru, this message translates to:
  /// **'Нет привязанных карт'**
  String get passengerWalletNoCards;

  /// No description provided for @passengerWalletAddCardButton.
  ///
  /// In ru, this message translates to:
  /// **'Добавить карту'**
  String get passengerWalletAddCardButton;

  /// No description provided for @passengerWalletAddCardSubtitle.
  ///
  /// In ru, this message translates to:
  /// **'Карта сохраняется только для последующей оплаты — сейчас с неё ничего не списывается.'**
  String get passengerWalletAddCardSubtitle;

  /// No description provided for @passengerWalletDefaultBadge.
  ///
  /// In ru, this message translates to:
  /// **'Основная'**
  String get passengerWalletDefaultBadge;

  /// No description provided for @passengerWalletSetDefaultAction.
  ///
  /// In ru, this message translates to:
  /// **'Сделать основной'**
  String get passengerWalletSetDefaultAction;

  /// No description provided for @passengerWalletRemoveAction.
  ///
  /// In ru, this message translates to:
  /// **'Удалить'**
  String get passengerWalletRemoveAction;

  /// No description provided for @passengerWalletRemoveCardConfirmTitle.
  ///
  /// In ru, this message translates to:
  /// **'Удалить карту?'**
  String get passengerWalletRemoveCardConfirmTitle;

  /// No description provided for @passengerWalletRemoveCardConfirmText.
  ///
  /// In ru, this message translates to:
  /// **'Карта {last4} будет удалена.'**
  String passengerWalletRemoveCardConfirmText(String last4);

  /// No description provided for @passengerCardNumberLabel.
  ///
  /// In ru, this message translates to:
  /// **'Номер карты'**
  String get passengerCardNumberLabel;

  /// No description provided for @passengerCardHolderNameLabel.
  ///
  /// In ru, this message translates to:
  /// **'Имя владельца (необязательно)'**
  String get passengerCardHolderNameLabel;

  /// No description provided for @passengerErrorInvalidCardNumber.
  ///
  /// In ru, this message translates to:
  /// **'Введите корректный номер карты'**
  String get passengerErrorInvalidCardNumber;

  /// No description provided for @passengerErrorCardTypo.
  ///
  /// In ru, this message translates to:
  /// **'Похоже, в номере карты опечатка — проверьте и попробуйте снова'**
  String get passengerErrorCardTypo;

  /// No description provided for @passengerWalletTopUpSheetTitle.
  ///
  /// In ru, this message translates to:
  /// **'Пополнение баланса'**
  String get passengerWalletTopUpSheetTitle;

  /// No description provided for @passengerWalletTopUpAmountLabel.
  ///
  /// In ru, this message translates to:
  /// **'Сумма пополнения'**
  String get passengerWalletTopUpAmountLabel;

  /// No description provided for @passengerWalletTopUpMinNote.
  ///
  /// In ru, this message translates to:
  /// **'Минимальная сумма — {amount}'**
  String passengerWalletTopUpMinNote(String amount);

  /// No description provided for @passengerWalletTopUpPendingNote.
  ///
  /// In ru, this message translates to:
  /// **'Оплата через Kaspi Pay появится в приложении позже — заявка сохранена и будет обработана автоматически, как только это станет доступно.'**
  String get passengerWalletTopUpPendingNote;

  /// No description provided for @passengerWalletTopUpSubmitButton.
  ///
  /// In ru, this message translates to:
  /// **'Создать заявку'**
  String get passengerWalletTopUpSubmitButton;

  /// No description provided for @passengerWalletTopupStatusPending.
  ///
  /// In ru, this message translates to:
  /// **'Ожидает'**
  String get passengerWalletTopupStatusPending;

  /// No description provided for @passengerWalletTopupStatusCompleted.
  ///
  /// In ru, this message translates to:
  /// **'Выполнено'**
  String get passengerWalletTopupStatusCompleted;

  /// No description provided for @passengerWalletTopupStatusFailed.
  ///
  /// In ru, this message translates to:
  /// **'Не удалось'**
  String get passengerWalletTopupStatusFailed;

  /// No description provided for @passengerWalletTopupStatusCancelled.
  ///
  /// In ru, this message translates to:
  /// **'Отменено'**
  String get passengerWalletTopupStatusCancelled;

  /// No description provided for @passengerSettingsMenuSubtitle.
  ///
  /// In ru, this message translates to:
  /// **'Язык, разрешения, аккаунт'**
  String get passengerSettingsMenuSubtitle;

  /// No description provided for @passengerAccountGroup.
  ///
  /// In ru, this message translates to:
  /// **'Аккаунт'**
  String get passengerAccountGroup;

  /// No description provided for @passengerProfileSubtitle.
  ///
  /// In ru, this message translates to:
  /// **'Аккаунт, поездки и настройки SmartTaxi'**
  String get passengerProfileSubtitle;

  /// No description provided for @passengerAddressEmptyHintTitle.
  ///
  /// In ru, this message translates to:
  /// **'Начните вводить адрес'**
  String get passengerAddressEmptyHintTitle;

  /// No description provided for @passengerAddressEmptyHintText.
  ///
  /// In ru, this message translates to:
  /// **'Напишите улицу, район или название места.'**
  String get passengerAddressEmptyHintText;

  /// No description provided for @passengerEnableLocationTitle.
  ///
  /// In ru, this message translates to:
  /// **'Включите геолокацию'**
  String get passengerEnableLocationTitle;

  /// No description provided for @passengerNoLocationAccessTitle.
  ///
  /// In ru, this message translates to:
  /// **'Нет доступа к геолокации'**
  String get passengerNoLocationAccessTitle;

  /// No description provided for @passengerEnableLocationText.
  ///
  /// In ru, this message translates to:
  /// **'Чтобы находить ближайших водителей и точно определять место подачи, включите GPS на телефоне.'**
  String get passengerEnableLocationText;

  /// No description provided for @passengerNoLocationAccessText.
  ///
  /// In ru, this message translates to:
  /// **'SmartTaxi нужен доступ к геолокации, чтобы находить водителей рядом с вами. Разрешите доступ в настройках телефона.'**
  String get passengerNoLocationAccessText;

  /// No description provided for @passengerOpenSettingsButton.
  ///
  /// In ru, this message translates to:
  /// **'Открыть настройки'**
  String get passengerOpenSettingsButton;

  /// No description provided for @passengerPickPointOnMapManualButton.
  ///
  /// In ru, this message translates to:
  /// **'Выбрать точку на карте вручную'**
  String get passengerPickPointOnMapManualButton;

  /// No description provided for @passengerLocationSheetTitle.
  ///
  /// In ru, this message translates to:
  /// **'Геолокация для подачи'**
  String get passengerLocationSheetTitle;

  /// No description provided for @passengerLocationSheetText.
  ///
  /// In ru, this message translates to:
  /// **'Используем ваше местоположение только для точки подачи и расчёта маршрута. Можно выбрать точку на карте вручную.'**
  String get passengerLocationSheetText;

  /// No description provided for @passengerAllowLocationButton.
  ///
  /// In ru, this message translates to:
  /// **'Разрешить геолокацию'**
  String get passengerAllowLocationButton;

  /// No description provided for @passengerPickPointOnMapButton.
  ///
  /// In ru, this message translates to:
  /// **'Выбрать точку на карте'**
  String get passengerPickPointOnMapButton;

  /// No description provided for @passengerPriceHintFaster.
  ///
  /// In ru, this message translates to:
  /// **'Быстрее найдём водителя'**
  String get passengerPriceHintFaster;

  /// No description provided for @passengerPriceHintSlower.
  ///
  /// In ru, this message translates to:
  /// **'Может занять больше времени'**
  String get passengerPriceHintSlower;

  /// No description provided for @passengerPriceHintNormal.
  ///
  /// In ru, this message translates to:
  /// **'Обычная скорость подачи'**
  String get passengerPriceHintNormal;

  /// No description provided for @passengerYourRegionQuestion.
  ///
  /// In ru, this message translates to:
  /// **'Ваш регион: {region}?'**
  String passengerYourRegionQuestion(String region);

  /// No description provided for @passengerRegionDetectedText.
  ///
  /// In ru, this message translates to:
  /// **'Мы определили регион по геолокации. Проверьте, чтобы заказы работали правильно.'**
  String get passengerRegionDetectedText;

  /// No description provided for @passengerChangeButton.
  ///
  /// In ru, this message translates to:
  /// **'Изменить'**
  String get passengerChangeButton;

  /// No description provided for @passengerYesCorrectButton.
  ///
  /// In ru, this message translates to:
  /// **'Да, верно'**
  String get passengerYesCorrectButton;

  /// No description provided for @passengerFindCityHint.
  ///
  /// In ru, this message translates to:
  /// **'Найти город или район'**
  String get passengerFindCityHint;

  /// No description provided for @passengerNoRegionFoundText.
  ///
  /// In ru, this message translates to:
  /// **'Уточните название региона или посёлка.'**
  String get passengerNoRegionFoundText;

  /// No description provided for @passengerPaymentCashDescription.
  ///
  /// In ru, this message translates to:
  /// **'Оплата водителю после поездки'**
  String get passengerPaymentCashDescription;

  /// No description provided for @passengerPaymentCardDescription.
  ///
  /// In ru, this message translates to:
  /// **'Оплата картой через Kaspi Pay'**
  String get passengerPaymentCardDescription;

  /// No description provided for @passengerChoosePaymentText.
  ///
  /// In ru, this message translates to:
  /// **'Выберите, как расплатиться за поездку'**
  String get passengerChoosePaymentText;

  /// No description provided for @passengerMyLocationLabel.
  ///
  /// In ru, this message translates to:
  /// **'Моё местоположение'**
  String get passengerMyLocationLabel;

  /// No description provided for @passengerChooseDropoffLabel.
  ///
  /// In ru, this message translates to:
  /// **'Выберите пункт назначения'**
  String get passengerChooseDropoffLabel;

  /// No description provided for @passengerAddressOutsideServiceZoneError.
  ///
  /// In ru, this message translates to:
  /// **'Этот адрес вне зоны обслуживания. Выберите другой.'**
  String get passengerAddressOutsideServiceZoneError;

  /// No description provided for @passengerMapPointLabel.
  ///
  /// In ru, this message translates to:
  /// **'Точка на карте'**
  String get passengerMapPointLabel;

  /// No description provided for @passengerResolvingAddressLabel.
  ///
  /// In ru, this message translates to:
  /// **'Определяем адрес...'**
  String get passengerResolvingAddressLabel;

  /// No description provided for @passengerRegionNotServedYetLabel.
  ///
  /// In ru, this message translates to:
  /// **'Пока не работаем в этом районе'**
  String get passengerRegionNotServedYetLabel;

  /// No description provided for @passengerPointOutsideRegionError.
  ///
  /// In ru, this message translates to:
  /// **'Эта точка вне выбранного региона. Смените регион или выберите точку внутри зоны SmartTaxi.'**
  String get passengerPointOutsideRegionError;

  /// No description provided for @passengerMapLoadingTitle.
  ///
  /// In ru, this message translates to:
  /// **'Карта загружается'**
  String get passengerMapLoadingTitle;

  /// No description provided for @passengerMapLoadingSubtitle.
  ///
  /// In ru, this message translates to:
  /// **'Подключаем карту города'**
  String get passengerMapLoadingSubtitle;

  /// No description provided for @passengerMapUnavailableTitle.
  ///
  /// In ru, this message translates to:
  /// **'Карта временно недоступна'**
  String get passengerMapUnavailableTitle;

  /// No description provided for @passengerMapUnavailableText.
  ///
  /// In ru, this message translates to:
  /// **'Маршрут и заказ можно выбрать вручную. Карта восстановится после подключения.'**
  String get passengerMapUnavailableText;

  /// No description provided for @passengerAllowGeolocationTooltip.
  ///
  /// In ru, this message translates to:
  /// **'Разрешить геолокацию'**
  String get passengerAllowGeolocationTooltip;

  /// No description provided for @passengerCalculatingRouteText.
  ///
  /// In ru, this message translates to:
  /// **'Считаем маршрут...'**
  String get passengerCalculatingRouteText;

  /// No description provided for @passengerRouteReadyText.
  ///
  /// In ru, this message translates to:
  /// **'Маршрут готов'**
  String get passengerRouteReadyText;

  /// No description provided for @passengerVerifiedDriversSubtitle.
  ///
  /// In ru, this message translates to:
  /// **'Проверенные водители · Безопасные поездки'**
  String get passengerVerifiedDriversSubtitle;

  /// No description provided for @passengerAddressNotePlaceholder.
  ///
  /// In ru, this message translates to:
  /// **'Описать место (дверь, подъезд, этаж)'**
  String get passengerAddressNotePlaceholder;

  /// No description provided for @passengerMapMarkerDragHint.
  ///
  /// In ru, this message translates to:
  /// **'Подвиньте карту так, чтобы маркер стоял над нужным входом.'**
  String get passengerMapMarkerDragHint;

  /// No description provided for @passengerOrderNoteSheetTitle.
  ///
  /// In ru, this message translates to:
  /// **'Описать место'**
  String get passengerOrderNoteSheetTitle;

  /// No description provided for @passengerOrderNoteSheetSubtitle.
  ///
  /// In ru, this message translates to:
  /// **'Например: домофон 45, второй подъезд, встретить у шлагбаума'**
  String get passengerOrderNoteSheetSubtitle;

  /// No description provided for @passengerOrderNoteFieldLabel.
  ///
  /// In ru, this message translates to:
  /// **'Комментарий для водителя'**
  String get passengerOrderNoteFieldLabel;

  /// No description provided for @passengerOrderNoteFieldHint.
  ///
  /// In ru, this message translates to:
  /// **'Где вас найти или куда ехать...'**
  String get passengerOrderNoteFieldHint;

  /// No description provided for @passengerDeleteNoteButton.
  ///
  /// In ru, this message translates to:
  /// **'Удалить комментарий'**
  String get passengerDeleteNoteButton;

  /// No description provided for @passengerConfirmAddressButton.
  ///
  /// In ru, this message translates to:
  /// **'Подтвердить адрес'**
  String get passengerConfirmAddressButton;

  /// No description provided for @passengerRecurringStatusActive.
  ///
  /// In ru, this message translates to:
  /// **'Активна'**
  String get passengerRecurringStatusActive;

  /// No description provided for @passengerRecurringStatusPaused.
  ///
  /// In ru, this message translates to:
  /// **'На паузе'**
  String get passengerRecurringStatusPaused;

  /// No description provided for @passengerRecurringStatusCancelled.
  ///
  /// In ru, this message translates to:
  /// **'Отменена'**
  String get passengerRecurringStatusCancelled;

  /// No description provided for @passengerRecurringStatusAwaitingDriver.
  ///
  /// In ru, this message translates to:
  /// **'Ждём водителя'**
  String get passengerRecurringStatusAwaitingDriver;

  /// No description provided for @passengerRecurringStatusSkippedToday.
  ///
  /// In ru, this message translates to:
  /// **'Пропущена сегодня'**
  String get passengerRecurringStatusSkippedToday;

  /// No description provided for @passengerRecurringSkippedTodayText.
  ///
  /// In ru, this message translates to:
  /// **'Сегодня поездка не состоялась: не нашлось свободного водителя. В следующий раз по расписанию всё сработает как обычно.'**
  String get passengerRecurringSkippedTodayText;

  /// No description provided for @passengerRecurringPauseButton.
  ///
  /// In ru, this message translates to:
  /// **'Пауза'**
  String get passengerRecurringPauseButton;

  /// No description provided for @passengerRecurringResumeButton.
  ///
  /// In ru, this message translates to:
  /// **'Возобновить'**
  String get passengerRecurringResumeButton;

  /// No description provided for @passengerRecurringAwaitingDriverConfirmationText.
  ///
  /// In ru, this message translates to:
  /// **'Ждём подтверждения от водителя'**
  String get passengerRecurringAwaitingDriverConfirmationText;

  /// No description provided for @passengerRecurringCancelButton.
  ///
  /// In ru, this message translates to:
  /// **'Отменить'**
  String get passengerRecurringCancelButton;

  /// No description provided for @passengerDriverArrivedWaitingBanner.
  ///
  /// In ru, this message translates to:
  /// **'Водитель приехал и ждёт вас'**
  String get passengerDriverArrivedWaitingBanner;

  /// No description provided for @passengerCopiedValueToast.
  ///
  /// In ru, this message translates to:
  /// **'Скопировано: {value}'**
  String passengerCopiedValueToast(String value);

  /// No description provided for @passengerCopyLabelSemantics.
  ///
  /// In ru, this message translates to:
  /// **'Скопировать {label}'**
  String passengerCopyLabelSemantics(String label);

  /// No description provided for @passengerDriverAppSubmittedMessage.
  ///
  /// In ru, this message translates to:
  /// **'Заявка отправлена. Администратор проверит данные.'**
  String get passengerDriverAppSubmittedMessage;

  /// No description provided for @passengerServerUnavailableError.
  ///
  /// In ru, this message translates to:
  /// **'Сервер временно недоступен. Можно выбрать маршрут, когда подключение восстановится.'**
  String get passengerServerUnavailableError;

  /// No description provided for @passengerRecurringSentToDriverToast.
  ///
  /// In ru, this message translates to:
  /// **'Заявка отправлена водителю, ждём подтверждения'**
  String get passengerRecurringSentToDriverToast;

  /// No description provided for @passengerRecurringCancelledToast.
  ///
  /// In ru, this message translates to:
  /// **'Регулярная поездка отменена'**
  String get passengerRecurringCancelledToast;

  /// No description provided for @passengerRecurringPausedToast.
  ///
  /// In ru, this message translates to:
  /// **'Регулярная поездка приостановлена'**
  String get passengerRecurringPausedToast;

  /// No description provided for @passengerRecurringResumedToast.
  ///
  /// In ru, this message translates to:
  /// **'Регулярная поездка возобновлена'**
  String get passengerRecurringResumedToast;

  /// No description provided for @passengerAddressAddedToFavoritesToast.
  ///
  /// In ru, this message translates to:
  /// **'Адрес добавлен в избранное'**
  String get passengerAddressAddedToFavoritesToast;

  /// No description provided for @passengerAddressRemovedFromFavoritesToast.
  ///
  /// In ru, this message translates to:
  /// **'Адрес удалён из избранного'**
  String get passengerAddressRemovedFromFavoritesToast;

  /// No description provided for @passengerDriverBlockedToast.
  ///
  /// In ru, this message translates to:
  /// **'Водитель заблокирован'**
  String get passengerDriverBlockedToast;

  /// No description provided for @passengerDriverAddedToFavoritesToast.
  ///
  /// In ru, this message translates to:
  /// **'Водитель добавлен в избранное'**
  String get passengerDriverAddedToFavoritesToast;

  /// No description provided for @passengerEntryDeletedToast.
  ///
  /// In ru, this message translates to:
  /// **'Запись удалена'**
  String get passengerEntryDeletedToast;

  /// No description provided for @passengerActiveRegionsNotLoadedError.
  ///
  /// In ru, this message translates to:
  /// **'Активные регионы пока не загружены'**
  String get passengerActiveRegionsNotLoadedError;

  /// No description provided for @passengerDriverFoundExclamation.
  ///
  /// In ru, this message translates to:
  /// **'Водитель найден!'**
  String get passengerDriverFoundExclamation;

  /// No description provided for @passengerDriverFoundNamedText.
  ///
  /// In ru, this message translates to:
  /// **'Водитель найден: {name} едет к вам'**
  String passengerDriverFoundNamedText(String name);

  /// No description provided for @passengerDriverCancelledSearchingAnotherToast.
  ///
  /// In ru, this message translates to:
  /// **'Водитель отменил поездку — ищем для вас другого'**
  String get passengerDriverCancelledSearchingAnotherToast;

  /// No description provided for @passengerPaymentInitiateFailedError.
  ///
  /// In ru, this message translates to:
  /// **'Не удалось начать оплату. Проверьте соединение.'**
  String get passengerPaymentInitiateFailedError;

  /// No description provided for @passengerLoginRequiredForOrderError.
  ///
  /// In ru, this message translates to:
  /// **'Для заказа войдите по номеру телефона.'**
  String get passengerLoginRequiredForOrderError;

  /// No description provided for @passengerAcceptedNewPriceToast.
  ///
  /// In ru, this message translates to:
  /// **'Вы согласились на новую цену: {amount}'**
  String passengerAcceptedNewPriceToast(String amount);

  /// No description provided for @passengerDeclinedOfferedPriceToast.
  ///
  /// In ru, this message translates to:
  /// **'Вы отклонили предложенную цену'**
  String get passengerDeclinedOfferedPriceToast;

  /// No description provided for @passengerCounterOfferSentToast.
  ///
  /// In ru, this message translates to:
  /// **'Ваше предложение отправлено водителю: {amount}'**
  String passengerCounterOfferSentToast(String amount);

  /// No description provided for @passengerQueuedOfferArrivedToast.
  ///
  /// In ru, this message translates to:
  /// **'Ещё один водитель предложил цену: {amount}'**
  String passengerQueuedOfferArrivedToast(String amount);

  /// No description provided for @passengerLegalHubTitle.
  ///
  /// In ru, this message translates to:
  /// **'Правовая информация'**
  String get passengerLegalHubTitle;

  /// No description provided for @passengerLegalHubSubtitle.
  ///
  /// In ru, this message translates to:
  /// **'Официальные документы SmartTaxi, редакция от 6 июля 2026 года'**
  String get passengerLegalHubSubtitle;

  /// No description provided for @passengerAllDocumentsButton.
  ///
  /// In ru, this message translates to:
  /// **'Все документы'**
  String get passengerAllDocumentsButton;

  /// No description provided for @passengerSupportStatusResolved.
  ///
  /// In ru, this message translates to:
  /// **'Отвечено'**
  String get passengerSupportStatusResolved;

  /// No description provided for @passengerSupportStatusPending.
  ///
  /// In ru, this message translates to:
  /// **'В обработке'**
  String get passengerSupportStatusPending;

  /// No description provided for @passengerSupportResponseLabel.
  ///
  /// In ru, this message translates to:
  /// **'Ответ поддержки'**
  String get passengerSupportResponseLabel;

  /// No description provided for @passengerPickupPointSemanticLabel.
  ///
  /// In ru, this message translates to:
  /// **'Точка подачи'**
  String get passengerPickupPointSemanticLabel;

  /// No description provided for @passengerDropoffPointSemanticLabel.
  ///
  /// In ru, this message translates to:
  /// **'Точка назначения'**
  String get passengerDropoffPointSemanticLabel;

  /// No description provided for @passengerNearbyFreeDriverSemanticLabel.
  ///
  /// In ru, this message translates to:
  /// **'Свободный водитель рядом, {eta} мин'**
  String passengerNearbyFreeDriverSemanticLabel(int eta);

  /// No description provided for @passengerDriverCarSemanticLabel.
  ///
  /// In ru, this message translates to:
  /// **'Автомобиль водителя'**
  String get passengerDriverCarSemanticLabel;

  /// No description provided for @passengerLocationServiceDisabledError.
  ///
  /// In ru, this message translates to:
  /// **'Геолокация выключена. Включите её в настройках или выберите точку на карте.'**
  String get passengerLocationServiceDisabledError;

  /// No description provided for @passengerChooseRegionTitle.
  ///
  /// In ru, this message translates to:
  /// **'Выберите регион'**
  String get passengerChooseRegionTitle;

  /// No description provided for @passengerChooseRegionSubtitle.
  ///
  /// In ru, this message translates to:
  /// **'Выберите регион, где хотите заказать такси.'**
  String get passengerChooseRegionSubtitle;

  /// No description provided for @passengerLocationSkippedManualPickText.
  ///
  /// In ru, this message translates to:
  /// **'Можно выбрать точку подачи на карте без доступа к геолокации.'**
  String get passengerLocationSkippedManualPickText;

  /// No description provided for @passengerLocationDeniedManualPickError.
  ///
  /// In ru, this message translates to:
  /// **'Геолокация не включена. Выберите точку подачи на карте вручную.'**
  String get passengerLocationDeniedManualPickError;

  /// No description provided for @passengerLocationOutsideRegionError.
  ///
  /// In ru, this message translates to:
  /// **'Ваше местоположение вне выбранного региона. Выберите точку подачи на карте или смените регион.'**
  String get passengerLocationOutsideRegionError;

  /// No description provided for @passengerCurrentLocationLabel.
  ///
  /// In ru, this message translates to:
  /// **'Текущее местоположение'**
  String get passengerCurrentLocationLabel;

  /// No description provided for @passengerSectionUnavailableTitle.
  ///
  /// In ru, this message translates to:
  /// **'Раздел недоступен'**
  String get passengerSectionUnavailableTitle;

  /// No description provided for @passengerSectionUnavailableText.
  ///
  /// In ru, this message translates to:
  /// **'Вернитесь на главный экран и попробуйте открыть раздел ещё раз.'**
  String get passengerSectionUnavailableText;

  /// No description provided for @passengerMonthJan.
  ///
  /// In ru, this message translates to:
  /// **'янв'**
  String get passengerMonthJan;

  /// No description provided for @passengerMonthFeb.
  ///
  /// In ru, this message translates to:
  /// **'фев'**
  String get passengerMonthFeb;

  /// No description provided for @passengerMonthMar.
  ///
  /// In ru, this message translates to:
  /// **'мар'**
  String get passengerMonthMar;

  /// No description provided for @passengerMonthApr.
  ///
  /// In ru, this message translates to:
  /// **'апр'**
  String get passengerMonthApr;

  /// No description provided for @passengerMonthMay.
  ///
  /// In ru, this message translates to:
  /// **'мая'**
  String get passengerMonthMay;

  /// No description provided for @passengerMonthJun.
  ///
  /// In ru, this message translates to:
  /// **'июн'**
  String get passengerMonthJun;

  /// No description provided for @passengerMonthJul.
  ///
  /// In ru, this message translates to:
  /// **'июл'**
  String get passengerMonthJul;

  /// No description provided for @passengerMonthAug.
  ///
  /// In ru, this message translates to:
  /// **'авг'**
  String get passengerMonthAug;

  /// No description provided for @passengerMonthSep.
  ///
  /// In ru, this message translates to:
  /// **'сен'**
  String get passengerMonthSep;

  /// No description provided for @passengerMonthOct.
  ///
  /// In ru, this message translates to:
  /// **'окт'**
  String get passengerMonthOct;

  /// No description provided for @passengerMonthNov.
  ///
  /// In ru, this message translates to:
  /// **'ноя'**
  String get passengerMonthNov;

  /// No description provided for @passengerMonthDec.
  ///
  /// In ru, this message translates to:
  /// **'дек'**
  String get passengerMonthDec;

  /// No description provided for @passengerNoTripsForLostItem.
  ///
  /// In ru, this message translates to:
  /// **'Нет доступных поездок, к которым можно привязать эту заявку. Опишите поездку в сообщении ниже, мы найдём водителя вручную.'**
  String get passengerNoTripsForLostItem;

  /// No description provided for @passengerWhichTripLabel.
  ///
  /// In ru, this message translates to:
  /// **'Какая поездка?'**
  String get passengerWhichTripLabel;

  /// No description provided for @passengerWhichTripText.
  ///
  /// In ru, this message translates to:
  /// **'Нужна для того, чтобы уведомить водителя'**
  String get passengerWhichTripText;

  /// No description provided for @passengerChooseTripHint.
  ///
  /// In ru, this message translates to:
  /// **'Выберите поездку'**
  String get passengerChooseTripHint;

  /// No description provided for @authWelcomeTitle.
  ///
  /// In ru, this message translates to:
  /// **'Вход и регистрация'**
  String get authWelcomeTitle;

  /// No description provided for @authWelcomeSubtitle.
  ///
  /// In ru, this message translates to:
  /// **'Введите номер телефона, чтобы продолжить'**
  String get authWelcomeSubtitle;

  /// No description provided for @phoneNumberLabel.
  ///
  /// In ru, this message translates to:
  /// **'Номер телефона'**
  String get phoneNumberLabel;

  /// No description provided for @authSmsConsentNotice.
  ///
  /// In ru, this message translates to:
  /// **'Мы отправим SMS с кодом подтверждения. Это быстро и безопасно.'**
  String get authSmsConsentNotice;

  /// No description provided for @authLegalConsentPrefix.
  ///
  /// In ru, this message translates to:
  /// **'Продолжая, вы принимаете'**
  String get authLegalConsentPrefix;

  /// No description provided for @authLegalConsentJoiner.
  ///
  /// In ru, this message translates to:
  /// **'и'**
  String get authLegalConsentJoiner;

  /// No description provided for @termsOfUseLink.
  ///
  /// In ru, this message translates to:
  /// **'Условия использования'**
  String get termsOfUseLink;

  /// No description provided for @privacyPolicyLink.
  ///
  /// In ru, this message translates to:
  /// **'Политику конфиденциальности'**
  String get privacyPolicyLink;

  /// No description provided for @smsEnterCodeTitle.
  ///
  /// In ru, this message translates to:
  /// **'Введите SMS-код'**
  String get smsEnterCodeTitle;

  /// No description provided for @smsCodeSentSubtitle.
  ///
  /// In ru, this message translates to:
  /// **'Код подтверждения отправлен'**
  String get smsCodeSentSubtitle;

  /// No description provided for @smsCodeHint.
  ///
  /// In ru, this message translates to:
  /// **'Код из 6 цифр'**
  String get smsCodeHint;

  /// No description provided for @smsNeverShareCode.
  ///
  /// In ru, this message translates to:
  /// **'Никому не сообщайте код.'**
  String get smsNeverShareCode;

  /// No description provided for @smsStaffNeverAsk.
  ///
  /// In ru, this message translates to:
  /// **'Сотрудники SmartTaxi никогда не попросят его.'**
  String get smsStaffNeverAsk;

  /// No description provided for @smsCodeValidity.
  ///
  /// In ru, this message translates to:
  /// **'Код действует 5 минут. Повторная отправка доступна после таймера.'**
  String get smsCodeValidity;

  /// No description provided for @smsTermsConsent.
  ///
  /// In ru, this message translates to:
  /// **'Продолжая, вы соглашаетесь с условиями сервиса.'**
  String get smsTermsConsent;

  /// No description provided for @smsResendCode.
  ///
  /// In ru, this message translates to:
  /// **'Отправить код повторно'**
  String get smsResendCode;

  /// No description provided for @smsResendCountdown.
  ///
  /// In ru, this message translates to:
  /// **'Повторная отправка через'**
  String get smsResendCountdown;

  /// No description provided for @authCheckingLabel.
  ///
  /// In ru, this message translates to:
  /// **'Проверяем...'**
  String get authCheckingLabel;

  /// No description provided for @offlineTitle.
  ///
  /// In ru, this message translates to:
  /// **'Нет подключения к интернету'**
  String get offlineTitle;

  /// No description provided for @offlineBody.
  ///
  /// In ru, this message translates to:
  /// **'Проверьте Wi-Fi или мобильные данные. Как только связь появится, приложение продолжит работу автоматически.'**
  String get offlineBody;

  /// No description provided for @offlineRetryLabel.
  ///
  /// In ru, this message translates to:
  /// **'Проверить снова'**
  String get offlineRetryLabel;

  /// No description provided for @runtimeFallbackBody.
  ///
  /// In ru, this message translates to:
  /// **'Не удалось открыть экран. Перезапустите приложение или попробуйте войти снова.'**
  String get runtimeFallbackBody;

  /// No description provided for @runtimeFallbackAction.
  ///
  /// In ru, this message translates to:
  /// **'Вернуться на главную'**
  String get runtimeFallbackAction;

  /// No description provided for @devCodeLabel.
  ///
  /// In ru, this message translates to:
  /// **'Код для локального теста: {devCode}'**
  String devCodeLabel(String devCode);

  /// No description provided for @validateEnterName.
  ///
  /// In ru, this message translates to:
  /// **'Введите имя'**
  String get validateEnterName;

  /// No description provided for @validateEnterPhone.
  ///
  /// In ru, this message translates to:
  /// **'Введите номер телефона'**
  String get validateEnterPhone;

  /// No description provided for @validateCorrectPhone.
  ///
  /// In ru, this message translates to:
  /// **'Введите корректный номер'**
  String get validateCorrectPhone;

  /// No description provided for @validateSmsCode.
  ///
  /// In ru, this message translates to:
  /// **'Введите 6 цифр из SMS'**
  String get validateSmsCode;

  /// No description provided for @validateConfirmPhoneFirst.
  ///
  /// In ru, this message translates to:
  /// **'Сначала подтвердите номер телефона'**
  String get validateConfirmPhoneFirst;

  /// No description provided for @validateEnterPassword.
  ///
  /// In ru, this message translates to:
  /// **'Введите пароль'**
  String get validateEnterPassword;

  /// No description provided for @validateEnterNewPassword.
  ///
  /// In ru, this message translates to:
  /// **'Введите новый пароль'**
  String get validateEnterNewPassword;

  /// No description provided for @passwordHintMinChars.
  ///
  /// In ru, this message translates to:
  /// **'Минимум 8 символов, буквы и цифры'**
  String get passwordHintMinChars;

  /// No description provided for @passwordAddLettersDigits.
  ///
  /// In ru, this message translates to:
  /// **'Добавьте буквы и цифры'**
  String get passwordAddLettersDigits;

  /// No description provided for @repeatPasswordLabel.
  ///
  /// In ru, this message translates to:
  /// **'Повторите пароль'**
  String get repeatPasswordLabel;

  /// No description provided for @passwordsMismatch.
  ///
  /// In ru, this message translates to:
  /// **'Пароли не совпадают'**
  String get passwordsMismatch;

  /// No description provided for @invalidSmsCode.
  ///
  /// In ru, this message translates to:
  /// **'Неверный код. Попробуйте ещё раз.'**
  String get invalidSmsCode;

  /// No description provided for @serverUnavailable.
  ///
  /// In ru, this message translates to:
  /// **'Сервер недоступен. Проверьте интернет и попробуйте ещё раз.'**
  String get serverUnavailable;

  /// No description provided for @smsConfirmFailed.
  ///
  /// In ru, this message translates to:
  /// **'Не удалось подтвердить код. Попробуйте ещё раз.'**
  String get smsConfirmFailed;

  /// No description provided for @invalidPhoneOrPassword.
  ///
  /// In ru, this message translates to:
  /// **'Неверный номер или пароль'**
  String get invalidPhoneOrPassword;

  /// No description provided for @phoneAlreadyRegistered.
  ///
  /// In ru, this message translates to:
  /// **'Этот номер уже зарегистрирован'**
  String get phoneAlreadyRegistered;

  /// No description provided for @driverAccountBlocked.
  ///
  /// In ru, this message translates to:
  /// **'Аккаунт водителя заблокирован'**
  String get driverAccountBlocked;

  /// No description provided for @sessionExpiredOtherDevice.
  ///
  /// In ru, this message translates to:
  /// **'Вы вышли из аккаунта, так как был выполнен вход с другого устройства'**
  String get sessionExpiredOtherDevice;

  /// No description provided for @passwordMinLength.
  ///
  /// In ru, this message translates to:
  /// **'Пароль должен быть не короче 6 символов'**
  String get passwordMinLength;

  /// No description provided for @checkFilledData.
  ///
  /// In ru, this message translates to:
  /// **'Проверьте заполненные данные'**
  String get checkFilledData;

  /// No description provided for @createPasswordTitle.
  ///
  /// In ru, this message translates to:
  /// **'Придумайте пароль'**
  String get createPasswordTitle;

  /// No description provided for @createPasswordSubtitle.
  ///
  /// In ru, this message translates to:
  /// **'Осталось указать имя и создать пароль для входа.'**
  String get createPasswordSubtitle;

  /// No description provided for @createAccountButton.
  ///
  /// In ru, this message translates to:
  /// **'Создать аккаунт'**
  String get createAccountButton;

  /// No description provided for @creatingLabel.
  ///
  /// In ru, this message translates to:
  /// **'Создаём...'**
  String get creatingLabel;

  /// No description provided for @nameFieldLabel.
  ///
  /// In ru, this message translates to:
  /// **'Имя'**
  String get nameFieldLabel;

  /// No description provided for @referralCodeFieldLabel.
  ///
  /// In ru, this message translates to:
  /// **'Код приглашения (необязательно)'**
  String get referralCodeFieldLabel;

  /// No description provided for @passwordFieldLabel.
  ///
  /// In ru, this message translates to:
  /// **'Пароль'**
  String get passwordFieldLabel;

  /// No description provided for @hidePasswordTooltip.
  ///
  /// In ru, this message translates to:
  /// **'Скрыть пароль'**
  String get hidePasswordTooltip;

  /// No description provided for @showPasswordTooltip.
  ///
  /// In ru, this message translates to:
  /// **'Показать пароль'**
  String get showPasswordTooltip;

  /// No description provided for @backToSmsCode.
  ///
  /// In ru, this message translates to:
  /// **'Назад к SMS-коду'**
  String get backToSmsCode;

  /// No description provided for @publicOfferTitle.
  ///
  /// In ru, this message translates to:
  /// **'Публичная оферта'**
  String get publicOfferTitle;

  /// No description provided for @legalDocPendingNotice.
  ///
  /// In ru, this message translates to:
  /// **'Документ ещё не готов и появится здесь после юридической проверки.'**
  String get legalDocPendingNotice;

  /// No description provided for @personalDataConsentTitle.
  ///
  /// In ru, this message translates to:
  /// **'Согласие на обработку персональных данных'**
  String get personalDataConsentTitle;

  /// No description provided for @understoodLabel.
  ///
  /// In ru, this message translates to:
  /// **'Понятно'**
  String get understoodLabel;

  /// No description provided for @closingLabel.
  ///
  /// In ru, this message translates to:
  /// **'Закрываем...'**
  String get closingLabel;

  /// No description provided for @privacyPolicyTitle.
  ///
  /// In ru, this message translates to:
  /// **'Политика конфиденциальности'**
  String get privacyPolicyTitle;

  /// No description provided for @passwordLoginSubtitle.
  ///
  /// In ru, this message translates to:
  /// **'Введите пароль для входа в аккаунт'**
  String get passwordLoginSubtitle;

  /// No description provided for @passwordLoginWelcome.
  ///
  /// In ru, this message translates to:
  /// **'Добро пожаловать! Введите пароль для входа в аккаунт'**
  String get passwordLoginWelcome;

  /// No description provided for @forgotPasswordLabel.
  ///
  /// In ru, this message translates to:
  /// **'Забыли пароль?'**
  String get forgotPasswordLabel;

  /// No description provided for @loggingInLabel.
  ///
  /// In ru, this message translates to:
  /// **'Входим...'**
  String get loggingInLabel;

  /// No description provided for @newPasswordFieldLabel.
  ///
  /// In ru, this message translates to:
  /// **'Новый пароль'**
  String get newPasswordFieldLabel;

  /// No description provided for @newPasswordSubtitle.
  ///
  /// In ru, this message translates to:
  /// **'Придумайте новый пароль для входа в аккаунт'**
  String get newPasswordSubtitle;

  /// No description provided for @repeatPasswordHint.
  ///
  /// In ru, this message translates to:
  /// **'Введите пароль ещё раз'**
  String get repeatPasswordHint;

  /// No description provided for @savePasswordButton.
  ///
  /// In ru, this message translates to:
  /// **'Сохранить пароль'**
  String get savePasswordButton;

  /// No description provided for @savingLabel.
  ///
  /// In ru, this message translates to:
  /// **'Сохраняем...'**
  String get savingLabel;

  /// No description provided for @strongPasswordTitle.
  ///
  /// In ru, this message translates to:
  /// **'Надёжный пароль'**
  String get strongPasswordTitle;

  /// No description provided for @strongPasswordHint.
  ///
  /// In ru, this message translates to:
  /// **'Используйте минимум 8 символов, буквы и цифры'**
  String get strongPasswordHint;

  /// No description provided for @secureTitle.
  ///
  /// In ru, this message translates to:
  /// **'Это безопасно'**
  String get secureTitle;

  /// No description provided for @secureHint.
  ///
  /// In ru, this message translates to:
  /// **'Ваш пароль надёжно защищён и не передаётся третьим лицам'**
  String get secureHint;

  /// No description provided for @defaultAccountLabel.
  ///
  /// In ru, this message translates to:
  /// **'Аккаунт SmartTaxi'**
  String get defaultAccountLabel;

  /// No description provided for @appTagline.
  ///
  /// In ru, this message translates to:
  /// **'Ваш комфорт. Наша забота'**
  String get appTagline;

  /// No description provided for @driverDrawerWallet.
  ///
  /// In ru, this message translates to:
  /// **'Кошелёк'**
  String get driverDrawerWallet;

  /// No description provided for @driverDrawerDocuments.
  ///
  /// In ru, this message translates to:
  /// **'Документы'**
  String get driverDrawerDocuments;

  /// No description provided for @driverDrawerRating.
  ///
  /// In ru, this message translates to:
  /// **'Рейтинг'**
  String get driverDrawerRating;

  /// No description provided for @driverDrawerNotifications.
  ///
  /// In ru, this message translates to:
  /// **'Уведомления'**
  String get driverDrawerNotifications;

  /// No description provided for @driverDrawerMenuTooltip.
  ///
  /// In ru, this message translates to:
  /// **'Меню'**
  String get driverDrawerMenuTooltip;

  /// No description provided for @driverDrawerNameFallback.
  ///
  /// In ru, this message translates to:
  /// **'Водитель SmartTaxi'**
  String get driverDrawerNameFallback;

  /// No description provided for @driverDrawerWorkSection.
  ///
  /// In ru, this message translates to:
  /// **'Работа'**
  String get driverDrawerWorkSection;

  /// No description provided for @driverDrawerNavigatorBrand.
  ///
  /// In ru, this message translates to:
  /// **'Smart Navigator'**
  String get driverDrawerNavigatorBrand;

  /// No description provided for @driverDrawerServiceSection.
  ///
  /// In ru, this message translates to:
  /// **'Сервис'**
  String get driverDrawerServiceSection;

  /// No description provided for @driverDrawerRoadAlerts.
  ///
  /// In ru, this message translates to:
  /// **'Дорожные события'**
  String get driverDrawerRoadAlerts;

  /// No description provided for @driverDrawerPassengerMode.
  ///
  /// In ru, this message translates to:
  /// **'Режим пассажира'**
  String get driverDrawerPassengerMode;

  /// No description provided for @driverWalletTitle.
  ///
  /// In ru, this message translates to:
  /// **'Кошелёк'**
  String get driverWalletTitle;

  /// No description provided for @driverWalletSubtitle.
  ///
  /// In ru, this message translates to:
  /// **'Баланс, задолженность и выплаты'**
  String get driverWalletSubtitle;

  /// No description provided for @driverWalletLoadError.
  ///
  /// In ru, this message translates to:
  /// **'Не удалось загрузить кошелёк'**
  String get driverWalletLoadError;

  /// No description provided for @driverWalletBalanceLabel.
  ///
  /// In ru, this message translates to:
  /// **'Баланс'**
  String get driverWalletBalanceLabel;

  /// No description provided for @driverWalletDebtLabel.
  ///
  /// In ru, this message translates to:
  /// **'Задолженность: {amount}'**
  String driverWalletDebtLabel(String amount);

  /// No description provided for @driverWalletPendingLabel.
  ///
  /// In ru, this message translates to:
  /// **'В обработке: {amount}'**
  String driverWalletPendingLabel(String amount);

  /// No description provided for @driverWalletRequestPayoutButton.
  ///
  /// In ru, this message translates to:
  /// **'Запросить выплату'**
  String get driverWalletRequestPayoutButton;

  /// No description provided for @driverWalletMinPayoutNote.
  ///
  /// In ru, this message translates to:
  /// **'Минимальная сумма выплаты — {amount}'**
  String driverWalletMinPayoutNote(String amount);

  /// No description provided for @driverWalletPayoutRequestsTitle.
  ///
  /// In ru, this message translates to:
  /// **'Заявки на выплату'**
  String get driverWalletPayoutRequestsTitle;

  /// No description provided for @driverWalletNoPayoutRequests.
  ///
  /// In ru, this message translates to:
  /// **'Заявок пока нет'**
  String get driverWalletNoPayoutRequests;

  /// No description provided for @driverWalletTopUpButton.
  ///
  /// In ru, this message translates to:
  /// **'Пополнить баланс'**
  String get driverWalletTopUpButton;

  /// No description provided for @driverWalletTopupRequestsTitle.
  ///
  /// In ru, this message translates to:
  /// **'Заявки на пополнение'**
  String get driverWalletTopupRequestsTitle;

  /// No description provided for @driverWalletNoTopupRequests.
  ///
  /// In ru, this message translates to:
  /// **'Заявок пока нет'**
  String get driverWalletNoTopupRequests;

  /// No description provided for @driverTopupStatusPending.
  ///
  /// In ru, this message translates to:
  /// **'Ожидает зачисления'**
  String get driverTopupStatusPending;

  /// No description provided for @driverTopupSheetTitle.
  ///
  /// In ru, this message translates to:
  /// **'Пополнить баланс'**
  String get driverTopupSheetTitle;

  /// No description provided for @driverTopupSheetHint.
  ///
  /// In ru, this message translates to:
  /// **'Укажите сумму. Менеджер свяжется с вами, чтобы принять перевод и зачислить средства'**
  String get driverTopupSheetHint;

  /// No description provided for @driverTopupAmountLabel.
  ///
  /// In ru, this message translates to:
  /// **'Сумма, ₸'**
  String get driverTopupAmountLabel;

  /// No description provided for @driverTopupErrorBelowMin.
  ///
  /// In ru, this message translates to:
  /// **'Минимальная сумма — {amount}'**
  String driverTopupErrorBelowMin(String amount);

  /// No description provided for @driverTopupErrorGeneric.
  ///
  /// In ru, this message translates to:
  /// **'Не удалось создать заявку. Попробуйте ещё раз'**
  String get driverTopupErrorGeneric;

  /// No description provided for @driverTopupSubmitButton.
  ///
  /// In ru, this message translates to:
  /// **'Отправить заявку'**
  String get driverTopupSubmitButton;

  /// No description provided for @driverWalletTransactionsTitle.
  ///
  /// In ru, this message translates to:
  /// **'Операции'**
  String get driverWalletTransactionsTitle;

  /// No description provided for @driverWalletNoTransactions.
  ///
  /// In ru, this message translates to:
  /// **'Пока нет завершённых поездок'**
  String get driverWalletNoTransactions;

  /// No description provided for @driverWalletTxCashCommission.
  ///
  /// In ru, this message translates to:
  /// **'Комиссия за наличную поездку'**
  String get driverWalletTxCashCommission;

  /// No description provided for @driverWalletTxAdjustment.
  ///
  /// In ru, this message translates to:
  /// **'Корректировка'**
  String get driverWalletTxAdjustment;

  /// No description provided for @driverWalletTxEarning.
  ///
  /// In ru, this message translates to:
  /// **'Поступление за поездку'**
  String get driverWalletTxEarning;

  /// No description provided for @driverPayoutStatusPending.
  ///
  /// In ru, this message translates to:
  /// **'На рассмотрении'**
  String get driverPayoutStatusPending;

  /// No description provided for @driverPayoutStatusApproved.
  ///
  /// In ru, this message translates to:
  /// **'Одобрено'**
  String get driverPayoutStatusApproved;

  /// No description provided for @driverPayoutStatusPaid.
  ///
  /// In ru, this message translates to:
  /// **'Выплачено'**
  String get driverPayoutStatusPaid;

  /// No description provided for @driverPayoutStatusRejected.
  ///
  /// In ru, this message translates to:
  /// **'Отклонено'**
  String get driverPayoutStatusRejected;

  /// No description provided for @driverPayoutStatusCancelled.
  ///
  /// In ru, this message translates to:
  /// **'Отменено'**
  String get driverPayoutStatusCancelled;

  /// No description provided for @driverPayoutSheetTitle.
  ///
  /// In ru, this message translates to:
  /// **'Запросить выплату'**
  String get driverPayoutSheetTitle;

  /// No description provided for @driverPayoutSheetAvailable.
  ///
  /// In ru, this message translates to:
  /// **'Доступно к выводу: {amount}'**
  String driverPayoutSheetAvailable(String amount);

  /// No description provided for @driverPayoutAmountLabel.
  ///
  /// In ru, this message translates to:
  /// **'Сумма, ₸'**
  String get driverPayoutAmountLabel;

  /// No description provided for @driverPayoutPhoneLabel.
  ///
  /// In ru, this message translates to:
  /// **'Номер Kaspi для перевода'**
  String get driverPayoutPhoneLabel;

  /// No description provided for @driverPayoutErrorBelowMin.
  ///
  /// In ru, this message translates to:
  /// **'Минимальная сумма — {amount}'**
  String driverPayoutErrorBelowMin(String amount);

  /// No description provided for @driverPayoutErrorExceedsBalance.
  ///
  /// In ru, this message translates to:
  /// **'Сумма превышает доступный баланс'**
  String get driverPayoutErrorExceedsBalance;

  /// No description provided for @driverPayoutErrorPhoneRequired.
  ///
  /// In ru, this message translates to:
  /// **'Укажите номер для перевода Kaspi'**
  String get driverPayoutErrorPhoneRequired;

  /// No description provided for @driverPayoutErrorGeneric.
  ///
  /// In ru, this message translates to:
  /// **'Не удалось создать заявку. Попробуйте ещё раз'**
  String get driverPayoutErrorGeneric;

  /// No description provided for @driverPayoutSubmitButton.
  ///
  /// In ru, this message translates to:
  /// **'Отправить заявку'**
  String get driverPayoutSubmitButton;

  /// No description provided for @driverDocumentsTitle.
  ///
  /// In ru, this message translates to:
  /// **'Документы'**
  String get driverDocumentsTitle;

  /// No description provided for @driverDocumentsSubtitle.
  ///
  /// In ru, this message translates to:
  /// **'Загрузите документы для проверки администратором SmartTaxi'**
  String get driverDocumentsSubtitle;

  /// No description provided for @driverDocumentsLoadError.
  ///
  /// In ru, this message translates to:
  /// **'Не удалось загрузить документы'**
  String get driverDocumentsLoadError;

  /// No description provided for @driverDocumentStatusMissing.
  ///
  /// In ru, this message translates to:
  /// **'Не загружен'**
  String get driverDocumentStatusMissing;

  /// No description provided for @driverDocumentStatusApproved.
  ///
  /// In ru, this message translates to:
  /// **'Проверен'**
  String get driverDocumentStatusApproved;

  /// No description provided for @driverDocumentStatusRejected.
  ///
  /// In ru, this message translates to:
  /// **'Отклонён'**
  String get driverDocumentStatusRejected;

  /// No description provided for @driverDocumentStatusPending.
  ///
  /// In ru, this message translates to:
  /// **'На проверке'**
  String get driverDocumentStatusPending;

  /// No description provided for @driverDocumentUploadButton.
  ///
  /// In ru, this message translates to:
  /// **'Загрузить'**
  String get driverDocumentUploadButton;

  /// No description provided for @driverDocumentReuploadButton.
  ///
  /// In ru, this message translates to:
  /// **'Загрузить заново'**
  String get driverDocumentReuploadButton;

  /// No description provided for @driverDocumentUploadHint.
  ///
  /// In ru, this message translates to:
  /// **'JPG, PNG или PDF, до 8 МБ'**
  String get driverDocumentUploadHint;

  /// No description provided for @driverDocumentUploadError.
  ///
  /// In ru, this message translates to:
  /// **'Не удалось загрузить файл. Проверьте формат (JPG, PNG, PDF) и попробуйте снова'**
  String get driverDocumentUploadError;

  /// No description provided for @driverDocumentPickCamera.
  ///
  /// In ru, this message translates to:
  /// **'Сделать фото'**
  String get driverDocumentPickCamera;

  /// No description provided for @driverDocumentPickFile.
  ///
  /// In ru, this message translates to:
  /// **'Выбрать файл'**
  String get driverDocumentPickFile;

  /// No description provided for @driverDocumentPickCameraShort.
  ///
  /// In ru, this message translates to:
  /// **'Фото'**
  String get driverDocumentPickCameraShort;

  /// No description provided for @driverDocumentPickFileShort.
  ///
  /// In ru, this message translates to:
  /// **'Файл'**
  String get driverDocumentPickFileShort;

  /// No description provided for @driverDocumentTypeLicenseFront.
  ///
  /// In ru, this message translates to:
  /// **'Водительское удостоверение (лицевая)'**
  String get driverDocumentTypeLicenseFront;

  /// No description provided for @driverDocumentTypeLicenseBack.
  ///
  /// In ru, this message translates to:
  /// **'Водительское удостоверение (оборот)'**
  String get driverDocumentTypeLicenseBack;

  /// No description provided for @driverDocumentTypeIdCardFront.
  ///
  /// In ru, this message translates to:
  /// **'Удостоверение личности (лицевая)'**
  String get driverDocumentTypeIdCardFront;

  /// No description provided for @driverDocumentTypeIdCardBack.
  ///
  /// In ru, this message translates to:
  /// **'Удостоверение личности (оборот)'**
  String get driverDocumentTypeIdCardBack;

  /// No description provided for @driverDocumentTypeVehicleRegistration.
  ///
  /// In ru, this message translates to:
  /// **'Техпаспорт автомобиля'**
  String get driverDocumentTypeVehicleRegistration;

  /// No description provided for @driverDocumentTypeInsurancePolicy.
  ///
  /// In ru, this message translates to:
  /// **'Страховой полис'**
  String get driverDocumentTypeInsurancePolicy;

  /// No description provided for @driverDocumentTypeProfilePhoto.
  ///
  /// In ru, this message translates to:
  /// **'Фото профиля'**
  String get driverDocumentTypeProfilePhoto;

  /// No description provided for @driverDocumentTypeOther.
  ///
  /// In ru, this message translates to:
  /// **'Документ'**
  String get driverDocumentTypeOther;

  /// No description provided for @driverApplicationDocumentsTitle.
  ///
  /// In ru, this message translates to:
  /// **'Документы'**
  String get driverApplicationDocumentsTitle;

  /// No description provided for @driverApplicationDocumentsIntro.
  ///
  /// In ru, this message translates to:
  /// **'Заявка отправлена. Чтобы ускорить проверку, загрузите документы сейчас'**
  String get driverApplicationDocumentsIntro;

  /// No description provided for @driverApplicationDocumentsDone.
  ///
  /// In ru, this message translates to:
  /// **'Готово'**
  String get driverApplicationDocumentsDone;

  /// No description provided for @driverApplicationDocumentsLater.
  ///
  /// In ru, this message translates to:
  /// **'Продолжить позже'**
  String get driverApplicationDocumentsLater;

  /// No description provided for @driverApplicationDocumentUploaded.
  ///
  /// In ru, this message translates to:
  /// **'Загружено'**
  String get driverApplicationDocumentUploaded;

  /// No description provided for @driverRatingTitle.
  ///
  /// In ru, this message translates to:
  /// **'Рейтинг'**
  String get driverRatingTitle;

  /// No description provided for @driverRatingSubtitle.
  ///
  /// In ru, this message translates to:
  /// **'Оценки и отзывы пассажиров'**
  String get driverRatingSubtitle;

  /// No description provided for @driverRatingLoadError.
  ///
  /// In ru, this message translates to:
  /// **'Не удалось загрузить рейтинг'**
  String get driverRatingLoadError;

  /// No description provided for @driverRatingEmptyTitle.
  ///
  /// In ru, this message translates to:
  /// **'Отзывов пока нет'**
  String get driverRatingEmptyTitle;

  /// No description provided for @driverRatingEmptyText.
  ///
  /// In ru, this message translates to:
  /// **'Как только пассажиры оценят поездки, отзывы появятся здесь'**
  String get driverRatingEmptyText;

  /// No description provided for @driverRatingTopTagsTitle.
  ///
  /// In ru, this message translates to:
  /// **'Чаще всего отмечают'**
  String get driverRatingTopTagsTitle;

  /// No description provided for @driverRatingRecentTitle.
  ///
  /// In ru, this message translates to:
  /// **'Последние отзывы'**
  String get driverRatingRecentTitle;

  /// No description provided for @driverNotificationsTitle.
  ///
  /// In ru, this message translates to:
  /// **'Уведомления'**
  String get driverNotificationsTitle;

  /// No description provided for @driverNotificationsSubtitle.
  ///
  /// In ru, this message translates to:
  /// **'Статусы выплат, документов и заказов'**
  String get driverNotificationsSubtitle;

  /// No description provided for @driverNotificationsLoadError.
  ///
  /// In ru, this message translates to:
  /// **'Не удалось загрузить уведомления'**
  String get driverNotificationsLoadError;

  /// No description provided for @driverNotificationsEmptyTitle.
  ///
  /// In ru, this message translates to:
  /// **'Новых уведомлений нет'**
  String get driverNotificationsEmptyTitle;

  /// No description provided for @driverNotificationsEmptyText.
  ///
  /// In ru, this message translates to:
  /// **'Здесь появятся статусы выплат, проверки документов и поездок'**
  String get driverNotificationsEmptyText;

  /// No description provided for @driverProfileTitle.
  ///
  /// In ru, this message translates to:
  /// **'Профиль водителя'**
  String get driverProfileTitle;

  /// No description provided for @driverProfileSubtitle.
  ///
  /// In ru, this message translates to:
  /// **'Данные аккаунта и текущей смены'**
  String get driverProfileSubtitle;

  /// No description provided for @driverProfileNameFallback.
  ///
  /// In ru, this message translates to:
  /// **'Водитель'**
  String get driverProfileNameFallback;

  /// No description provided for @driverProfilePhoneMissing.
  ///
  /// In ru, this message translates to:
  /// **'Телефон не указан'**
  String get driverProfilePhoneMissing;

  /// No description provided for @driverProfileRegionLabel.
  ///
  /// In ru, this message translates to:
  /// **'Рабочий регион'**
  String get driverProfileRegionLabel;

  /// No description provided for @driverProfileRegionNotSelected.
  ///
  /// In ru, this message translates to:
  /// **'Не выбран'**
  String get driverProfileRegionNotSelected;

  /// No description provided for @driverProfileLineStatusLabel.
  ///
  /// In ru, this message translates to:
  /// **'Статус линии'**
  String get driverProfileLineStatusLabel;

  /// No description provided for @driverProfileOrdersTodayLabel.
  ///
  /// In ru, this message translates to:
  /// **'Заказов сегодня'**
  String get driverProfileOrdersTodayLabel;

  /// No description provided for @driverProfileEarnedTodayLabel.
  ///
  /// In ru, this message translates to:
  /// **'Заработано сегодня'**
  String get driverProfileEarnedTodayLabel;

  /// No description provided for @driverProfileDebtLabel.
  ///
  /// In ru, this message translates to:
  /// **'Задолженность'**
  String get driverProfileDebtLabel;

  /// No description provided for @driverProfileDocumentsNote.
  ///
  /// In ru, this message translates to:
  /// **'Документы автомобиля и допуск к регионам проверяет администратор SmartTaxi.'**
  String get driverProfileDocumentsNote;

  /// No description provided for @driverProfileTripHistoryTitle.
  ///
  /// In ru, this message translates to:
  /// **'История поездок'**
  String get driverProfileTripHistoryTitle;

  /// No description provided for @driverAvatarUpdated.
  ///
  /// In ru, this message translates to:
  /// **'Фото обновлено'**
  String get driverAvatarUpdated;

  /// No description provided for @driverAvatarUploadError.
  ///
  /// In ru, this message translates to:
  /// **'Не удалось загрузить фото'**
  String get driverAvatarUploadError;

  /// No description provided for @driverSupportTitle.
  ///
  /// In ru, this message translates to:
  /// **'Поддержка'**
  String get driverSupportTitle;

  /// No description provided for @driverSupportSubtitle.
  ///
  /// In ru, this message translates to:
  /// **'Опишите проблему, мы поможем'**
  String get driverSupportSubtitle;

  /// No description provided for @driverSupportTopicSectionTitle.
  ///
  /// In ru, this message translates to:
  /// **'Тема обращения'**
  String get driverSupportTopicSectionTitle;

  /// No description provided for @driverSupportTopicSectionText.
  ///
  /// In ru, this message translates to:
  /// **'Выберите, с чем нужна помощь'**
  String get driverSupportTopicSectionText;

  /// No description provided for @driverSupportTopicOrder.
  ///
  /// In ru, this message translates to:
  /// **'Проблема с заказом'**
  String get driverSupportTopicOrder;

  /// No description provided for @driverSupportTopicRegion.
  ///
  /// In ru, this message translates to:
  /// **'Вопрос по региону'**
  String get driverSupportTopicRegion;

  /// No description provided for @driverSupportTopicBilling.
  ///
  /// In ru, this message translates to:
  /// **'Начисления и долг'**
  String get driverSupportTopicBilling;

  /// No description provided for @driverSupportTopicOther.
  ///
  /// In ru, this message translates to:
  /// **'Другое'**
  String get driverSupportTopicOther;

  /// No description provided for @driverSupportMessageLabel.
  ///
  /// In ru, this message translates to:
  /// **'Сообщение'**
  String get driverSupportMessageLabel;

  /// No description provided for @driverSupportMessageHint.
  ///
  /// In ru, this message translates to:
  /// **'Напишите сообщение...'**
  String get driverSupportMessageHint;

  /// No description provided for @driverSupportMessageTooShort.
  ///
  /// In ru, this message translates to:
  /// **'Опишите проблему подробнее: минимум 8 символов.'**
  String get driverSupportMessageTooShort;

  /// No description provided for @driverSupportMessageSent.
  ///
  /// In ru, this message translates to:
  /// **'Обращение отправлено. Администратор ответит в ближайшее время.'**
  String get driverSupportMessageSent;

  /// No description provided for @driverSupportSendingButton.
  ///
  /// In ru, this message translates to:
  /// **'Отправляем...'**
  String get driverSupportSendingButton;

  /// No description provided for @driverSupportSendButton.
  ///
  /// In ru, this message translates to:
  /// **'Отправить'**
  String get driverSupportSendButton;

  /// No description provided for @driverSupportHistoryTitle.
  ///
  /// In ru, this message translates to:
  /// **'Ваши обращения'**
  String get driverSupportHistoryTitle;

  /// No description provided for @driverSupportStatusResolved.
  ///
  /// In ru, this message translates to:
  /// **'Отвечено'**
  String get driverSupportStatusResolved;

  /// No description provided for @driverSupportStatusPending.
  ///
  /// In ru, this message translates to:
  /// **'В обработке'**
  String get driverSupportStatusPending;

  /// No description provided for @driverSupportResponseLabel.
  ///
  /// In ru, this message translates to:
  /// **'Ответ поддержки'**
  String get driverSupportResponseLabel;

  /// No description provided for @driverSupportLoadError.
  ///
  /// In ru, this message translates to:
  /// **'Не удалось загрузить обращения'**
  String get driverSupportLoadError;

  /// No description provided for @driverTripHistoryLoadError.
  ///
  /// In ru, this message translates to:
  /// **'Не удалось загрузить историю поездок'**
  String get driverTripHistoryLoadError;

  /// No description provided for @driverSupportEmptyTitle.
  ///
  /// In ru, this message translates to:
  /// **'Обращений пока нет'**
  String get driverSupportEmptyTitle;

  /// No description provided for @driverSupportEmptyText.
  ///
  /// In ru, this message translates to:
  /// **'Здесь появятся ваши обращения в поддержку и ответы на них'**
  String get driverSupportEmptyText;

  /// No description provided for @driverFaqTitle.
  ///
  /// In ru, this message translates to:
  /// **'FAQ'**
  String get driverFaqTitle;

  /// No description provided for @driverFaqSubtitle.
  ///
  /// In ru, this message translates to:
  /// **'Ответы на частые вопросы водителей'**
  String get driverFaqSubtitle;

  /// No description provided for @driverFaqQ1.
  ///
  /// In ru, this message translates to:
  /// **'Как принять заказ?'**
  String get driverFaqQ1;

  /// No description provided for @driverFaqA1.
  ///
  /// In ru, this message translates to:
  /// **'На вкладке «Заказы» откройте карточку заказа и нажмите «Принять». Заказы с более высокой ценой от клиента показываются выше.'**
  String get driverFaqA1;

  /// No description provided for @driverFaqQ2.
  ///
  /// In ru, this message translates to:
  /// **'Почему не видно заказов?'**
  String get driverFaqQ2;

  /// No description provided for @driverFaqA2.
  ///
  /// In ru, this message translates to:
  /// **'Проверьте, что вы на линии (вкладка «Линия»), выбран рабочий регион и включена геолокация.'**
  String get driverFaqA2;

  /// No description provided for @driverFaqQ3.
  ///
  /// In ru, this message translates to:
  /// **'Как считается задолженность?'**
  String get driverFaqQ3;

  /// No description provided for @driverFaqA3.
  ///
  /// In ru, this message translates to:
  /// **'При оплате наличными или переводом комиссия сервиса добавляется в долг. При электронной оплате комиссия списывается автоматически.'**
  String get driverFaqA3;

  /// No description provided for @driverFaqQ4.
  ///
  /// In ru, this message translates to:
  /// **'Что означает «Своя цена»?'**
  String get driverFaqQ4;

  /// No description provided for @driverFaqA4.
  ///
  /// In ru, this message translates to:
  /// **'Клиент может предложить цену выше или ниже расчётной. Такие заказы отмечены бейджем и показываются в списке первыми.'**
  String get driverFaqA4;

  /// No description provided for @driverFaqQ5.
  ///
  /// In ru, this message translates to:
  /// **'Как сменить рабочий регион?'**
  String get driverFaqQ5;

  /// No description provided for @driverFaqA5.
  ///
  /// In ru, this message translates to:
  /// **'Регион выбирается на вкладке «Линия». Доступны только регионы, подтверждённые администратором.'**
  String get driverFaqA5;

  /// No description provided for @driverFaqQ6.
  ///
  /// In ru, this message translates to:
  /// **'Куда пропадают заказы, которые я пропустил?'**
  String get driverFaqQ6;

  /// No description provided for @driverFaqA6.
  ///
  /// In ru, this message translates to:
  /// **'Пропущенный заказ остаётся доступным другим водителям в регионе, пока его не примут.'**
  String get driverFaqA6;

  /// No description provided for @driverAboutDescription.
  ///
  /// In ru, this message translates to:
  /// **'SmartTaxi — региональный сервис такси. Водительское приложение показывает заказы только из активных регионов, подтверждённых администратором.'**
  String get driverAboutDescription;

  /// No description provided for @driverAboutVersionLabel.
  ///
  /// In ru, this message translates to:
  /// **'Версия приложения'**
  String get driverAboutVersionLabel;

  /// No description provided for @driverSettingsTitle.
  ///
  /// In ru, this message translates to:
  /// **'Настройки'**
  String get driverSettingsTitle;

  /// No description provided for @driverSettingsSubtitle.
  ///
  /// In ru, this message translates to:
  /// **'Аккаунт и информация о приложении'**
  String get driverSettingsSubtitle;

  /// No description provided for @driverSettingsAccountGroup.
  ///
  /// In ru, this message translates to:
  /// **'Аккаунт'**
  String get driverSettingsAccountGroup;

  /// No description provided for @driverSettingsPhoneLabel.
  ///
  /// In ru, this message translates to:
  /// **'Номер телефона'**
  String get driverSettingsPhoneLabel;

  /// No description provided for @driverSettingsPhoneMissing.
  ///
  /// In ru, this message translates to:
  /// **'Не указан'**
  String get driverSettingsPhoneMissing;

  /// No description provided for @driverSettingsPhoneCopied.
  ///
  /// In ru, this message translates to:
  /// **'Номер скопирован'**
  String get driverSettingsPhoneCopied;

  /// No description provided for @driverSettingsLogoutTitle.
  ///
  /// In ru, this message translates to:
  /// **'Выход из аккаунта'**
  String get driverSettingsLogoutTitle;

  /// No description provided for @driverSettingsLogoutText.
  ///
  /// In ru, this message translates to:
  /// **'Завершить текущую сессию'**
  String get driverSettingsLogoutText;

  /// No description provided for @driverSettingsInterfaceGroup.
  ///
  /// In ru, this message translates to:
  /// **'Интерфейс'**
  String get driverSettingsInterfaceGroup;

  /// No description provided for @driverSettingsLanguageLabel.
  ///
  /// In ru, this message translates to:
  /// **'Язык'**
  String get driverSettingsLanguageLabel;

  /// No description provided for @driverSettingsAboutGroup.
  ///
  /// In ru, this message translates to:
  /// **'О приложении'**
  String get driverSettingsAboutGroup;

  /// No description provided for @driverSettingsTermsTitle.
  ///
  /// In ru, this message translates to:
  /// **'Условия использования'**
  String get driverSettingsTermsTitle;

  /// No description provided for @driverSettingsTermsText.
  ///
  /// In ru, this message translates to:
  /// **'Правила поездок, заказов и ответственности сторон'**
  String get driverSettingsTermsText;

  /// No description provided for @driverSettingsPrivacyTitle.
  ///
  /// In ru, this message translates to:
  /// **'Политика конфиденциальности'**
  String get driverSettingsPrivacyTitle;

  /// No description provided for @driverSettingsPrivacyText.
  ///
  /// In ru, this message translates to:
  /// **'Как используются телефон, геолокация и история поездок'**
  String get driverSettingsPrivacyText;

  /// No description provided for @driverTabLine.
  ///
  /// In ru, this message translates to:
  /// **'Линия'**
  String get driverTabLine;

  /// No description provided for @driverTabOrders.
  ///
  /// In ru, this message translates to:
  /// **'Заказы'**
  String get driverTabOrders;

  /// No description provided for @driverTabTrip.
  ///
  /// In ru, this message translates to:
  /// **'Поездка'**
  String get driverTabTrip;

  /// No description provided for @driverTabNavigator.
  ///
  /// In ru, this message translates to:
  /// **'Навигатор'**
  String get driverTabNavigator;

  /// No description provided for @driverLineRegionSectionTitle.
  ///
  /// In ru, this message translates to:
  /// **'Рабочий регион'**
  String get driverLineRegionSectionTitle;

  /// No description provided for @driverLineRegionSectionText.
  ///
  /// In ru, this message translates to:
  /// **'Заказы поступают только из выбранного региона'**
  String get driverLineRegionSectionText;

  /// No description provided for @driverLineRegionsLoading.
  ///
  /// In ru, this message translates to:
  /// **'Загружаем регионы...'**
  String get driverLineRegionsLoading;

  /// No description provided for @driverLineNoRegionsTitle.
  ///
  /// In ru, this message translates to:
  /// **'Нет одобренных регионов'**
  String get driverLineNoRegionsTitle;

  /// No description provided for @driverLineNoRegionsText.
  ///
  /// In ru, this message translates to:
  /// **'Администратор должен одобрить вас для работы.'**
  String get driverLineNoRegionsText;

  /// No description provided for @driverLineLocationSectionTitle.
  ///
  /// In ru, this message translates to:
  /// **'Геолокация'**
  String get driverLineLocationSectionTitle;

  /// No description provided for @driverLineLocationSectionText.
  ///
  /// In ru, this message translates to:
  /// **'Позиция отправляется только во время работы на линии'**
  String get driverLineLocationSectionText;

  /// No description provided for @driverOrdersTitle.
  ///
  /// In ru, this message translates to:
  /// **'Заказы в регионе'**
  String get driverOrdersTitle;

  /// No description provided for @driverOrdersSubtitle.
  ///
  /// In ru, this message translates to:
  /// **'Показываем заказы только в вашем рабочем регионе.'**
  String get driverOrdersSubtitle;

  /// No description provided for @driverOrdersUpdating.
  ///
  /// In ru, this message translates to:
  /// **'Обновляем заказы...'**
  String get driverOrdersUpdating;

  /// No description provided for @driverOrdersGoOnlineTitle.
  ///
  /// In ru, this message translates to:
  /// **'Выйдите на линию, чтобы получать заказы'**
  String get driverOrdersGoOnlineTitle;

  /// No description provided for @driverOrdersGoOnlineText.
  ///
  /// In ru, this message translates to:
  /// **'После выхода на линию заказы появятся здесь.'**
  String get driverOrdersGoOnlineText;

  /// No description provided for @driverOrdersEmptyTitle.
  ///
  /// In ru, this message translates to:
  /// **'Заказов в вашем регионе пока нет'**
  String get driverOrdersEmptyTitle;

  /// No description provided for @driverOrdersEmptyText.
  ///
  /// In ru, this message translates to:
  /// **'Новые заказы появятся здесь, когда пассажиры создадут поездку.'**
  String get driverOrdersEmptyText;

  /// No description provided for @driverTripTitle.
  ///
  /// In ru, this message translates to:
  /// **'Активная поездка'**
  String get driverTripTitle;

  /// No description provided for @driverTripSubtitle.
  ///
  /// In ru, this message translates to:
  /// **'Следующий шаг по поездке'**
  String get driverTripSubtitle;

  /// No description provided for @driverTripEmptyTitle.
  ///
  /// In ru, this message translates to:
  /// **'Активной поездки нет'**
  String get driverTripEmptyTitle;

  /// No description provided for @driverTripEmptyText.
  ///
  /// In ru, this message translates to:
  /// **'Примите заказ, и поездка появится здесь.'**
  String get driverTripEmptyText;

  /// No description provided for @driverTripTariffLabel.
  ///
  /// In ru, this message translates to:
  /// **'Тариф: {tariff}'**
  String driverTripTariffLabel(String tariff);

  /// No description provided for @driverTripSavingButton.
  ///
  /// In ru, this message translates to:
  /// **'Сохраняем...'**
  String get driverTripSavingButton;

  /// No description provided for @driverTripDoneButton.
  ///
  /// In ru, this message translates to:
  /// **'Готово, к новым заказам'**
  String get driverTripDoneButton;

  /// No description provided for @driverTripNoShowButton.
  ///
  /// In ru, this message translates to:
  /// **'Клиент не вышел'**
  String get driverTripNoShowButton;

  /// No description provided for @driverTripCancelButton.
  ///
  /// In ru, this message translates to:
  /// **'Отменить'**
  String get driverTripCancelButton;

  /// No description provided for @driverActionGoingToClient.
  ///
  /// In ru, this message translates to:
  /// **'Выехал к клиенту'**
  String get driverActionGoingToClient;

  /// No description provided for @driverActionArrived.
  ///
  /// In ru, this message translates to:
  /// **'Прибыл'**
  String get driverActionArrived;

  /// No description provided for @driverActionStartWaiting.
  ///
  /// In ru, this message translates to:
  /// **'Начать ожидание'**
  String get driverActionStartWaiting;

  /// No description provided for @driverActionStartTrip.
  ///
  /// In ru, this message translates to:
  /// **'Начать поездку'**
  String get driverActionStartTrip;

  /// No description provided for @driverActionCompleteTrip.
  ///
  /// In ru, this message translates to:
  /// **'Завершить поездку'**
  String get driverActionCompleteTrip;

  /// No description provided for @driverStatusBusy.
  ///
  /// In ru, this message translates to:
  /// **'Занят'**
  String get driverStatusBusy;

  /// No description provided for @driverStatusOnline.
  ///
  /// In ru, this message translates to:
  /// **'На линии'**
  String get driverStatusOnline;

  /// No description provided for @driverStatusOffline.
  ///
  /// In ru, this message translates to:
  /// **'Не на линии'**
  String get driverStatusOffline;

  /// No description provided for @driverLocationChecking.
  ///
  /// In ru, this message translates to:
  /// **'Проверяем геолокацию...'**
  String get driverLocationChecking;

  /// No description provided for @driverLocationRequiredError.
  ///
  /// In ru, this message translates to:
  /// **'Для работы на линии нужна геолокация'**
  String get driverLocationRequiredError;

  /// No description provided for @driverLocationSendFailed.
  ///
  /// In ru, this message translates to:
  /// **'Не удалось отправить геолокацию. Попробуйте снова.'**
  String get driverLocationSendFailed;

  /// No description provided for @driverLocationFetchFailed.
  ///
  /// In ru, this message translates to:
  /// **'Не удалось получить геолокацию. Попробуйте снова.'**
  String get driverLocationFetchFailed;

  /// No description provided for @driverLocationActive.
  ///
  /// In ru, this message translates to:
  /// **'Геолокация активна'**
  String get driverLocationActive;

  /// No description provided for @driverGoOnlineRequiredError.
  ///
  /// In ru, this message translates to:
  /// **'Выйдите на линию, чтобы принимать заказы.'**
  String get driverGoOnlineRequiredError;

  /// No description provided for @driverGoOnlineRequiredRejectError.
  ///
  /// In ru, this message translates to:
  /// **'Выйдите на линию, чтобы пропускать заказы.'**
  String get driverGoOnlineRequiredRejectError;

  /// No description provided for @driverUpdatesUnavailableNote.
  ///
  /// In ru, this message translates to:
  /// **'Связь с сервером обновлений временно недоступна. Экран продолжит работать через API.'**
  String get driverUpdatesUnavailableNote;

  /// No description provided for @driverManeuverTurnLeft.
  ///
  /// In ru, this message translates to:
  /// **'Поворот налево'**
  String get driverManeuverTurnLeft;

  /// No description provided for @driverManeuverTurnRight.
  ///
  /// In ru, this message translates to:
  /// **'Поворот направо'**
  String get driverManeuverTurnRight;

  /// No description provided for @driverManeuverSlightLeft.
  ///
  /// In ru, this message translates to:
  /// **'Держитесь левее'**
  String get driverManeuverSlightLeft;

  /// No description provided for @driverManeuverSlightRight.
  ///
  /// In ru, this message translates to:
  /// **'Держитесь правее'**
  String get driverManeuverSlightRight;

  /// No description provided for @driverManeuverSharpLeft.
  ///
  /// In ru, this message translates to:
  /// **'Крутой поворот налево'**
  String get driverManeuverSharpLeft;

  /// No description provided for @driverManeuverSharpRight.
  ///
  /// In ru, this message translates to:
  /// **'Крутой поворот направо'**
  String get driverManeuverSharpRight;

  /// No description provided for @driverManeuverUturn.
  ///
  /// In ru, this message translates to:
  /// **'Разворот'**
  String get driverManeuverUturn;

  /// No description provided for @driverManeuverStraight.
  ///
  /// In ru, this message translates to:
  /// **'Двигайтесь прямо'**
  String get driverManeuverStraight;

  /// No description provided for @driverManeuverMergeLeft.
  ///
  /// In ru, this message translates to:
  /// **'Перестройтесь влево'**
  String get driverManeuverMergeLeft;

  /// No description provided for @driverManeuverMergeRight.
  ///
  /// In ru, this message translates to:
  /// **'Перестройтесь вправо'**
  String get driverManeuverMergeRight;

  /// No description provided for @driverManeuverOnRamp.
  ///
  /// In ru, this message translates to:
  /// **'Съезд на трассу'**
  String get driverManeuverOnRamp;

  /// No description provided for @driverManeuverOffRamp.
  ///
  /// In ru, this message translates to:
  /// **'Съезд с трассы'**
  String get driverManeuverOffRamp;

  /// No description provided for @driverManeuverRoundaboutWithExit.
  ///
  /// In ru, this message translates to:
  /// **'Круговое движение, {exit}-й съезд'**
  String driverManeuverRoundaboutWithExit(int exit);

  /// No description provided for @driverManeuverRoundabout.
  ///
  /// In ru, this message translates to:
  /// **'Круговое движение'**
  String get driverManeuverRoundabout;

  /// No description provided for @driverManeuverExitRoundabout.
  ///
  /// In ru, this message translates to:
  /// **'Съезд с кругового движения'**
  String get driverManeuverExitRoundabout;

  /// No description provided for @driverManeuverArrive.
  ///
  /// In ru, this message translates to:
  /// **'Вы почти на месте'**
  String get driverManeuverArrive;

  /// No description provided for @driverManeuverFollowRoute.
  ///
  /// In ru, this message translates to:
  /// **'Двигайтесь по маршруту'**
  String get driverManeuverFollowRoute;

  /// No description provided for @driverPaymentCashback.
  ///
  /// In ru, this message translates to:
  /// **'Бонусы'**
  String get driverPaymentCashback;

  /// No description provided for @driverPaymentMixed.
  ///
  /// In ru, this message translates to:
  /// **'Смешанная'**
  String get driverPaymentMixed;

  /// No description provided for @driverRouteMetaLabel.
  ///
  /// In ru, this message translates to:
  /// **'Маршрут: {details}'**
  String driverRouteMetaLabel(String details);

  /// No description provided for @driverOrderStatusNew.
  ///
  /// In ru, this message translates to:
  /// **'Новый'**
  String get driverOrderStatusNew;

  /// No description provided for @driverOrderStatusAccepted.
  ///
  /// In ru, this message translates to:
  /// **'Принят'**
  String get driverOrderStatusAccepted;

  /// No description provided for @driverOrderStatusGoingToClient.
  ///
  /// In ru, this message translates to:
  /// **'Едет к клиенту'**
  String get driverOrderStatusGoingToClient;

  /// No description provided for @driverOrderStatusWaiting.
  ///
  /// In ru, this message translates to:
  /// **'Ожидание'**
  String get driverOrderStatusWaiting;

  /// No description provided for @driverOrderStatusCompleted.
  ///
  /// In ru, this message translates to:
  /// **'Завершено'**
  String get driverOrderStatusCompleted;

  /// No description provided for @driverOrderStatusPaymentPending.
  ///
  /// In ru, this message translates to:
  /// **'Ожидает оплату'**
  String get driverOrderStatusPaymentPending;

  /// No description provided for @driverOrderStatusRated.
  ///
  /// In ru, this message translates to:
  /// **'Оценено'**
  String get driverOrderStatusRated;

  /// No description provided for @driverOrderStatusCancelledByDriver.
  ///
  /// In ru, this message translates to:
  /// **'Отменён водителем'**
  String get driverOrderStatusCancelledByDriver;

  /// No description provided for @driverOrderStatusCancelledByClient.
  ///
  /// In ru, this message translates to:
  /// **'Отменён клиентом'**
  String get driverOrderStatusCancelledByClient;

  /// No description provided for @driverOrderStatusCancelledByOperator.
  ///
  /// In ru, this message translates to:
  /// **'Отменён оператором'**
  String get driverOrderStatusCancelledByOperator;

  /// No description provided for @driverOrderStatusCancelled.
  ///
  /// In ru, this message translates to:
  /// **'Отменён'**
  String get driverOrderStatusCancelled;

  /// No description provided for @driverErrorRegionNotSelected.
  ///
  /// In ru, this message translates to:
  /// **'Выберите рабочий регион'**
  String get driverErrorRegionNotSelected;

  /// No description provided for @driverErrorRegionInactive.
  ///
  /// In ru, this message translates to:
  /// **'Регион временно отключён'**
  String get driverErrorRegionInactive;

  /// No description provided for @driverErrorRegionNotApproved.
  ///
  /// In ru, this message translates to:
  /// **'Вы не одобрены для этого региона'**
  String get driverErrorRegionNotApproved;

  /// No description provided for @driverErrorRegionBlocked.
  ///
  /// In ru, this message translates to:
  /// **'Работа в этом регионе заблокирована'**
  String get driverErrorRegionBlocked;

  /// No description provided for @driverErrorDriverBlocked.
  ///
  /// In ru, this message translates to:
  /// **'Водитель заблокирован'**
  String get driverErrorDriverBlocked;

  /// No description provided for @driverErrorDocumentsNotApproved.
  ///
  /// In ru, this message translates to:
  /// **'Сервер ещё требует проверку документов — обратитесь в поддержку'**
  String get driverErrorDocumentsNotApproved;

  /// No description provided for @driverErrorHasActiveOrder.
  ///
  /// In ru, this message translates to:
  /// **'У вас уже есть активный заказ'**
  String get driverErrorHasActiveOrder;

  /// No description provided for @driverErrorOrderAlreadyAccepted.
  ///
  /// In ru, this message translates to:
  /// **'Заказ уже принят другим водителем'**
  String get driverErrorOrderAlreadyAccepted;

  /// No description provided for @driverErrorInvalidStatusTransition.
  ///
  /// In ru, this message translates to:
  /// **'Этот шаг уже недоступен для заказа'**
  String get driverErrorInvalidStatusTransition;

  /// No description provided for @driverErrorForbiddenOrder.
  ///
  /// In ru, this message translates to:
  /// **'Этот заказ назначен другому водителю'**
  String get driverErrorForbiddenOrder;

  /// No description provided for @driverErrorOrderRegionMismatch.
  ///
  /// In ru, this message translates to:
  /// **'Заказ вне вашего рабочего региона'**
  String get driverErrorOrderRegionMismatch;

  /// No description provided for @driverErrorOrderNotFound.
  ///
  /// In ru, this message translates to:
  /// **'Заказ не найден'**
  String get driverErrorOrderNotFound;

  /// No description provided for @driverErrorDebtLimit.
  ///
  /// In ru, this message translates to:
  /// **'Превышен лимит долга. Свяжитесь с оператором'**
  String get driverErrorDebtLimit;

  /// No description provided for @driverErrorLocationOutsideRegion.
  ///
  /// In ru, this message translates to:
  /// **'Геолокация вне рабочего региона'**
  String get driverErrorLocationOutsideRegion;

  /// No description provided for @driverErrorLocationUnavailable.
  ///
  /// In ru, this message translates to:
  /// **'Ожидаем геолокацию водителя'**
  String get driverErrorLocationUnavailable;

  /// No description provided for @driverErrorOrderNotCompleted.
  ///
  /// In ru, this message translates to:
  /// **'Оплата поездки ещё не подтверждена оператором.'**
  String get driverErrorOrderNotCompleted;

  /// No description provided for @driverErrorOrderAlreadyRated.
  ///
  /// In ru, this message translates to:
  /// **'Вы уже оценили этого пассажира'**
  String get driverErrorOrderAlreadyRated;

  /// No description provided for @driverPassengerFallback.
  ///
  /// In ru, this message translates to:
  /// **'Пассажир'**
  String get driverPassengerFallback;

  /// No description provided for @driverStepperAccepted.
  ///
  /// In ru, this message translates to:
  /// **'Принят'**
  String get driverStepperAccepted;

  /// No description provided for @driverStepperGoing.
  ///
  /// In ru, this message translates to:
  /// **'Едет'**
  String get driverStepperGoing;

  /// No description provided for @driverStepperArrived.
  ///
  /// In ru, this message translates to:
  /// **'Прибыл'**
  String get driverStepperArrived;

  /// No description provided for @driverStepperWaiting.
  ///
  /// In ru, this message translates to:
  /// **'Ждём'**
  String get driverStepperWaiting;

  /// No description provided for @driverStepperInTransit.
  ///
  /// In ru, this message translates to:
  /// **'В пути'**
  String get driverStepperInTransit;

  /// No description provided for @driverStepperFinish.
  ///
  /// In ru, this message translates to:
  /// **'Финиш'**
  String get driverStepperFinish;

  /// No description provided for @driverNewOrderTitle.
  ///
  /// In ru, this message translates to:
  /// **'Новый заказ'**
  String get driverNewOrderTitle;

  /// No description provided for @driverWorkingRegionLabel.
  ///
  /// In ru, this message translates to:
  /// **'Рабочий регион'**
  String get driverWorkingRegionLabel;

  /// No description provided for @driverTariffLabel.
  ///
  /// In ru, this message translates to:
  /// **'Тариф {tariff}'**
  String driverTariffLabel(String tariff);

  /// No description provided for @driverPriceAfterCalculation.
  ///
  /// In ru, this message translates to:
  /// **'Цена после расчёта'**
  String get driverPriceAfterCalculation;

  /// No description provided for @driverCustomPriceBadge.
  ///
  /// In ru, this message translates to:
  /// **'Своя цена'**
  String get driverCustomPriceBadge;

  /// No description provided for @driverSkippingButton.
  ///
  /// In ru, this message translates to:
  /// **'Пропускаем...'**
  String get driverSkippingButton;

  /// No description provided for @driverSkipButton.
  ///
  /// In ru, this message translates to:
  /// **'Пропустить'**
  String get driverSkipButton;

  /// No description provided for @driverAcceptingButton.
  ///
  /// In ru, this message translates to:
  /// **'Принимаем...'**
  String get driverAcceptingButton;

  /// No description provided for @driverAcceptButton.
  ///
  /// In ru, this message translates to:
  /// **'Принять'**
  String get driverAcceptButton;

  /// No description provided for @driverDeclineButton.
  ///
  /// In ru, this message translates to:
  /// **'Отказаться'**
  String get driverDeclineButton;

  /// No description provided for @driverRespondingButton.
  ///
  /// In ru, this message translates to:
  /// **'Отвечаем...'**
  String get driverRespondingButton;

  /// No description provided for @driverClientOfferedCustomPrice.
  ///
  /// In ru, this message translates to:
  /// **'Клиент предложил {price}'**
  String driverClientOfferedCustomPrice(String price);

  /// No description provided for @driverClientOfferedCustomPriceGeneric.
  ///
  /// In ru, this message translates to:
  /// **'свою цену'**
  String get driverClientOfferedCustomPriceGeneric;

  /// No description provided for @driverAwaitingClientResponse.
  ///
  /// In ru, this message translates to:
  /// **'Ожидаем ответа клиента'**
  String get driverAwaitingClientResponse;

  /// No description provided for @driverAwaitingClientResponseWithPrice.
  ///
  /// In ru, this message translates to:
  /// **'Ожидаем ответа: {price}'**
  String driverAwaitingClientResponseWithPrice(String price);

  /// No description provided for @driverOfferCustomPriceButton.
  ///
  /// In ru, this message translates to:
  /// **'Предложить свою цену'**
  String get driverOfferCustomPriceButton;

  /// No description provided for @driverPaidWaitingLabel.
  ///
  /// In ru, this message translates to:
  /// **'Платное ожидание'**
  String get driverPaidWaitingLabel;

  /// No description provided for @driverFreeWaitingLabel.
  ///
  /// In ru, this message translates to:
  /// **'Бесплатное ожидание'**
  String get driverFreeWaitingLabel;

  /// No description provided for @driverTripDistanceCoveredLabel.
  ///
  /// In ru, this message translates to:
  /// **'Пройдено в этой поездке'**
  String get driverTripDistanceCoveredLabel;

  /// No description provided for @driverTripCompletedTitle.
  ///
  /// In ru, this message translates to:
  /// **'Поездка завершена'**
  String get driverTripCompletedTitle;

  /// No description provided for @driverTripCostLabel.
  ///
  /// In ru, this message translates to:
  /// **'Стоимость поездки'**
  String get driverTripCostLabel;

  /// No description provided for @driverServiceCommissionLabel.
  ///
  /// In ru, this message translates to:
  /// **'Комиссия сервиса'**
  String get driverServiceCommissionLabel;

  /// No description provided for @driverYouReceiveLabel.
  ///
  /// In ru, this message translates to:
  /// **'Вы получите'**
  String get driverYouReceiveLabel;

  /// No description provided for @driverConfirmPaymentTitle.
  ///
  /// In ru, this message translates to:
  /// **'Клиент оплатил поездку?'**
  String get driverConfirmPaymentTitle;

  /// No description provided for @driverConfirmPaymentHint.
  ///
  /// In ru, this message translates to:
  /// **'Подтвердите получение оплаты, чтобы продолжить и оценить пассажира'**
  String get driverConfirmPaymentHint;

  /// No description provided for @driverConfirmPaymentButton.
  ///
  /// In ru, this message translates to:
  /// **'Оплата получена'**
  String get driverConfirmPaymentButton;

  /// No description provided for @driverConfirmingPaymentButton.
  ///
  /// In ru, this message translates to:
  /// **'Подтверждаем...'**
  String get driverConfirmingPaymentButton;

  /// No description provided for @driverRatePassengerTitle.
  ///
  /// In ru, this message translates to:
  /// **'Оцените пассажира'**
  String get driverRatePassengerTitle;

  /// No description provided for @driverRatingTagPolitePassenger.
  ///
  /// In ru, this message translates to:
  /// **'Вежливый пассажир'**
  String get driverRatingTagPolitePassenger;

  /// No description provided for @driverRatingTagWaitedAtPickup.
  ///
  /// In ru, this message translates to:
  /// **'Ждал в точке посадки'**
  String get driverRatingTagWaitedAtPickup;

  /// No description provided for @driverRatingTagExactAddress.
  ///
  /// In ru, this message translates to:
  /// **'Точный адрес'**
  String get driverRatingTagExactAddress;

  /// No description provided for @driverRatingTagOnTimeExit.
  ///
  /// In ru, this message translates to:
  /// **'Вышел вовремя'**
  String get driverRatingTagOnTimeExit;

  /// No description provided for @driverRatingTagLongNoShow.
  ///
  /// In ru, this message translates to:
  /// **'Долго не выходил'**
  String get driverRatingTagLongNoShow;

  /// No description provided for @driverRatingTagRudeCommunication.
  ///
  /// In ru, this message translates to:
  /// **'Грубое общение'**
  String get driverRatingTagRudeCommunication;

  /// No description provided for @driverRatingTagWrongAddress.
  ///
  /// In ru, this message translates to:
  /// **'Неточный адрес'**
  String get driverRatingTagWrongAddress;

  /// No description provided for @driverRatingTagDirtyInterior.
  ///
  /// In ru, this message translates to:
  /// **'Испачкал салон'**
  String get driverRatingTagDirtyInterior;

  /// No description provided for @driverCommentOptionalHint.
  ///
  /// In ru, this message translates to:
  /// **'Комментарий (необязательно)'**
  String get driverCommentOptionalHint;

  /// No description provided for @driverSendingRatingButton.
  ///
  /// In ru, this message translates to:
  /// **'Отправляем...'**
  String get driverSendingRatingButton;

  /// No description provided for @driverSubmitRatingButton.
  ///
  /// In ru, this message translates to:
  /// **'Отправить оценку'**
  String get driverSubmitRatingButton;

  /// No description provided for @driverRatingThanksMessage.
  ///
  /// In ru, this message translates to:
  /// **'Спасибо, оценка отправлена'**
  String get driverRatingThanksMessage;

  /// No description provided for @driverRatingSkippedMessage.
  ///
  /// In ru, this message translates to:
  /// **'Оценка пропущена'**
  String get driverRatingSkippedMessage;

  /// No description provided for @driverFavoriteAddedLabel.
  ///
  /// In ru, this message translates to:
  /// **'В избранном'**
  String get driverFavoriteAddedLabel;

  /// No description provided for @driverFavoriteAddButton.
  ///
  /// In ru, this message translates to:
  /// **'В избранные'**
  String get driverFavoriteAddButton;

  /// No description provided for @driverBlockedLabel.
  ///
  /// In ru, this message translates to:
  /// **'Заблокирован'**
  String get driverBlockedLabel;

  /// No description provided for @driverBlockButton.
  ///
  /// In ru, this message translates to:
  /// **'Не принимать'**
  String get driverBlockButton;

  /// No description provided for @doneButton.
  ///
  /// In ru, this message translates to:
  /// **'Готово'**
  String get doneButton;

  /// No description provided for @driverStarRatingSemanticLabel.
  ///
  /// In ru, this message translates to:
  /// **'Оценка: {count} {count, plural, one{звезда} few{звезды} many{звёзд} other{звёзд}}'**
  String driverStarRatingSemanticLabel(int count);

  /// No description provided for @driverUpdatingGeneric.
  ///
  /// In ru, this message translates to:
  /// **'Обновляем...'**
  String get driverUpdatingGeneric;

  /// No description provided for @driverEmergencyHelpTitle.
  ///
  /// In ru, this message translates to:
  /// **'Экстренная помощь'**
  String get driverEmergencyHelpTitle;

  /// No description provided for @driverEmergencyCallButton.
  ///
  /// In ru, this message translates to:
  /// **'Позвонить {phone}'**
  String driverEmergencyCallButton(String phone);

  /// No description provided for @driverEmergencyLineSubtitle.
  ///
  /// In ru, this message translates to:
  /// **'Экстренная линия SmartTaxi, если что-то пошло не так'**
  String get driverEmergencyLineSubtitle;

  /// No description provided for @driverSupportWillReceiveSignal.
  ///
  /// In ru, this message translates to:
  /// **'Поддержка получит сигнал'**
  String get driverSupportWillReceiveSignal;

  /// No description provided for @driverSupportSignalDescription.
  ///
  /// In ru, this message translates to:
  /// **'Заявка с вашими координатами и номером поездки (если есть) уходит в поддержку одновременно со звонком'**
  String get driverSupportSignalDescription;

  /// No description provided for @driverChooseRegionButton.
  ///
  /// In ru, this message translates to:
  /// **'Выбрать регион'**
  String get driverChooseRegionButton;

  /// No description provided for @driverTodayLabel.
  ///
  /// In ru, this message translates to:
  /// **'Сегодня'**
  String get driverTodayLabel;

  /// No description provided for @driverGoOfflineButton.
  ///
  /// In ru, this message translates to:
  /// **'Уйти с линии'**
  String get driverGoOfflineButton;

  /// No description provided for @driverGoOnlineButton.
  ///
  /// In ru, this message translates to:
  /// **'Выйти на линию'**
  String get driverGoOnlineButton;

  /// No description provided for @driverDemandHigh.
  ///
  /// In ru, this message translates to:
  /// **'Высокий'**
  String get driverDemandHigh;

  /// No description provided for @driverDemandAboveNormal.
  ///
  /// In ru, this message translates to:
  /// **'Выше'**
  String get driverDemandAboveNormal;

  /// No description provided for @driverDemandNormal.
  ///
  /// In ru, this message translates to:
  /// **'Норма'**
  String get driverDemandNormal;

  /// No description provided for @driverTripsTodayLabel.
  ///
  /// In ru, this message translates to:
  /// **'Поездок сегодня'**
  String get driverTripsTodayLabel;

  /// No description provided for @driverNewOrdersLabel.
  ///
  /// In ru, this message translates to:
  /// **'Новых заказов'**
  String get driverNewOrdersLabel;

  /// No description provided for @driverDemandNearbyLabel.
  ///
  /// In ru, this message translates to:
  /// **'Спрос рядом'**
  String get driverDemandNearbyLabel;

  /// No description provided for @driverLocationOnlineHint.
  ///
  /// In ru, this message translates to:
  /// **'Геолокация отправляется только во время работы на линии.'**
  String get driverLocationOnlineHint;

  /// No description provided for @driverUpdatingStatusButton.
  ///
  /// In ru, this message translates to:
  /// **'Обновляем статус...'**
  String get driverUpdatingStatusButton;

  /// No description provided for @driverPayoutMethodTitle.
  ///
  /// In ru, this message translates to:
  /// **'Способ выплаты'**
  String get driverPayoutMethodTitle;

  /// No description provided for @driverPayoutCardSummary.
  ///
  /// In ru, this message translates to:
  /// **'Карта •• •• •• {last4}'**
  String driverPayoutCardSummary(String last4);

  /// No description provided for @driverPayoutKaspiSummary.
  ///
  /// In ru, this message translates to:
  /// **'Kaspi-перевод: {phone}'**
  String driverPayoutKaspiSummary(String phone);

  /// No description provided for @driverPayoutMethodNotSet.
  ///
  /// In ru, this message translates to:
  /// **'Не указан — добавьте, чтобы выводить средства'**
  String get driverPayoutMethodNotSet;

  /// No description provided for @driverPayoutMethodSubtitle.
  ///
  /// In ru, this message translates to:
  /// **'Куда переводить деньги при выводе средств'**
  String get driverPayoutMethodSubtitle;

  /// No description provided for @driverPayoutMethodKaspiOption.
  ///
  /// In ru, this message translates to:
  /// **'Kaspi-перевод'**
  String get driverPayoutMethodKaspiOption;

  /// No description provided for @driverPayoutMethodCardOption.
  ///
  /// In ru, this message translates to:
  /// **'Карта'**
  String get driverPayoutMethodCardOption;

  /// No description provided for @driverCardNumberLabel.
  ///
  /// In ru, this message translates to:
  /// **'Номер карты'**
  String get driverCardNumberLabel;

  /// No description provided for @driverPhoneNumberKaspiLabel.
  ///
  /// In ru, this message translates to:
  /// **'Номер телефона (Kaspi)'**
  String get driverPhoneNumberKaspiLabel;

  /// No description provided for @driverSavingButton.
  ///
  /// In ru, this message translates to:
  /// **'Сохраняем...'**
  String get driverSavingButton;

  /// No description provided for @driverErrorInvalidCardNumber.
  ///
  /// In ru, this message translates to:
  /// **'Введите корректный номер карты'**
  String get driverErrorInvalidCardNumber;

  /// No description provided for @driverErrorPhoneRequiredGeneric.
  ///
  /// In ru, this message translates to:
  /// **'Введите номер телефона'**
  String get driverErrorPhoneRequiredGeneric;

  /// No description provided for @driverErrorCardTypo.
  ///
  /// In ru, this message translates to:
  /// **'Похоже, в номере карты опечатка — проверьте и попробуйте снова'**
  String get driverErrorCardTypo;

  /// No description provided for @driverErrorSaveFailedGeneric.
  ///
  /// In ru, this message translates to:
  /// **'Не удалось сохранить. Проверьте данные и попробуйте снова.'**
  String get driverErrorSaveFailedGeneric;

  /// No description provided for @driverPayoutMethodNotSetShort.
  ///
  /// In ru, this message translates to:
  /// **'Способ выплаты не указан'**
  String get driverPayoutMethodNotSetShort;

  /// No description provided for @addButton.
  ///
  /// In ru, this message translates to:
  /// **'Добавить'**
  String get addButton;

  /// No description provided for @driverReviewsCountLabel.
  ///
  /// In ru, this message translates to:
  /// **'{count} {count, plural, one{отзыв} few{отзыва} many{отзывов} other{отзывов}}'**
  String driverReviewsCountLabel(int count);

  /// No description provided for @driverTopTagLabel.
  ///
  /// In ru, this message translates to:
  /// **'{tag} · {count}'**
  String driverTopTagLabel(String tag, int count);

  /// No description provided for @driverClientAcceptedPriceToast.
  ///
  /// In ru, this message translates to:
  /// **'Клиент принял вашу цену: {price}'**
  String driverClientAcceptedPriceToast(String price);

  /// No description provided for @driverClientDeclinedOfferToast.
  ///
  /// In ru, this message translates to:
  /// **'Клиент отклонил ваше предложение цены'**
  String get driverClientDeclinedOfferToast;

  /// No description provided for @driverClientCounterOfferToast.
  ///
  /// In ru, this message translates to:
  /// **'Клиент предложил свою цену: {price}'**
  String driverClientCounterOfferToast(String price);

  /// No description provided for @driverSpeedLimitAnnouncement.
  ///
  /// In ru, this message translates to:
  /// **'Ограничение скорости {limit}'**
  String driverSpeedLimitAnnouncement(int limit);

  /// No description provided for @driverCameraIn500mVoice.
  ///
  /// In ru, this message translates to:
  /// **'Через 500 метров камера'**
  String get driverCameraIn500mVoice;

  /// No description provided for @driverCameraIn500mBanner.
  ///
  /// In ru, this message translates to:
  /// **'Камера через 500 м{heading}'**
  String driverCameraIn500mBanner(String heading);

  /// No description provided for @driverCameraIn200mVoice.
  ///
  /// In ru, this message translates to:
  /// **'Через 200 метров камера'**
  String get driverCameraIn200mVoice;

  /// No description provided for @driverCameraIn200mBanner.
  ///
  /// In ru, this message translates to:
  /// **'Камера через 200 м{heading}'**
  String driverCameraIn200mBanner(String heading);

  /// No description provided for @driverCameraNowVoice.
  ///
  /// In ru, this message translates to:
  /// **'Камера'**
  String get driverCameraNowVoice;

  /// No description provided for @driverCameraNowBanner.
  ///
  /// In ru, this message translates to:
  /// **'Камера{heading}'**
  String driverCameraNowBanner(String heading);

  /// No description provided for @driverSignBannerLabel.
  ///
  /// In ru, this message translates to:
  /// **'Знак: {sign}'**
  String driverSignBannerLabel(String sign);

  /// No description provided for @driverSpeedingVoiceWarning.
  ///
  /// In ru, this message translates to:
  /// **'Превышение скорости'**
  String get driverSpeedingVoiceWarning;

  /// No description provided for @driverManeuverIn200mVoice.
  ///
  /// In ru, this message translates to:
  /// **'Через 200 метров {maneuver}{street}'**
  String driverManeuverIn200mVoice(String maneuver, String street);

  /// No description provided for @driverStreetSuffix.
  ///
  /// In ru, this message translates to:
  /// **' на {street}'**
  String driverStreetSuffix(String street);

  /// No description provided for @driverPriceOfferSentToast.
  ///
  /// In ru, this message translates to:
  /// **'Предложение цены отправлено клиенту'**
  String get driverPriceOfferSentToast;

  /// No description provided for @driverAcceptedClientPriceToast.
  ///
  /// In ru, this message translates to:
  /// **'Вы приняли цену клиента — заказ ваш'**
  String get driverAcceptedClientPriceToast;

  /// No description provided for @driverDeclinedClientOfferToast.
  ///
  /// In ru, this message translates to:
  /// **'Вы отклонили предложение клиента'**
  String get driverDeclinedClientOfferToast;

  /// No description provided for @driverSettingsPayoutsGroup.
  ///
  /// In ru, this message translates to:
  /// **'Выплаты'**
  String get driverSettingsPayoutsGroup;

  /// No description provided for @driverLogoutConfirmText.
  ///
  /// In ru, this message translates to:
  /// **'Придётся снова войти по номеру телефона, чтобы продолжить работу в SmartTaxi.'**
  String get driverLogoutConfirmText;

  /// No description provided for @driverMustGoOfflineToChangeRegion.
  ///
  /// In ru, this message translates to:
  /// **'Чтобы сменить регион, сначала уйдите с линии'**
  String get driverMustGoOfflineToChangeRegion;

  /// No description provided for @driverQuickMessageToClientButton.
  ///
  /// In ru, this message translates to:
  /// **'Быстрое сообщение клиенту'**
  String get driverQuickMessageToClientButton;

  /// No description provided for @driverNoShowConfirmTitle.
  ///
  /// In ru, this message translates to:
  /// **'Клиент не вышел?'**
  String get driverNoShowConfirmTitle;

  /// No description provided for @driverNoShowConfirmText.
  ///
  /// In ru, this message translates to:
  /// **'Поездка будет отмечена как неявка клиента — убедитесь, что вы дождались бесплатное время ожидания.'**
  String get driverNoShowConfirmText;

  /// No description provided for @driverNoShowConfirmButton.
  ///
  /// In ru, this message translates to:
  /// **'Подтвердить неявку'**
  String get driverNoShowConfirmButton;

  /// No description provided for @driverCancelTripConfirmTitle.
  ///
  /// In ru, this message translates to:
  /// **'Отменить поездку?'**
  String get driverCancelTripConfirmTitle;

  /// No description provided for @driverCancelTripConfirmText.
  ///
  /// In ru, this message translates to:
  /// **'Заказ вернётся в поиск для других водителей. Частые отмены могут повлиять на ваш рейтинг.'**
  String get driverCancelTripConfirmText;

  /// No description provided for @back.
  ///
  /// In ru, this message translates to:
  /// **'Назад'**
  String get back;

  /// No description provided for @pressBackAgainToExit.
  ///
  /// In ru, this message translates to:
  /// **'Нажмите «Назад» ещё раз, чтобы выйти'**
  String get pressBackAgainToExit;

  /// No description provided for @driverNoApprovedRegionsTitle.
  ///
  /// In ru, this message translates to:
  /// **'Нет одобренных регионов'**
  String get driverNoApprovedRegionsTitle;

  /// No description provided for @driverChooseWorkingRegionTitle.
  ///
  /// In ru, this message translates to:
  /// **'Выберите рабочий регион'**
  String get driverChooseWorkingRegionTitle;

  /// No description provided for @driverRegionTemporarilyDisabledTitle.
  ///
  /// In ru, this message translates to:
  /// **'Регион временно отключён'**
  String get driverRegionTemporarilyDisabledTitle;

  /// No description provided for @driverRegionWorkBlockedTitle.
  ///
  /// In ru, this message translates to:
  /// **'Работа в этом регионе заблокирована'**
  String get driverRegionWorkBlockedTitle;

  /// No description provided for @driverRegionNotApprovedTitle.
  ///
  /// In ru, this message translates to:
  /// **'Вы не одобрены для этого региона'**
  String get driverRegionNotApprovedTitle;

  /// No description provided for @driverNoRegionsMessage.
  ///
  /// In ru, this message translates to:
  /// **'Чтобы выйти на линию, нужен хотя бы один одобренный регион. Напишите в поддержку, чтобы вам открыли доступ к региону.'**
  String get driverNoRegionsMessage;

  /// No description provided for @driverContactSupportAction.
  ///
  /// In ru, this message translates to:
  /// **'Написать в поддержку'**
  String get driverContactSupportAction;

  /// No description provided for @driverChooseRegionMessage.
  ///
  /// In ru, this message translates to:
  /// **'У вас есть одобренные регионы — выберите один, чтобы начать принимать заказы.'**
  String get driverChooseRegionMessage;

  /// No description provided for @driverRegionPausedMessage.
  ///
  /// In ru, this message translates to:
  /// **'Работа в регионе «{region}» сейчас приостановлена. '**
  String driverRegionPausedMessage(String region);

  /// No description provided for @driverTryLaterOrChangeRegion.
  ///
  /// In ru, this message translates to:
  /// **'Попробуйте позже или выберите другой регион.'**
  String get driverTryLaterOrChangeRegion;

  /// No description provided for @driverTryLater.
  ///
  /// In ru, this message translates to:
  /// **'Попробуйте позже.'**
  String get driverTryLater;

  /// No description provided for @driverChangeRegionAction.
  ///
  /// In ru, this message translates to:
  /// **'Сменить регион'**
  String get driverChangeRegionAction;

  /// No description provided for @driverAccessBlockedTitle.
  ///
  /// In ru, this message translates to:
  /// **'Доступ заблокирован'**
  String get driverAccessBlockedTitle;

  /// No description provided for @driverRegionBlockedByAdminMessage.
  ///
  /// In ru, this message translates to:
  /// **'Работа в регионе «{region}» заблокирована администратором.'**
  String driverRegionBlockedByAdminMessage(String region);

  /// No description provided for @driverApplicationUnderReviewTitle.
  ///
  /// In ru, this message translates to:
  /// **'Заявка на рассмотрении'**
  String get driverApplicationUnderReviewTitle;

  /// No description provided for @driverApplicationUnderReviewMessage.
  ///
  /// In ru, this message translates to:
  /// **'Мы проверяем ваш доступ к региону «{region}». Обычно это занимает немного времени.'**
  String driverApplicationUnderReviewMessage(String region);

  /// No description provided for @driverStatusUnavailableByRegion.
  ///
  /// In ru, this message translates to:
  /// **'Недоступен по региону'**
  String get driverStatusUnavailableByRegion;

  /// No description provided for @driverRegionStatusDisabled.
  ///
  /// In ru, this message translates to:
  /// **'Отключён'**
  String get driverRegionStatusDisabled;

  /// No description provided for @driverRegionStatusBlocked.
  ///
  /// In ru, this message translates to:
  /// **'Заблокирован'**
  String get driverRegionStatusBlocked;

  /// No description provided for @driverRegionStatusApproved.
  ///
  /// In ru, this message translates to:
  /// **'Одобрен'**
  String get driverRegionStatusApproved;

  /// No description provided for @driverRegionStatusUnderReview.
  ///
  /// In ru, this message translates to:
  /// **'На рассмотрении'**
  String get driverRegionStatusUnderReview;

  /// No description provided for @driverFreeModeLabel.
  ///
  /// In ru, this message translates to:
  /// **'Свободный режим'**
  String get driverFreeModeLabel;

  /// No description provided for @driverActiveOrderLabel.
  ///
  /// In ru, this message translates to:
  /// **'Активный заказ'**
  String get driverActiveOrderLabel;

  /// No description provided for @driverYourCarSemanticLabel.
  ///
  /// In ru, this message translates to:
  /// **'Ваш автомобиль'**
  String get driverYourCarSemanticLabel;

  /// No description provided for @driverDisableVoiceHints.
  ///
  /// In ru, this message translates to:
  /// **'Выключить голосовые подсказки'**
  String get driverDisableVoiceHints;

  /// No description provided for @driverEnableVoiceHints.
  ///
  /// In ru, this message translates to:
  /// **'Включить голосовые подсказки'**
  String get driverEnableVoiceHints;

  /// No description provided for @driverReportRoadEventSemanticLabel.
  ///
  /// In ru, this message translates to:
  /// **'Сообщить о дорожном событии'**
  String get driverReportRoadEventSemanticLabel;

  /// No description provided for @driverRecenterSemanticLabel.
  ///
  /// In ru, this message translates to:
  /// **'Вернуться к текущей позиции'**
  String get driverRecenterSemanticLabel;

  /// No description provided for @driverSpeedLabel.
  ///
  /// In ru, this message translates to:
  /// **'Скорость'**
  String get driverSpeedLabel;

  /// No description provided for @driverLimitLabel.
  ///
  /// In ru, this message translates to:
  /// **'Лимит'**
  String get driverLimitLabel;

  /// No description provided for @driverSearchingGpsSignal.
  ///
  /// In ru, this message translates to:
  /// **'Ищу сигнал GPS…'**
  String get driverSearchingGpsSignal;

  /// No description provided for @driverRouteWillAppearAfterCalc.
  ///
  /// In ru, this message translates to:
  /// **'Маршрут появится после расчёта'**
  String get driverRouteWillAppearAfterCalc;

  /// No description provided for @driverRouteToPickupPoint.
  ///
  /// In ru, this message translates to:
  /// **'Маршрут до точки посадки'**
  String get driverRouteToPickupPoint;

  /// No description provided for @driverQuickMessageArrived.
  ///
  /// In ru, this message translates to:
  /// **'Я приехал'**
  String get driverQuickMessageArrived;

  /// No description provided for @driverQuickMessageWaitingAtEntrance.
  ///
  /// In ru, this message translates to:
  /// **'Жду у входа'**
  String get driverQuickMessageWaitingAtEntrance;

  /// No description provided for @driverQuickMessageRunningLate2Min.
  ///
  /// In ru, this message translates to:
  /// **'Опаздываю на 2 минуты'**
  String get driverQuickMessageRunningLate2Min;

  /// No description provided for @driverQuickMessagePleaseComeOut.
  ///
  /// In ru, this message translates to:
  /// **'Пожалуйста, выходите'**
  String get driverQuickMessagePleaseComeOut;

  /// No description provided for @driverQuickMessageOnMyWay.
  ///
  /// In ru, this message translates to:
  /// **'Уже еду к вам'**
  String get driverQuickMessageOnMyWay;

  /// No description provided for @driverQuickMessageSentToast.
  ///
  /// In ru, this message translates to:
  /// **'Отправлено: {text}'**
  String driverQuickMessageSentToast(String text);

  /// No description provided for @driverQuickMessageSheetTitle.
  ///
  /// In ru, this message translates to:
  /// **'Быстрое сообщение'**
  String get driverQuickMessageSheetTitle;

  /// No description provided for @driverPriceOfferRangeError.
  ///
  /// In ru, this message translates to:
  /// **'Введите цену от 200 до 1 000 000 ₸'**
  String get driverPriceOfferRangeError;

  /// No description provided for @driverPriceOfferSheetTitle.
  ///
  /// In ru, this message translates to:
  /// **'Предложить свою цену'**
  String get driverPriceOfferSheetTitle;

  /// No description provided for @driverPriceOfferSheetSubtitle.
  ///
  /// In ru, this message translates to:
  /// **'Клиент увидит вашу цену и сможет согласиться или отказаться'**
  String get driverPriceOfferSheetSubtitle;

  /// No description provided for @driverCurrentOrderPriceLabel.
  ///
  /// In ru, this message translates to:
  /// **'Текущая цена заказа: {price}'**
  String driverCurrentOrderPriceLabel(String price);

  /// No description provided for @driverPriceFieldLabel.
  ///
  /// In ru, this message translates to:
  /// **'Цена, ₸'**
  String get driverPriceFieldLabel;

  /// No description provided for @driverSendOfferButton.
  ///
  /// In ru, this message translates to:
  /// **'Отправить предложение'**
  String get driverSendOfferButton;

  /// No description provided for @driverRouteAcceptedToast.
  ///
  /// In ru, this message translates to:
  /// **'Маршрут принят'**
  String get driverRouteAcceptedToast;

  /// No description provided for @driverRouteDeclinedToast.
  ///
  /// In ru, this message translates to:
  /// **'Маршрут отклонён'**
  String get driverRouteDeclinedToast;

  /// No description provided for @driverRecurringTitle.
  ///
  /// In ru, this message translates to:
  /// **'Регулярные поездки'**
  String get driverRecurringTitle;

  /// No description provided for @driverRecurringSubtitle.
  ///
  /// In ru, this message translates to:
  /// **'Входящие заявки и ваши активные маршруты'**
  String get driverRecurringSubtitle;

  /// No description provided for @driverRecurringEmptyTitle.
  ///
  /// In ru, this message translates to:
  /// **'Пока нет заявок'**
  String get driverRecurringEmptyTitle;

  /// No description provided for @driverRecurringEmptyText.
  ///
  /// In ru, this message translates to:
  /// **'Клиенты смогут предложить вам регулярный маршрут после совместной поездки.'**
  String get driverRecurringEmptyText;

  /// No description provided for @driverRecurringNewRequestsTitle.
  ///
  /// In ru, this message translates to:
  /// **'Новые заявки'**
  String get driverRecurringNewRequestsTitle;

  /// No description provided for @driverRecurringNewRequestsText.
  ///
  /// In ru, this message translates to:
  /// **'Примите, если готовы возить по расписанию'**
  String get driverRecurringNewRequestsText;

  /// No description provided for @driverRecurringYourRoutesTitle.
  ///
  /// In ru, this message translates to:
  /// **'Ваши маршруты'**
  String get driverRecurringYourRoutesTitle;

  /// No description provided for @driverRecurringNewRequestLabel.
  ///
  /// In ru, this message translates to:
  /// **'Новая заявка'**
  String get driverRecurringNewRequestLabel;

  /// No description provided for @driverRejectButton.
  ///
  /// In ru, this message translates to:
  /// **'Отклонить'**
  String get driverRejectButton;

  /// No description provided for @driverEnableLocationOrPickOnMap.
  ///
  /// In ru, this message translates to:
  /// **'Включите геолокацию или выберите точку на карте.'**
  String get driverEnableLocationOrPickOnMap;

  /// No description provided for @driverAllowLocationOrPickOnMap.
  ///
  /// In ru, this message translates to:
  /// **'Разрешите геолокацию или выберите точку на карте.'**
  String get driverAllowLocationOrPickOnMap;

  /// No description provided for @driverCoordinatesFromGps.
  ///
  /// In ru, this message translates to:
  /// **'Координаты выбраны из GPS.'**
  String get driverCoordinatesFromGps;

  /// No description provided for @driverFailedToGetLocation.
  ///
  /// In ru, this message translates to:
  /// **'Не удалось получить геолокацию.'**
  String get driverFailedToGetLocation;

  /// No description provided for @driverChooseAlertPointOnMapOrGps.
  ///
  /// In ru, this message translates to:
  /// **'Выберите точку события на карте или через GPS.'**
  String get driverChooseAlertPointOnMapOrGps;

  /// No description provided for @driverEnterSpeedLimitNumber.
  ///
  /// In ru, this message translates to:
  /// **'Укажите ограничение скорости числом.'**
  String get driverEnterSpeedLimitNumber;

  /// No description provided for @driverAlertSubmittedForSafety.
  ///
  /// In ru, this message translates to:
  /// **'Событие отправлено для безопасности движения.'**
  String get driverAlertSubmittedForSafety;

  /// No description provided for @driverAlertConfirmedThanks.
  ///
  /// In ru, this message translates to:
  /// **'Спасибо. Подтверждение поможет другим водителям.'**
  String get driverAlertConfirmedThanks;

  /// No description provided for @driverAlertHiddenFromList.
  ///
  /// In ru, this message translates to:
  /// **'Событие скрыто из активного списка.'**
  String get driverAlertHiddenFromList;

  /// No description provided for @driverRoadAlertsTitle.
  ///
  /// In ru, this message translates to:
  /// **'Дорожные события'**
  String get driverRoadAlertsTitle;

  /// No description provided for @driverRoadAlertsSubtitle.
  ///
  /// In ru, this message translates to:
  /// **'Отмеченные камеры и опасные участки сразу видны другим водителям на навигаторе — это помогает всем на дороге.'**
  String get driverRoadAlertsSubtitle;

  /// No description provided for @refreshButton.
  ///
  /// In ru, this message translates to:
  /// **'Обновить'**
  String get refreshButton;

  /// No description provided for @driverPointSelectedOnMap.
  ///
  /// In ru, this message translates to:
  /// **'Координаты выбраны на карте.'**
  String get driverPointSelectedOnMap;

  /// No description provided for @driverNewAlertSectionTitle.
  ///
  /// In ru, this message translates to:
  /// **'Новое событие'**
  String get driverNewAlertSectionTitle;

  /// No description provided for @driverNewAlertSectionText.
  ///
  /// In ru, this message translates to:
  /// **'Выберите тип и точку. Сообщение увидят водители в регионе.'**
  String get driverNewAlertSectionText;

  /// No description provided for @driverAlertCommentLabel.
  ///
  /// In ru, this message translates to:
  /// **'Комментарий'**
  String get driverAlertCommentLabel;

  /// No description provided for @driverAlertCommentHint.
  ///
  /// In ru, this message translates to:
  /// **'Например: правая полоса закрыта'**
  String get driverAlertCommentHint;

  /// No description provided for @driverAlertSpeedLimitLabel.
  ///
  /// In ru, this message translates to:
  /// **'Ограничение, км/ч'**
  String get driverAlertSpeedLimitLabel;

  /// No description provided for @driverAlertSpeedLimitHint.
  ///
  /// In ru, this message translates to:
  /// **'Только если указано знаком'**
  String get driverAlertSpeedLimitHint;

  /// No description provided for @driverPointSelectedCoordinates.
  ///
  /// In ru, this message translates to:
  /// **'Точка выбрана: {lat}, {lng}'**
  String driverPointSelectedCoordinates(String lat, String lng);

  /// No description provided for @driverNearbyAlertsTitle.
  ///
  /// In ru, this message translates to:
  /// **'События рядом'**
  String get driverNearbyAlertsTitle;

  /// No description provided for @driverNearbyAlertsSubtitle.
  ///
  /// In ru, this message translates to:
  /// **'Показываем только сохранённые активные сообщения.'**
  String get driverNearbyAlertsSubtitle;

  /// No description provided for @driverLoadingAlerts.
  ///
  /// In ru, this message translates to:
  /// **'Загружаем события...'**
  String get driverLoadingAlerts;

  /// No description provided for @driverAlertsLoadFailedTitle.
  ///
  /// In ru, this message translates to:
  /// **'Не удалось загрузить события'**
  String get driverAlertsLoadFailedTitle;

  /// No description provided for @driverCheckConnectionRetry.
  ///
  /// In ru, this message translates to:
  /// **'Проверьте связь и попробуйте ещё раз.'**
  String get driverCheckConnectionRetry;

  /// No description provided for @driverNoNearbyAlertsTitle.
  ///
  /// In ru, this message translates to:
  /// **'Пока нет дорожных событий рядом'**
  String get driverNoNearbyAlertsTitle;

  /// No description provided for @driverNoNearbyAlertsText.
  ///
  /// In ru, this message translates to:
  /// **'Когда водитель отправит сообщение, оно появится здесь.'**
  String get driverNoNearbyAlertsText;

  /// No description provided for @driverTapMapToSelectAlertPoint.
  ///
  /// In ru, this message translates to:
  /// **'Нажмите на карту, чтобы выбрать точку события'**
  String get driverTapMapToSelectAlertPoint;

  /// No description provided for @driverMapUnavailableUseGps.
  ///
  /// In ru, this message translates to:
  /// **'Карта временно недоступна. Выберите точку через GPS или повторите позже.'**
  String get driverMapUnavailableUseGps;

  /// No description provided for @roadAlertHazard.
  ///
  /// In ru, this message translates to:
  /// **'Дорожная опасность'**
  String get roadAlertHazard;

  /// No description provided for @roadAlertAccident.
  ///
  /// In ru, this message translates to:
  /// **'ДТП'**
  String get roadAlertAccident;

  /// No description provided for @roadAlertRoadWork.
  ///
  /// In ru, this message translates to:
  /// **'Ремонт дороги'**
  String get roadAlertRoadWork;

  /// No description provided for @roadAlertSpeedCamera.
  ///
  /// In ru, this message translates to:
  /// **'Камера скорости'**
  String get roadAlertSpeedCamera;

  /// No description provided for @roadAlertPolice.
  ///
  /// In ru, this message translates to:
  /// **'Контроль движения'**
  String get roadAlertPolice;

  /// No description provided for @roadAlertTrafficJam.
  ///
  /// In ru, this message translates to:
  /// **'Пробка'**
  String get roadAlertTrafficJam;

  /// No description provided for @roadAlertRoadClosed.
  ///
  /// In ru, this message translates to:
  /// **'Закрытая дорога'**
  String get roadAlertRoadClosed;

  /// No description provided for @roadAlertBadRoad.
  ///
  /// In ru, this message translates to:
  /// **'Плохая дорога'**
  String get roadAlertBadRoad;

  /// No description provided for @roadAlertPothole.
  ///
  /// In ru, this message translates to:
  /// **'Яма'**
  String get roadAlertPothole;

  /// No description provided for @roadAlertSpeedBump.
  ///
  /// In ru, this message translates to:
  /// **'Лежачий полицейский'**
  String get roadAlertSpeedBump;

  /// No description provided for @roadAlertIcyRoad.
  ///
  /// In ru, this message translates to:
  /// **'Скользкая дорога'**
  String get roadAlertIcyRoad;

  /// No description provided for @roadAlertSchoolZone.
  ///
  /// In ru, this message translates to:
  /// **'Школьная зона'**
  String get roadAlertSchoolZone;

  /// No description provided for @roadAlertTemporarySpeedLimit.
  ///
  /// In ru, this message translates to:
  /// **'Временное ограничение'**
  String get roadAlertTemporarySpeedLimit;

  /// No description provided for @roadAlertDangerousTurn.
  ///
  /// In ru, this message translates to:
  /// **'Опасный поворот'**
  String get roadAlertDangerousTurn;

  /// No description provided for @roadAlertRailroadCrossing.
  ///
  /// In ru, this message translates to:
  /// **'Ж/д переезд'**
  String get roadAlertRailroadCrossing;

  /// No description provided for @roadAlertPedestrianCrossing.
  ///
  /// In ru, this message translates to:
  /// **'Пешеходный переход'**
  String get roadAlertPedestrianCrossing;

  /// No description provided for @roadAlertOther.
  ///
  /// In ru, this message translates to:
  /// **'Другое'**
  String get roadAlertOther;

  /// No description provided for @driverAlertConfidenceLabel.
  ///
  /// In ru, this message translates to:
  /// **'Доверие: {score}% · подтверждений: {count}'**
  String driverAlertConfidenceLabel(int score, int count);

  /// No description provided for @driverAlertSpeedLimitDetail.
  ///
  /// In ru, this message translates to:
  /// **'Ограничение: {limit} км/ч'**
  String driverAlertSpeedLimitDetail(int limit);

  /// No description provided for @driverAlertHeadingDetail.
  ///
  /// In ru, this message translates to:
  /// **'Смотрит: {direction}'**
  String driverAlertHeadingDetail(String direction);

  /// No description provided for @driverConfirmAlertButton.
  ///
  /// In ru, this message translates to:
  /// **'На месте'**
  String get driverConfirmAlertButton;

  /// No description provided for @noButton.
  ///
  /// In ru, this message translates to:
  /// **'Нет'**
  String get noButton;

  /// No description provided for @driverInDistanceLabel.
  ///
  /// In ru, this message translates to:
  /// **'Через {distance}'**
  String driverInDistanceLabel(String distance);

  /// No description provided for @roadAlertShortAccident.
  ///
  /// In ru, this message translates to:
  /// **'ДТП'**
  String get roadAlertShortAccident;

  /// No description provided for @roadAlertShortRoadWork.
  ///
  /// In ru, this message translates to:
  /// **'Р'**
  String get roadAlertShortRoadWork;

  /// No description provided for @roadAlertShortSpeedCamera.
  ///
  /// In ru, this message translates to:
  /// **'К'**
  String get roadAlertShortSpeedCamera;

  /// No description provided for @roadAlertShortPolice.
  ///
  /// In ru, this message translates to:
  /// **'КД'**
  String get roadAlertShortPolice;

  /// No description provided for @roadAlertShortTrafficJam.
  ///
  /// In ru, this message translates to:
  /// **'П'**
  String get roadAlertShortTrafficJam;

  /// No description provided for @roadAlertShortBadRoad.
  ///
  /// In ru, this message translates to:
  /// **'БД'**
  String get roadAlertShortBadRoad;

  /// No description provided for @roadAlertShortPothole.
  ///
  /// In ru, this message translates to:
  /// **'Я'**
  String get roadAlertShortPothole;

  /// No description provided for @roadAlertShortSpeedBump.
  ///
  /// In ru, this message translates to:
  /// **'ЛП'**
  String get roadAlertShortSpeedBump;

  /// No description provided for @roadAlertShortIcyRoad.
  ///
  /// In ru, this message translates to:
  /// **'Л'**
  String get roadAlertShortIcyRoad;

  /// No description provided for @roadAlertShortSchoolZone.
  ///
  /// In ru, this message translates to:
  /// **'Ш'**
  String get roadAlertShortSchoolZone;

  /// No description provided for @roadAlertShortTemporarySpeedLimit.
  ///
  /// In ru, this message translates to:
  /// **'ЛИМ'**
  String get roadAlertShortTemporarySpeedLimit;

  /// No description provided for @roadAlertShortDangerousTurn.
  ///
  /// In ru, this message translates to:
  /// **'ПВ'**
  String get roadAlertShortDangerousTurn;

  /// No description provided for @roadAlertShortRailroadCrossing.
  ///
  /// In ru, this message translates to:
  /// **'ЖД'**
  String get roadAlertShortRailroadCrossing;

  /// No description provided for @roadAlertShortPedestrianCrossing.
  ///
  /// In ru, this message translates to:
  /// **'ПЕШ'**
  String get roadAlertShortPedestrianCrossing;

  /// No description provided for @driverRegionsLoadFailedTitle.
  ///
  /// In ru, this message translates to:
  /// **'Не удалось загрузить регионы'**
  String get driverRegionsLoadFailedTitle;

  /// No description provided for @driverRegionsLoadFailedMessage.
  ///
  /// In ru, this message translates to:
  /// **'Проверьте связь и потяните экран вниз, чтобы обновить. Ваш доступ к регионам никуда не делся.'**
  String get driverRegionsLoadFailedMessage;

  /// No description provided for @driverRegionsRetryAction.
  ///
  /// In ru, this message translates to:
  /// **'Обновить'**
  String get driverRegionsRetryAction;

  /// No description provided for @authTagline.
  ///
  /// In ru, this message translates to:
  /// **'ГОРОДСКОЕ ТАКСИ'**
  String get authTagline;

  /// No description provided for @passengerMapPointNoAddressHint.
  ///
  /// In ru, this message translates to:
  /// **'Передвиньте точку к ближайшему дому или объекту'**
  String get passengerMapPointNoAddressHint;
}

class _AppLocalizationsDelegate
    extends LocalizationsDelegate<AppLocalizations> {
  const _AppLocalizationsDelegate();

  @override
  Future<AppLocalizations> load(Locale locale) {
    return SynchronousFuture<AppLocalizations>(lookupAppLocalizations(locale));
  }

  @override
  bool isSupported(Locale locale) =>
      <String>['kk', 'ru', 'uz', 'zh'].contains(locale.languageCode);

  @override
  bool shouldReload(_AppLocalizationsDelegate old) => false;
}

AppLocalizations lookupAppLocalizations(Locale locale) {
  // Lookup logic when only language code is specified.
  switch (locale.languageCode) {
    case 'kk':
      return AppLocalizationsKk();
    case 'ru':
      return AppLocalizationsRu();
    case 'uz':
      return AppLocalizationsUz();
    case 'zh':
      return AppLocalizationsZh();
  }

  throw FlutterError(
      'AppLocalizations.delegate failed to load unsupported locale "$locale". This is likely '
      'an issue with the localizations generation tool. Please file an issue '
      'on GitHub with a reproducible sample app and the gen-l10n configuration '
      'that was used.');
}
