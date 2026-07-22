// ignore: unused_import
import 'package:intl/intl.dart' as intl;
import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for Kazakh (`kk`).
class AppLocalizationsKk extends AppLocalizations {
  AppLocalizationsKk([String locale = 'kk']) : super(locale);

  @override
  String get appName => 'SmartTaxi';

  @override
  String get continueLabel => 'Жалғастыру';

  @override
  String get cancel => 'Бас тарту';

  @override
  String get save => 'Сақтау';

  @override
  String get close => 'Жабу';

  @override
  String get retry => 'Қайталау';

  @override
  String get logIn => 'Кіру';

  @override
  String get logOut => 'Шығу';

  @override
  String get loading => 'Жүктелуде...';

  @override
  String get settings => 'Баптаулар';

  @override
  String get language => 'Тіл';

  @override
  String get languageRussian => 'Орысша';

  @override
  String get languageKazakh => 'Қазақша';

  @override
  String get languageChangedNote =>
      'Интерфейс тілі өзгертілді. Кейбір экрандар әзірге ішінара ғана аударылған.';

  @override
  String get passengerSettingsTitle => 'Баптаулар';

  @override
  String get passengerSettingsSubtitle =>
      'Аккаунт, сапарлар және қосымша туралы ақпарат';

  @override
  String get passengerSettingsAccountGroup => 'Аккаунт';

  @override
  String get passengerSettingsPhoneLabel => 'Телефон нөмірі';

  @override
  String get passengerSettingsPhoneMissing => 'Көрсетілмеген';

  @override
  String get passengerSettingsPhoneCopied => 'Нөмір көшірілді';

  @override
  String get passengerSettingsRegionLabel => 'Аймақ';

  @override
  String get passengerSettingsRegionNotSelected => 'Таңдалмаған';

  @override
  String get passengerSettingsLogoutTitle => 'Аккаунттан шығу';

  @override
  String get passengerSettingsLogoutText => 'Ағымдағы сессияны аяқтау';

  @override
  String get passengerSettingsInterfaceGroup => 'Интерфейс';

  @override
  String get passengerSettingsLanguageLabel => 'Тіл';

  @override
  String get passengerSettingsThemeLabel => 'Тема';

  @override
  String get passengerSettingsThemeDark => 'Қараңғы';

  @override
  String get passengerSettingsThemeSystem => 'Жүйедегідей';

  @override
  String get passengerSettingsThemeLight => 'Ашық';

  @override
  String get passengerSettingsPermissionsGroup => 'Рұқсаттар';

  @override
  String get passengerSettingsPushLabel => 'Push-хабарландырулар';

  @override
  String get passengerSettingsPushEnabled =>
      'Қосулы — баптауларды ашу үшін басыңыз';

  @override
  String get passengerSettingsPushDisabled => 'Телефон баптауларында өшірілген';

  @override
  String get passengerSettingsPushNotRequested => 'Сұралмаған';

  @override
  String get passengerSettingsPushCheckError =>
      'Тапсырыс өзгерген кезде қосымшада пайда болады';

  @override
  String get passengerSettingsPushChecking => 'Мәртебені тексеріп жатырмыз...';

  @override
  String get passengerSettingsLocationLabel => 'Геолокация';

  @override
  String get passengerSettingsLocationText =>
      'Телефонның геолокация баптауларын ашу';

  @override
  String get passengerSettingsAboutGroup => 'Қосымша туралы';

  @override
  String get passengerSettingsVersionLabel => 'Қосымша нұсқасы';

  @override
  String get passengerSettingsLegalTitle => 'Құқықтық ақпарат';

  @override
  String get passengerSettingsLegalText =>
      'Пайдалану шарттары, төлем, бас тарту, қауіпсіздік';

  @override
  String get home => 'Басты бет';

  @override
  String get trips => 'Сапарлар';

  @override
  String get profile => 'Профиль';

  @override
  String get notifications => 'Хабарландырулар';

  @override
  String get support => 'Қолдау';

  @override
  String get authWelcomeTitle => 'Кіру және тіркелу';

