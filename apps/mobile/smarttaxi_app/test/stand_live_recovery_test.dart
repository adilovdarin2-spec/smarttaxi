import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:smarttaxi_app/core/map/map_style.dart';
import 'package:smarttaxi_app/core/api/api_client.dart';
import 'package:smarttaxi_app/core/sockets/socket_service.dart';
import 'package:smarttaxi_app/core/theme/app_theme.dart';
import 'package:smarttaxi_app/features/passenger/screens/stands/passenger_stands_screen.dart';
import 'package:smarttaxi_app/features/shared/models.dart';
import 'package:smarttaxi_app/features/shared/stand_outcome.dart';
import 'package:smarttaxi_app/l10n/app_localizations.dart';
import 'api_transport_test.dart' show MemoryAuthStore;

const standData = {
  'id': 's1',
  'regionId': 'r1',
  'name': 'Тестовая стоянка',
  'kind': 'INTERCITY',
  'lat': 40.8458,
  'lng': 68.5041,
  'radiusM': 150,
  'defaultSeats': 4,
  'driversCount': 1,
  'freeSeats': 4,
};

class StandApi extends ApiClient {
  StandApi() : super(MemoryAuthStore('test-session'));
  int taken = 0;
  int writes = 0;
  StandSeatReservation? reservation;
  bool closed = false;
  final outcomeReads = <String>[];
  @override
  Future<StandOutcome> getStandOutcome(String id, {bool driver = false}) async {
    outcomeReads.add(id);
    return StandOutcome(id: id, status: 'CANCELLED', reason: 'STAND_CLOSED');
  }

  @override
  Future<List<TaxiStand>> getStands(
          {String? regionId, Coordinate? near}) async =>
      closed ? [] : [TaxiStand.fromJson(standData)];
  @override
  Future<StandSeatReservation?> getMyStandReservation() async => reservation;
  @override
  Future<StandQueueView> getStandQueue(String id) async =>
      StandQueueView.fromJson({
        'stand': standData,
        'entries': [
          {
            'id': 'e1',
            'standId': 's1',
            'driverId': 'd1',
            'status': 'BOARDING',
            'totalSeats': 4,
            'takenSeats': taken,
            'destinationLabel': 'Шымкент',
            'pricePerSeat': 2500,
            'driver': {'name': 'Тест', 'phone': '+77000000000'},
          }
        ],
      });
  @override
  Future<StandSeatReservation> reserveStandSeat(
    String entryId, {
    int seats = 1,
    String? pickupLabel,
    Coordinate? pickup,
    String? comment,
  }) async {
    writes++;
    taken += seats;
    reservation = StandSeatReservation.fromJson({
      'id': 'booking1',
      'entryId': entryId,
      'standId': 's1',
      'standName': 'Тестовая стоянка',
      'seats': seats,
      'status': 'PENDING',
      'source': 'APP',
    });
    throw Exception('lost acknowledgement');
  }
}

class StandSocket extends SocketService {
  StandSocket() : super(MemoryAuthStore('test-session'));
  void Function(dynamic)? update;
  @override
  void Function() onStandQueueUpdate(void Function(dynamic) handler) {
    update = handler;
    return () => update = null;
  }
}

void main() {
  testWidgets(
      'closed native stand dismisses its car and seat-count sheets without leaving passenger screen',
      (tester) async {
    tester.view.physicalSize = const Size(320, 1000);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    final api = StandApi();
    final socket = StandSocket();
    await tester.pumpWidget(MaterialApp(
      locale: const Locale('ru'),
      localizationsDelegates: AppLocalizations.localizationsDelegates,
      supportedLocales: AppLocalizations.supportedLocales,
      theme: buildSmartTaxiTheme(),
      home: PassengerStandsScreen(
          api: api,
          socket: socket,
          regionId: 'r1',
          mapStyle: MapStyleChoice.fallback),
    ));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Тестовая стоянка'));
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(FilledButton, 'Забронировать место'));
    await tester.pumpAndSettle();
    expect(find.widgetWithText(OutlinedButton, '1'), findsOneWidget);
    api.closed = true;
    socket.update!(null);
    await tester.pumpAndSettle();
    expect(find.byType(PassengerStandSheet), findsNothing);
    expect(find.widgetWithText(OutlinedButton, '1'), findsNothing);
    expect(find.byType(PassengerStandsScreen), findsOneWidget);
    expect(api.writes, 0);
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox.shrink());
    await tester.pumpAndSettle();
  });

  testWidgets(
      'rider recovers closure reason by polling without a personal socket event',
      (tester) async {
    tester.view.physicalSize = const Size(320, 1000);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    final api = StandApi()
      ..reservation = StandSeatReservation.fromJson({
        'id': 'booking1',
        'entryId': 'e1',
        'standId': 's1',
        'standName': 'Тестовая стоянка',
        'seats': 1,
        'status': 'CONFIRMED',
        'source': 'APP',
      });
    await tester.pumpWidget(MaterialApp(
      locale: const Locale('ru'),
      localizationsDelegates: AppLocalizations.localizationsDelegates,
      supportedLocales: AppLocalizations.supportedLocales,
      theme: buildSmartTaxiTheme(),
      builder: (context, child) => MediaQuery(
          data: MediaQuery.of(context)
              .copyWith(textScaler: const TextScaler.linear(1.6)),
          child: child!),
      home: PassengerStandsScreen(
          api: api,
          socket: StandSocket(),
          regionId: 'r1',
          mapStyle: MapStyleChoice.fallback),
    ));
    await tester.pumpAndSettle();
    api.closed = true;
    api.reservation = null;
    await tester.pump(const Duration(seconds: 20));
    await tester.pumpAndSettle();
    expect(api.outcomeReads, ['booking1']);
    expect(
        find.text(
            'Стоянку закрыли. Бронь снята. Выберите другую стоянку или закажите поездку.'),
        findsOneWidget);
    expect(find.byType(PassengerStandReservationBanner), findsNothing);
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox.shrink());
    await tester.pumpAndSettle();
  });
  testWidgets(
      'open native stand sheet follows live seats and restores a lost reservation response',
      (tester) async {
    tester.view.physicalSize = const Size(390, 1000);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    final api = StandApi();
    final socket = StandSocket();
    await tester.pumpWidget(MaterialApp(
      locale: const Locale('ru'),
      localizationsDelegates: AppLocalizations.localizationsDelegates,
      supportedLocales: AppLocalizations.supportedLocales,
      theme: buildSmartTaxiTheme(),
      home: PassengerStandsScreen(
          api: api,
          socket: socket,
          regionId: 'r1',
          mapStyle: MapStyleChoice.fallback),
    ));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Тестовая стоянка'));
    await tester.pumpAndSettle();
    expect(find.byType(PassengerStandSheet), findsOneWidget);
    expect(find.text('4 свободных места'), findsWidgets);
    api.taken = 2;
    socket.update!(null);
    await tester.pumpAndSettle();
    expect(
        find.descendant(
            of: find.byType(PassengerStandSheet),
            matching: find.text('2 свободных места')),
        findsOneWidget);
    await tester.tap(find.widgetWithText(FilledButton, 'Забронировать место'));
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(OutlinedButton, '1'));
    await tester.pumpAndSettle();
    expect(api.writes, 1);
    expect(find.byType(PassengerStandSheet), findsNothing);
    expect(find.text('Ждём подтверждения водителя'), findsOneWidget);
    await tester.pumpWidget(const SizedBox.shrink());
    await tester.pumpAndSettle();
    expect(socket.update, isNull,
        reason: 'Closed screen releases its listener');
    expect(tester.takeException(), isNull);
  });
}
