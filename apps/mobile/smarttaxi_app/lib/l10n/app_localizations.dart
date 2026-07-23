import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:intl/intl.dart' as intl;

import 'app_localizations_kk.dart';
import 'app_localizations_ru.dart';

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
    Locale('ru')
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
      <String>['kk', 'ru'].contains(locale.languageCode);

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
  }

  throw FlutterError(
      'AppLocalizations.delegate failed to load unsupported locale "$locale". This is likely '
      'an issue with the localizations generation tool. Please file an issue '
      'on GitHub with a reproducible sample app and the gen-l10n configuration '
      'that was used.');
}