  @override
  String get authWelcomeSubtitle => 'Жалғастыру үшін телефон нөмірін енгізіңіз';

  @override
  String get phoneNumberLabel => 'Телефон нөмірі';

  @override
  String get authSmsConsentNotice =>
      'Растау коды бар SMS жібереміз. Бұл жылдам және қауіпсіз.';

  @override
  String get authLegalConsentPrefix => 'Жалғастыра отырып, сіз қабылдайсыз';

  @override
  String get authLegalConsentJoiner => 'және';

  @override
  String get termsOfUseLink => 'Пайдалану шарттарын';

  @override
  String get privacyPolicyLink => 'Құпиялылық саясатын';

  @override
  String get smsEnterCodeTitle => 'SMS-кодты енгізіңіз';

  @override
  String get smsCodeSentSubtitle => 'Растау коды жіберілді';

  @override
  String get smsCodeHint => '6 таңбалы код';

  @override
  String get smsNeverShareCode => 'Кодты ешкімге айтпаңыз.';

  @override
  String get smsStaffNeverAsk =>
      'SmartTaxi қызметкерлері оны ешқашан сұрамайды.';

  @override
  String get smsCodeValidity =>
      'Код 5 минут жарамды. Қайта жіберу таймерден кейін қолжетімді.';

  @override
  String get smsTermsConsent =>
      'Жалғастыра отырып, сіз қызмет шарттарымен келісесіз.';

  @override
  String get smsResendCode => 'Кодты қайта жіберу';

  @override
  String get smsResendCountdown => 'Қайта жіберу мынадан кейін';

  @override
  String get authCheckingLabel => 'Тексеріп жатырмыз...';

  @override
  String get offlineTitle => 'Интернетке қосылым жоқ';

  @override
  String get offlineBody =>
      'Wi-Fi немесе мобильді интернетті тексеріңіз. Байланыс пайда болысымен қолданба жұмысын өзі жалғастырады.';

  @override
  String get offlineRetryLabel => 'Қайта тексеру';

  @override
  String get runtimeFallbackBody =>
      'Экранды ашу мүмкін болмады. Қолданбаны қайта іске қосыңыз немесе қайта кіріп көріңіз.';

  @override
  String get runtimeFallbackAction => 'Басты бетке оралу';

  @override
  String devCodeLabel(String devCode) {
    return 'Жергілікті сынақ коды: $devCode';
  }

  @override
  String get validateEnterName => 'Атыңызды енгізіңіз';

  @override
  String get validateEnterPhone => 'Телефон нөмірін енгізіңіз';

  @override
  String get validateCorrectPhone => 'Дұрыс нөмір енгізіңіз';

  @override
  String get validateSmsCode => 'SMS-тен 6 таңба енгізіңіз';

  @override
  String get validateConfirmPhoneFirst => 'Алдымен телефон нөмірін растаңыз';

  @override
  String get validateEnterPassword => 'Құпия сөзді енгізіңіз';

  @override
  String get validateEnterNewPassword => 'Жаңа құпия сөзді енгізіңіз';

  @override
  String get passwordHintMinChars => 'Кемінде 8 таңба, әріптер мен сандар';

  @override
  String get passwordAddLettersDigits => 'Әріптер мен сандар қосыңыз';

  @override
  String get repeatPasswordLabel => 'Құпия сөзді қайталаңыз';

  @override
  String get passwordsMismatch => 'Құпия сөздер сәйкес келмейді';

  @override
  String get invalidSmsCode => 'Код қате. Қайталап көріңіз.';

  @override
  String get serverUnavailable =>
      'Сервер қолжетімсіз. Интернетті тексеріп, қайталап көріңіз.';

  @override
  String get smsConfirmFailed =>
      'Кодты растау мүмкін болмады. Қайталап көріңіз.';

  @override
  String get invalidPhoneOrPassword => 'Нөмір немесе құпия сөз қате';

  @override
  String get phoneAlreadyRegistered => 'Бұл нөмір бұрын тіркелген';

  @override
  String get driverAccountBlocked => 'Жүргізуші аккаунты бұғатталған';

