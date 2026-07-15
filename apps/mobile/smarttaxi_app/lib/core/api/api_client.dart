import 'package:dio/dio.dart';

import '../../features/driver/models/driver_document_models.dart';
import '../../features/driver/models/driver_rating_models.dart';
import '../../features/driver/models/driver_wallet_models.dart';
import '../../features/shared/models.dart';
import '../auth/auth_store.dart';
import '../config/app_config.dart';

class ApiClient {
  ApiClient(this._authStore)
      : _dio = Dio(BaseOptions(
          baseUrl: AppConfig.apiBaseUrl,
          connectTimeout: const Duration(seconds: 12),
          receiveTimeout: const Duration(seconds: 20),
          headers: {'Content-Type': 'application/json'},
        ));

  final AuthStore _authStore;
  final Dio _dio;

  Future<void> _attachToken() async {
    final token = await _authStore.readToken();
    if (token == null || token.isEmpty) {
      _dio.options.headers.remove('Authorization');
      return;
    }
    _dio.options.headers['Authorization'] = 'Bearer $token';
  }

  Future<Map<String, dynamic>> login(
      {String? phone, String? email, required String password}) async {
    final response =
        await _dio.post<Map<String, dynamic>>('/api/auth/login', data: {
      if (phone != null && phone.isNotEmpty) 'phone': phone,
      if (email != null && email.isNotEmpty) 'email': email,
      'password': password,
    });
    final data = response.data ?? {};
    final token = data['token']?.toString() ?? data['accessToken']?.toString();
    if (token != null && token.isNotEmpty) {
      await _authStore.saveToken(token);
      _dio.options.headers['Authorization'] = 'Bearer $token';
    }
    return data;
  }

  Future<Map<String, dynamic>> checkAuthPhone(String phone) async {
    final response = await _dio.post<Map<String, dynamic>>(
      '/api/auth/phone/check',
      data: {'phone': phone},
    );
    return response.data ?? {};
  }

  Future<Map<String, dynamic>> sendAuthSms(String phone,
      {String purpose = 'REGISTER'}) async {
    final response = await _dio.post<Map<String, dynamic>>(
      '/api/auth/sms/send',
      data: {'phone': phone, 'purpose': purpose},
    );
    return response.data ?? {};
  }

  Future<Map<String, dynamic>> verifyAuthSms({
    required String phone,
    required String code,
    String purpose = 'REGISTER',
  }) async {
    final response = await _dio.post<Map<String, dynamic>>(
      '/api/auth/sms/verify',
      data: {'phone': phone, 'code': code, 'purpose': purpose},
    );
    return response.data ?? {};
  }

  Future<Map<String, dynamic>> registerWithPassword({
    required String name,
    required String phone,
    required String verificationToken,
    required String password,
  }) async {
    final response = await _dio.post<Map<String, dynamic>>(
      '/api/auth/register/password',
      data: {
        'name': name,
        'phone': phone,
        'verificationToken': verificationToken,
        'password': password,
      },
    );
    final data = response.data ?? {};
    final token = data['token']?.toString() ?? data['accessToken']?.toString();
    if (token != null && token.isNotEmpty) {
      await _authStore.saveToken(token);
      _dio.options.headers['Authorization'] = 'Bearer $token';
    }
    return data;
  }

  Future<Map<String, dynamic>> requestPasswordReset(String phone) async {
    final response = await _dio.post<Map<String, dynamic>>(
      '/api/auth/password/reset/request',
      data: {'phone': phone},
    );
    return response.data ?? {};
  }

  Future<Map<String, dynamic>> confirmPasswordReset({
    required String phone,
    required String verificationToken,
    required String password,
  }) async {
    final response = await _dio.post<Map<String, dynamic>>(
      '/api/auth/password/reset/confirm',
      data: {
        'phone': phone,
        'verificationToken': verificationToken,
        'password': password,
      },
    );
    final data = response.data ?? {};
    final token = data['token']?.toString() ?? data['accessToken']?.toString();
    if (token != null && token.isNotEmpty) {
      await _authStore.saveToken(token);
      _dio.options.headers['Authorization'] = 'Bearer $token';
    }
    return data;
  }

