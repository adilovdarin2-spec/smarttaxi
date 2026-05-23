import 'package:latlong2/latlong.dart';

class Coordinate {
  const Coordinate({required this.lat, required this.lng});

  final double lat;
  final double lng;

  Map<String, dynamic> toJson({String prefix = ''}) => {
        '${prefix}Lat': lat,
        '${prefix}Lng': lng,
      };

  LatLng toLatLng() => LatLng(lat, lng);
}

class RegionOption {
  const RegionOption({required this.id, required this.name, this.center});

  final String id;
  final String name;
  final Coordinate? center;

  factory RegionOption.fromJson(Map<String, dynamic> json) {
    return RegionOption(
      id: '${json['id'] ?? json['regionId']}',
      name: '${json['name'] ?? json['regionName'] ?? 'Регион'}',
      center: _coordinateFromFields(json, ['center_lat', 'centerLat', 'lat'], ['center_lng', 'centerLng', 'lng']),
    );
  }
}

class DriverRegion {
  const DriverRegion({required this.id, required this.name, required this.status, required this.isActive});

  final String id;
  final String name;
  final String status;
  final bool isActive;

  factory DriverRegion.fromJson(Map<String, dynamic> json) {
    return DriverRegion(
      id: '${json['id'] ?? json['regionId']}',
      name: '${json['name'] ?? json['regionName'] ?? 'Регион'}',
      status: '${json['status'] ?? 'APPROVED'}',
      isActive: json['is_active'] != false && json['isActive'] != false,
    );
  }
}

class TariffOption {
  const TariffOption({required this.id, required this.name, this.description});

  final String id;
  final String name;
  final String? description;

  factory TariffOption.fromJson(Map<String, dynamic> json) {
    return TariffOption(
      id: '${json['id']}',
      name: '${json['name'] ?? 'Тариф'}',
      description: json['description']?.toString(),
    );
  }
}

class RoutePreview {
  const RoutePreview({
    required this.regionId,
    required this.distanceMeters,
    required this.durationSeconds,
    required this.geometry,
    this.estimatedPrice,
    this.tariffName,
  });

  final String regionId;
  final double distanceMeters;
  final double durationSeconds;
  final List<LatLng> geometry;
  final double? estimatedPrice;
  final String? tariffName;

  factory RoutePreview.fromJson(Map<String, dynamic> json) {
    final estimate = json['estimate'] is Map ? Map<String, dynamic>.from(json['estimate']) : const <String, dynamic>{};
    return RoutePreview(
      regionId: (json['regionId'] ?? estimate['regionId'] ?? '').toString(),
      distanceMeters: _toDouble(json['distanceMeters']),
      durationSeconds: _toDouble(json['durationSeconds']),
      geometry: parseGeoJsonLine(json['geometry']),
      estimatedPrice: _nullableDouble(estimate['estimatedPrice'] ?? json['estimatedPrice']),
      tariffName: estimate['tariffName']?.toString(),
    );
  }
}

class OrderSummary {
  const OrderSummary({
    required this.id,
    required this.status,
    required this.pickup,
    required this.dropoff,
    this.price,
    this.distanceKm,
    this.durationMin,
    this.driverId,
    this.pickupCoordinate,
    this.dropoffCoordinate,
  });

  final String id;
  final String status;
  final String pickup;
  final String dropoff;
  final double? price;
  final double? distanceKm;
  final double? durationMin;
  final String? driverId;
  final Coordinate? pickupCoordinate;
  final Coordinate? dropoffCoordinate;

  bool get isActive => const ['DRIVER_ASSIGNED', 'DRIVER_ARRIVED', 'IN_PROGRESS'].contains(status);
  bool get isOpen => status == 'NEW';

  factory OrderSummary.fromJson(Map<String, dynamic> json) {
    final snapshot = json['pricing_snapshot'] is Map
        ? Map<String, dynamic>.from(json['pricing_snapshot'])
        : json['pricingSnapshot'] is Map
            ? Map<String, dynamic>.from(json['pricingSnapshot'])
            : const <String, dynamic>{};
    return OrderSummary(
      id: '${json['id']}',
      status: '${json['status'] ?? json['public_status'] ?? 'NEW'}',
      pickup: '${json['pickup_text'] ?? json['pickupText'] ?? json['pickup'] ?? 'Точка посадки'}',
      dropoff: '${json['dropoff_text'] ?? json['dropoffText'] ?? json['dropoff'] ?? 'Точка назначения'}',
      price: _nullableDouble(json['estimated_price'] ?? json['estimatedPrice'] ?? snapshot['estimatedPrice']),
      distanceKm: _nullableDouble(json['distance_km'] ?? json['distanceKm'] ?? snapshot['distanceKm']),
      durationMin: _nullableDouble(json['duration_min'] ?? json['durationMin'] ?? snapshot['durationMin']),
      driverId: json['driver_id']?.toString() ?? json['driverId']?.toString(),
      pickupCoordinate: _coordinateFromJson(json, 'pickup'),
      dropoffCoordinate: _coordinateFromJson(json, 'dropoff'),
    );
  }
}

class DriverLocation {
  const DriverLocation({required this.lat, required this.lng});

  final double lat;
  final double lng;

  LatLng toLatLng() => LatLng(lat, lng);

  factory DriverLocation.fromJson(Map<String, dynamic> json) {
    return DriverLocation(lat: _toDouble(json['lat'] ?? json['driverLat']), lng: _toDouble(json['lng'] ?? json['driverLng']));
  }
}

List<LatLng> parseGeoJsonLine(dynamic geometry) {
  if (geometry is! Map || geometry['coordinates'] is! List) return const [];
  return (geometry['coordinates'] as List)
      .whereType<List>()
      .where((point) => point.length >= 2)
      .map((point) => LatLng(_toDouble(point[1]), _toDouble(point[0])))
      .toList(growable: false);
}

double _toDouble(dynamic value) {
  if (value is num) return value.toDouble();
  return double.tryParse('$value') ?? 0;
}

double? _nullableDouble(dynamic value) {
  if (value == null) return null;
  if (value is num) return value.toDouble();
  return double.tryParse('$value');
}

Coordinate? _coordinateFromJson(Map<String, dynamic> json, String prefix) {
  final lat = _nullableDouble(json['${prefix}_lat'] ?? json['${prefix}Lat']);
  final lng = _nullableDouble(json['${prefix}_lng'] ?? json['${prefix}Lng']);
  if (lat == null || lng == null) return null;
  return Coordinate(lat: lat, lng: lng);
}

Coordinate? _coordinateFromFields(Map<String, dynamic> json, List<String> latKeys, List<String> lngKeys) {
  double? lat;
  double? lng;
  for (final key in latKeys) {
    lat ??= _nullableDouble(json[key]);
  }
  for (final key in lngKeys) {
    lng ??= _nullableDouble(json[key]);
  }
  if (lat == null || lng == null) return null;
  return Coordinate(lat: lat, lng: lng);
}
