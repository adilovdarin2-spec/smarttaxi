import 'dart:io';
import 'dart:ui' as ui;
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:smarttaxi_app/core/theme/app_theme.dart';
import 'package:smarttaxi_app/features/driver/widgets/navigator_panels.dart';
import 'package:smarttaxi_app/features/driver/widgets/driver_common_widgets.dart';
import 'package:smarttaxi_app/l10n/app_localizations.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  for (final width in [320.0, 390.0]) {
    for (final scale in [1.0, 1.6]) {
      testWidgets('navigator trip action remains visible at $width/$scale',
          (tester) async {
        tester.view.physicalSize = Size(width, 568);
        tester.view.devicePixelRatio = 1;
        addTearDown(tester.view.resetPhysicalSize);
        addTearDown(tester.view.resetDevicePixelRatio);
        var pressed = 0;
        Future<void> render(bool loading) => tester.pumpWidget(MaterialApp(
              theme: buildSmartTaxiTheme(),
              locale: const Locale('ru'),
              localizationsDelegates: AppLocalizations.localizationsDelegates,
              supportedLocales: AppLocalizations.supportedLocales,
              builder: (context, child) => MediaQuery(
                  data: MediaQuery.of(context)
                      .copyWith(textScaler: TextScaler.linear(scale)),
                  child: child!),
              home: Scaffold(
                  body: Stack(children: [
                Positioned(
                    left: 14,
                    right: 14,
                    bottom: 14,
                    child: NavigatorTripControls(
                      maxHeight: 568 * .42,
                      panel: const NavigatorTripPanel(
                          targetLabel:
                              'улица Бектасова, 60, главный вход со стороны улицы',
                          speedKmh: 20,
                          distanceMeters: 240,
                          durationSeconds: 120,
                          idleLabel: 'GPS'),
                      action: DriverGradientButton(
                          text: 'Прибыл',
                          loading: loading,
                          onTap: () => pressed++),
                    ))
              ])),
            ));
        await render(false);
        await tester.pumpAndSettle();
        expect(tester.takeException(), isNull);
        final rect = tester.getRect(find.byType(DriverGradientButton));
        expect(rect.bottom, lessThanOrEqualTo(554));
        expect(rect.top, greaterThan(300));
        await tester.tap(find.byType(DriverGradientButton));
        expect(pressed, 1);
        await render(true);
        await tester.pump();
        await tester.tap(find.byType(DriverGradientButton));
        expect(pressed, 1);
        expect(tester.takeException(), isNull);
      });
    }
  }
  setUpAll(() async {
    await (FontLoader('Inter')
          ..addFont(rootBundle.load('assets/fonts/InterVariable.ttf')))
        .load();
    await (FontLoader('MaterialIcons')
          ..addFont(rootBundle.load('fonts/MaterialIcons-Regular.otf')))
        .load();
  });
  for (final width in [320.0, 390.0]) {
    for (final scale in [1.0, 1.6]) {
      for (final locale in ['ru', 'kk', 'uz', 'zh']) {
        for (final dark in [false, true]) {
          testWidgets('navigation panels $width/$scale/$locale/dark=$dark',
              (tester) async {
            tester.view.physicalSize = Size(width, 900);
            tester.view.devicePixelRatio = 1;
            addTearDown(tester.view.resetPhysicalSize);
            addTearDown(tester.view.resetDevicePixelRatio);
            final boundary = GlobalKey();
            const warningKey = ValueKey('warning');
            await tester.pumpWidget(MaterialApp(
              theme: dark ? buildSmartTaxiDarkTheme() : buildSmartTaxiTheme(),
              locale: Locale(locale),
              localizationsDelegates: AppLocalizations.localizationsDelegates,
              supportedLocales: AppLocalizations.supportedLocales,
              builder: (context, child) => MediaQuery(
                  data: MediaQuery.of(context)
                      .copyWith(textScaler: TextScaler.linear(scale)),
                  child: child!),
              home: Scaffold(body: Builder(builder: (context) {
                final l10n = AppLocalizations.of(context);
                return ListView(padding: const EdgeInsets.all(14), children: [
                  RepaintBoundary(
                    key: boundary,
                    child: ColoredBox(
                        color: Theme.of(context).scaffoldBackgroundColor,
                        child: Padding(
                            padding: const EdgeInsets.all(2),
                            child: Column(children: [
                              NavigatorStatusStack(
                                maneuver: NavigatorManeuverBanner(
                                    label: l10n.driverManeuverTurnRight,
                                    icon: Icons.turn_right_rounded,
                                    distanceMeters: 120,
                                    streetName:
                                        'улица Бектасова, выезд на улицу Кожанова'),
                                warning: NavigatorRoadWarning(
                                    key: warningKey,
                                    text: l10n.driverCameraNowVoice),
                              ),
                              const SizedBox(height: 20),
                              NavigatorTripPanel(
                                  targetLabel: 'улица Кожанова, 34, Мырзакент',
                                  targetIcon: Icons.place_rounded,
                                  speedKmh: 45,
                                  speedLimit: 60,
                                  distanceMeters: 2400,
                                  durationSeconds: 360,
                                  idleLabel: l10n.driverNavigatorNoRouteLabel,
                                  now: DateTime(2026, 9, 9, 12, 0)),
                            ]))),
                  ),
                ]);
              })),
            ));
            await tester.pumpAndSettle();
            expect(tester.takeException(), isNull);
            final turn = tester.getRect(find.byType(NavigatorManeuverBanner));
            final warning = tester.getRect(find.byKey(warningKey));
            expect(warning.top, greaterThanOrEqualTo(turn.bottom + 7));
            expect(tester.getSize(find.byType(NavigatorTripPanel)).width,
                width - 32);
            final output = Platform.environment['NAVIGATOR_QA_OUTPUT'];
            if (output != null &&
                locale == 'ru' &&
                ((width == 390 && scale == 1) ||
                    (width == 320 && scale == 1.6))) {
              final render = boundary.currentContext!.findRenderObject()!
                  as RenderRepaintBoundary;
              await tester.runAsync(() async {
                final picture = await render.toImage(pixelRatio: 2);
                final data =
                    (await picture.toByteData(format: ui.ImageByteFormat.png))!;
                await Directory(output).create(recursive: true);
                await File(
                        '$output/navigator-panels-${width.toInt()}-$scale-${dark ? 'dark' : 'light'}.png')
                    .writeAsBytes(data.buffer.asUint8List());
                picture.dispose();
              });
            }
          });
        }
      }
    }
  }
  testWidgets('GPS failure replaces the turn and unknown speed is not zero',
      (tester) async {
    await tester.pumpWidget(MaterialApp(
      theme: buildSmartTaxiTheme(),
      locale: const Locale('ru'),
      localizationsDelegates: AppLocalizations.localizationsDelegates,
      supportedLocales: AppLocalizations.supportedLocales,
      home: const Scaffold(
          body: Column(children: [
        NavigatorStatusStack(
            status: Text('GPS lost'),
            maneuver: NavigatorManeuverBanner(
                label: 'Turn now', icon: Icons.turn_right, distanceMeters: 5)),
        NavigatorTripPanel(idleLabel: 'GPS lost'),
      ])),
    ));
    await tester.pumpAndSettle();
    expect(find.text('Turn now'), findsNothing);
    expect(find.text('0'), findsNothing);
    expect(find.text('—'), findsNWidgets(2));
    expect(tester.takeException(), isNull);
  });
}
