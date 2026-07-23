import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:smarttaxi_app/core/config/app_config.dart';

String _read(String path) => File(path).readAsStringSync();

Iterable<File> _dartFiles(String root) {
  return Directory(root)
      .listSync(recursive: true)
      .whereType<File>()
      .where((file) => file.path.endsWith('.dart'));
}

String _visibleSource(String source) {
  return source
      .split('\n')
      .where(
        (line) =>
            line.contains('Text(') ||
            line.contains('InputDecoration') ||
            line.contains('SnackBar') ||
            line.contains('_InlineMessage') ||
            line.contains('title:') ||
            line.contains('subtitle:') ||
            line.contains('labelText') ||
            line.contains('child: Text') ||
            line.contains('tooltip:'),
      )
      .join('\n')
      .toLowerCase();
}

void main() {
  test('map configuration is explicit and attributed', () {
    expect(AppConfig.apiBaseUrl, 'https://api.smarttaxi.kz');
    expect(AppConfig.osmTileUrl, contains('{z}'));
    expect(AppConfig.osmTileUrl, contains('{x}'));
    expect(AppConfig.osmTileUrl, contains('{y}'));
    expect(AppConfig.mapAttribution, contains('OpenStreetMap'));
  });

  test('official icon-only logo asset is wired', () {
    final logo = _read('lib/core/widgets/brand_logo.dart');
    final pubspec = _read('pubspec.yaml');

    expect(logo, contains('assets/brand/smarttaxi_app_icon_2026.png'));
    expect(
      logo,
      contains('assets/brand/smarttaxi_wordmark_2026.png'),
    );
    expect(pubspec, contains('assets/brand/smarttaxi_app_icon_2026.png'));
    expect(
      pubspec,
      contains('assets/brand/smarttaxi_wordmark_2026.png'),
    );
    expect(
      pubspec,
      contains('assets/cars/tariff_economy_white_sedan_flutter.png'),
    );
    expect(
      pubspec,
      contains('assets/cars/tariff_comfort_white_sedan_flutter.png'),
    );
    expect(
      pubspec,
      contains('assets/cars/tariff_business_white_premium_sedan_flutter.png'),
    );
    expect(pubspec, contains('assets/map/driver_car_topview_white.png'));
    expect(
      pubspec,
      contains('assets/map/user_location_marker_blue_gold.png'),
    );
    expect(pubspec, contains('assets/map/destination_pin_gold_white.png'));
    expect(pubspec, contains('assets/map/navigation_button_gold_white.png'));
  });

  test('auth screen is production-only and starts before main app', () {
    final main = _read('lib/main.dart');
    final authArb = _read('lib/l10n/app_ru.arb');
    final testAccountsLabel = 'Тестовые '
        'аккаунты';
    final clientSeedPassword = '123'
        '456';
    final ownerSeedPassword = 'ChangeMe_'
        '2026';

    expect(main, contains('AppSession.splash'));
    expect(main, contains('AppSession.auth'));
    expect(
      main,
      contains(
          'final title = _registerMode ? l10n.createPasswordTitle : l10n.authWelcomeTitle'),
    );
    expect(main, contains('l10n.authWelcomeSubtitle'));
    expect(authArb, contains('"authWelcomeTitle": "Вход и регистрация"'));
    expect(
      authArb,
      contains(
          '"authWelcomeSubtitle": "Введите номер телефона, чтобы продолжить"'),
    );
    expect(main, contains('AppLocalizations.of(context).phoneNumberLabel'));
    expect(main, contains('_PhotoAuthLanguageToggle'));
    expect(main, contains('l10n.createAccountButton'));
    expect(authArb, contains('"createAccountButton": "Создать аккаунт"'));
    expect(main, isNot(contains('Телефон или ' 'E' 'mail')));
    expect(main, isNot(contains('E' 'mail, если вход по ' 'email')));
    expect(main, isNot(contains('_AuthModeSwitch')));
    expect(main, isNot(contains(testAccountsLabel)));
    expect(main, isNot(contains(clientSeedPassword)));
    expect(main, isNot(contains(ownerSeedPassword)));
  });

  test('login and register forms are phone-only', () {
    final main = _read('lib/main.dart');
    final authArb = _read('lib/l10n/app_ru.arb');

    expect(main, contains('l10n.authWelcomeTitle'));
    expect(main, contains('l10n.createPasswordTitle'));
    expect(authArb, contains('"createPasswordTitle": "Придумайте пароль"'));
    expect(main, contains('l10n.nameFieldLabel'));
    expect(authArb, contains('"nameFieldLabel": "Имя"'));
    expect(main, contains('AppLocalizations.of(context).phoneNumberLabel'));
    expect(main, contains('l10n.passwordFieldLabel'));
    expect(authArb, contains('"passwordFieldLabel": "Пароль"'));
    expect(main, contains('l10n.repeatPasswordLabel'));
    expect(authArb, contains('"repeatPasswordLabel": "Повторите пароль"'));
    expect(main, contains('l10n.passwordMinLength'));
    expect(
      authArb,
      contains(
          '"passwordMinLength": "Пароль должен быть не короче 6 символов"'),
    );
    expect(main, contains('l10n.passwordsMismatch'));
    expect(authArb, contains('"passwordsMismatch": "Пароли не совпадают"'));
    expect(main, contains('l10n.validateEnterName'));
    expect(authArb, contains('"validateEnterName": "Введите имя"'));
    expect(main, contains('l10n.invalidPhoneOrPassword'));
    expect(
      authArb,
      contains('"invalidPhoneOrPassword": "Неверный номер или пароль"'),
    );
    expect(main, contains('l10n.serverUnavailable'));
    expect(
      authArb,
      contains(
          '"serverUnavailable": "Сервер недоступен. Проверьте интернет и попробуйте ещё раз."'),
    );
    expect(main, contains('_normalizePhone'));
    expect(main, contains('_phoneDigits'));
    expect(main, contains('TextEditingController'));
    expect(main, contains('l10n.showPasswordTooltip'));
    expect(authArb, contains('"showPasswordTooltip": "Показать пароль"'));
    expect(main, contains('l10n.logIn'));
    expect(main, contains('l10n.createAccountButton'));
    expect(main, isNot(contains('TextInputType.emailAddress')));
    expect(main, isNot(contains('Телефон или ' 'E' 'mail')));
    expect(main, isNot(contains('E' 'mail, если вход по ' 'email')));
  });

  test(
    'passenger home has map, order sheet, route, tariff, price, and action',
    () {
      final passenger = _read('lib/features/passenger/passenger_shell.dart');

      expect(passenger, contains('FlutterMap'));
      expect(passenger, contains('_OrderSheet'));
      expect(passenger, contains('_MapOverlayHeader'));
      expect(passenger, contains('_MapChromeButton'));
      expect(passenger, contains('_SheetAddressEntryCard'));
      expect(passenger, isNot(contains('_FloatingAddressCard')));
      expect(passenger, contains('_MapPermissionCard'));
      expect(passenger, contains('_MapRouteState'));
      expect(passenger, contains('Выбрать точку на карте'));
      expect(
        passenger,
        contains(
            'Можно включить GPS для точной подачи или выбрать точку на карте.'),
      );
      expect(passenger, contains('Выберите точку подачи'));
      expect(passenger, contains('Моё местоположение'));
      expect(passenger, contains('Введите адрес назначения'));
      expect(passenger, contains('Введите адрес назначения'));
      expect(passenger, contains('_AddressSearchSheet'));
      expect(passenger, contains('Улица, дом или место'));
      expect(passenger, contains('Ничего не найдено'));
      expect(passenger, contains('Выбрать точку на карте'));
      expect(passenger, contains('Выбрать адрес назначения'));
      expect(passenger, contains('Куда едем?'));
      expect(passenger, contains('Выберите пункт назначения'));
      expect(
        passenger,
        contains('_SheetAddressEntryCard'),
      );
      expect(passenger, isNot(contains('_FloatingAddressCard')));
      expect(passenger, isNot(contains('_QuickAddressGrid')));
      // _popularAddressesForRegion hand-typed fabricated place names/coords
      // as fallback suggestions; deliberately deleted (commit 387007f,
      // "Mobile: remove fabricated fallback addresses from picker") so
      // suggestions only ever come from real recent addresses or live
      // search. Guard against it quietly coming back.
      expect(passenger, isNot(contains('_popularAddressesForRegion')));
      expect(passenger, contains('_RecentAddressSection'));
      expect(passenger, contains('_RouteSummaryCard'));
      expect(passenger, isNot(contains('_OrderRouteCompact')));
      expect(passenger, isNot(contains('_OrderRouteButton')));
      expect(passenger, contains('_PaymentMethodRow'));
      expect(passenger, contains('Наличные'));
      expect(passenger, isNot(contains('Широта')));
      expect(passenger, isNot(contains('Долгота')));
      expect(passenger, isNot(contains('Координаты выбраны')));
      expect(passenger, contains('Тариф'));
      expect(passenger, contains('_TariffSection'));
      expect(passenger, contains('Эконом'));
      expect(passenger, contains('Комфорт'));
      expect(passenger, contains('Бизнес'));
      expect(passenger, contains('Доставка'));
      expect(
        passenger,
        contains('assets/cars/tariff_v11_economy.png'),
      );
      expect(
        passenger,
        contains('assets/cars/tariff_comfort_white_sedan_flutter.png'),
      );
      expect(
        passenger,
        contains('assets/cars/tariff_business_white_premium_sedan_flutter.png'),
      );
      expect(passenger, contains('Тарифы пока не настроены'));
      expect(passenger, contains('_PaymentMethodRow'));
      expect(passenger, contains('цена'));
      expect(passenger, contains('Маршрут временно недоступен.'));
      expect(passenger, contains('Считаем маршрут...'));
      expect(passenger, contains('Map<String, RoutePreview> _tariffEstimates'));
      expect(passenger, contains('_TariffCard'));
      expect(passenger, contains('_formatTenge'));
      expect(passenger, contains('Заказать'));
    },
  );

  test('post-login passenger shell renders home with safe fallbacks', () {
    final main = _read('lib/main.dart');
    final authArb = _read('lib/l10n/app_ru.arb');
    final passenger = _read('lib/features/passenger/passenger_shell.dart');

    expect(main, contains('ErrorWidget.builder'));
    expect(main, contains('_RuntimeFallbackScreen'));
    expect(main, contains('_RuntimeFallbackLogo'));
    expect(main, contains('l10n.runtimeFallbackAction'));
    expect(authArb, contains('"runtimeFallbackAction": "Вернуться на главную"'));
    expect(main, contains('AppSession.passenger => PassengerShell'));
    expect(main, contains('if (!mounted) return;'));
    expect(main, contains('setState(() => _session = AppSession.passenger)'));
    expect(passenger, contains('PassengerTab _tab = PassengerTab.home'));
    expect(passenger, isNot(contains('bool _mapReady = false')));
    expect(passenger, contains('final showMapFallback = mapUnavailable'));
    expect(passenger, contains('Positioned.fill('));
    expect(passenger, contains('AnimatedSwitcher'));
    expect(passenger, contains('_currentScreen'));
    expect(passenger, contains('_unknownPassengerSection'));
    expect(passenger, contains('PassengerTab.home: _homeScreen'));
    expect(passenger, contains('PassengerTab.trips: _tripsScreen'));
    expect(passenger, contains('PassengerTab.profile: _profileScreen'));
    expect(passenger, contains('PassengerTab.support: _supportScreen'));
    expect(passenger, contains('PassengerTab.faq: _faqScreen'));
    expect(passenger, contains('PassengerTab.about: _aboutScreen'));
    expect(passenger, contains('PassengerTab.settings: _settingsScreen'));
    expect(passenger, contains('_MapFallbackSurface'));
    expect(passenger, contains('_MapUnavailableCard'));
    expect(passenger, contains('final showMapFallback = mapUnavailable'));
    expect(passenger, contains('showMapFallback'));
    expect(passenger, contains('mapUnavailable'));
    expect(passenger, contains('errorTileCallback'));
    expect(passenger,
        contains('backgroundColor: context.palette.appBackground'));
    expect(passenger, isNot(contains('IndexedStack(')));
  });

  test('passenger stage 2 polish keeps one clear CTA and animated states', () {
    final passenger = _read('lib/features/passenger/passenger_shell.dart');

    expect(passenger, contains('Выбрать точку подачи'));
    expect(passenger, contains('Выбрать адрес назначения'));
    expect(passenger, contains("return 'Рассчитать'"));
    expect(passenger, contains("return 'Оформить доставку'"));
    expect(
      passenger,
      contains(r"return label == null ? 'Заказать' : 'Заказать $label'"),
    );
    expect(passenger, contains('AnimatedSwitcher'));
    expect(passenger, contains('AnimatedSize'));
    expect(passenger, contains('_TariffCard'));
    expect(passenger, contains('AnimatedContainer'));
    expect(passenger, contains('_CompactNotice'));
    expect(
      passenger,
      contains('Предлагаем заказ ближайшим водителям.'),
    );
    expect(
      passenger,
      contains('Показываем статус поездки и маршрут в реальном времени.'),
    );
    expect(passenger, contains('_TripStatusPanel'));
    expect(passenger, contains('_StatusStepper'));
  });

  test('stage 3 route preview stays server-driven with honest map states', () {
    final passenger = _read('lib/features/passenger/passenger_shell.dart');
    final api = _read('lib/core/api/api_client.dart');
    final models = _read('lib/features/shared/models.dart');

    expect(api, contains("'/api/routes/addresses/search'"));
    expect(api, contains("'/api/routes/addresses/reverse'"));
    expect(api, contains('searchAddresses'));
    expect(api, contains('reverseAddress'));
    expect(models, contains('class AddressSuggestion'));
    expect(api, contains("'/api/routes/preview'"));
    expect(api, contains("'/api/routes/driver-to-pickup'"));
    expect(passenger, contains('PointSource.gps'));
    expect(passenger, contains('PointSource.map'));
    expect(passenger, contains('PointSource.manual'));
    expect(passenger, contains('PointSource.none'));
    expect(passenger, contains('Точка на карте'));
    expect(passenger, contains('Геолокация для подачи'));
    expect(passenger, contains('initialCameraFit'));
    expect(passenger, contains('CameraFit.coordinates'));
    expect(passenger, contains('if (route.isNotEmpty)'));
    expect(passenger, contains('PolylineLayer'));
    expect(passenger, contains('assets/map/marker_my_location_2026.png'));
    expect(passenger, contains('assets/map/marker_destination_2026.png'));
    expect(passenger, contains('assets/map/driver_car_topview_white.png'));
    // navigation_button_gold_white.png (an image-based recenter/nav button)
    // isn't referenced anywhere under lib/ anymore -- the map chrome moved to
    // icon-only controls (Icons.my_location_rounded / _MapChromeButton,
    // already covered elsewhere in this file).
    expect(passenger, contains('_driverPickupRoute'));
    expect(passenger, contains('_driverRouteError'));
    expect(passenger, contains('Маршрут водителя временно недоступен.'));
    expect(
      passenger,
      contains('\$label: \$distance км · \$minutes мин'),
    );
    expect(
      passenger,
      contains('_order?.driverId == null ? null : _driverLocation'),
    );
    expect(models, contains('_routeDistanceMeters'));
    expect(models, contains('_routeDurationSeconds'));
    expect(models, contains('final double? heading;'));
    expect(models, contains("json['driverHeading']"));
  });

  test('passenger order API sends required rider phone contract', () {
    final api = _read('lib/core/api/api_client.dart');
    final passenger = _read('lib/features/passenger/passenger_shell.dart');

    expect(api, contains('required String riderPhone'));
    expect(api, contains("'riderPhone': riderPhone"));
    expect(api, contains("data: {'riderPhone': riderPhone}"));
    expect(passenger, contains('accountPhone'));
    expect(passenger, contains('Для заказа войдите по номеру телефона.'));
  });

  test('client navigation is drawer-only with full passenger sections', () {
    final passenger = _read('lib/features/passenger/passenger_shell.dart');

    expect(passenger, contains('enum PassengerTab'));
    expect(passenger, contains('PassengerTab.driverApplication'));
    expect(passenger, contains('PassengerTab.support'));
    expect(passenger, contains('PassengerTab.faq'));
    expect(passenger, contains('PassengerTab.about'));
    expect(passenger, contains('PassengerTab.settings'));
    expect(passenger, contains('_SmartDrawer'));
    // Drawer labels now go through AppLocalizations (l10n.home,
    // passengerDrawerTrips, etc.) instead of raw Russian literals.
    expect(passenger, contains('label: l10n.home'));
    expect(passenger, contains('label: l10n.passengerDrawerTrips'));
    expect(passenger, contains('label: l10n.profile'));
    expect(passenger, contains('passengerDrawerBecomeDriver'));
    expect(passenger, contains('label: l10n.support'));
    expect(passenger, contains('label: l10n.passengerDrawerFaq'));
    expect(passenger, contains('label: l10n.passengerDrawerAboutUs'));
    expect(passenger, contains('label: l10n.settings'));
    expect(passenger, contains('label: l10n.logOut'));
    expect(passenger, contains('drawerWidth'));
    // _DrawerDivider (a plain line separator) was replaced by labeled
    // _DrawerSectionLabel headers (Аккаунт/Помощь/О сервисе) grouping the
    // drawer entries.
    expect(passenger, contains('_DrawerSectionLabel'));
    // Главная's icon changed from a map pin to a house icon.
    expect(passenger, contains('Icons.home_rounded'));
    expect(passenger, contains('Icons.support_agent_rounded'));
    expect(passenger, contains('Icons.tune_rounded'));
    expect(passenger, contains('passengerDrawerRegionalBadge'));
    expect(passenger, isNot(contains('NavigationBar(')));
    expect(passenger, isNot(contains('NavigationDestination(')));
    expect(passenger, isNot(contains('class _FloatingNav')));
  });

  test('passenger menu screens are useful and production-oriented', () {
    final passenger = _read('lib/features/passenger/passenger_shell.dart');

    expect(passenger, contains('_supportScreen'));
    expect(passenger, contains('_SupportTopicChip'));
    expect(passenger, isNot(contains('ChoiceChip(')));
    expect(passenger, contains('Проблема с поездкой'));
    expect(passenger, contains('Водитель не приехал'));
    expect(passenger, contains('Сообщение'));
    expect(passenger, contains('Напишите сообщение'));
    // The support form used to just copy the text to the clipboard for the
    // user to paste elsewhere ("Текст скопирован..."); it now actually
    // submits via widget.api.submitSupportMessage and shows a real
    // confirmation.
    expect(
      passenger,
      contains(
          'Обращение отправлено. Мы ответим здесь и, если нужно, позвоним.'),
    );
    expect(passenger, contains('_settingsScreen'));
    expect(passenger, contains('Аккаунт'));
    // Settings screen group/row labels were localized (passengerSettings*
    // arb keys) instead of hardcoded Russian literals, so the copy itself
    // now lives in app_ru.arb rather than passenger_shell.dart's source.
    final ruArb = _read('lib/l10n/app_ru.arb');
    expect(passenger, contains('l10n.passengerSettingsInterfaceGroup'));
    expect(ruArb, contains('"passengerSettingsInterfaceGroup": "Интерфейс"'));
    expect(passenger, contains('Поездки'));
    // The old standalone "Уведомления о статусе" toggle was replaced by a
    // real OS-permission-backed row (FirebaseMessaging.getNotificationSettings).
    expect(passenger, contains('l10n.passengerSettingsPushLabel'));
    expect(ruArb, contains('"passengerSettingsPushLabel": "Push-уведомления"'));
    expect(passenger, contains('Геолокация'));
    expect(passenger, contains('l10n.passengerSettingsAboutGroup'));
    expect(ruArb, contains('"passengerSettingsAboutGroup": "О приложении"'));
    expect(passenger, isNot(contains('Скоро')));
    expect(passenger, isNot(contains('будут добавлены')));
    expect(passenger, contains('_faqScreen'));
    expect(passenger, contains('_FaqTile'));
    expect(passenger, contains('Как заказать поездку?'));
    expect(passenger, contains('Как считается цена?'));
    expect(passenger, contains('Как стать водителем?'));
    expect(passenger, contains('_aboutScreen'));
    expect(passenger, contains('SmartTaxi'));
    expect(passenger, contains('региональный сервис такси'));
    expect(passenger, contains('_ProfileGroupLabel'));
    // Profile screen groups were consolidated from 3 (Основное/Приложение/
    // Аккаунт) down to 2 in the later redesign -- "Приложение" no longer
    // exists as its own group.
    expect(passenger, contains("const _ProfileGroupLabel('Быстрые действия')"));
    expect(passenger, contains("const _ProfileGroupLabel('Аккаунт')"));
    expect(passenger, contains("action: 'На главную'"));
  });

  test('driver entry is not a public top role switch', () {
    final main = _read('lib/main.dart');
    final passenger = _read('lib/features/passenger/passenger_shell.dart');
    final publicSwitchA = 'Пассажир / '
        'Водитель';
    final publicSwitchB = 'Passenger / '
        'Driver';

    expect(
      main,
      isNot(
        contains(
          'Segmented'
          'Button',
        ),
      ),
    );
    expect(
      main,
      isNot(
        contains(
          'Button'
          'Segment',
        ),
      ),
    );
    expect(main, isNot(contains(publicSwitchA)));
    expect(main, isNot(contains(publicSwitchB)));
    expect(passenger, contains('Стать водителем'));
    expect(passenger, contains('onOpenDriverMode'));
    expect(passenger, contains('_SmartDrawer'));
  });

  test('driver drawer keeps driver tabs and adds account/support sections', () {
    final driver = _read('lib/features/driver/driver_shell.dart');
    final chrome =
        _read('lib/features/driver/widgets/driver_shell_chrome.dart');

    expect(driver, contains('DriverDrawer'));
    expect(driver, contains('drawer: DriverDrawer('));
    expect(driver, contains('_RoadAlertsSheet'));
    // Drawer labels now go through AppLocalizations instead of raw
    // Russian literals (see l10n/app_ru.arb + app_kk.arb).
    expect(chrome, contains('label: l10n.driverTabLine'));
    expect(chrome, contains('label: l10n.driverTabOrders'));
    expect(chrome, contains('label: l10n.driverTabTrip'));
    expect(chrome, contains('label: l10n.driverDrawerNavigatorBrand'));
    expect(chrome, contains('label: l10n.profile'));
    expect(chrome, contains('label: l10n.driverDrawerRoadAlerts'));
    expect(chrome, contains('label: l10n.support'));
    expect(chrome, contains('label: l10n.driverFaqTitle'));
    expect(chrome, contains('label: l10n.passengerDrawerAboutUs'));
    expect(chrome, contains('label: l10n.settings'));
    expect(chrome, contains('label: l10n.driverDrawerPassengerMode'));
    expect(chrome, contains('label: l10n.logOut'));
  });

  test('route fields use pickup/destination icon markers without A/B letters',
      () {
    final routeFields = _read('lib/core/widgets/route_fields.dart');

    expect(routeFields, contains('Icons.radio_button_checked_rounded'));
    expect(routeFields, contains('Icons.location_on_rounded'));
    expect(routeFields, isNot(contains("label: 'A'")));
    expect(routeFields, isNot(contains("label: 'B'")));
    expect(routeFields, contains('height: 130'));
    expect(
      routeFields,
      isNot(contains('crossAxisAlignment: CrossAxisAlignment.stretch')),
    );
    expect(
      routeFields,
      isNot(
        contains(
          'Icons.'
          'home',
        ),
      ),
    );
    expect(
      routeFields,
      isNot(
        contains(
          'Icons.'
          'house',
        ),
      ),
    );
  });

  test('driver map markers do not use visible A/B letters', () {
    final driver = _read('lib/features/driver/driver_shell.dart');

    expect(driver, isNot(contains("_NavigatorPointMarker(label: 'A')")));
    expect(driver, isNot(contains("_NavigatorPointMarker(label: 'B')")));
    expect(driver, isNot(contains('_letterMarker')));
    expect(driver, contains('Icons.navigation_rounded'));
    expect(driver, contains('Icons.location_on_rounded'));
  });

  test('driver tabs and premium driver states exist', () {
    final driver = _read('lib/features/driver/driver_shell.dart');
    final arb = _read('lib/l10n/app_ru.arb');
    final lineWidgets =
        _read('lib/features/driver/widgets/driver_line_widgets.dart');
    final orderWidgets =
        _read('lib/features/driver/widgets/driver_order_widgets.dart');
    final helpers =
        _read('lib/features/driver/models/driver_shell_helpers.dart');

    // Bottom nav destination labels went through AppLocalizations — check
    // the Russian source of truth rather than the (now l10n-getter-only)
    // driver_shell.dart.
    expect(arb, contains('"driverTabLine": "Линия"'));
    expect(arb, contains('"driverTabOrders": "Заказы"'));
    expect(arb, contains('"driverTabTrip": "Поездка"'));
    expect(arb, contains('"driverTabNavigator": "Навигатор"'));
    expect(driver, contains('DriverShiftHero'));
    // DriverStatsGrid/DriverQuickActions were merged into a single compact
    // DriverTodayStrip during the P1 "На линии" rework.
    expect(driver, contains('DriverTodayStrip'));
    expect(driver, contains('LocationNotice'));
    expect(driver, contains('DriverStatusStepper'));
    expect(lineWidgets, contains('LineGlyph('));
    expect(arb, contains('"driverLineRegionSectionTitle": "Рабочий регион"'));
    expect(driver, contains('Выйти на линию'));
    expect(lineWidgets, contains('Уйти с линии'));
    expect(arb,
        contains('"driverLocationRequiredError": "Для работы на линии нужна геолокация"'));
    expect(arb, contains('"driverLocationChecking": "Проверяем геолокацию..."'));
    expect(arb, contains('"driverLocationActive": "Геолокация активна"'));
    expect(
      arb,
      contains(
          '"driverLocationSendFailed": "Не удалось отправить геолокацию. Попробуйте снова."'),
    );
    expect(driver, contains('Нет одобренных регионов'));
    // Copy rewritten by the "stop requiring driver documents" change (round
    // 4, docs/status/mobile-driver-overnight-2026-07-15.md) to point at
    // support instead of an admin-approval/documents message.
    expect(
      driver,
      contains(
          'Чтобы выйти на линию, нужен хотя бы один одобренный регион. Напишите в поддержку'),
    );
    expect(arb,
        contains('"driverOrdersGoOnlineText": "После выхода на линию заказы появятся здесь."'));
    expect(
      arb,
      contains(
          '"driverOrdersEmptyText": "Новые заказы появятся здесь, когда пассажиры создадут поездку."'),
    );
    expect(driver, contains('_acceptingOrderId'));
    expect(driver, contains('_rejectingOrderId'));
    expect(driver, contains('Принимаем...'));
    expect(orderWidgets, contains('Пропускаем...'));
    expect(orderWidgets, contains('Пропустить'));
    expect(driver, contains('Клиент не вышел'));
    expect(helpers, contains('Выйдите на линию, чтобы принимать заказы.'));
    expect(helpers, contains('Заказ уже принят другим водителем'));
    expect(helpers, contains('У вас уже есть активный заказ'));
    expect(driver, contains('_TripMap'));
    // Navigator became a dedicated pushed full-screen route instead of a
    // 4th IndexedStack tab (P2 rework) — _navigatorTab/_NavigatorCockpit no
    // longer exist; _SmartNavigatorMap's layers and _NavigatorMetric are
    // reused inside the new _DriverFullScreenNavigator.
    expect(driver, contains('_openFullScreenNavigator'));
    expect(driver, contains('_DriverFullScreenNavigator'));
    expect(driver, contains('_SmartNavigatorMap'));
    expect(driver, contains('_NavigatorMetric'));
    expect(driver, contains('Свободный режим'));
    // 2GIS/Yandex/Google external-navigator buttons were removed by explicit
    // request — guard against them silently coming back.
    expect(driver, isNot(contains('2GIS')));
    expect(driver, isNot(contains('Yandex')));
    expect(driver, isNot(contains('Google')));
    expect(driver, contains('CameraFit.coordinates'));
    expect(driver, contains('Маршрут до точки посадки'));
    expect(helpers, contains('Маршрут временно недоступен'));
    expect(driver, contains("status == 'DRIVER_FOUND'"));
    expect(driver, contains("status == 'DRIVER_GOING_TO_CLIENT'"));
    expect(driver, contains("status == 'DRIVER_ARRIVED'"));
    expect(driver, contains("status == 'WAITING_CLIENT'"));
    expect(driver, contains("status == 'TRIP_STARTED'"));
    expect(driver, contains('widget.api.goingToClient'));
    expect(driver, contains('widget.api.waitingClient'));
    expect(driver, contains('widget.api.noShow'));
    expect(driver, contains('_tripActionLabel'));
  });

  test('driver lifecycle API matches backend order status actions', () {
    final api = _read('lib/core/api/api_client.dart');
    final models = _read('lib/features/shared/models.dart');
    final arb = _read('lib/l10n/app_ru.arb');

    expect(api, contains("'/api/driver/orders/\$orderId/reject'"));
    expect(api, contains("'/api/orders/\$orderId/going-to-client'"));
    expect(api, contains("'/api/orders/\$orderId/waiting'"));
    expect(api, contains("'/api/orders/\$orderId/no-show'"));
    expect(api, contains('rejectDriverOrder'));
    expect(api, contains('goingToClient'));
    expect(api, contains('waitingClient'));
    expect(api, contains('noShow'));

    expect(models, contains("'SEARCHING_DRIVER'"));
    expect(models, contains("'DRIVER_FOUND'"));
    expect(models, contains("'DRIVER_GOING_TO_CLIENT'"));
    expect(models, contains("'WAITING_CLIENT'"));
    expect(models, contains("'TRIP_STARTED'"));
    // Trip-action button labels went through AppLocalizations.
    expect(arb, contains('"driverActionGoingToClient": "Выехал к клиенту"'));
    expect(arb, contains('"driverActionStartWaiting": "Начать ожидание"'));
    expect(arb, contains('"driverActionStartTrip": "Начать поездку"'));
    expect(arb, contains('"driverActionCompleteTrip": "Завершить поездку"'));
  });

  test('driver road-safety alerts use real server data and safe copy', () {
    final api = _read('lib/core/api/api_client.dart');
    final driver = _read('lib/features/driver/driver_shell.dart');
    final models = _read('lib/features/shared/models.dart');

    expect(api, contains("'/api/driver/road-alerts'"));
    expect(api, contains('getDriverRoadAlerts'));
    expect(api, contains('createDriverRoadAlert'));
    expect(api, contains('confirmDriverRoadAlert'));
    expect(api, contains('dismissDriverRoadAlert'));
    expect(models, contains('class RoadAlert'));
    expect(models, contains('roadAlertTypes'));
    expect(models, contains("'ROAD_HAZARD'"));
    expect(models, contains("'SPEED_CAMERA'"));
    expect(models, contains("'ROAD_CLOSED'"));
    expect(models, contains("'POTHOLE'"));
    expect(models, contains("'SCHOOL_ZONE'"));
    expect(models, contains('confidenceScore'));
    expect(driver, contains('Дорожные события'));
    expect(
        driver,
        contains(
            'Сообщения нужны для безопасности движения и соблюдения правил.'));
    expect(driver, contains('Пока нет дорожных событий рядом'));
    expect(driver, contains('Нажмите на карту, чтобы выбрать точку события'));
    expect(models, contains('Камера скорости'));
    expect(driver, contains('_RoadAlertMap'));
    expect(driver, contains('FlutterMap'));
    expect(driver, contains('MarkerLayer'));
    expect(driver, contains("label: const Text('GPS')"));
    expect(driver, contains('На месте'));
    expect(driver, contains('Событие скрыто из активного списка.'));
    expect(driver, isNot(contains('\u26d4')));
    final unsafeIntent = 'police ${'eva'}sion';
    final unsafeRouting = 'avoid ${'pol'}ice';
    expect(driver.toLowerCase(), isNot(contains(unsafeIntent)));
    expect(driver.toLowerCase(), isNot(contains(unsafeRouting)));
    expect(
        RegExp(r'(^|\s)мент(ы)?($|\s|[,.!?])', caseSensitive: false)
            .hasMatch(driver),
        isFalse);
  });

  test('stage 4.5 final visual QA guards compact premium mobile polish', () {
    final main = _read('lib/main.dart');
    final theme = _read('lib/core/theme/app_theme.dart');
    final passenger = _read('lib/features/passenger/passenger_shell.dart');
    final driver = _read('lib/features/driver/driver_shell.dart');
    final emptyState = _read('lib/core/widgets/empty_state.dart');
    final statusPill = _read('lib/core/widgets/status_pill.dart');
    final driverCommon =
        _read('lib/features/driver/widgets/driver_common_widgets.dart');
    final driverLineWidgets =
        _read('lib/features/driver/widgets/driver_line_widgets.dart');

    expect(main,
        contains('final compact = size.height < 840 || size.width < 390'));
    expect(main, contains('AutofillGroup'));
    expect(main, contains('AutofillHints.telephoneNumber'));
    expect(main, contains('TextCapitalization'));
    expect(main, contains('.words'));
    expect(theme, contains('textSelectionTheme'));
    expect(theme, contains('bottomSheetTheme'));
    expect(theme, contains('snackBarTheme'));
    expect(passenger, contains('final compact = screen.height < 720'));
    expect(passenger, contains('BoxFit.scaleDown'));
    expect(passenger, contains('TextButton.styleFrom'));
    expect(emptyState, contains('BoxConstraints(maxWidth: 430)'));
    expect(emptyState, contains('fontWeight: FontWeight.w900'));
    expect(statusPill, contains('BoxConstraints(maxWidth: 164)'));
    expect(statusPill, contains('TextOverflow.ellipsis'));
    // driverPagePadding and the compact-screen scaleDown treatment moved into
    // the extracted driver widget files (driver_common_widgets.dart,
    // driver_line_widgets.dart) rather than living directly in
    // driver_shell.dart.
    expect(driver, contains('driverPagePadding'));
    expect(driverCommon, contains('width < 390 ? 16 : 20'));
    expect(driverLineWidgets, contains('BoxFit.scaleDown'));
  });

  test('driver socket and order model keep live updates region scoped', () {
    final socket = _read('lib/core/sockets/socket_service.dart');
    final models = _read('lib/features/shared/models.dart');
    final driver = _read('lib/features/driver/driver_shell.dart');
    final helpers =
        _read('lib/features/driver/models/driver_shell_helpers.dart');

    expect(socket, contains("emit('join_drivers')"));
    expect(socket, contains("'order_updated'"));
    expect(socket, contains("'order_accepted'"));
    expect(socket, contains("'order_status_public'"));
    expect(socket, isNot(contains('regionId')));
    expect(models, contains('final String? tariff;'));
    expect(models, contains("snapshot['tariffName']"));
    // _mergeOrderDetails moved into models/driver_shell_helpers.dart.
    expect(helpers, contains('_mergeOrderDetails'));
    expect(driver, contains('unawaited(_loadOrders())'));
  });

  test(
    'become driver flow submits a real application or shows production state',
    () {
      final api = _read('lib/core/api/api_client.dart');
      final passenger = _read('lib/features/passenger/passenger_shell.dart');

      expect(api, contains("'/api/admin/driver-applications'"));
      expect(passenger, contains('Отправить заявку'));
      expect(
        passenger,
        contains('Заявка отправлена. Администратор проверит данные.'),
      );
    },
  );

  test('live Flutter UI has no placeholder or technical visible copy', () {
    final blocked = [
      'fa'
          'ke',
      'mo'
          'ck',
      'de'
          'mo',
      'de'
          'bug',
      'de'
          'v',
      'back'
          'end',
      'end'
          'point',
    ];
    final mojibake = [
      String.fromCharCode(0x2568),
      String.fromCharCode(0x2564),
      String.fromCharCodes([0x0442, 0x0416, 0x0422]),
      String.fromCharCodes([0x0420, 0x201D]),
      String.fromCharCodes([0x0420, 0x045E]),
    ];

    for (final file in _dartFiles('lib')) {
      final source = _read(file.path);
      final visible = _visibleSource(source);
      for (final token in blocked) {
        expect(visible, isNot(contains(token)), reason: file.path);
      }
      for (final token in mojibake) {
        expect(source, isNot(contains(token)), reason: file.path);
      }
    }
  });

  test('removed unsupported live shortcuts and seed credential display', () {
    final liveSource = _dartFiles(
      'lib',
    ).map((file) => _read(file.path)).join('\n');
    final driverOrders = 'DRIVER_'
        'ORDERS';
    final testAccountsLabel = 'Тестовые '
        'аккаунты';
    final clientSeedPassword = '123'
        '456';
    final ownerSeedPassword = 'ChangeMe_'
        '2026';

    expect(liveSource, isNot(contains(driverOrders)));
    expect(liveSource, isNot(contains(testAccountsLabel)));
    expect(liveSource, isNot(contains(clientSeedPassword)));
    expect(liveSource, isNot(contains(ownerSeedPassword)));
  });

  test('live Flutter client has no debug console logging', () {
    final liveSource = _dartFiles(
      'lib',
    ).map((file) => _read(file.path)).join('\n');

    expect(liveSource, isNot(contains('debugPrint(')));
    expect(liveSource, isNot(contains('print(')));
  });
}
