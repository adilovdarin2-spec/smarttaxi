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
    expect(AppConfig.apiBaseUrl, 'http://10.0.2.2:4000');
    expect(AppConfig.osmTileUrl, contains('{z}'));
    expect(AppConfig.osmTileUrl, contains('{x}'));
    expect(AppConfig.osmTileUrl, contains('{y}'));
    expect(AppConfig.mapAttribution, contains('OpenStreetMap'));
  });

  test('official icon-only logo asset is wired', () {
    final logo = _read('lib/core/widgets/brand_logo.dart');
    final pubspec = _read('pubspec.yaml');

    expect(logo, contains('assets/brand/smarttaxi_icon.svg'));
    expect(pubspec, contains('assets/brand/smarttaxi_icon.svg'));
    expect(pubspec, contains('assets/brand/smarttaxi_icon_2048.png'));
  });

  test('auth screen is production-only and starts before main app', () {
    final main = _read('lib/main.dart');
    final testAccountsLabel = 'Тестовые '
        'аккаунты';
    final clientSeedPassword = '123'
        '456';
    final ownerSeedPassword = 'ChangeMe_'
        '2026';

    expect(main, contains('AppSession.splash'));
    expect(main, contains('AppSession.auth'));
    expect(main, contains('Региональное такси рядом с вами'));
    expect(
        main, contains("final title = _registerMode ? 'Регистрация' : 'Вход'"));
    expect(main, contains('Введите номер телефона, чтобы продолжить'));
    expect(main, contains('Создайте аккаунт для заказа поездок'));
    expect(main, contains('Номер телефона'));
    expect(main, contains('Создать аккаунт'));
    expect(main, contains('_AuthSwitchLink'));
    expect(main, contains('Ещё нет аккаунта?'));
    expect(main, contains('Зарегистрируйтесь'));
    expect(main, contains('Уже есть аккаунт?'));
    expect(main, isNot(contains('Телефон или ' 'Email')));
    expect(main, isNot(contains('Email, если вход по ' 'email')));
    expect(main, isNot(contains('_AuthModeSwitch')));
    expect(main, isNot(contains(testAccountsLabel)));
    expect(main, isNot(contains(clientSeedPassword)));
    expect(main, isNot(contains(ownerSeedPassword)));
  });

  test('login and register forms are phone-only', () {
    final main = _read('lib/main.dart');

    expect(main, contains('Вход'));
    expect(main, contains('Регистрация'));
    expect(main, contains('Имя'));
    expect(main, contains('Номер телефона'));
    expect(main, contains('+7 ___ ___ __ __'));
    expect(main, contains('Пароль'));
    expect(main, contains('Повторите пароль'));
    expect(main, contains('Введите номер телефона'));
    expect(main, contains('Введите корректный номер'));
    expect(main, contains('Введите пароль'));
    expect(main, contains('Пароль должен быть не короче 6 символов'));
    expect(main, contains('Пароли не совпадают'));
    expect(main, contains('Введите имя'));
    expect(main, contains('Неверный номер или пароль'));
    expect(main, contains('Сервер недоступен. Проверьте подключение.'));
    expect(
      main,
      contains('Проверьте адрес сервера в настройках запуска приложения.'),
    );
    expect(main, contains('_normalizePhone'));
    expect(main, contains('_phoneDigits'));
    expect(main, contains('TextEditingController'));
    expect(main, contains('Показать пароль'));
    expect(main, contains('Войти'));
    expect(main, contains('Создать аккаунт'));
    expect(main, isNot(contains('TextInputType.emailAddress')));
    expect(main, isNot(contains('Телефон или ' 'Email')));
    expect(main, isNot(contains('Email, если вход по ' 'email')));
  });

  test(
    'passenger home has map, order sheet, route, tariff, price, and action',
    () {
      final passenger = _read('lib/features/passenger/passenger_shell.dart');

      expect(passenger, contains('FlutterMap'));
      expect(passenger, contains('_OrderSheet'));
      expect(passenger, contains('_MapOverlayHeader'));
      expect(passenger, contains('_MapRoundButton'));
      expect(passenger, contains('_MapInstructionCard'));
      expect(passenger, contains('_MapPermissionCard'));
      expect(passenger, contains('_MapRouteState'));
      expect(passenger, contains('Выбрать точку на карте'));
      expect(
        passenger,
        contains('Разрешите геолокацию или выберите точку посадки вручную.'),
      );
      expect(passenger, contains('Куда едем?'));
      expect(passenger, contains('Выберите точку посадки'));
      expect(passenger, contains('Выберите точку посадки на карте'));
      expect(passenger, contains('Выберите точку назначения на карте'));
      expect(passenger, contains('Введите точку назначения'));
      expect(passenger, contains('Адрес или ориентир'));
      expect(passenger, contains('Можно проще'));
      expect(passenger, contains('Координаты выбраны'));
      expect(passenger, contains('Тариф'));
      expect(passenger, contains('_TariffSection'));
      expect(passenger, contains('Тарифы пока не настроены'));
      expect(passenger, contains('_PriceSection'));
      expect(passenger, contains('Стоимость'));
      expect(passenger, contains('Маршрут временно недоступен.'));
      expect(passenger, contains('Считаем маршрут...'));
      expect(passenger, contains('Цена рассчитана сервером'));
      expect(passenger, contains('Заказать'));
    },
  );

  test('passenger stage 2 polish keeps one clear CTA and animated states', () {
    final passenger = _read('lib/features/passenger/passenger_shell.dart');

    expect(passenger, contains("cta == 'Рассчитать' || cta == 'Заказать'"));
    expect(passenger, contains('AnimatedSwitcher'));
    expect(passenger, contains('AnimatedSize'));
    expect(passenger, contains('AnimatedScale'));
    expect(passenger, contains('AnimatedContainer'));
    expect(passenger, contains('_CompactNotice'));
    expect(
      passenger,
      contains('Данные водителя появятся после принятия заказа.'),
    );
    expect(
      passenger,
      contains('Местоположение получено из реального обновления водителя.'),
    );
    expect(passenger, contains('_StatusStepper'));
  });

  test('stage 3 route preview stays server-driven with honest map states', () {
    final passenger = _read('lib/features/passenger/passenger_shell.dart');
    final api = _read('lib/core/api/api_client.dart');
    final models = _read('lib/features/shared/models.dart');

    expect(api, contains("'/api/routes/preview'"));
    expect(api, contains("'/api/routes/driver-to-pickup'"));
    expect(passenger, contains('PointSource.gps'));
    expect(passenger, contains('PointSource.map'));
    expect(passenger, contains('PointSource.manual'));
    expect(passenger, contains('PointSource.none'));
    expect(passenger, contains('Точка на карте'));
    expect(passenger, contains('Получаем геолокацию...'));
    expect(passenger, contains('initialCameraFit'));
    expect(passenger, contains('CameraFit.coordinates'));
    expect(passenger, contains('if (route.isNotEmpty)'));
    expect(passenger, contains('PolylineLayer'));
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

  test('route fields use A/B markers without home or house icons', () {
    final routeFields = _read('lib/core/widgets/route_fields.dart');
    final passenger = _read('lib/features/passenger/passenger_shell.dart');

    expect(routeFields, contains("label: 'A'"));
    expect(routeFields, contains("label: 'B'"));
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
    expect(
      passenger,
      isNot(
        contains(
          'Icons.'
          'home',
        ),
      ),
    );
    expect(
      passenger,
      isNot(
        contains(
          'Icons.'
          'house',
        ),
      ),
    );
  });

  test('driver tabs and premium driver states exist', () {
    final driver = _read('lib/features/driver/driver_shell.dart');

    expect(driver, contains("label: 'Линия'"));
    expect(driver, contains("label: 'Заказы'"));
    expect(driver, contains("label: 'Поездка'"));
    expect(driver, contains('_DriverStatusPanel'));
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
    expect(driver, contains('Принимаем...'));
    expect(driver, contains('Выйдите на линию, чтобы принимать заказы.'));
    expect(driver, contains('Заказ уже принят другим водителем'));
    expect(driver, contains('У вас уже есть активный заказ'));
    expect(driver, contains('_TripMap'));
    expect(driver, contains('CameraFit.coordinates'));
    expect(driver, contains('Маршрут до точки посадки'));
    expect(driver, contains('Маршрут временно недоступен'));
    expect(driver, contains("if (status == 'DRIVER_ASSIGNED')"));
    expect(driver, contains("if (status == 'DRIVER_ARRIVED')"));
    expect(driver, contains("if (status == 'IN_PROGRESS')"));
    expect(driver, contains('_tripActionLabel'));
  });

  test('stage 4.5 final visual QA guards compact premium mobile polish', () {
    final main = _read('lib/main.dart');
    final theme = _read('lib/core/theme/app_theme.dart');
    final passenger = _read('lib/features/passenger/passenger_shell.dart');
    final driver = _read('lib/features/driver/driver_shell.dart');
    final emptyState = _read('lib/core/widgets/empty_state.dart');
    final statusPill = _read('lib/core/widgets/status_pill.dart');

    expect(main, contains('final compact = size.height < 720'));
    expect(main, contains('AutofillGroup'));
    expect(main, contains('AutofillHints.telephoneNumber'));
    expect(main, contains('TextCapitalization.words'));
    expect(main, contains('WrapAlignment.center'));
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
    final statsPath = 'drivers/me/'
        'stats';
    final testAccountsLabel = 'Тестовые '
        'аккаунты';
    final clientSeedPassword = '123'
        '456';
    final ownerSeedPassword = 'ChangeMe_'
        '2026';

    expect(liveSource, isNot(contains(driverOrders)));
    expect(liveSource, isNot(contains(statsPath)));
    expect(liveSource, isNot(contains(testAccountsLabel)));
    expect(liveSource, isNot(contains(clientSeedPassword)));
    expect(liveSource, isNot(contains(ownerSeedPassword)));
  });
}
