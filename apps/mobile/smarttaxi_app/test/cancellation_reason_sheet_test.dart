import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:smarttaxi_app/core/theme/app_theme.dart';
import 'package:smarttaxi_app/features/shared/cancellation_reason_sheet.dart';
import 'package:smarttaxi_app/l10n/app_localizations.dart';

// The sheet is the only place the two halves of an off-book trip become
// visible: a driver saying why they cancelled at the door, and a rider saying
// the driver asked them to. Everything below is about that sentence surviving
// intact — and about the sheet never cancelling a trip on its own.

Future<CancellationReason?> _open(
  WidgetTester tester, {
  required bool isDriver,
  bool dark = false,
  double scale = 1.0,
  Size size = const Size(320, 640),
}) async {
  tester.view.physicalSize = size;
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);

  CancellationReason? result;
  var opened = false;
  await tester.pumpWidget(
    MaterialApp(
      locale: const Locale('ru'),
      supportedLocales: AppLocalizations.supportedLocales,
      localizationsDelegates: AppLocalizations.localizationsDelegates,
      theme: dark ? buildSmartTaxiDarkTheme() : buildSmartTaxiTheme(),
      home: MediaQuery(
        data: MediaQueryData(textScaler: TextScaler.linear(scale)),
        child: Builder(
          builder: (context) => Scaffold(
            body: Center(
              child: ElevatedButton(
                onPressed: () async {
                  opened = true;
                  result = await askCancellationReason(context,
                      isDriver: isDriver);
                },
                child: const Text('open'),
              ),
            ),
          ),
        ),
      ),
    ),
  );
  await tester.tap(find.text('open'));
  await tester.pumpAndSettle();
  expect(opened, isTrue);
  return result;
}

void main() {
  for (final dark in [false, true]) {
    for (final scale in [1.0, 1.6]) {
      testWidgets(
        'driver reasons fit 320px ${dark ? 'dark' : 'light'} at $scale',
        (tester) async {
          await _open(tester, isDriver: true, dark: dark, scale: scale);
          expect(tester.takeException(), isNull);
          expect(find.text('Почему отменяете поездку?'), findsOneWidget);
          expect(find.text('Пассажир не вышел'), findsOneWidget);
          expect(find.text('Пассажир попросил отменить'), findsOneWidget);
        },
      );
    }
  }

  testWidgets('a trip is never cancelled until a reason is chosen',
      (tester) async {
    await _open(tester, isDriver: true);
    final submit = find.widgetWithText(FilledButton, 'Отменить поездку');
    expect(submit, findsOneWidget);
    expect(
      tester.widget<FilledButton>(submit).onPressed,
      isNull,
      reason: 'an unexplained cancellation is exactly what this must surface',
    );

    await tester.tap(find.text('Пассажир не вышел'));
    await tester.pumpAndSettle();
    expect(tester.widget<FilledButton>(submit).onPressed, isNotNull);
  });

  testWidgets('backing out keeps the trip rather than cancelling it silently',
      (tester) async {
    CancellationReason? captured;
    tester.view.physicalSize = const Size(360, 720);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    await tester.pumpWidget(
      MaterialApp(
        locale: const Locale('ru'),
        supportedLocales: AppLocalizations.supportedLocales,
        localizationsDelegates: AppLocalizations.localizationsDelegates,
        theme: buildSmartTaxiTheme(),
        home: Builder(
          builder: (context) => Scaffold(
            body: Center(
              child: ElevatedButton(
                onPressed: () async {
                  captured =
                      await askCancellationReason(context, isDriver: true);
                },
                child: const Text('open'),
              ),
            ),
          ),
        ),
      ),
    );
    await tester.tap(find.text('open'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Не отменять'));
    await tester.pumpAndSettle();
    expect(captured, isNull);
  });

  testWidgets('the rider can say the driver asked them to cancel',
      (tester) async {
    CancellationReason? captured;
    tester.view.physicalSize = const Size(360, 720);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    await tester.pumpWidget(
      MaterialApp(
        locale: const Locale('ru'),
        supportedLocales: AppLocalizations.supportedLocales,
        localizationsDelegates: AppLocalizations.localizationsDelegates,
        theme: buildSmartTaxiTheme(),
        home: Builder(
          builder: (context) => Scaffold(
            body: Center(
              child: ElevatedButton(
                onPressed: () async {
                  captured =
                      await askCancellationReason(context, isDriver: false);
                },
                child: const Text('open'),
              ),
            ),
          ),
        ),
      ),
    );
    await tester.tap(find.text('open'));
    await tester.pumpAndSettle();
    expect(find.text('Водитель попросил отменить'), findsOneWidget);
    await tester.tap(find.text('Водитель попросил отменить'));
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(FilledButton, 'Отменить поездку'));
    await tester.pumpAndSettle();
    expect(captured?.code, 'DRIVER_ASKED_TO_CANCEL');
  });

  test('reason codes match the ones the server accepts', () {
    // These lists are the contract. A code the server does not know is
    // rejected as a validation error at the worst possible moment — the
    // driver is at the door and the rider is waiting.
    expect(driverCancelReasonCodes, [
      'CLIENT_NO_SHOW',
      'CLIENT_ASKED',
      'WRONG_ADDRESS',
      'CAR_PROBLEM',
      'TOO_FAR',
      'OTHER',
    ]);
    expect(clientCancelReasonCodes, [
      'CHANGED_MIND',
      'DRIVER_ASKED_TO_CANCEL',
      'WAITED_TOO_LONG',
      'FOUND_ANOTHER_CAR',
      'WRONG_ADDRESS',
      'OTHER',
    ]);
  });
}
