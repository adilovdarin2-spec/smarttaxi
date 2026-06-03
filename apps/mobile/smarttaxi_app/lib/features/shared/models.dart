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

class AddressSuggestion {
  const AddressSuggestion({
    required this.label,
    required this.coordinate,
    this.subtitle,
    this.city,
    this.region,
  });

  final String label;
  final Coordinate coordinate;
  final String? subtitle;
  final String? city;
  final String? region;

  factory AddressSuggestion.fromJson(Map<String, dynamic> json) {
    return AddressSuggestion(
      label: '${json['label'] ?? 'Точка на карте'}',
      subtitle: json['subtitle']?.toString(),
      city: json['city']?.toString(),
      region: json['region']?.toString(),
      coordinate: Coordinate(
        lat: _toDouble(json['lat']),
        lng: _toDouble(json['lng']),
      ),
    );
  }
}

class RegionOption {
  const RegionOption({
    required this.id,
    required this.name,
    this.center,
    this.boundary = const [],
  });

  final String id;
  final String name;
  final Coordinate? center;
  final List<Coordinate> boundary;

  factory RegionOption.fromJson(Map<String, dynamic> json) {
    return RegionOption(
      id: '${json['id'] ?? json['regionId']}',
      name: '${json['name'] ?? json['regionName'] ?? 'Регион'}',
      center: _coordinateFromFields(json, ['center_lat', 'centerLat', 'lat'],
          ['center_lng', 'centerLng', 'lng']),
      boundary: _boundaryFromJson(json['boundary']),
    );
  }

  bool contains(Coordinate point) {
    if (boundary.length < 3) return true;
    var inside = false;
    var j = boundary.length - 1;
    for (var i = 0; i < boundary.length; i += 1) {
      final pi = boundary[i];
      final pj = boundary[j];
      final crosses = ((pi.lat > point.lat) != (pj.lat > point.lat)) &&
          (point.lng <
              (pj.lng - pi.lng) *
                      (point.lat - pi.lat) /
                      ((pj.lat - pi.lat) == 0 ? 1e-12 : (pj.lat - pi.lat)) +
                  pi.lng);
      if (crosses) inside = !inside;
      j = i;
    }
    return inside;
  }
}

class DriverRegion {
  const DriverRegion(
      {required this.id,
      required this.name,
      required this.status,
      required this.isActive});

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
      name: '${json['displayName'] ?? json['name'] ?? 'Тариф'}',
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
    final estimate = json['estimate'] is Map
        ? Map<String, dynamic>.from(json['estimate'])
        : const <String, dynamic>{};
    return RoutePreview(
      regionId: (json['regionId'] ?? estimate['regionId'] ?? '').toString(),
      distanceMeters: _routeDistanceMeters(json),
      durationSeconds: _routeDurationSeconds(json),
      geometry: parseGeoJsonLine(json['geometry']),
      estimatedPrice:
          _nullableDouble(estimate['estimatedPrice'] ?? json['estimatedPrice']),
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
    this.tariff,
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
  final String? tariff;
  final String? driverId;
  final Coordinate? pickupCoordinate;
  final Coordinate? dropoffCoordinate;

  bool get isActive => const [
        'DRIVER_ASSIGNED',
        'DRIVER_ARRIVED',
        'IN_PROGRESS'
      ].contains(status);
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
      pickup:
          '${json['pickup_text'] ?? json['pickupText'] ?? json['pickup'] ?? 'Точка посадки'}',
      dropoff:
          '${json['dropoff_text'] ?? json['dropoffText'] ?? json['dropoff'] ?? 'Точка назначения'}',
      price: _nullableDouble(json['estimated_price'] ??
          json['estimatedPrice'] ??
          snapshot['estimatedPrice']),
      distanceKm: _nullableDouble(
          json['distance_km'] ?? json['distanceKm'] ?? snapshot['distanceKm']),
      durationMin: _nullableDouble(json['duration_min'] ??
          json['durationMin'] ??
          snapshot['durationMin']),
      tariff: (json['tariff'] ?? snapshot['tariffName'])?.toString(),
      driverId: json['driver_id']?.toString() ?? json['driverId']?.toString(),
      pickupCoordinate: _coordinateFromJson(json, 'pickup'),
      dropoffCoordinate: _coordinateFromJson(json, 'dropoff'),
    );
  }
}

