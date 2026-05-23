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
      .where((line) =>
          line.contains('Text(') ||
          line.contains('InputDecoration') ||
          line.contains('SnackBar') ||
          line.contains('_InlineMessage') ||
          line.contains('title:') ||
          line.contains('subtitle:') ||
          line.contains('labelText') ||
          line.contains('child: Text') ||
          line.contains('tooltip:'))
      .join('\n')
      .toLowerCase();
}

void main() {
  test('map configuration is explicit and attributed', () {
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
    final testAccountsLabel = 'Тестовые ' 'аккаунты';
    final clientSeedPassword = '123' '456';
    final ownerSeedPassword = 'ChangeMe_' '2026';

    expect(main, contains('AppSession.splash'));
    expect(main, contains('AppSession.auth'));
    expect(main, contains('Региональное такси рядом с вами'));
    expect(main, contains('Номер телефона'));
    expect(main, contains('Создать аккаунт'));
    expect(main, contains('Продолжая, вы соглашаетесь с правилами сервиса'));
    expect(main, isNot(contains('Телефон или Email')));
    expect(main, isNot(contains('Email, если вход по email')));
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
    expect(main, contains('_normalizePhone'));
    expect(main, contains('_phoneDigits'));
    expect(main, contains('Показать пароль'));
    expect(main, contains('Войти'));
    expect(main, contains('Создать аккаунт'));
    expect(main, isNot(contains('TextInputType.emailAddress')));
    expect(main, isNot(contains('Телефон или Email')));
    expect(main, isNot(contains('Email, если вход по email')));
  });

  test('passenger home has map, order sheet, route, tariff, price, and action',
      () {
    final passenger = _read('lib/features/passenger/passenger_shell.dart');

    expect(passenger, contains('FlutterMap'));
    expect(passenger, contains('_OrderSheet'));
    expect(passenger, contains('_MapOverlayHeader'));
    expect(passenger, contains('_MapRoundButton'));
    expect(passenger, contains('Выбрать точку на карте'));
    expect(passenger,
        contains('Разрешите геолокацию или выберите точку посадки вручную'));
    expect(passenger, contains('Куда едем?'));
    expect(passenger, contains('Выберите точку посадки'));
    expect(passenger, contains('Введите точку назначения'));
    expect(passenger, contains('Тариф'));
    expect(passenger, contains('_TariffSection'));
    expect(passenger, contains('_PriceSection'));
    expect(passenger, contains('Стоимость'));
    expect(passenger, contains('Заказать'));
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
    final publicSwitchA = 'Пассажир / ' 'Водитель';
    final publicSwitchB = 'Passenger / ' 'Driver';

    expect(main, isNot(contains('Segmented' 'Button')));
    expect(main, isNot(contains('Button' 'Segment')));
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
    expect(routeFields, isNot(contains('Icons.' 'home')));
    expect(routeFields, isNot(contains('Icons.' 'house')));
    expect(passenger, isNot(contains('Icons.' 'home')));
    expect(passenger, isNot(contains('Icons.' 'house')));
  });

  test('driver tabs and premium driver states exist', () {
    final driver = _read('lib/features/driver/driver_shell.dart');

    expect(driver, contains("label: 'Линия'"));
    expect(driver, contains("label: 'Заказы'"));
    expect(driver, contains("label: 'Поездка'"));
    expect(driver, contains('_DriverStatusStepper'));
    expect(driver, contains('_LineGlyph'));
    expect(driver, contains('Выйдите на линию, чтобы получать заказы'));
    expect(driver, contains('Заказов в вашем регионе пока нет'));
  });

  test(
      'become driver flow submits a real application or shows production state',
      () {
    final api = _read('lib/core/api/api_client.dart');
    final passenger = _read('lib/features/passenger/passenger_shell.dart');

    expect(api, contains("'/api/admin/driver-applications'"));
    expect(passenger, contains('Отправить заявку'));
    expect(passenger,
        contains('Заявка отправлена. Администратор проверит данные.'));
  });

  test('live Flutter UI has no placeholder or technical visible copy', () {
    final blocked = [
      'fa' 'ke',
      'mo' 'ck',
      'de' 'mo',
      'de' 'bug',
      'de' 'v',
      'back' 'end',
      'end' 'point',
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
    final liveSource =
        _dartFiles('lib').map((file) => _read(file.path)).join('\n');
    final driverOrders = 'DRIVER_' 'ORDERS';
    final statsPath = 'drivers/me/' 'stats';
    final testAccountsLabel = 'Тестовые ' 'аккаунты';
    final clientSeedPassword = '123' '456';
    final ownerSeedPassword = 'ChangeMe_' '2026';

    expect(liveSource, isNot(contains(driverOrders)));
    expect(liveSource, isNot(contains(statsPath)));
    expect(liveSource, isNot(contains(testAccountsLabel)));
    expect(liveSource, isNot(contains(clientSeedPassword)));
    expect(liveSource, isNot(contains(ownerSeedPassword)));
  });
}
