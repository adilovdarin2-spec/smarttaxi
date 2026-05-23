import 'package:dio/dio.dart';

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

  Future<Map<String, dynamic>> login({String? phone, String? email, required String password}) async {
    final response = await _dio.post<Map<String, dynamic>>('/api/auth/login', data: {
      if (phone != null && phone.isNotEmpty) 'phone': phone,
      if (email != null && email.isNotEmpty) 'email': email,
      'password': password,
    });
    final data = response.data ?? {};
    final token = data['token']?.toString() ?? data['accessToken']?.toString();
    if (token != null && token.isNotEmpty) await _authStore.saveToken(token);
    return data;
  }

  Future<List<RegionOption>> getActiveRegions() async {
    final response = await _dio.get<dynamic>('/api/regions/active');
    final items = _extractList(response.data, 'regions');
    return items.map((item) => RegionOption.fromJson(item)).toList(growable: false);
  }

  Future<List<TariffOption>> getTariffs(String regionId) async {
    final response = await _dio.get<dynamic>('/api/tariffs', queryParameters: {'regionId': regionId});
    final items = _extractList(response.data, 'tariffs');
    return items.map((item) => TariffOption.fromJson(item)).toList(growable: false);
  }

  Future<RoutePreview> previewRoute({
    required Coordinate pickup,
    required Coordinate dropoff,
    String? tariffId,
  }) async {
    await _attachToken();
    final response = await _dio.post<Map<String, dynamic>>('/api/routes/preview', data: {
      'pickupLat': pickup.lat,
      'pickupLng': pickup.lng,
      'dropoffLat': dropoff.lat,
      'dropoffLng': dropoff.lng,
      if (tariffId != null) 'tariffId': tariffId,
    });
    final data = response.data ?? {};
    return RoutePreview.fromJson(Map<String, dynamic>.from(data['route'] ?? data));
  }

  Future<OrderSummary> createOrder({
    required Coordinate pickup,
    required Coordinate dropoff,
    required String tariffId,
    required double distanceKm,
    required double durationMin,
    String paymentMethod = 'CASH',
  }) async {
    await _attachToken();
    final response = await _dio.post<Map<String, dynamic>>('/api/orders', data: {
      'pickupLat': pickup.lat,
      'pickupLng': pickup.lng,
      'dropoffLat': dropoff.lat,
      'dropoffLng': dropoff.lng,
      'pickupText': 'Выбранная точка посадки',
      'dropoffText': 'Выбранная точка назначения',
      'tariffId': tariffId,
      'distanceKm': distanceKm,
      'durationMin': durationMin,
      'paymentMethod': paymentMethod,
    });
    final data = response.data ?? {};
    return OrderSummary.fromJson(Map<String, dynamic>.from(data['order'] ?? data));
  }

  Future<void> cancelPublicOrder(String orderId) async {
    await _attachToken();
    await _dio.post('/api/orders/$orderId/cancel-public');
  }

  Future<List<DriverRegion>> getDriverRegions() async {
    await _attachToken();
    final response = await _dio.get<dynamic>('/api/drivers/me/regions');
    final items = _extractList(response.data, 'regions');
    return items.map((item) => DriverRegion.fromJson(item)).toList(growable: false);
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

  Future<List<OrderSummary>> getOrders() async {
    await _attachToken();
    final response = await _dio.get<dynamic>('/api/orders');
    final items = _extractList(response.data, 'orders');
    return items.map((item) => OrderSummary.fromJson(item)).toList(growable: false);
  }

  Future<OrderSummary> acceptOrder(String orderId) => _postOrderAction('/api/orders/$orderId/accept');
  Future<OrderSummary> arrived(String orderId) => _postOrderAction('/api/orders/$orderId/arrived');
  Future<OrderSummary> startTrip(String orderId) => _postOrderAction('/api/orders/$orderId/start');
  Future<OrderSummary> completeTrip(String orderId) => _postOrderAction('/api/orders/$orderId/complete');
  Future<OrderSummary> cancelDriverOrder(String orderId) => _postOrderAction('/api/orders/$orderId/cancel');

  Future<RoutePreview> driverToPickupRoute(String orderId) async {
    await _attachToken();
    final response = await _dio.post<Map<String, dynamic>>('/api/routes/driver-to-pickup', data: {'orderId': orderId});
    final data = response.data ?? {};
    return RoutePreview.fromJson(Map<String, dynamic>.from(data['route'] ?? data));
  }

  Future<OrderSummary> _postOrderAction(String path) async {
    await _attachToken();
    final response = await _dio.post<Map<String, dynamic>>(path);
    final data = response.data ?? {};
    return OrderSummary.fromJson(Map<String, dynamic>.from(data['order'] ?? data));
  }

  List<Map<String, dynamic>> _extractList(dynamic data, String key) {
    if (data is List) return data.whereType<Map>().map((item) => Map<String, dynamic>.from(item)).toList(growable: false);
    if (data is Map && data[key] is List) {
      return (data[key] as List).whereType<Map>().map((item) => Map<String, dynamic>.from(item)).toList(growable: false);
    }
    if (data is Map && data['items'] is List) {
      return (data['items'] as List).whereType<Map>().map((item) => Map<String, dynamic>.from(item)).toList(growable: false);
    }
    return const [];
  }
}
