import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:smarttaxi_app/core/api/api_client.dart';
import 'package:smarttaxi_app/core/sockets/socket_service.dart';
import 'package:smarttaxi_app/core/theme/app_theme.dart';
import 'package:smarttaxi_app/features/driver/screens/stand/driver_stand_screen.dart';
import 'package:smarttaxi_app/features/driver/widgets/driver_common_widgets.dart';
import 'package:smarttaxi_app/features/shared/models.dart';
import 'package:smarttaxi_app/features/shared/stand_outcome.dart';
import 'package:smarttaxi_app/l10n/app_localizations.dart';
import 'api_transport_test.dart' show MemoryAuthStore;
import 'stand_live_recovery_test.dart' show standData;

class DriverStandApi extends ApiClient {
  DriverStandApi() : super(MemoryAuthStore('test-session'));
  MyStandPlace place = const MyStandPlace();
  final joins = <Coordinate>[];
  final presence = <Coordinate?>[];
  @override
  Future<StandOutcome> getStandOutcome(String id, {bool driver = false}) async {
    expect(driver, isTrue);
    return StandOutcome(id: id, status: 'EXPIRED', reason: 'NO_SIGNAL');
  }

  @override
  Future<MyStandPlace> getMyStandPlace() async => place;
  @override
  Future<List<TaxiStand>> getDriverStands(
          {String? regionId, Coordinate? at}) async =>
      [TaxiStand.fromJson(standData)];
  @override
  Future<MyStandPlace> joinStandQueue(String standId,
      {required Coordinate at,
      String? destinationLabel,
      String? destinationRegionId,
      int? pricePerSeat,
      int? totalSeats,
      String? comment}) async {
    joins.add(at);
    place = MyStandPlace.fromJson({
      'stand': standData,
      'entry': {
        'id': 'e1',
        'standId': 's1',
        'driverId': 'd1',
        'status': 'BOARDING',
        'totalSeats': 4,
        'takenSeats': 0,
        'position': 1,
      },
      'queue': []
    });
    return place;
  }

  @override
  Future<StandPresence?> publishStandPresence(Coordinate? at) async {
    presence.add(at);
    return StandPresence(
        entryId: 'e1', standId: 's1', inside: at == null ? null : true);
  }
}

class DriverStandSocket extends SocketService {
  DriverStandSocket() : super(MemoryAuthStore('test-session'));
  int listeners = 0;
  @override
  void Function() onDriverStandQueueUpdate(void Function(dynamic) handler) {
    listeners++;
    return () {
      listeners--;
    };
  }

  @override
  void Function() onStandPersonalEvent(void Function(String, dynamic) handler) {
    listeners++;
    return () {
      listeners--;
    };
  }
}

void main() {
  testWidgets(
      'region centre cannot join; offer rechecks GPS; lost GPS publishes unknown and releases listeners on exit',
      (tester) async {
    tester.view.physicalSize = const Size(390, 1000);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    const channel = MethodChannel('flutter.baseflow.com/geolocator');
    bool gpsAvailable = false;
    Completer<Map<String, Object>>? pendingGps;
    final gpsCalls = <String>[];
    tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(channel,
        (call) async {
      gpsCalls.add(call.method);
      if (call.method != 'getCurrentPosition') {
        throw StateError('No cached-coordinate fallback: ${call.method}');
      }
      if (pendingGps != null) return pendingGps.future;
      if (!gpsAvailable) throw PlatformException(code: 'PERMISSION_DENIED');
      return {
        'latitude': 40.8458,
        'longitude': 68.5041,
        'timestamp': DateTime.now().millisecondsSinceEpoch,
        'accuracy': 8.0
      };
    });
    addTearDown(() => tester.binding.defaultBinaryMessenger
        .setMockMethodCallHandler(channel, null));
    final api = DriverStandApi();
    final socket = DriverStandSocket();
    await tester.pumpWidget(MaterialApp(
        locale: const Locale('ru'),
        localizationsDelegates: AppLocalizations.localizationsDelegates,
        supportedLocales: AppLocalizations.supportedLocales,
        theme: buildSmartTaxiTheme(),
        home: DriverStandScreen(
            api: api,
            socket: socket,
            regionId: 'r1',
            isOnline: true,
            initialPosition: const Coordinate(lat: 40.8458, lng: 68.5041))));
    await tester.pumpAndSettle();
    expect(find.text('Включите геолокацию, чтобы встать в очередь'),
        findsOneWidget);
    DriverGradientButton joinButton() =>
        tester.widget<DriverGradientButton>(find.byType(DriverGradientButton));
    expect(joinButton().enabled, isFalse);
    expect(api.joins, isEmpty);
    expect(socket.listeners, 2);

    gpsAvailable = true;
    await tester.tap(find.byIcon(Icons.refresh));
    await tester.pumpAndSettle();
    expect(joinButton().enabled, isTrue);
    await tester.tap(find.text('Встать в очередь'));
    await tester.pumpAndSettle();
    gpsAvailable = false;
    pendingGps = Completer<Map<String, Object>>();
    await tester.pump(const Duration(seconds: 25));
    await tester.pump();
    await tester.tap(find.widgetWithText(FilledButton, 'Встать в очередь'));
    await tester.pump();
    expect(api.joins, isEmpty,
        reason: 'Submit must await the in-flight GPS check');
    pendingGps.completeError(PlatformException(code: 'PERMISSION_DENIED'));
    pendingGps = null;
    await tester.pumpAndSettle();
    expect(api.joins, isEmpty,
        reason:
            'Permission lost while filling the offer cannot reuse its earlier fix');

    gpsAvailable = true;
    await tester.tap(find.byIcon(Icons.refresh));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Встать в очередь'));
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(FilledButton, 'Встать в очередь'));
    await tester.pumpAndSettle();
    expect(api.joins, hasLength(1));
    expect(api.joins.single.lat, 40.8458);
    expect(find.byType(DriverStandPlaceSection), findsOneWidget);

    gpsAvailable = false;
    await tester.pump(const Duration(seconds: 25));
    await tester.pumpAndSettle();
    expect(api.presence, [null],
        reason: 'No old coordinates may renew a place after GPS failure');
    expect(find.textContaining('Не удалось подтвердить геолокацию.'),
        findsOneWidget);
    expect(gpsCalls, everyElement('getCurrentPosition'));
    api.place = const MyStandPlace();
    await tester.tap(find.byIcon(Icons.refresh));
    await tester.pumpAndSettle();
    expect(find.byType(DriverStandPlaceSection), findsNothing);
    expect(find.textContaining('Давно не было координат от вашего устройства.'),
        findsOneWidget);
    await tester.pumpWidget(const SizedBox.shrink());
    await tester.pumpAndSettle();
    expect(socket.listeners, 0);
    expect(tester.takeException(), isNull);
  });
}
