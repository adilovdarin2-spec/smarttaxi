import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:smarttaxi_app/core/theme/app_theme.dart';
import 'package:smarttaxi_app/core/widgets/account_action_row.dart';
import 'package:smarttaxi_app/features/driver/widgets/driver_profile_widgets.dart';
import 'package:smarttaxi_app/features/shared/models.dart';
import 'package:smarttaxi_app/l10n/app_localizations.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  for (final dark in [false, true]) {
    testWidgets('Account rows fit narrow screens with large text, dark=$dark',
        (tester) async {
      await tester.binding.setSurfaceSize(const Size(320, 900));
      addTearDown(() => tester.binding.setSurfaceSize(null));
      var taps = 0;
      await tester.pumpWidget(MaterialApp(
        theme: dark ? buildSmartTaxiDarkTheme() : buildSmartTaxiTheme(),
        home: MediaQuery(
          data: const MediaQueryData(textScaler: TextScaler.linear(1.8)),
          child: Scaffold(
              body: Padding(
            padding: const EdgeInsets.all(20),
            child: AccountActionRow(
              icon: Icons.notifications_outlined,
              title: 'Уведомления о поездках и ответы поддержки',
              subtitle: 'Разрешения можно изменить в настройках устройства',
              selected: true,
              onTap: () => taps++,
            ),
          )),
        ),
      ));
      expect(tester.takeException(), isNull);
      expect(find.byIcon(Icons.check_circle_rounded), findsOneWidget);
      await tester.tap(find.text('Уведомления о поездках и ответы поддержки'));
      expect(taps, 1);
    });
  }

  testWidgets(
      'Driver history preserves both endpoints and fits long account values',
      (tester) async {
    await tester.binding.setSurfaceSize(const Size(320, 900));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    await tester.pumpWidget(MaterialApp(
      theme: buildSmartTaxiTheme(),
      locale: const Locale('ru'),
      localizationsDelegates: AppLocalizations.localizationsDelegates,
      supportedLocales: AppLocalizations.supportedLocales,
      home: const Scaffold(
          body: SingleChildScrollView(
              child: Padding(
        padding: EdgeInsets.all(20),
        child: Column(children: [
          DriverProfileRow(
              label: 'Рабочий регион',
              value: 'Очень длинное название рабочего региона'),
          DriverTripHistoryCard(
              trip: OrderSummary(
            id: 'local-presentation',
            status: 'PAID',
            pickup: 'улица Бектасова, 60, Мырзакент',
            dropoff: 'улица Абая, 42, Мырзакент',
            price: 700,
          )),
        ]),
      ))),
    ));
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
    expect(find.text('улица Бектасова, 60, Мырзакент'), findsOneWidget);
    expect(find.text('улица Абая, 42, Мырзакент'), findsOneWidget);
  });

  for (final tariff in ['economy', 'delivery']) {
    test('Bundled $tariff vehicle is present and decodes', () async {
      final asset = await rootBundle
          .load('assets/cars/tariff_${tariff}_smarttaxi_v3.png');
      final codec = await ui.instantiateImageCodec(asset.buffer.asUint8List());
      final frame = await codec.getNextFrame();
      expect(frame.image.width, greaterThan(100));
      frame.image.dispose();
      codec.dispose();
    });
  }
}
