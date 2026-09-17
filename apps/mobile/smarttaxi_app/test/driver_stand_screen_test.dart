import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:smarttaxi_app/core/theme/app_theme.dart';
import 'package:smarttaxi_app/features/driver/screens/stand/driver_stand_screen.dart';
import 'package:smarttaxi_app/features/driver/widgets/driver_common_widgets.dart';
import 'package:smarttaxi_app/features/shared/models.dart';
import 'package:smarttaxi_app/l10n/app_localizations.dart';

// The driver's place in a line is the screen they stand in front of a stand
// looking at. It has to render — with the seat counter, the offer and the rest
// of the line — on a small phone, in both themes, at large text.

final _stand = TaxiStand.fromJson(const {
  'id': 's1',
  'regionId': 'r1',
  'name': 'Базар, межгород',
  'kind': 'INTERCITY',
  'lat': 40.663032,
  'lng': 68.553626,
  'radiusM': 200,
  'boardingSlots': 1,
  'defaultSeats': 4,
  'driversCount': 1,
  'freeSeats': 3,
  'isActive': true,
  'note': 'Заезд со стороны улицы Абая',
});

MyStandPlace _place({int taken = 1, int pending = 0, int manual = 1, List<Map<String, dynamic>> reservations = const []}) {
  final entry = {
    'id': 'e1',
    'standId': 's1',
    'driverId': 'd1',
    'status': 'BOARDING',
    'position': 1,
    'totalSeats': 4,
    'takenSeats': taken,
    'pendingSeats': pending,
    'manualSeats': manual,
    'destinationLabel': 'Шымкент',
    'pricePerSeat': 3000,
    'comment': 'Выезжаю по заполнению',
    'reservations': reservations,
    'driver': {
      'name': 'Test Driver',
      'phone': '+77000000000',
      'carModel': 'Toyota Camry',
      'carColor': 'Белый',
      'plate': '777AAA17',
    },
  };
  return MyStandPlace.fromJson({
    'entry': entry,
    'stand': {
      'id': 's1',
      'regionId': 'r1',
      'name': 'Базар, межгород',
      'kind': 'INTERCITY',
      'lat': 40.663032,
      'lng': 68.553626,
      'radiusM': 200,
      'boardingSlots': 1,
      'defaultSeats': 4,
      'driversCount': 1,
      'freeSeats': 3,
      'isActive': true,
    },
    'queue': [entry],
  });
}

Future<void> _pump(WidgetTester tester, Widget child,
    {bool dark = false, double scale = 1.0, Size size = const Size(320, 1400)}) async {
  tester.view.physicalSize = size;
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
          // Deliberately the same shape the screen uses: the section sits in a
          // ListView, where it is handed unbounded height. That is exactly the
          // condition a Column inside an Expanded fails under.
          body: ListView(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
            children: [child],
          ),
        ),
      ),
    ),
  );
  await tester.pumpAndSettle();
}

