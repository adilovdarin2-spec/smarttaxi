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
    expect(AppConfig.apiBaseUrl, 'https://smarttaxi-api-production.up.railway.app');
    expect(AppConfig.osmTileUrl, contains('{z}'));
    expect(AppConfig.osmTileUrl, contains('{x}'));
    expect(AppConfig.osmTileUrl, contains('{y}'));
    expect(AppConfig.mapAttribution, contains('OpenStreetMap'));
  });

  test('official icon-only logo asset is wired', () {
    final logo = _read('lib/core/widgets/brand_logo.dart');
    final pubspec = _read('pubspec.yaml');

    expect(logo, contains('assets/brand/smarttaxi_app_icon.svg'));
    expect(
      logo,
      contains('assets/brand/smarttaxi_logo_horizontal.svg'),
    );
    expect(logo, contains('placeholderBuilder'));
    expect(logo, contains('_LogoFallbackMark'));
    expect(logo, contains('_HorizontalLogoFallback'));
    expect(pubspec, contains('assets/brand/smarttaxi_app_icon_websafe.png'));
    expect(
      pubspec,
      contains('assets/brand/smarttaxi_logo_horizontal_transparent.png'),
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
      expect(passenger, contains('_MapRoundButton'));
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
      expect(passenger, contains('_popularAddressesForRegion'));
      expect(passenger, contains('_HomeRecentAddresses'));
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
        contains('assets/cars/tariff_economy_white_sedan_flutter.png'),
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
      expect(passenger, contains('_TariffListRow'));
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
    expect(
        passenger, contains('backgroundColor: SmartTaxiColors.appBackground'));
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
    expect(passenger, contains('_TariffListRow'));
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
    expect(
        passenger, contains('assets/map/user_location_marker_blue_gold.png'));
    expect(passenger, contains('assets/map/destination_pin_gold_white.png'));
    expect(passenger, contains('assets/map/driver_car_topview_white.png'));
    expect(passenger, contains('assets/map/navigation_button_gold_white.png'));
    expect(passenger, contains('_driverPickupRoute'));
    expect(passenger, contains('_driverRouteError'));
    expect(passenger, contains('Маршрут водителя временно недоступен.'));
    expect(
      passenger,
      contains('До точки посадки: \$distance км · \$minutes мин'),
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
    expect(passenger, contains("label: 'Главная'"));
    expect(passenger, contains("label: 'Мои поездки'"));
    expect(passenger, contains("label: 'Профиль'"));
    expect(passenger, contains("driverLabel: 'Стать водителем'"));
    expect(passenger, contains("label: 'Поддержка'"));
    expect(passenger, contains("label: 'FAQ'"));
    expect(passenger, contains("label: 'О нас'"));
    expect(passenger, contains("label: 'Настройки'"));
    expect(passenger, contains("label: 'Выйти'"));
    expect(passenger, contains('drawerWidth'));
    expect(passenger, contains('_DrawerDivider'));
    expect(passenger, contains('Icons.map_rounded'));
    expect(passenger, contains('Icons.support_agent_rounded'));
    expect(passenger, contains('Icons.tune_rounded'));
    expect(passenger, contains('Региональное такси'));
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
    expect(
      passenger,
      contains('Текст скопирован. Отправьте его в поддержку удобным способом.'),
    );
    expect(passenger, contains('_settingsScreen'));
    expect(passenger, contains('Аккаунт'));
    expect(passenger, contains('Интерфейс'));
    expect(passenger, contains('Поездки'));
    expect(passenger, contains('Уведомления о статусе'));
    expect(passenger, contains('Геолокация'));
    expect(passenger, contains('О приложении'));
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
    expect(passenger, contains("const _ProfileGroupLabel('Основное')"));
    expect(passenger, contains("const _ProfileGroupLabel('Приложение')"));
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

    expect(driver, contains('_DriverDrawer'));
    expect(driver, contains('drawer: _DriverDrawer('));
    expect(driver, contains('_RoadAlertsSheet'));
    expect(driver, contains("label: 'Линия'"));
    expect(driver, contains("label: 'Заказы'"));
    expect(driver, contains("label: 'Поездка'"));
    expect(driver, contains("label: 'Smart Navigator'"));
    expect(driver, contains("label: 'Профиль'"));
    expect(driver, contains("label: 'Дорожные события'"));
    expect(driver, contains("label: 'Поддержка'"));
    expect(driver, contains("label: 'FAQ'"));
    expect(driver, contains("label: 'О нас'"));
    expect(driver, contains("label: 'Настройки'"));
    expect(driver, contains("label: 'Режим пассажира'"));
    expect(driver, contains("label: 'Выйти'"));
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

    expect(driver, contains("label: 'Линия'"));
    expect(driver, contains("label: 'Заказы'"));
    expect(driver, contains("label: 'Поездка'"));
    expect(driver, contains("label: 'Навигатор'"));
    expect(driver, contains('_DriverShiftHero'));
    expect(driver, contains('_DriverStatsGrid'));
    expect(driver, contains('_DriverQuickActions'));
    expect(driver, contains('_RegionSummary'));
    expect(driver, contains('_LocationNotice'));
    expect(driver, contains('_DriverStatusStepper'));
    expect(driver, contains('_LineGlyph'));
    expect(driver, contains('Рабочий регион'));
    expect(driver, contains('Выйти на линию'));
    expect(driver, contains('Уйти с линии'));
    expect(driver, contains('Для работы на линии нужна геолокация'));
    expect(driver, contains('Проверяем геолокацию...'));
    expect(driver, contains('Геолокация активна'));
    expect(
        driver, contains('Не удалось отправить геолокацию. Попробуйте снова.'));
    expect(driver, contains('Нет одобренных регионов'));
    expect(
      driver,
      contains('Администратор должен одобрить вас для работы.'),
    );
    expect(driver, contains('Выйдите на линию, чтобы получать заказы'));
    expect(driver, contains('Заказов в вашем регионе пока нет'));
    expect(driver, contains('_acceptingOrderId'));
    expect(driver, contains('_rejectingOrderId'));
    expect(driver, contains('Принимаем...'));
    expect(driver, contains('Пропускаем...'));
    expect(driver, contains('Пропустить'));
    expect(driver, contains('Клиент не вышел'));
    expect(driver, contains('Выйдите на линию, чтобы принимать заказы.'));
    expect(driver, contains('Заказ уже принят другим водителем'));
    expect(driver, contains('У вас уже есть активный заказ'));
    expect(driver, contains('_TripMap'));
    expect(driver, contains('_navigatorTab'));
    expect(driver, contains('_SmartNavigatorMap'));
    expect(driver, contains('_NavigatorCockpit'));
    expect(driver, contains('Свободный режим'));
    expect(driver, contains('2GIS'));
    expect(driver, contains('Yandex'));
    expect(driver, contains('Google'));
    expect(driver, contains('CameraFit.coordinates'));
    expect(driver, contains('Маршрут до точки посадки'));
    expect(driver, contains('Маршрут временно недоступен'));
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
    final driver = _read('lib/features/driver/driver_shell.dart');

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
    expect(driver, contains('Выехал к клиенту'));
    expect(driver, contains('Начать ожидание'));
    expect(driver, contains('Начать поездку'));
    expect(driver, contains('Завершить поездку'));
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
    expect(driver, contains('_driverPagePadding'));
    expect(driver, contains('width < 390 ? 16 : 20'));
    expect(driver, contains('BoxFit.scaleDown'));
  });

  test('driver socket and order model keep live updates region scoped', () {
    final socket = _read('lib/core/sockets/socket_service.dart');
    final models = _read('lib/features/shared/models.dart');
    final driver = _read('lib/features/driver/driver_shell.dart');

    expect(socket, contains("emit('join_drivers')"));
    expect(socket, contains("'order_updated'"));
    expect(socket, contains("'order_accepted'"));
    expect(socket, contains("'order_status_public'"));
    expect(socket, isNot(contains('regionId')));
    expect(models, contains('final String? tariff;'));
    expect(models, contains("snapshot['tariffName']"));
    expect(driver, contains('_mergeOrderDetails'));
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