class DriverLocation {
  const DriverLocation({required this.lat, required this.lng, this.heading});

  final double lat;
  final double lng;
  final double? heading;

  LatLng toLatLng() => LatLng(lat, lng);

  factory DriverLocation.fromJson(Map<String, dynamic> json) {
    return DriverLocation(
        lat: _toDouble(json['lat'] ?? json['driverLat']),
        lng: _toDouble(json['lng'] ?? json['driverLng']),
        heading: _nullableDouble(
          json['heading'] ?? json['bearing'] ?? json['driverHeading'],
        ));
  }
}

class RoadAlert {
  const RoadAlert({
    required this.id,
    required this.regionId,
    required this.type,
    required this.label,
    required this.lat,
    required this.lng,
    required this.status,
    required this.confirmationsCount,
    this.comment = '',
  });

  final String id;
  final String regionId;
  final String type;
  final String label;
  final double lat;
  final double lng;
  final String status;
  final int confirmationsCount;
  final String comment;

  LatLng toLatLng() => LatLng(lat, lng);

  factory RoadAlert.fromJson(Map<String, dynamic> json) {
    final type = (json['type'] ?? 'OTHER').toString();
    return RoadAlert(
      id: '${json['id']}',
      regionId: '${json['regionId'] ?? json['region_id'] ?? ''}',
      type: type,
      label: roadAlertLabel(type),
      lat: _toDouble(json['lat']),
      lng: _toDouble(json['lng']),
      status: '${json['status'] ?? 'ACTIVE'}',
      confirmationsCount:
          _toDouble(json['confirmationsCount'] ?? json['confirmations_count'])
              .round(),
      comment: (json['comment'] ?? '').toString(),
    );
  }
}

const roadAlertTypes = <String>[
  'ROAD_HAZARD',
  'ACCIDENT',
  'ROAD_WORK',
  'SPEED_CAMERA',
  'TRAFFIC_JAM',
  'ROAD_CLOSED',
  'OTHER',
];

String roadAlertLabel(String type) {
  return const {
        'ROAD_HAZARD': 'Дорожная опасность',
        'ACCIDENT': 'ДТП',
        'ROAD_WORK': 'Ремонт дороги',
        'SPEED_CAMERA': 'Камера скорости',
        'TRAFFIC_JAM': 'Пробка',
        'ROAD_CLOSED': 'Закрытая дорога',
        'OTHER': 'Другое',
      }[type] ??
      'Другое';
}

List<LatLng> parseGeoJsonLine(dynamic geometry) {
  if (geometry is! Map || geometry['coordinates'] is! List) return const [];
  return (geometry['coordinates'] as List)
      .whereType<List>()
      .where((point) => point.length >= 2)
      .map((point) => LatLng(_toDouble(point[1]), _toDouble(point[0])))
      .toList(growable: false);
}

List<Coordinate> _boundaryFromJson(dynamic boundary) {
  if (boundary is! List) return const [];
  return boundary
      .whereType<List>()
      .where((point) => point.length >= 2)
      .map((point) => Coordinate(
            lat: _toDouble(point[1]),
            lng: _toDouble(point[0]),
          ))
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

double _routeDistanceMeters(Map<String, dynamic> json) {
  final meters = _nullableDouble(json['distanceMeters']);
  if (meters != null) return meters;
  final km = _nullableDouble(json['distanceKm']);
  if (km != null) return km * 1000;
  return 0;
}

double _routeDurationSeconds(Map<String, dynamic> json) {
  final seconds = _nullableDouble(json['durationSeconds']);
  if (seconds != null) return seconds;
  final minutes = _nullableDouble(json['durationMin']);
  if (minutes != null) return minutes * 60;
  return 0;
}

Coordinate? _coordinateFromJson(Map<String, dynamic> json, String prefix) {
  final lat = _nullableDouble(json['${prefix}_lat'] ?? json['${prefix}Lat']);
  final lng = _nullableDouble(json['${prefix}_lng'] ?? json['${prefix}Lng']);
  if (lat == null || lng == null) return null;
  return Coordinate(lat: lat, lng: lng);
}

Coordinate? _coordinateFromFields(
    Map<String, dynamic> json, List<String> latKeys, List<String> lngKeys) {
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