void main() {
  for (final dark in [false, true]) {
    testWidgets('held seats block addition and app seats block manual release, dark=$dark', (tester) async {
      var adds = 0;
      var releases = 0;
      await _pump(tester, DriverStandPlaceSection(
        place: _place(taken: 1, pending: 3, manual: 0), presence: null, busy: false,
        onAddSeat: () async { adds++; }, onReleaseSeat: () async { releases++; },
        onEditOffer: () async {}, onDepart: () async {}, onLeave: () async {},
        onGiveTurn: () async {}, onRespond: (_, __) async {},
      ), dark: dark, scale: 1.6);
      expect(find.text('Ожидают подтверждения: 3 места'), findsOneWidget);
      final add = tester.widget<FilledButton>(find.widgetWithText(FilledButton, '+1 место'));
      expect(add.onPressed, isNull);
      final release = tester.widget<OutlinedButton>(find.ancestor(of: find.byIcon(Icons.remove), matching: find.byType(OutlinedButton)));
      expect(release.onPressed, isNull);
      expect(adds, 0);
      expect(releases, 0);
      expect(tester.takeException(), isNull);
    });
  }
  for (final dark in [false, true]) {
    for (final scale in [1.0, 1.6]) {
      testWidgets(
        'the driver place renders at 320px ${dark ? 'dark' : 'light'} at $scale',
        (tester) async {
          await _pump(
            tester,
            DriverStandPlaceSection(
              place: _place(),
              presence: null,
              busy: false,
              onAddSeat: () async {},
              onReleaseSeat: () async {},
              onEditOffer: () async {},
              onDepart: () async {},
              onLeave: () async {},
              onGiveTurn: () async {},
              onRespond: (_, __) async {},
            ),
            dark: dark,
            scale: scale,
          );
          expect(tester.takeException(), isNull);
          expect(find.text('Базар, межгород'), findsOneWidget);
          expect(find.text('Ваша очередь'), findsOneWidget);
          expect(find.text('Шымкент'), findsOneWidget);
          // The seat counter is the control the whole screen exists for.
          expect(find.text('1 из 4'), findsWidgets);
          expect(find.text('+1 место'), findsOneWidget);
          expect(find.text('Выехать'), findsOneWidget);
        },
      );
    }
  }

  testWidgets('a waiting car is told how many are ahead, not that it is its turn',
      (tester) async {
    final place = MyStandPlace.fromJson({
      'entry': {
        'id': 'e2',
        'standId': 's1',
        'driverId': 'd2',
        'status': 'WAITING',
        'position': 3,
        'totalSeats': 4,
        'takenSeats': 0,
      },
      'stand': {'id': 's1', 'name': 'Базар, межгород', 'kind': 'INTERCITY', 'lat': 40.6, 'lng': 68.5},
      'queue': const [],
    });
    await _pump(
      tester,
      DriverStandPlaceSection(
        place: place,
        presence: null,
        busy: false,
        onAddSeat: () async {},
        onReleaseSeat: () async {},
        onEditOffer: () async {},
        onDepart: () async {},
        onLeave: () async {},
        onGiveTurn: () async {},
        onRespond: (_, __) async {},
      ),
    );
    expect(tester.takeException(), isNull);
    expect(find.text('3-й в очереди'), findsOneWidget);
    expect(find.textContaining('Перед вами 2 машины'), findsOneWidget);
    // A car that is not at the front cannot depart or take seats.
    final depart = find.ancestor(
      of: find.text('Выехать'),
      matching: find.byType(Semantics),
    );
    expect(depart, findsWidgets);
  });

  testWidgets('a car outside the stand is warned before it loses its place',
      (tester) async {
    await _pump(
      tester,
      DriverStandPlaceSection(
        place: _place(),
        presence: StandPresence.fromJson(const {
          'entryId': 'e1',
          'standId': 's1',
          'inside': false,
          'distanceM': 1240,
          'graceMinutes': 6,
        }),
        busy: false,
        onAddSeat: () async {},
        onReleaseSeat: () async {},
        onEditOffer: () async {},
        onDepart: () async {},
        onLeave: () async {},
        onGiveTurn: () async {},
        onRespond: (_, __) async {},
      ),
    );
    expect(tester.takeException(), isNull);
    expect(find.textContaining('1240'), findsOneWidget);
    expect(find.textContaining('6'), findsWidgets);
  });

  testWidgets('a seat request shows the rider and both answers', (tester) async {
    await _pump(
      tester,
      DriverStandPlaceSection(
        place: _place(reservations: const [
          {
            'id': 'r1',
            'entryId': 'e1',
            'standId': 's1',
            'seats': 2,
            'status': 'PENDING',
            'source': 'APP',
            'pickupLabel': 'улица Абая 12',
            'client': {'name': 'Айгуль', 'phone': '+77010000002'},
          }
        ]),
        presence: null,
        busy: false,
        onAddSeat: () async {},
        onReleaseSeat: () async {},
        onEditOffer: () async {},
        onDepart: () async {},
        onLeave: () async {},
        onGiveTurn: () async {},
        onRespond: (_, __) async {},
      ),
    );
    expect(tester.takeException(), isNull);
    expect(find.text('Айгуль'), findsOneWidget);
    expect(find.textContaining('+77010000002'), findsOneWidget);
    expect(find.text('Подтвердить'), findsOneWidget);
    expect(find.text('Отказать'), findsOneWidget);
  });

  testWidgets('the nearby list offers the button only where the car is',
      (tester) async {
    await _pump(
      tester,
      DriverStandListSection(
        stands: [_stand],
        position: const Coordinate(lat: 40.663032, lng: 68.553626),
        isOnline: true,
        busy: false,
        onJoin: (_) async {},
      ),
    );
    expect(tester.takeException(), isNull);
    expect(find.text('Базар, межгород'), findsOneWidget);
    expect(find.text('Встать в очередь'), findsOneWidget);
    expect(find.text('Межгород'), findsOneWidget);
  });

  testWidgets('a car too far away is told why it cannot take a place',
      (tester) async {
    await _pump(
      tester,
      DriverStandListSection(
        stands: [_stand],
        // ~700 m north of the stand, well outside its 200 m radius.
        position: const Coordinate(lat: 40.6693, lng: 68.553626),
        isOnline: true,
        busy: false,
        onJoin: (_) async {},
      ),
    );
    expect(tester.takeException(), isNull);
    expect(find.text('Подойдите к стоянке, чтобы встать в очередь'), findsOneWidget);
    // The button must not merely look disabled — it must carry no action, or
    // a driver taps it from across town and gets a refusal from the server.
    final join = tester.widget<DriverGradientButton>(find.byType(DriverGradientButton));
    expect(join.enabled, isFalse);
    expect(join.onTap, isNull);
  });
}
