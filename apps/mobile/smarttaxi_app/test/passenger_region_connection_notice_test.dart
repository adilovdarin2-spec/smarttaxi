import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:smarttaxi_app/core/theme/app_theme.dart';
import 'package:smarttaxi_app/features/passenger/widgets/passenger_region_connection_notice.dart';
import 'package:smarttaxi_app/l10n/app_localizations.dart';

void main() {
  for (final dark in [false, true]) {
    for (final scale in [1.0, 1.6]) {
      testWidgets(
        'region recovery fits 320px ${dark ? 'dark' : 'light'} at $scale',
        (tester) async {
          tester.view.physicalSize = const Size(320, 360);
          tester.view.devicePixelRatio = 1;
          addTearDown(tester.view.resetPhysicalSize);
          addTearDown(tester.view.resetDevicePixelRatio);
          var retries = 0;
          await tester.pumpWidget(
            MaterialApp(
              locale: const Locale('ru'),
              supportedLocales: AppLocalizations.supportedLocales,
              localizationsDelegates: AppLocalizations.localizationsDelegates,
              theme: dark ? buildSmartTaxiDarkTheme() : buildSmartTaxiTheme(),
              home: MediaQuery(
                data: MediaQueryData(textScaler: TextScaler.linear(scale)),
                child: Scaffold(
                  body: SingleChildScrollView(
                    child: Padding(
                      padding: const EdgeInsets.all(8),
                      child: PassengerRegionConnectionNotice(
                        loading: false,
                        onRetry: () => retries += 1,
                      ),
                    ),
                  ),
                ),
              ),
            ),
          );
          await tester.pumpAndSettle();
          expect(tester.takeException(), isNull);
          expect(
              find.text('Активные регионы пока не загружены'), findsOneWidget);
          expect(find.text('Повторить'), findsOneWidget);
          await tester.ensureVisible(find.text('Повторить'));
          await tester.tap(find.text('Повторить'));
          expect(retries, 1);
        },
      );
    }
  }

  testWidgets('loading region recovery is disabled and shows progress',
      (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        locale: const Locale('ru'),
        supportedLocales: AppLocalizations.supportedLocales,
        localizationsDelegates: AppLocalizations.localizationsDelegates,
        theme: buildSmartTaxiTheme(),
        home: Scaffold(
          body: PassengerRegionConnectionNotice(
            loading: true,
            onRetry: () => fail('disabled recovery must not run'),
          ),
        ),
      ),
    );
    expect(tester.takeException(), isNull);
    expect(find.byType(CircularProgressIndicator), findsOneWidget);
    expect(tester.widget<OutlinedButton>(find.byType(OutlinedButton)).onPressed,
        isNull);
  });
}