  Future<Map<String, dynamic>> register({
    required String name,
    required String phone,
    String? email,
    required String password,
  }) async {
    final response =
        await _dio.post<Map<String, dynamic>>('/api/auth/register', data: {
      'name': name,
      'phone': phone,
      if (email != null && email.isNotEmpty) 'email': email,
      'password': password,
    });
    final data = response.data ?? {};
    final token = data['token']?.toString() ?? data['accessToken']?.toString();
    if (token != null && token.isNotEmpty) {
      await _authStore.saveToken(token);
      _dio.options.headers['Authorization'] = 'Bearer $token';
    }
    return data;
  }

  Future<Map<String, dynamic>> me() async {
    await _attachToken();
    final response = await _dio.get<Map<String, dynamic>>('/api/auth/me');
    return response.data ?? {};
  }

  Future<List<RegionOption>> getActiveRegions() async {
    final response = await _dio.get<dynamic>('/api/regions/active');
    final items = _extractList(response.data, 'regions');
    return items
        .map((item) => RegionOption.fromJson(item))
        .toList(growable: false);
  }

  Future<List<TariffOption>> getTariffs(String regionId) async {
    final response = await _dio
        .get<dynamic>('/api/tariffs', queryParameters: {'regionId': regionId});
    final items = _extractList(response.data, 'tariffs');
    return items
        .map((item) => TariffOption.fromJson(item))
        .toList(growable: false);
  }

  Future<List<AddressSuggestion>> searchAddresses(
    String query, {
    String? region,
  }) async {
    final response = await _dio.get<dynamic>(
      '/api/routes/addresses/search',
      queryParameters: {
        'q': query,
        'limit': 8,
        if (region != null && region.trim().isNotEmpty) 'region': region.trim(),
      },
    );
    final items = _extractList(response.data, 'addresses');
    return items
        .map((item) => AddressSuggestion.fromJson(item))
        .toList(growable: false);
  }

  Future<AddressSuggestion?> reverseAddress(Coordinate coordinate) async {
    final response = await _dio.get<Map<String, dynamic>>(
      '/api/routes/addresses/reverse',
      queryParameters: {'lat': coordinate.lat, 'lng': coordinate.lng},
    );
    final data = response.data ?? {};
    final address = data['address'];
    if (address is! Map) return null;
    return AddressSuggestion.fromJson(Map<String, dynamic>.from(address));
  }

  Future<RoutePreview> previewRoute({
    required Coordinate pickup,
    required Coordinate dropoff,
    String? tariffId,
  }) async {
    await _attachToken();
    final tariffPayload = _tariffPayload(tariffId);
    final response =
        await _dio.post<Map<String, dynamic>>('/api/routes/preview', data: {
      'pickupLat': pickup.lat,
      'pickupLng': pickup.lng,
      'dropoffLat': dropoff.lat,
      'dropoffLng': dropoff.lng,
      ...tariffPayload,
    });
    final data = response.data ?? {};
    return RoutePreview.fromJson(
        Map<String, dynamic>.from(data['route'] ?? data));
  }

  Future<OrderSummary> createOrder({
    required Coordinate pickup,
    required Coordinate dropoff,
    required String pickupText,
    required String dropoffText,
    required String riderPhone,
    String? riderName,
    required String tariffId,
    required double distanceKm,
    required double durationMin,
    String paymentMethod = 'CASH',
    int? offeredPriceKzt,
    String? promoCode,
  }) async {
    await _attachToken();
    final tariffPayload = _tariffPayload(tariffId);
    final orderDurationMin = durationMin.ceil().clamp(1, 600).toInt();
    final payload = {
      'pickupLat': pickup.lat,
      'pickupLng': pickup.lng,
      'dropoffLat': dropoff.lat,
      'dropoffLng': dropoff.lng,
      'pickupText': pickupText,
      'dropoffText': dropoffText,
      'riderPhone': riderPhone,
      if (riderName != null && riderName.trim().isNotEmpty)
        'riderName': riderName.trim(),
      ...tariffPayload,
      'distanceKm': distanceKm,
      'durationMin': orderDurationMin,
      'paymentMethod': paymentMethod,
      if (offeredPriceKzt != null) 'offeredPriceKzt': offeredPriceKzt,
      if (promoCode != null && promoCode.isNotEmpty) 'promoCode': promoCode,
    };
    final response =
        await _dio.post<Map<String, dynamic>>('/api/orders', data: payload);
    final data = response.data ?? {};
    return OrderSummary.fromJson(
        Map<String, dynamic>.from(data['order'] ?? data));
  }

