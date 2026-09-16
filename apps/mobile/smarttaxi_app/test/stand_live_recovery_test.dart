import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:smarttaxi_app/core/api/api_client.dart';
import 'package:smarttaxi_app/core/sockets/socket_service.dart';
import 'package:smarttaxi_app/core/theme/app_theme.dart';
import 'package:smarttaxi_app/features/passenger/screens/stands/passenger_stands_screen.dart';
import 'package:smarttaxi_app/features/shared/models.dart';
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
  @override
  Future<List<TaxiStand>> getStands(
          {String? regionId, Coordinate? near}) async =>
      [TaxiStand.fromJson(standData)];
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
  void onStandQueueUpdate(void Function(dynamic) handler) {
    update = handler;
  }
}

void main() {
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
      home: PassengerStandsScreen(api: api, socket: socket, regionId: 'r1'),
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
    expect(tester.takeException(), isNull);
  });
}
