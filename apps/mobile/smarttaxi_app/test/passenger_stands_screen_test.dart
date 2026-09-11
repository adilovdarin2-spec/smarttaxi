import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:smarttaxi_app/core/theme/app_theme.dart';
import 'package:smarttaxi_app/features/passenger/screens/stands/passenger_stands_screen.dart';
import 'package:smarttaxi_app/features/shared/models.dart';
import 'package:smarttaxi_app/l10n/app_localizations.dart';

// What the rider is deciding from: where this car is going, what a seat costs,
// whether there is room, and how to reach the driver. Rendered at 320px and at
// large text, because a bazaar is not where anyone zooms in to read.

StandQueueEntry _entry({int taken = 1, int total = 4, String status = 'BOARDING'}) {
  return StandQueueEntry.fromJson({
    'id': 'e1',
    'standId': 's1',
    'driverId': 'd1',
    'status': status,
    'position': 1,
    'totalSeats': total,
    'takenSeats': taken,
    'destinationLabel': 'Шымкент',
    'pricePerSeat': 2500,
    'comment': 'Выезжаю по заполнению',
    'driver': {
      'name': 'Ержан',
      'phone': '+77010000001',
      'carModel': 'Gentra',
      'carColor': 'Белый',
      'plate': '123ABC13',
      'rating': 4.85,
    },
  });
}

Future<void> _pump(WidgetTester tester, Widget child,
    {bool dark = false, double scale = 1.0}) async {
  tester.view.physicalSize = const Size(320, 1200);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  await tester.pumpWidget(
    MaterialApp(
      locale: const Locale('ru'),
      supportedLocales: AppLocalizations.supportedLocales,
      localizationsDelegates: AppLocalizations.localizationsDelegates,
      theme: dark ? buildSmartTaxiDarkTheme() : buildSmartTaxiTheme(),
      home: MediaQuery(
        data: MediaQueryData(textScaler: TextScaler.linear(scale)),
        child: Scaffold(
          body: ListView(padding: const EdgeInsets.all(16), children: [child]),
        ),
      ),
    ),
  );
  await tester.pumpAndSettle();
}