  Map<String, String> _tariffPayload(String? tariffIdOrName) {
    final value = tariffIdOrName?.trim();
    if (value == null || value.isEmpty) return const {};
    final uuid = RegExp(
      r'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$',
    );
    if (uuid.hasMatch(value)) return {'tariffId': value};
    return {'tariff': value};
  }

  // Restores an in-progress trip after the app was killed/restarted —
  // without this the rider reopens SmartTaxi mid-trip to a bare home screen
  // with no idea a driver is already on the way.
  Future<OrderSummary?> getMyActiveOrder() async {
    await _attachToken();
    final response = await _dio.get<Map<String, dynamic>>('/api/orders/me/active');
    final data = response.data ?? {};
    final order = data['order'];
    if (order is! Map) return null;
    return OrderSummary.fromJson(Map<String, dynamic>.from(order));
  }

  Future<List<OrderSummary>> getMyOrderHistory({int limit = 20}) async {
    await _attachToken();
    final response = await _dio.get<Map<String, dynamic>>(
      '/api/orders/me/history',
      queryParameters: {'limit': limit},
    );
    final data = response.data ?? {};
    final orders = data['orders'];
    if (orders is! List) return const [];
    return orders
        .whereType<Map>()
        .map((item) => OrderSummary.fromJson(Map<String, dynamic>.from(item)))
        .toList();
  }

  Future<List<OrderSummary>> getDriverOrderHistory({int limit = 20}) async {
    await _attachToken();
    final response = await _dio.get<Map<String, dynamic>>(
      '/api/orders/me/driver-history',
      queryParameters: {'limit': limit},
    );
    final data = response.data ?? {};
    final orders = data['orders'];
    if (orders is! List) return const [];
    return orders
        .whereType<Map>()
        .map((item) => OrderSummary.fromJson(Map<String, dynamic>.from(item)))
        .toList();
  }

  Future<void> cancelPublicOrder(String orderId,
      {required String riderPhone}) async {
    await _attachToken();
    await _dio.post('/api/orders/$orderId/cancel-public',
        data: {'riderPhone': riderPhone});
  }

  Future<void> rateOrder(
    String orderId, {
    required int rating,
    List<String> tags = const [],
    String comment = '',
  }) async {
    await _attachToken();
    await _dio.post('/api/orders/$orderId/rate', data: {
      'rating': rating,
      'tags': tags,
      'comment': comment,
    });
  }

  Future<({String code, int discountAmountKzt, int finalPriceKzt})> validatePromoCode({
    required String code,
    required String regionId,
    required int orderPriceKzt,
  }) async {
    await _attachToken();
    final response = await _dio.post<Map<String, dynamic>>(
      '/api/orders/promo/validate',
      data: {
        'code': code,
        'regionId': regionId,
        'orderPriceKzt': orderPriceKzt,
      },
    );
    final promo =
        Map<String, dynamic>.from(response.data?['promo'] ?? const {});
    return (
      code: '${promo['code'] ?? code}',
      discountAmountKzt:
          int.tryParse('${promo['discountAmountKzt'] ?? 0}') ?? 0,
      finalPriceKzt:
          int.tryParse('${promo['finalPriceKzt'] ?? orderPriceKzt}') ??
              orderPriceKzt,
    );
  }

  Future<PaymentInfo> initiatePayment(String orderId) async {
    await _attachToken();
    final response = await _dio
        .post<Map<String, dynamic>>('/api/orders/$orderId/payments/initiate');
    final data = response.data ?? {};
    return PaymentInfo.fromJson(
        Map<String, dynamic>.from(data['payment'] ?? data));
  }

  Future<PaymentInfo> getPaymentStatus(String orderId) async {
    await _attachToken();
    final response = await _dio
        .get<Map<String, dynamic>>('/api/orders/$orderId/payments/status');
    final data = response.data ?? {};
    return PaymentInfo.fromJson(
        Map<String, dynamic>.from(data['payment'] ?? data));
  }

