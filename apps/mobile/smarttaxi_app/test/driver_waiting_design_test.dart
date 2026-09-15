import 'dart:io';
import 'dart:ui' as ui;
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:smarttaxi_app/core/theme/app_theme.dart';
import 'package:smarttaxi_app/features/driver/widgets/driver_common_widgets.dart';
import 'package:smarttaxi_app/features/driver/widgets/driver_order_widgets.dart';
import 'package:smarttaxi_app/features/driver/widgets/driver_route_summary.dart';
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
  final start = DateTime.utc(2026, 9, 9, 12);
  for (final width in [320.0, 390.0]) {
    for (final scale in [1.0, 1.6]) {
      for (final paid in [false, true]) {
        testWidgets(
            'waiting sheet $width/$scale paid=$paid keeps real time and action',
            (tester) async {
          tester.view.physicalSize = Size(width, 844);
          tester.view.devicePixelRatio = 1;
          addTearDown(tester.view.resetPhysicalSize);
          addTearDown(tester.view.resetDevicePixelRatio);
          var presses = 0;
          final boundary = GlobalKey();
          await tester.pumpWidget(MaterialApp(
            theme: buildSmartTaxiTheme(),
            locale: const Locale('ru'),
            localizationsDelegates: AppLocalizations.localizationsDelegates,
            supportedLocales: AppLocalizations.supportedLocales,
            builder: (context, child) => MediaQuery(
                data: MediaQuery.of(context)
                    .copyWith(textScaler: TextScaler.linear(scale)),
                child: child!),
            home: Scaffold(
                bottomNavigationBar: const SizedBox(height: 68),
                body: DriverTripLayout(
                  body: ListView(children: [
                    RepaintBoundary(
                        key: boundary,
                        child: DriverTripSheet(
                            child: Column(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            const Text('Ожидание клиента',
                                style: TextStyle(
                                    fontSize: 21, fontWeight: FontWeight.w700)),
                            const SizedBox(height: 12),
                            const DriverStatusStepper(
                                status: 'WAITING_CLIENT', compact: true),
                            const SizedBox(height: 16),
                            DriverWaitingTimerCard(
                                waitingStartedAt: start,
                                freeWaitingUntil:
                                    start.add(const Duration(minutes: 3)),
                                waitingPricePerMinute: 20,
                                now: () => start
                                    .add(Duration(seconds: paid ? 270 : 30))),
                            const SizedBox(height: 18),
                            const DriverRouteSummary(
                                pickup:
                                    'улица Бектасова, 12, главный вход со стороны двора',
                                dropoff: 'улица Кожанова, 34, Мырзакент'),
                          ],
                        )))
                  ]),
                  action: DriverGradientButton(
                      text: 'Начать поездку', onTap: () => presses++),
                )),
          ));
          await tester.pumpAndSettle();
          expect(tester.takeException(), isNull);
          expect(find.text(paid ? '01:30' : '02:30'), findsOneWidget);
          if (paid) expect(find.text('+40 ₸'), findsOneWidget);
          final ring = tester.widget<CircularProgressIndicator>(
              find.byType(CircularProgressIndicator));
          expect(ring.value, paid ? 1 : closeTo(5 / 6, .001));
          final fullAddress = tester.widget<Text>(
              find.text('улица Бектасова, 12, главный вход со стороны двора'));
          expect(fullAddress.maxLines, isNull);
          final button = find.byType(DriverGradientButton);
          expect(tester.getRect(button).bottom, lessThanOrEqualTo(776));
          await tester.tap(button);
          expect(presses, 1);
          final output = Platform.environment['DRIVER_DESIGN_QA_OUTPUT'];
          if (output != null && width == 390 && scale == 1) {
            final render = boundary.currentContext!.findRenderObject()!
                as RenderRepaintBoundary;
            await tester.runAsync(() async {
              final picture = await render.toImage(pixelRatio: 2);
              final data =
                  (await picture.toByteData(format: ui.ImageByteFormat.png))!;
              await Directory(output).create(recursive: true);
              await File('$output/native-waiting-${paid ? 'paid' : 'free'}.png')
                  .writeAsBytes(data.buffer.asUint8List());
              picture.dispose();
            });
          }
          await tester.pumpWidget(const SizedBox());
          await tester.pump(const Duration(seconds: 2));
          expect(tester.takeException(), isNull);
        });
      }
    }
  }
}
