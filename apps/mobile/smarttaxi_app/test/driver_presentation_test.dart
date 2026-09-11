import 'dart:io';
import 'dart:ui' as ui;
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:smarttaxi_app/core/theme/app_theme.dart';
import 'package:smarttaxi_app/features/driver/widgets/driver_common_widgets.dart';
import 'package:smarttaxi_app/features/driver/widgets/driver_line_widgets.dart';
import 'package:smarttaxi_app/features/driver/widgets/driver_order_widgets.dart';
import 'package:smarttaxi_app/features/shared/models.dart';
import 'package:smarttaxi_app/l10n/app_localizations.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUpAll(() async {
    await (FontLoader('Inter')
          ..addFont(rootBundle.load('assets/fonts/InterVariable.ttf')))
        .load();
    await (FontLoader('MaterialIcons')
          ..addFont(rootBundle.load('fonts/MaterialIcons-Regular.otf')))
        .load();
  });
  // Exercise the actual production cards, not approximations built from
  // stock buttons. Long names, Kazakh and enlarged type expose real overflow.
  for (final width in [320.0, 360.0, 390.0]) {
    for (final scale in [1.0, 1.3, 1.6]) {
      for (final locale in [const Locale('ru'), const Locale('kk')]) {
        for (final dark in [false, true]) {
          final variant = '$width/$scale/${locale.languageCode}/dark=$dark';
          testWidgets('shift and order cards remain usable $variant',
              (tester) async {
            tester.view.physicalSize = Size(width, 844);
            tester.view.devicePixelRatio = 1;
            addTearDown(tester.view.resetPhysicalSize);
            addTearDown(tester.view.resetDevicePixelRatio);
            var toggles = 0;
            var accepts = 0;
            final shiftBoundary = GlobalKey();
            final orderBoundary = GlobalKey();
            await tester.pumpWidget(MaterialApp(
              theme: dark ? buildSmartTaxiDarkTheme() : buildSmartTaxiTheme(),
              locale: locale,
              localizationsDelegates: AppLocalizations.localizationsDelegates,
              supportedLocales: AppLocalizations.supportedLocales,
              builder: (context, child) => MediaQuery(
                data: MediaQuery.of(context)
                    .copyWith(textScaler: TextScaler.linear(scale)),
                child: child!,
              ),
              home: Scaffold(
                body: ListView(
                  padding: const EdgeInsets.all(16),
                  children: [
                    RepaintBoundary(
                        key: shiftBoundary,
                        child: DriverShiftHero(
                          online: false,
                          busy: false,
                          loading: false,
                          regionName: 'Атакент (Ильич)',
                          driverName: 'Водитель с длинным именем',
                          todayEarnings: '125 700 ₸',
                          onToggle: () => toggles++,
                          onRegionTap: () {},
                        )),
                    const SizedBox(height: 12),
                    const DriverTodayStrip(
                      stats: null,
                      loading: false,
                      openOrders: 12,
                      demandLevel: 1.2,
                      demandLoading: false,
                    ),
                    const SizedBox(height: 12),
                    RepaintBoundary(
                        key: orderBoundary,
                        child: OrderCard(
                          order: const OrderSummary(
                            id: 'presentation-fixture',
                            status: 'SEARCHING_DRIVER',
                            pickup:
                                'улица Бектасова, 12, главный вход со стороны двора',
                            dropoff: 'Торговый центр, северный вход',
                            tariff: 'Эконом',
                            price: 700,
                            distanceKm: 3.5,
                            durationMin: 12,
                            paymentMethod: 'CASH',
                            riderName: 'Пассажир с длинным именем',
                          ),
                          accepting: false,
                          rejecting: false,
                          onAccept: () => accepts++,
                          onReject: () {},
                        )),
                  ],
                ),
              ),
            ));
            await tester.pumpAndSettle();
            expect(tester.takeException(), isNull);
            final shift = find.byType(DriverShiftHero);
            expect(tester.getSize(shift).width, width - 32);
            expect(tester.getSize(shift).height,
                lessThan(scale > 1.3 ? 320 : 270));
            final output = Platform.environment['DRIVER_DESIGN_QA_OUTPUT'];
            Future<void> capture(GlobalKey boundary, String name) async {
              if (output == null ||
                  width != 390 ||
                  scale != 1 ||
                  locale.languageCode != 'ru') {
                return;
              }
              final render = boundary.currentContext!.findRenderObject()!
                  as RenderRepaintBoundary;
              await tester.runAsync(() async {
                final picture = await render.toImage(pixelRatio: 2);
                final data =
                    (await picture.toByteData(format: ui.ImageByteFormat.png))!;
                await Directory(output).create(recursive: true);
                await File(
                        '$output/native-$name-${dark ? 'dark' : 'light'}.png')
                    .writeAsBytes(data.buffer.asUint8List());
                picture.dispose();
              });
            }

            await capture(shiftBoundary, 'shift');
            await tester.tap(find.byType(DriverGradientButton));
            expect(toggles, 1);
            final accept = find.descendant(
                of: find.byType(OrderCard),
                matching: find.byType(ElevatedButton));
            await tester.ensureVisible(accept);
            await tester.pumpAndSettle();
            await capture(orderBoundary, 'incoming');
            expect(tester.getSize(accept).height, greaterThanOrEqualTo(48));
            await tester.tap(accept);
            expect(accepts, 1);
            expect(tester.takeException(), isNull);
          });
        }
      }
    }
  }
}