  Future<void> registerPushToken(String token,
      {String platform = 'android'}) async {
    await _attachToken();
    await _dio.post('/api/notifications/register-token', data: {
      'token': token,
      'platform': platform,
    });
  }

  Future<({List<AppNotification> notifications, int unreadCount})>
      getNotifications({int limit = 30}) async {
    await _attachToken();
    final response = await _dio.get<Map<String, dynamic>>(
      '/api/notifications',
      queryParameters: {'limit': limit},
    );
    final data = response.data ?? {};
    final items = _extractList(data, 'notifications')
        .map((item) => AppNotification.fromJson(item))
        .toList(growable: false);
    final unreadCount = int.tryParse('${data['unreadCount'] ?? 0}') ?? 0;
    return (notifications: items, unreadCount: unreadCount);
  }

  Future<void> markNotificationRead(String id) async {
    await _attachToken();
    await _dio.post('/api/notifications/$id/read');
  }

  Future<void> markAllNotificationsRead() async {
    await _attachToken();
    await _dio.post('/api/notifications/read-all');
  }

  Future<({String? sosPhone, String? supportPhone})> getServiceContacts() async {
    try {
      final response = await _dio
          .get<Map<String, dynamic>>('/api/regions/service-settings');
      String? clean(String? key) {
        final value = response.data?[key]?.toString().trim();
        return (value == null || value.isEmpty) ? null : value;
      }

      return (sosPhone: clean('sosPhone'), supportPhone: clean('supportPhone'));
    } catch (_) {
      return (sosPhone: null, supportPhone: null);
    }
  }

  Future<List<DriverRegion>> getDriverRegions() async {
    await _attachToken();
    final response = await _dio.get<dynamic>('/api/drivers/me/regions');
    final items = _extractList(response.data, 'regions');
    return items
        .map((item) => DriverRegion.fromJson(item))
        .toList(growable: false);
  }

  Future<void> selectDriverRegion(String regionId) async {
    await _attachToken();
    await _dio.patch('/api/drivers/me/region', data: {'regionId': regionId});
  }

  Future<void> setDriverStatus(String status) async {
    await _attachToken();
    await _dio.patch('/api/drivers/me/status', data: {'status': status});
  }

  Future<void> updateDriverLocation({
    required Coordinate location,
    double? heading,
    double? speed,
    double? accuracy,
  }) async {
    await _attachToken();
    await _dio.patch('/api/drivers/me/location', data: {
      'lat': location.lat,
      'lng': location.lng,
      if (heading != null) 'heading': heading,
      if (speed != null) 'speed': speed,
      if (accuracy != null) 'accuracy': accuracy,
      'source': 'mobile',
    });
  }

  Future<List<NearbyDriver>> getNearbyDrivers({
    required Coordinate location,
    int limit = 5,
  }) async {
    await _attachToken();
    final response = await _dio.get<dynamic>(
      '/api/drivers/nearby',
      queryParameters: {
        'lat': location.lat,
        'lng': location.lng,
        'limit': limit.clamp(1, 5).toInt(),
      },
    );
    final items = _extractList(response.data, 'drivers');
    return items.map(NearbyDriver.fromJson).toList(growable: false);
  }

  Future<DriverStats> getDriverStats() async {
    await _attachToken();
    final response =
        await _dio.get<Map<String, dynamic>>('/api/drivers/me/stats');
    return DriverStats.fromJson(response.data ?? {});
  }

  Future<List<OrderSummary>> getOrders() async {
    await _attachToken();
    final response = await _dio.get<dynamic>('/api/orders');
    final items = _extractList(response.data, 'orders');
    return items
        .map((item) => OrderSummary.fromJson(item))
        .toList(growable: false);
  }

  Future<OrderSummary> acceptOrder(String orderId) =>
      _postOrderAction('/api/orders/$orderId/accept');
  Future<void> rejectDriverOrder(String orderId) async {
    await _attachToken();
    await _dio.post('/api/driver/orders/$orderId/reject');
  }