  @override
  String get passwordMinLength => 'Құпия сөз кемінде 6 таңбадан тұруы керек';

  @override
  String get checkFilledData => 'Енгізген деректерді тексеріңіз';

  @override
  String get createPasswordTitle => 'Құпия сөз ойлап табыңыз';

  @override
  String get createPasswordSubtitle =>
      'Атыңызды көрсету және кіру үшін құпия сөз жасау қалды.';

  @override
  String get createAccountButton => 'Аккаунт жасау';

  @override
  String get creatingLabel => 'Жасап жатырмыз...';

  @override
  String get nameFieldLabel => 'Аты';

  @override
  String get passwordFieldLabel => 'Құпия сөз';

  @override
  String get hidePasswordTooltip => 'Құпия сөзді жасыру';

  @override
  String get showPasswordTooltip => 'Құпия сөзді көрсету';

  @override
  String get backToSmsCode => 'SMS-кодқа оралу';

  @override
  String get publicOfferTitle => 'Жария оферта';

  @override
  String get legalDocPendingNotice =>
      'Құжат әлі дайын емес, заңгерлік тексеруден кейін осында пайда болады.';

  @override
  String get personalDataConsentTitle => 'Дербес деректерді өңдеуге келісім';

  @override
  String get understoodLabel => 'Түсінікті';

  @override
  String get closingLabel => 'Жабылуда...';

  @override
  String get privacyPolicyTitle => 'Құпиялылық саясаты';

  @override
  String get passwordLoginSubtitle =>
      'Аккаунтқа кіру үшін құпия сөзді енгізіңіз';

  @override
  String get passwordLoginWelcome =>
      'Қош келдіңіз! Аккаунтқа кіру үшін құпия сөзді енгізіңіз';

  @override
  String get forgotPasswordLabel => 'Құпия сөзді ұмыттыңыз ба?';

  @override
  String get loggingInLabel => 'Кіріп жатырмыз...';

  @override
  String get newPasswordFieldLabel => 'Жаңа құпия сөз';

  @override
  String get newPasswordSubtitle =>
      'Аккаунтқа кіру үшін жаңа құпия сөз ойлап табыңыз';

  @override
  String get repeatPasswordHint => 'Құпия сөзді қайта енгізіңіз';

  @override
  String get savePasswordButton => 'Құпия сөзді сақтау';

  @override
  String get savingLabel => 'Сақтап жатырмыз...';

  @override
  String get strongPasswordTitle => 'Сенімді құпия сөз';

  @override
  String get strongPasswordHint =>
      'Кемінде 8 таңба, әріптер мен сандарды пайдаланыңыз';

  @override
  String get secureTitle => 'Бұл қауіпсіз';

  @override
  String get secureHint =>
      'Құпия сөзіңіз сенімді қорғалған және үшінші тұлғаларға берілмейді';

  @override
  String get defaultAccountLabel => 'SmartTaxi аккаунты';

  @override
  String get appTagline => 'Сіздің жайлылығыңыз. Біздің қамқорлығымыз';

  @override
  String get driverDrawerWallet => 'Әмиян';

  @override
  String get driverDrawerDocuments => 'Құжаттар';

  @override
  String get driverDrawerRating => 'Рейтинг';

  @override
  String get driverDrawerNotifications => 'Хабарландырулар';

  @override
  String get driverWalletTitle => 'Әмиян';

  @override
  String get driverWalletSubtitle => 'Баланс, борыш және төлемдер';

  @override
  String get driverWalletLoadError => 'Әмиянды жүктеу мүмкін болмады';

  @override
  String get driverWalletBalanceLabel => 'Баланс';

  @override
  String driverWalletDebtLabel(String amount) {
    return 'Борыш: $amount';
  }

  @override
  String driverWalletPendingLabel(String amount) {
    return 'Өңделуде: $amount';
  }

  @override
  String get driverWalletRequestPayoutButton => 'Төлем сұрау';

  @override
  String driverWalletMinPayoutNote(String amount) {
    return 'Ең аз төлем сомасы — $amount';
  }

  @override
  String get driverWalletPayoutRequestsTitle => 'Төлем сұраныстары';

