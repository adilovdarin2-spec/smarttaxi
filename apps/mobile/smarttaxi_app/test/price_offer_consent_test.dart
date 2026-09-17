import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:smarttaxi_app/core/api/api_client.dart';
import 'package:smarttaxi_app/features/shared/models.dart';
import 'package:smarttaxi_app/features/shared/assignment_error.dart';
import 'package:smarttaxi_app/l10n/app_localizations_ru.dart';
import 'api_transport_test.dart'
    show MemoryAuthStore, TestAdapter, jsonResponse;

void main() {
  final displayed = OrderSummary.fromJson({
    'id': 'order',
    'status': 'SEARCHING_DRIVER',
    'driver_offer_status': 'PENDING',
    'driver_offer_by_driver_id': 'driver',
    'driver_offer_price_kzt': 800,
    'driver_offer_proposed_by': 'DRIVER',
  });
  for (final action in ['respond', 'counter', 'driver-respond', 'promote']) {
    test('$action sends the displayed terms once and never replays a conflict',
        () async {
      final expected = displayed.priceOfferSnapshot;
      final adapter = TestAdapter((request) async {
        expect(request.method, 'POST');
        expect(request.data['expectedOffer'], expected);
        expect(
            request.path,
            action == 'promote'
                ? '/api/orders/order/price-offers/queue/queue/promote'
                : '/api/orders/order/price-offer/$action');
        return jsonResponse({'error': 'PRICE_OFFER_CHANGED'}, 409);
      });
      final dio = Dio(BaseOptions(baseUrl: 'http://127.0.0.1:1'))
        ..httpClientAdapter = adapter;
      addTearDown(() => dio.close(force: true));
      final api = ApiClient(MemoryAuthStore('qa'), dio: dio);
      final Future<OrderSummary> operation;
      switch (action) {
        case 'respond':
          operation = api.respondToDriverPriceOffer(
              orderId: 'order', accept: true, expectedOffer: expected);
        case 'counter':
          operation = api.submitClientCounterOffer(
              orderId: 'order', priceKzt: 700, expectedOffer: expected);
        case 'driver-respond':
          operation = api.respondToClientCounterOffer(
              orderId: 'order', accept: false, expectedOffer: expected);
        default:
          operation = api.promoteQueuedPriceOffer(
              orderId: 'order', queueOfferId: 'queue', expectedOffer: expected);
      }
      await expectLater(operation, throwsA(isA<DioException>()));
      expect(adapter.requests, hasLength(1));
      expect(expected,
          {'driverId': 'driver', 'priceKzt': 800, 'proposedBy': 'DRIVER'});
    });
  }
  test('queue snapshot and conflict copy are explicit for both audiences', () {
    const queued = QueuedPriceOffer(
        id: 'q', orderId: 'order', priceKzt: 750, driverId: 'other');
    expect(queued.priceOfferSnapshot,
        {'driverId': 'other', 'priceKzt': 750, 'proposedBy': 'DRIVER'});
    final l10n = AppLocalizationsRu();
    for (final driver in [true, false]) {
      expect(
          assignmentErrorMessage('PRICE_OFFER_CHANGED', l10n, driver: driver),
          l10n.priceOfferChanged);
      expect(
          assignmentErrorMessage('PRICE_OFFER_CONFIRMATION_REQUIRED', l10n,
              driver: driver),
          l10n.priceOfferConfirmationRequired);
    }
  });
}