  Future<OrderSummary> goingToClient(String orderId) =>
      _postOrderAction('/api/orders/$orderId/going-to-client');
  Future<OrderSummary> arrived(String orderId) =>
      _postOrderAction('/api/orders/$orderId/arrived');
  Future<OrderSummary> waitingClient(String orderId) =>
      _postOrderAction('/api/orders/$orderId/waiting');
  Future<OrderSummary> startTrip(String orderId) =>
      _postOrderAction('/api/orders/$orderId/start');
  Future<OrderSummary> completeTrip(String orderId) =>
      _postOrderAction('/api/orders/$orderId/complete');
  Future<OrderSummary> noShow(String orderId) =>
      _postOrderAction('/api/orders/$orderId/no-show');
  Future<OrderSummary> cancelDriverOrder(String orderId) =>
      _postOrderAction('/api/orders/$orderId/cancel');

  // Torg: driver counter-proposes a price on an open order; rider accepts
  // or declines. See OrderSummary.driverOfferStatus for the tri-state.
  Future<OrderSummary> submitDriverPriceOffer({
    required String orderId,
    required int priceKzt,
  }) async {
    await _attachToken();
    final response = await _dio.post<Map<String, dynamic>>(
      '/api/orders/$orderId/price-offer',
      data: {'priceKzt': priceKzt},
    );
    final data = response.data ?? {};
    return OrderSummary.fromJson(
        Map<String, dynamic>.from(data['order'] ?? data));
  }

  Future<OrderSummary> respondToDriverPriceOffer({
    required String orderId,
    required bool accept,
  }) async {
    await _attachToken();
    final response = await _dio.post<Map<String, dynamic>>(
      '/api/orders/$orderId/price-offer/respond',
      data: {'accept': accept},
    );
    final data = response.data ?? {};
    return OrderSummary.fromJson(
        Map<String, dynamic>.from(data['order'] ?? data));
  }

  // "School route" recurring bookings — see
  // recurring-bookings.routes.js for the authoritative contract.
  Future<RecurringBooking> createRecurringBooking({
    required String driverId,
    required String pickupText,
    required Coordinate pickupCoordinate,
    required String dropoffText,
    required Coordinate dropoffCoordinate,
    required List<int> daysOfWeek,
    required String timeOfDay,
    required int priceKzt,
    String notes = '',
  }) async {
    await _attachToken();
    final response = await _dio.post<Map<String, dynamic>>(
      '/api/recurring-bookings',
      data: {
        'driverId': driverId,
        'pickupText': pickupText,
        'pickupLat': pickupCoordinate.lat,
        'pickupLng': pickupCoordinate.lng,
        'dropoffText': dropoffText,
        'dropoffLat': dropoffCoordinate.lat,
        'dropoffLng': dropoffCoordinate.lng,
        'daysOfWeek': daysOfWeek,
        'timeOfDay': timeOfDay,
        'priceKzt': priceKzt,
        'notes': notes,
      },
    );
    final data = response.data ?? {};
    return RecurringBooking.fromJson(
        Map<String, dynamic>.from(data['booking'] ?? data));
  }

  Future<RecurringBooking> respondToRecurringBooking({
    required String id,
    required bool accept,
  }) async {
    await _attachToken();
    final response = await _dio.post<Map<String, dynamic>>(
      '/api/recurring-bookings/$id/respond',
      data: {'accept': accept},
    );
    final data = response.data ?? {};
    return RecurringBooking.fromJson(
        Map<String, dynamic>.from(data['booking'] ?? data));
  }

  Future<List<RecurringBooking>> getMyRecurringBookings() async {
    await _attachToken();
    final response =
        await _dio.get<dynamic>('/api/recurring-bookings/mine');
    final items = _extractList(response.data, 'bookings');
    return items
        .map((item) => RecurringBooking.fromJson(item))
        .toList(growable: false);
  }

  Future<List<RecurringBooking>> getDriverRecurringBookings() async {
    await _attachToken();
    final response =
        await _dio.get<dynamic>('/api/recurring-bookings/driver');
    final items = _extractList(response.data, 'bookings');
    return items
        .map((item) => RecurringBooking.fromJson(item))
        .toList(growable: false);
  }

  Future<RecurringBooking> updateRecurringBookingStatus({
    required String id,
    required String status,
  }) async {
    await _attachToken();
    final response = await _dio.patch<Map<String, dynamic>>(
      '/api/recurring-bookings/$id/status',
      data: {'status': status},
    );
    final data = response.data ?? {};
    return RecurringBooking.fromJson(
        Map<String, dynamic>.from(data['booking'] ?? data));
  }