  @override
  String get driverWalletNoPayoutRequests => 'Сұраныстар әлі жоқ';

  @override
  String get driverWalletTransactionsTitle => 'Операциялар';

  @override
  String get driverWalletNoTransactions => 'Аяқталған сапарлар әлі жоқ';

  @override
  String get driverWalletTxCashCommission => 'Қолма-қол сапар үшін комиссия';

  @override
  String get driverWalletTxAdjustment => 'Түзету';

  @override
  String get driverWalletTxEarning => 'Сапар үшін түсім';

  @override
  String get driverPayoutStatusPending => 'Қаралуда';

  @override
  String get driverPayoutStatusApproved => 'Мақұлданды';

  @override
  String get driverPayoutStatusPaid => 'Төленді';

  @override
  String get driverPayoutStatusRejected => 'Қабылданбады';

  @override
  String get driverPayoutStatusCancelled => 'Болдырылмады';

  @override
  String get driverPayoutSheetTitle => 'Төлем сұрау';

  @override
  String driverPayoutSheetAvailable(String amount) {
    return 'Шығаруға қолжетімді: $amount';
  }

  @override
  String get driverPayoutAmountLabel => 'Сома, ₸';

  @override
  String get driverPayoutPhoneLabel => 'Аударым үшін Kaspi нөірі';

  @override
  String driverPayoutErrorBelowMin(String amount) {
    return 'Ең аз сома — $amount';
  }

  @override
  String get driverPayoutErrorExceedsBalance =>
      'Сома қолжетімді баланстан асып кетті';

  @override
  String get driverPayoutErrorPhoneRequired =>
      'Kaspi аударымы үшін нөірді көрсетіңіз';

  @override
  String get driverPayoutErrorGeneric =>
      'Сұранысты жасау мүмкін болмады. Қайталап көріңіз';

  @override
  String get driverPayoutSubmitButton => 'Сұранысты жіберу';

  @override
  String get driverDocumentsTitle => 'Құжаттар';

  @override
  String get driverDocumentsSubtitle =>
      'SmartTaxi әкімшісі тексеруі үшін құжаттарды жүктеңіз';

  @override
  String get driverDocumentsLoadError => 'Құжаттарды жүктеу мүмкін болмады';

  @override
  String get driverDocumentStatusMissing => 'Жүктелмеген';

  @override
  String get driverDocumentStatusApproved => 'Тексерілді';

  @override
  String get driverDocumentStatusRejected => 'Қабылданбады';

  @override
  String get driverDocumentStatusPending => 'Тексерілуде';

  @override
  String get driverDocumentUploadButton => 'Жүктеу';

  @override
  String get driverDocumentReuploadButton => 'Қайта жүктеу';

  @override
  String get driverDocumentUploadHint => 'JPG, PNG немесе PDF, 8 МБ дейін';

  @override
  String get driverDocumentUploadError =>
      'Файлды жүктеу мүмкін болмады. Форматты тексеріңіз (JPG, PNG, PDF) және қайталаңыз';

  @override
  String get driverDocumentPickCamera => 'Фото түсіру';

  @override
  String get driverDocumentPickFile => 'Файл таңдау';

  @override
  String get driverDocumentPickCameraShort => 'Фото';

  @override
  String get driverDocumentPickFileShort => 'Файл';

  @override
  String get driverDocumentTypeLicenseFront => 'Жүргізуші куәлігі (алды)';

  @override
  String get driverDocumentTypeLicenseBack => 'Жүргізуші куәлігі (арты)';

  @override
  String get driverDocumentTypeIdCardFront => 'Жеке куәлік (алды)';

  @override
  String get driverDocumentTypeIdCardBack => 'Жеке куәлік (арты)';

  @override
  String get driverDocumentTypeVehicleRegistration => 'Көлік техпаспорты';

  @override
  String get driverDocumentTypeInsurancePolicy => 'Сақтандыру полисі';

  @override
  String get driverDocumentTypeProfilePhoto => 'Профиль фотосы';

  @override
  String get driverDocumentTypeOther => 'Құжат';

  @override
  String get driverApplicationDocumentsTitle => 'Құжаттар';