void main() {
  for (final dark in [false, true]) {
    for (final scale in [1.0, 1.6]) {
      testWidgets('a car on the stand reads at 320px ${dark ? 'dark' : 'light'} at $scale',
          (tester) async {
        await _pump(
          tester,
          PassengerStandCarCard(
            entry: _entry(),
            busy: false,
            alreadyReserved: false,
            onCall: (_) async {},
            onReserve: (_) async {},
          ),
          dark: dark,
          scale: scale,
        );
        expect(tester.takeException(), isNull);
        expect(find.text('Шымкент'), findsOneWidget);
        expect(find.text('2500 ₸ за место'), findsOneWidget);
        expect(find.text('3 свободных места'), findsOneWidget);
        expect(find.textContaining('123ABC13'), findsOneWidget);
        expect(find.text('Позвонить'), findsOneWidget);
        expect(find.text('Забронировать место'), findsOneWidget);
      });
    }
  }

  testWidgets('a full car cannot be booked', (tester) async {
    await _pump(
      tester,
      PassengerStandCarCard(
        entry: _entry(taken: 4),
        busy: false,
        alreadyReserved: false,
        onCall: (_) async {},
        onReserve: (_) async {},
      ),
    );
    expect(tester.takeException(), isNull);
    expect(find.text('0 свободных мест'), findsOneWidget);
    final reserve = tester.widget<FilledButton>(
      find.widgetWithText(FilledButton, 'Забронировать место'),
    );
    expect(reserve.onPressed, isNull);
    // Calling the driver stays available: a full car is still worth asking.
    final call = tester.widget<OutlinedButton>(
      find.widgetWithText(OutlinedButton, 'Позвонить'),
    );
    expect(call.onPressed, isNotNull);
  });

  testWidgets('a rider who already holds a seat is not offered a second',
      (tester) async {
    await _pump(
      tester,
      PassengerStandCarCard(
        entry: _entry(),
        busy: false,
        alreadyReserved: true,
        onCall: (_) async {},
        onReserve: (_) async {},
      ),
    );
    expect(tester.takeException(), isNull);
    final reserve = tester.widget<FilledButton>(
      find.widgetWithText(FilledButton, 'Забронировать место'),
    );
    expect(reserve.onPressed, isNull);
  });

  testWidgets('a pending reservation says it is still waiting on the driver',
      (tester) async {
    await _pump(
      tester,
      PassengerStandReservationBanner(
        reservation: StandSeatReservation.fromJson(const {
          'id': 'r1',
          'entryId': 'e1',
          'standId': 's1',
          'seats': 1,
          'status': 'PENDING',
          'source': 'APP',
          'standName': 'Базар, межгород',
          'driver': {
            'name': 'Ержан',
            'phone': '+77010000001',
            'carModel': 'Gentra',
            'carColor': 'Белый',
            'plate': '123ABC13',
          },
        }),
        busy: false,
        onCancel: () async {},
      ),
    );
    expect(tester.takeException(), isNull);
    expect(find.text('Ваша бронь на стоянке'), findsOneWidget);
    expect(find.textContaining('Базар, межгород'), findsOneWidget);
    expect(find.text('Ждём подтверждения водителя'), findsOneWidget);
    expect(find.text('Отменить бронь'), findsOneWidget);
  });

  testWidgets('a confirmed reservation says so plainly', (tester) async {
    await _pump(
      tester,
      PassengerStandReservationBanner(
        reservation: StandSeatReservation.fromJson(const {
          'id': 'r1',
          'entryId': 'e1',
          'standId': 's1',
          'seats': 2,
          'status': 'CONFIRMED',
          'source': 'APP',
          'standName': 'Базар, межгород',
          'driver': {'name': 'Ержан', 'phone': '+77010000001', 'plate': '123ABC13'},
        }),
        busy: false,
        onCancel: () async {},
      ),
    );
    expect(tester.takeException(), isNull);
    expect(find.text('Место подтверждено'), findsOneWidget);
    expect(find.textContaining('2 места'), findsOneWidget);
  });

  testWidgets('only cars that are actually loading are offered to the rider',
      (tester) async {
    final view = StandQueueView.fromJson({
      'stand': const {
        'id': 's1',
        'regionId': 'r1',
        'name': 'Базар, межгород',
        'kind': 'INTERCITY',
        'lat': 40.663,
        'lng': 68.553,
        'radiusM': 200,
        'driversCount': 2,
        'freeSeats': 3,
        'isActive': true,
      },
      'entries': [
        _entryJson('e1', 'BOARDING', 1),
        // Second in line: waiting its turn, and promising a seat in it would
        // promise something its driver cannot deliver.
        _entryJson('e2', 'WAITING', 2),
      ],
    });
    tester.view.physicalSize = const Size(360, 1400);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    await tester.pumpWidget(
      MaterialApp(
        locale: const Locale('ru'),
        supportedLocales: AppLocalizations.supportedLocales,
        localizationsDelegates: AppLocalizations.localizationsDelegates,
        theme: buildSmartTaxiTheme(),
        home: Scaffold(
          body: PassengerStandSheet(
            view: view,
            reservation: null,
            busy: false,
            onCall: (_) async {},
            onReserve: (_) async {},
            onCancelReservation: () async {},
            error: null,
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
    expect(find.text('Машины на стоянке'), findsOneWidget);
    expect(find.text('Забронировать место'), findsOneWidget);
  });
}

Map<String, dynamic> _entryJson(String id, String status, int position) => {
      'id': id,
      'standId': 's1',
      'driverId': 'd-$id',
      'status': status,
      'position': position,
      'totalSeats': 4,
      'takenSeats': 1,
      'destinationLabel': 'Шымкент',
      'pricePerSeat': 2500,
      'driver': {
        'name': 'Ержан',
        'phone': '+77010000001',
        'carModel': 'Gentra',
        'carColor': 'Белый',
        'plate': '123ABC13',
      },
    };