  Future<List<FavoriteAddress>> getFavoriteAddresses() async {
    await _attachToken();
    final response = await _dio.get<dynamic>('/api/favorites/addresses');
    final items = _extractList(response.data, 'addresses');
    return items
        .map((item) => FavoriteAddress.fromJson(item))
        .toList(growable: false);
  }

  Future<FavoriteAddress> createFavoriteAddress({
    required String label,
    required String title,
    required String addressText,
    required double lat,
    required double lng,
  }) async {
    await _attachToken();
    final response = await _dio.post<Map<String, dynamic>>(
      '/api/favorites/addresses',
      data: {
        'label': label,
        'title': title,
        'addressText': addressText,
        'lat': lat,
        'lng': lng,
      },
    );
    final data = response.data ?? {};
    return FavoriteAddress.fromJson(
        Map<String, dynamic>.from(data['address'] ?? data));
  }

  Future<void> deleteFavoriteAddress(String id) async {
    await _attachToken();
    await _dio.delete<void>('/api/favorites/addresses/$id');
  }

  Future<List<DriverPreference>> getDriverPreferences() async {
    await _attachToken();
    final response = await _dio.get<dynamic>('/api/favorites/drivers');
    final items = _extractList(response.data, 'preferences');
    return items
        .map((item) => DriverPreference.fromJson(item))
        .toList(growable: false);
  }

  // POST upserts: setting the same driverId again with a different type
  // (e.g. FAVORITE -> BLOCKED) just flips it server-side (ON CONFLICT DO
  // UPDATE), no separate "change type" endpoint exists.
  Future<DriverPreference> setDriverPreference({
    required String driverId,
    required String type,
  }) async {
    await _attachToken();
    final response = await _dio.post<Map<String, dynamic>>(
      '/api/favorites/drivers',
      data: {'driverId': driverId, 'type': type},
    );
    final data = response.data ?? {};
    return DriverPreference.fromJson(
        Map<String, dynamic>.from(data['preference'] ?? data));
  }

  Future<void> removeDriverPreference(String driverId) async {
    await _attachToken();
    await _dio.delete<void>('/api/favorites/drivers/$driverId');
  }

  // Fixed vocabulary on the backend (orders.routes.js QUICK_MESSAGES) — the
  // server owns the display text, this just sends the key. Callable by
  // either CLIENT or DRIVER on their own order; the other party is notified.
  // The backend serves the identical summary at both /mine (spec'd path)
  // and /me (alias already used by the web client) — /me here to match web.
  Future<ReferralSummary> getReferralSummary() async {
    await _attachToken();
    final response = await _dio.get<Map<String, dynamic>>('/api/referrals/me');
    final data = response.data ?? {};
    return ReferralSummary.fromJson(data);
  }

  Future<String> sendQuickMessage({
    required String orderId,
    required String messageKey,
  }) async {
    await _attachToken();
    final response = await _dio.post<Map<String, dynamic>>(
      '/api/orders/$orderId/quick-message',
      data: {'messageKey': messageKey},
    );
    final data = response.data ?? {};
    return '${data['text'] ?? ''}';
  }

  Future<RoutePreview> driverToPickupRoute(String orderId) async {
    await _attachToken();
    final response = await _dio.post<Map<String, dynamic>>(
        '/api/routes/driver-to-pickup',
        data: {'orderId': orderId});
    final data = response.data ?? {};
    return RoutePreview.fromJson(
        Map<String, dynamic>.from(data['route'] ?? data));
  }

  Future<List<RoadAlert>> getDriverRoadAlerts({String? regionId}) async {
    await _attachToken();
    final response = await _dio.get<dynamic>(
      '/api/driver/road-alerts',
      queryParameters: {if (regionId != null) 'regionId': regionId},
    );
    final items = _extractList(response.data, 'alerts');
    return items
        .map((item) => RoadAlert.fromJson(item))
        .toList(growable: false);
  }