  @override
  String get driverApplicationDocumentsIntro =>
      'Өтініш жіберілді. Тексеруді жеделдету үшін құжаттарды қазір жүктеңіз';

  @override
  String get driverApplicationDocumentsDone => 'Дайын';

  @override
  String get driverApplicationDocumentsLater => 'Кейінірек жалғастыру';

  @override
  String get driverApplicationDocumentUploaded => 'Жүктелді';

  @override
  String get driverRatingTitle => 'Рейтинг';

  @override
  String get driverRatingSubtitle => 'Жолаушылардың бағалары мен пікірлері';

  @override
  String get driverRatingLoadError => 'Рейтингті жүктеу мүмкін болмады';

  @override
  String get driverRatingEmptyTitle => 'Пікірлер әлі жоқ';

  @override
  String get driverRatingEmptyText =>
      'Жолаушылар сапарларды бағалаған кезде пікірлер осында пайда болады';

  @override
  String get driverRatingTopTagsTitle => 'Жиі белгіленеді';

  @override
  String get driverRatingRecentTitle => 'Соңғы пікірлер';

  @override
  String get driverNotificationsTitle => 'Хабарландырулар';

  @override
  String get driverNotificationsSubtitle =>
      'Төлемдер, құжаттар және тапсырыстар статустары';

  @override
  String get driverNotificationsLoadError =>
      'Хабарландыруларды жүктеу мүмкін болмады';

  @override
  String get driverNotificationsEmptyTitle => 'Жаңа хабарландырулар жоқ';

  @override
  String get driverNotificationsEmptyText =>
      'Мұнда төлемдер, құжат тексерулері және сапарлар статустары пайда болады';

  @override
  String get driverProfileTitle => 'Жүргізуші профилі';

  @override
  String get driverProfileSubtitle => 'Аккаунт деректері және ағымдағы ауысым';

  @override
  String get driverProfileNameFallback => 'Жүргізуші';

  @override
  String get driverProfilePhoneMissing => 'Телефон көрсетілмеген';

  @override
  String get driverProfileRegionLabel => 'Жұмыс аймағы';

  @override
  String get driverProfileRegionNotSelected => 'Таңдалмаған';

  @override
  String get driverProfileLineStatusLabel => 'Желі статусы';

  @override
  String get driverProfileOrdersTodayLabel => 'Бүгінгі тапсырыстар';

  @override
  String get driverProfileEarnedTodayLabel => 'Бүгін табылды';

  @override
  String get driverProfileDebtLabel => 'Борыш';

  @override
  String get driverProfileDocumentsNote =>
      'Көлік құжаттарын және аймаққа рұқсатты SmartTaxi әкімшісі тексереді.';

  @override
  String get driverProfileTripHistoryTitle => 'Сапарлар тарихы';

  @override
  String get driverAvatarUpdated => 'Фото жаңартылды';

  @override
  String get driverAvatarUploadError => 'Фотоны жүктеу мүмкін болмады';

  @override
  String get driverSupportTitle => 'Қолдау қызметі';

  @override
  String get driverSupportSubtitle => 'Мәселені сипаттаңыз, біз көмектесеміз';

  @override
  String get driverSupportTopicSectionTitle => 'Өтініш тақырыбы';

  @override
  String get driverSupportTopicSectionText =>
      'Не бойынша көмек керек екенін таңдаңыз';

  @override
  String get driverSupportTopicOrder => 'Тапсырыс мәселесі';

  @override
  String get driverSupportTopicRegion => 'Аймақ бойынша сұрақ';

  @override
  String get driverSupportTopicBilling => 'Есептеулер мен борыш';

  @override
  String get driverSupportTopicOther => 'Басқа';

  @override
  String get driverSupportMessageLabel => 'Хабарлама';

  @override
  String get driverSupportMessageHint => 'Хабарлама жазыңыз...';

  @override
  String get driverSupportMessageTooShort =>
      'Мәселені толығырақ сипаттаңыз: кемінде 8 таңба.';

  @override
  String get driverSupportMessageSent =>
      'Өтініш жіберілді. Әкімші жақын арада жауап береді.';

  @override
  String get driverSupportSendingButton => 'Жіберілуде...';

  @override
  String get driverSupportSendButton => 'Жіберу';

  @override
  String get driverFaqTitle => 'Жиі қойылатын сұрақтар';

  @override
  String get driverFaqSubtitle =>
      'Жүргізушілердің жиі қойылатын сұрақтарына жауаптар';

  @override
  String get driverFaqQ1 => 'Тапсырысты қалай қабылдауға болады?';

  @override
  String get driverFaqA1 =>
      '«Тапсырыстар» бөлімінде тапсырыс карточкасын ашып, «Қабылдау» батырмасын басыңыз. Клиенттің жоғары бағасы бар тапсырыстар жоғарыда көрсетіледі.';

  @override
  String get driverFaqQ2 => 'Неге тапсырыстар көрінбейді?';

  @override
  String get driverFaqA2 =>
      'Желіде екеніңізді («Желі» бөлімі), жұмыс аймағы таңдалғанын және геолокация қосулы екенін тексеріңіз.';

  @override
  String get driverFaqQ3 => 'Борыш қалай есептеледі?';

  @override
  String get driverFaqA3 =>
      'Қолма-қол немесе аударыммен төлегенде қызмет комиссиясы борышқа қосылады. Электронды төлемде комиссия автоматты түрде шегеріледі.';

  @override
  String get driverFaqQ4 => '«Өз бағасы» дегеніміз не?';

  @override
  String get driverFaqA4 =>
      'Клиент есептелген бағадан жоғары немесе төмен баға ұсына алады. Мұндай тапсырыстар белгімен көрсетіліп, тізімде бірінші болып шығады.';

  @override
  String get driverFaqQ5 => 'Жұмыс аймағын қалай ауыстыруға болады?';

  @override
  String get driverFaqA5 =>
      'Аймақ «Желі» бөлімінде таңдалады. Тек әкімші растаған аймақтар қолжетімді.';

  @override
  String get driverFaqQ6 => 'Өткізіп алған тапсырыстар қайда кетеді?';

  @override
  String get driverFaqA6 =>
      'Өткізіп алынған тапсырыс оны ешкім қабылдамағанша аймақтағы басқа жүргізушілерге қолжетімді болып қалады.';

  @override
  String get driverAboutDescription =>
      'SmartTaxi — аймақтық такси қызметі. Жүргізуші қосымшасы тек әкімші растаған белсенді аймақтардағы тапсырыстарды көрсетеді.';

  @override
  String get driverAboutVersionLabel => 'Қосымша нұсқасы';

  @override
  String get driverSettingsTitle => 'Баптаулар';

  @override
  String get driverSettingsSubtitle => 'Аккаунт және қосымша туралы ақпарат';

  @override
  String get driverSettingsAccountGroup => 'Аккаунт';

  @override
  String get driverSettingsPhoneLabel => 'Телефон нөмірі';

  @override
  String get driverSettingsPhoneMissing => 'Көрсетілмеген';

  @override
  String get driverSettingsPhoneCopied => 'Нөмір көшірілді';

  @override
  String get driverSettingsLogoutTitle => 'Аккаунттан шығу';

  @override
  String get driverSettingsLogoutText => 'Ағымдағы сессияны аяқтау';

  @override
  String get driverSettingsInterfaceGroup => 'Интерфейс';

  @override
  String get driverSettingsLanguageLabel => 'Тіл';

  @override
  String get driverSettingsAboutGroup => 'Қосымша туралы';

  @override
  String get driverSettingsTermsTitle => 'Пайдалану шарттары';

  @override
  String get driverSettingsTermsText =>
      'Сапарлар, тапсырыстар және тараптардың жауапкершілігі ережелері';

  @override
  String get driverSettingsPrivacyTitle => 'Құпиялылық саясаты';

  @override
  String get driverSettingsPrivacyText =>
      'Телефон, геолокация және сапарлар тарихы қалай пайдаланылады';

  @override
  String get driverTabLine => 'Желі';

  @override
  String get driverTabOrders => 'Тапсырыстар';