  /// Live speed cameras + posted speed limit around [location], sourced
  /// from OpenStreetMap (see osm-navigation.service.js on the backend).
  Future<OsmNavigationInfo> getOsmNavigation({
    required Coordinate location,
    int radiusM = 3000,
  }) async {
    await _attachToken();
    final response = await _dio.get<Map<String, dynamic>>(
      '/api/driver/road-alerts/osm-navigation',
      queryParameters: {
        'lat': location.lat,
        'lng': location.lng,
        'radiusM': radiusM,
      },
    );
    final data = response.data ?? {};
    final cameras = _extractList(data, 'cameras')
        .map((item) => RoadAlert.fromJson(item))
        .toList(growable: false);
    final signs = _extractList(data, 'signs')
        .map((item) => OsmSign.fromJson(item))
        .toList(growable: false);
    final speedLimit = data['speedLimit'];
    return OsmNavigationInfo(
      cameras: cameras,
      speedLimit: speedLimit is num ? speedLimit.round() : null,
      signs: signs,
    );
  }

  Future<RoadAlert> createDriverRoadAlert({
    required String type,
    required Coordinate location,
    String? regionId,
    String comment = '',
    int? speedLimit,
    double? heading,
  }) async {
    await _attachToken();
    final response =
        await _dio.post<Map<String, dynamic>>('/api/driver/road-alerts', data: {
      if (regionId != null) 'regionId': regionId,
      'type': type,
      'comment': comment,
      'lat': location.lat,
      'lng': location.lng,
      if (speedLimit != null) 'speedLimit': speedLimit,
      if (heading != null) 'heading': heading,
    });
    final data = response.data ?? {};
    return RoadAlert.fromJson(Map<String, dynamic>.from(data['alert'] ?? data));
  }

  Future<RoadAlert> confirmDriverRoadAlert(String alertId) async {
    await _attachToken();
    final response = await _dio.patch<Map<String, dynamic>>(
      '/api/driver/road-alerts/$alertId/confirm',
    );
    final data = response.data ?? {};
    return RoadAlert.fromJson(Map<String, dynamic>.from(data['alert'] ?? data));
  }

  Future<RoadAlert> dismissDriverRoadAlert(String alertId) async {
    await _attachToken();
    final response = await _dio.patch<Map<String, dynamic>>(
      '/api/driver/road-alerts/$alertId/expire',
    );
    final data = response.data ?? {};
    return RoadAlert.fromJson(Map<String, dynamic>.from(data['alert'] ?? data));
  }

  Future<SupportMessage> submitSupportMessage({
    required String topic,
    required String message,
    String? orderId,
  }) async {
    await _attachToken();
    final response = await _dio.post<Map<String, dynamic>>('/api/support', data: {
      'topic': topic,
      'message': message,
      if (orderId != null) 'orderId': orderId,
    });
    final data = response.data ?? {};
    return SupportMessage.fromJson(
        Map<String, dynamic>.from(data['message'] ?? data));
  }

  Future<List<SupportMessage>> getMySupportMessages() async {
    await _attachToken();
    final response = await _dio.get<dynamic>('/api/support/mine');
    final items = _extractList(response.data, 'messages');
    return items
        .map((item) => SupportMessage.fromJson(item))
        .toList(growable: false);
  }

  Future<String> submitDriverApplication({
    required String fullName,
    required String phone,
    required String carModel,
    required String carColor,
    required String plateNumber,
    int? year,
    String comment = '',
  }) async {
    final response =
        await _dio.post<Map<String, dynamic>>('/api/admin/driver-applications', data: {
      'fullName': fullName,
      'phone': phone,
      'carModel': carModel,
      'carColor': carColor,
      'plateNumber': plateNumber,
      if (year != null) 'year': year,
      if (comment.isNotEmpty) 'comment': comment,
    });
    final data = response.data ?? {};
    final application = Map<String, dynamic>.from(data['application'] ?? data);
    return '${application['id']}';
  }

  Future<DriverDocument> uploadDriverApplicationDocument({
    required String applicationId,
    required String type,
    required String filePath,
  }) async {
    final fileName = filePath.split(RegExp(r'[\\/]')).last;
    final response = await _dio.post<Map<String, dynamic>>(
      '/api/driver-applications/$applicationId/documents',
      data: FormData.fromMap({
        'type': type,
        'file': await MultipartFile.fromFile(filePath, filename: fileName),
      }),
    );
    final data = response.data ?? {};
    return DriverDocument.fromJson(
        Map<String, dynamic>.from(data['document'] ?? data));
  }