  @override
  String get driverTabTrip => 'Сапар';

  @override
  String get driverTabNavigator => 'Навигатор';

  @override
  String get driverLineRegionSectionTitle => 'Жұмыс аймағы';

  @override
  String get driverLineRegionSectionText =>
      'Тапсырыстар тек таңдалған аймақтан келеді';

  @override
  String get driverLineRegionsLoading => 'Аймақтар жүктелуде...';

  @override
  String get driverLineNoRegionsTitle => 'Мақұлданған аймақтар жоқ';

  @override
  String get driverLineNoRegionsText =>
      'Жұмыс істеу үшін әкімші сізді мақұлдауы керек.';

  @override
  String get driverLineLocationSectionTitle => 'Геолокация';

  @override
  String get driverLineLocationSectionText =>
      'Позиция тек желіде жұмыс істеу кезінде жіберіледі';

  @override
  String get driverOrdersTitle => 'Аймақтағы тапсырыстар';

  @override
  String get driverOrdersSubtitle =>
      'Тек жұмыс аймағыңыздағы тапсырыстарды көрсетеміз.';

  @override
  String get driverOrdersUpdating => 'Тапсырыстар жаңартылуда...';

  @override
  String get driverOrdersGoOnlineTitle => 'Тапсырыс алу үшін желіге шығыңыз';

  @override
  String get driverOrdersGoOnlineText =>
      'Желіге шыққаннан кейін тапсырыстар осында пайда болады.';

  @override
  String get driverOrdersEmptyTitle => 'Аймағыңызда әлі тапсырыстар жоқ';

  @override
  String get driverOrdersEmptyText =>
      'Жолаушылар сапар жасағанда жаңа тапсырыстар осында пайда болады.';

  @override
  String get driverTripTitle => 'Белсенді сапар';

  @override
  String get driverTripSubtitle => 'Сапардың келесі қадамы';

  @override
  String get driverTripEmptyTitle => 'Белсенді сапар жоқ';

  @override
  String get driverTripEmptyText =>
      'Тапсырысты қабылдаңыз, сапар осында пайда болады.';

  @override
  String driverTripTariffLabel(String tariff) {
    return 'Тариф: $tariff';
  }

  @override
  String get driverTripSavingButton => 'Сақталуда...';

  @override
  String get driverTripDoneButton => 'Дайын, жаңа тапсырыстарға';

  @override
  String get driverTripNoShowButton => 'Клиент шықпады';

  @override
  String get driverTripCancelButton => 'Бас тарту';

  @override
  String get driverActionGoingToClient => 'Клиентке жол алды';

  @override
  String get driverActionArrived => 'Келді';

  @override
  String get driverActionStartWaiting => 'Күтуді бастау';

  @override
  String get driverActionStartTrip => 'Сапарды бастау';

  @override
  String get driverActionCompleteTrip => 'Сапарды аяқтау';

  @override
  String get driverStatusBusy => 'Бос емес';

  @override
  String get driverStatusOnline => 'Желіде';

  @override
  String get driverStatusOffline => 'Желіде емес';

  @override
  String get driverLocationChecking => 'Геолокация тексерілуде...';

  @override
  String get driverLocationRequiredError =>
      'Желіде жұмыс істеу үшін геолокация керек';

  @override
  String get driverLocationSendFailed =>
      'Геолокацияны жіберу мүмкін болмады. Қайталап көріңіз.';

  @override
  String get driverLocationFetchFailed =>
      'Геолокацияны алу мүмкін болмады. Қайталап көріңіз.';

  @override
  String get driverLocationActive => 'Геолокация белсенді';

  @override
  String get driverGoOnlineRequiredError =>
      'Тапсырыстарды қабылдау үшін желіге шығыңыз.';

  @override
  String get driverGoOnlineRequiredRejectError =>
      'Тапсырыстарды өткізіп жіберу үшін желіге шығыңыз.';

  @override
  String get driverUpdatesUnavailableNote =>
      'Жаңарту серверімен байланыс уақытша қолжетімсіз. Экран API арқылы жұмысын жалғастырады.';
}