  Future<List<DriverDocument>> getDriverDocuments() async {
    await _attachToken();
    final response = await _dio.get<dynamic>('/api/drivers/me/documents');
    final items = _extractList(response.data, 'documents');
    return items.map((item) => DriverDocument.fromJson(item)).toList(growable: false);
  }

  Future<DriverDocument> uploadDriverDocument({
    required String type,
    required String filePath,
  }) async {
    await _attachToken();
    final fileName = filePath.split(RegExp(r'[\\/]')).last;
    final response = await _dio.post<Map<String, dynamic>>(
      '/api/drivers/me/documents',
      data: FormData.fromMap({
        'type': type,
        'file': await MultipartFile.fromFile(filePath, filename: fileName),
      }),
    );
    final data = response.data ?? {};
    return DriverDocument.fromJson(
        Map<String, dynamic>.from(data['document'] ?? data));
  }

  Future<WalletSummary> getWalletSummary() async {
    await _attachToken();
    final response =
        await _dio.get<Map<String, dynamic>>('/api/drivers/me/wallet');
    return WalletSummary.fromJson(response.data ?? {});
  }

  Future<({List<WalletTransaction> items, int total})> getWalletTransactions({
    int limit = 30,
    int offset = 0,
  }) async {
    await _attachToken();
    final response = await _dio.get<Map<String, dynamic>>(
      '/api/drivers/me/wallet/transactions',
      queryParameters: {'limit': limit, 'offset': offset},
    );
    final data = response.data ?? {};
    final items = _extractList(data, 'items')
        .map((item) => WalletTransaction.fromJson(item))
        .toList(growable: false);
    final total = int.tryParse('${data['total'] ?? 0}') ?? 0;
    return (items: items, total: total);
  }

  Future<List<PayoutRequest>> getPayoutRequests({String? status}) async {
    await _attachToken();
    final response = await _dio.get<Map<String, dynamic>>(
      '/api/drivers/me/wallet/payout-requests',
      queryParameters: {if (status != null) 'status': status},
    );
    final items = _extractList(response.data, 'payoutRequests');
    return items.map((item) => PayoutRequest.fromJson(item)).toList(growable: false);
  }

  Future<PayoutRequest> createPayoutRequest({
    required int amountKzt,
    String method = 'KASPI_TRANSFER',
    Map<String, dynamic>? details,
  }) async {
    await _attachToken();
    final response = await _dio.post<Map<String, dynamic>>(
      '/api/drivers/me/wallet/payout-requests',
      data: {
        'amountKzt': amountKzt,
        'method': method,
        if (details != null) 'details': details,
      },
    );
    final data = response.data ?? {};
    return PayoutRequest.fromJson(
        Map<String, dynamic>.from(data['payoutRequest'] ?? data));
  }

  Future<void> cancelPayoutRequest(String id) async {
    await _attachToken();
    await _dio.post('/api/drivers/me/wallet/payout-requests/$id/cancel');
  }

  Future<DriverRatingSummary> getDriverRatingSummary() async {
    await _attachToken();
    final response = await _dio
        .get<Map<String, dynamic>>('/api/drivers/me/rating-summary');
    return DriverRatingSummary.fromJson(response.data ?? {});
  }

  Future<OrderSummary> _postOrderAction(String path) async {
    await _attachToken();
    final response = await _dio.post<Map<String, dynamic>>(path);
    final data = response.data ?? {};
    return OrderSummary.fromJson(
        Map<String, dynamic>.from(data['order'] ?? data));
  }

  List<Map<String, dynamic>> _extractList(dynamic data, String key) {
    if (data is List) {
      return data
          .whereType<Map>()
          .map((item) => Map<String, dynamic>.from(item))
          .toList(growable: false);
    }
    if (data is Map && data[key] is List) {
      return (data[key] as List)
          .whereType<Map>()
          .map((item) => Map<String, dynamic>.from(item))
          .toList(growable: false);
    }
    if (data is Map && data['items'] is List) {
      return (data['items'] as List)
          .whereType<Map>()
          .map((item) => Map<String, dynamic>.from(item))
          .toList(growable: false);
    }
    return const [];
  }
}
