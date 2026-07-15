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

// "School route" recurring bookings — POST/GET /api/recurring-bookings.
// Field names and the PENDING_DRIVER/ACTIVE/PAUSED/CANCELLED lifecycle are
// read verbatim from recurring-bookings.routes.js's publicBooking(), not
// guessed.
class RecurringBooking {
  const RecurringBooking({
    required this.id,
    required this.clientId,
    required this.driverId,
    required this.pickupText,
    required this.pickupCoordinate,
    required this.dropoffText,
    required this.dropoffCoordinate,
    required this.daysOfWeek,
    required this.timeOfDay,
    required this.priceKzt,
    required this.status,
    this.driverName,
    this.clientName,
    this.notes = '',
    this.lastTriggeredDate,
    this.createdAt,
    this.updatedAt,
  });

  final String id;
  final String clientId;
  final String driverId;
  final String? driverName;
  final String? clientName;
  final String pickupText;
  final Coordinate pickupCoordinate;
  final String dropoffText;
  final Coordinate dropoffCoordinate;
  // ISO day-of-week, 1=Monday..5=Friday.
  final List<int> daysOfWeek;
  final String timeOfDay;
  final int priceKzt;
  final String status;
  final String notes;
  final String? lastTriggeredDate;
  final DateTime? createdAt;
  final DateTime? updatedAt;

  bool get isPendingDriver => status == 'PENDING_DRIVER';
  bool get isActive => status == 'ACTIVE';
  bool get isPaused => status == 'PAUSED';
  bool get isCancelled => status == 'CANCELLED';

  static const _dayLabels = {1: 'Пн', 2: 'Вт', 3: 'Ср', 4: 'Чт', 5: 'Пт'};

  String get daysLabel {
    final sorted = [...daysOfWeek]..sort();
    return sorted.map((d) => _dayLabels[d] ?? '?').join(', ');
  }

  factory RecurringBooking.fromJson(Map<String, dynamic> json) {
    return RecurringBooking(
      id: '${json['id']}',
      clientId: '${json['client_id'] ?? json['clientId']}',
      driverId: '${json['driver_id'] ?? json['driverId']}',
      driverName: (json['driver_name'] ?? json['driverName'])?.toString(),
      clientName: (json['client_name'] ?? json['clientName'])?.toString(),
      pickupText:
          '${json['pickup_text'] ?? json['pickupText'] ?? 'Точка посадки'}',
      pickupCoordinate: Coordinate(
        lat: _toDouble(json['pickup_lat'] ?? json['pickupLat']),
        lng: _toDouble(json['pickup_lng'] ?? json['pickupLng']),
      ),
      dropoffText:
          '${json['dropoff_text'] ?? json['dropoffText'] ?? 'Точка назначения'}',
      dropoffCoordinate: Coordinate(
        lat: _toDouble(json['dropoff_lat'] ?? json['dropoffLat']),
        lng: _toDouble(json['dropoff_lng'] ?? json['dropoffLng']),
      ),
      daysOfWeek: ((json['days_of_week'] ?? json['daysOfWeek']) as List?)
              ?.map((d) => int.tryParse('$d') ?? 0)
              .where((d) => d > 0)
              .toList() ??
          const [],
      timeOfDay: '${json['time_of_day'] ?? json['timeOfDay'] ?? '00:00'}',
      priceKzt:
          int.tryParse('${json['price_kzt'] ?? json['priceKzt'] ?? 0}') ?? 0,
      status: '${json['status'] ?? 'PENDING_DRIVER'}',
      notes: '${json['notes'] ?? ''}',
      lastTriggeredDate:
          (json['last_triggered_date'] ?? json['lastTriggeredDate'])
              ?.toString(),
      createdAt: DateTime.tryParse(
        '${json['created_at'] ?? json['createdAt'] ?? ''}',
      ),
      updatedAt: DateTime.tryParse(
        '${json['updated_at'] ?? json['updatedAt'] ?? ''}',
      ),
    );
  }
}

class FavoriteAddress {
  const FavoriteAddress({
    required this.id,
    required this.label,
    required this.title,
    required this.addressText,
    required this.lat,
    required this.lng,
    this.createdAt,
  });

  final String id;
  // HOME | WORK | OTHER
  final String label;
  final String title;
  final String addressText;
  final double lat;
  final double lng;
  final DateTime? createdAt;

  Coordinate get coordinate => Coordinate(lat: lat, lng: lng);

  factory FavoriteAddress.fromJson(Map<String, dynamic> json) {
    return FavoriteAddress(
      id: '${json['id']}',
      label: '${json['label'] ?? 'OTHER'}',
      title: '${json['title'] ?? ''}',
      addressText: '${json['address_text'] ?? json['addressText'] ?? ''}',
      lat: _toDouble(json['lat']),
      lng: _toDouble(json['lng']),
      createdAt: DateTime.tryParse(
        '${json['created_at'] ?? json['createdAt'] ?? ''}',
      ),
    );
  }
}

class DriverPreference {
  const DriverPreference({
    required this.id,
    required this.driverId,
    required this.type,
    this.driverName,
    this.driverCarModel,
    this.driverPlate,
    this.createdAt,
  });

  final String id;
  final String driverId;
  // FAVORITE | BLOCKED
  final String type;
  final String? driverName;
  final String? driverCarModel;
  final String? driverPlate;
  final DateTime? createdAt;

  bool get isFavorite => type == 'FAVORITE';
  bool get isBlocked => type == 'BLOCKED';

  factory DriverPreference.fromJson(Map<String, dynamic> json) {
    return DriverPreference(
      id: '${json['id']}',
      driverId: '${json['driver_id'] ?? json['driverId']}',
      type: '${json['type'] ?? 'FAVORITE'}',
      driverName: (json['driver_name'] ?? json['driverName'])?.toString(),
      driverCarModel:
          (json['driver_car_model'] ?? json['driverCarModel'])?.toString(),
      driverPlate: (json['driver_plate'] ?? json['driverPlate'])?.toString(),
      createdAt: DateTime.tryParse(
        '${json['created_at'] ?? json['createdAt'] ?? ''}',
      ),
    );
  }
}

class ReferralSummary {
  const ReferralSummary({
    required this.code,
    required this.invitedCount,
    required this.totalBonusEarned,
  });

  final String code;
  final int invitedCount;
  final int totalBonusEarned;

  factory ReferralSummary.fromJson(Map<String, dynamic> json) {
    return ReferralSummary(
      code: '${json['code'] ?? ''}',
      invitedCount:
          int.tryParse('${json['invitedCount'] ?? json['invited_count'] ?? 0}') ??
              0,
      totalBonusEarned: int.tryParse(
              '${json['totalBonusEarned'] ?? json['total_bonus_earned'] ?? 0}') ??
          0,
    );
  }
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
    this.supportPhone,
  });

  final String id;
  final String name;
  final Coordinate? center;
  final List<Coordinate> boundary;
  final String? supportPhone;

  factory RegionOption.fromJson(Map<String, dynamic> json) {
    return RegionOption(
      id: '${json['id'] ?? json['regionId']}',
      name: '${json['name'] ?? json['regionName'] ?? 'Регион'}',
      center: _coordinateFromFields(json, ['center_lat', 'centerLat', 'lat'],
          ['center_lng', 'centerLng', 'lng']),
      boundary: _boundaryFromJson(json['boundary']),
      supportPhone:
          (json['support_phone'] ?? json['supportPhone'])?.toString(),
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
      required this.isActive,
      this.center});

  final String id;
  final String name;
  final String status;
  final bool isActive;
  final Coordinate? center;

  factory DriverRegion.fromJson(Map<String, dynamic> json) {
    return DriverRegion(
      id: '${json['id'] ?? json['regionId']}',
      name: '${json['name'] ?? json['regionName'] ?? 'Регион'}',
      status: '${json['status'] ?? 'APPROVED'}',
      isActive: json['is_active'] != false && json['isActive'] != false,
      center: _coordinateFromFields(json, ['center_lat', 'centerLat', 'lat'],
          ['center_lng', 'centerLng', 'lng']),
    );
  }
}

class DriverStats {
  const DriverStats({
    required this.ordersTotal,
    required this.completedOrders,
    required this.revenueTotal,
    required this.debt,
    required this.balance,
  });

  final int ordersTotal;
  final int completedOrders;
  final int revenueTotal;
  final int debt;
  final int balance;

  factory DriverStats.fromJson(Map<String, dynamic> json) {
    final today =
        json['today'] is Map ? Map<String, dynamic>.from(json['today']) : json;
    return DriverStats(
      ordersTotal:
          _toDouble(today['orders_total'] ?? today['ordersTotal']).round(),
      completedOrders:
          _toDouble(today['completed_orders'] ?? today['completedOrders'])
              .round(),
      revenueTotal:
          _toDouble(today['revenue_total'] ?? today['revenueTotal']).round(),
      debt: _toDouble(today['debt']).round(),
      balance: _toDouble(today['balance']).round(),
    );
  }
}

class TariffOption {
  const TariffOption({
    required this.id,
    required this.name,
    this.description,
    this.surgeMultiplier = 1,
    this.demandCoefficient = 1,
  });

  final String id;
  final String name;
  final String? description;
  // Real, server-computed pricing multipliers (tariffs.routes.js
  // publicTariff) — the only demand signal the backend actually exposes;
  // there is no separate spatial "demand zone"/heatmap endpoint.
  final double surgeMultiplier;
  final double demandCoefficient;

  factory TariffOption.fromJson(Map<String, dynamic> json) {
    return TariffOption(
      id: '${json['id']}',
      name: '${json['displayName'] ?? json['name'] ?? 'Тариф'}',
      description: json['description']?.toString(),
      surgeMultiplier: _toDouble(json['surgeMultiplier'] ?? 1),
      demandCoefficient: _toDouble(json['demandCoefficient'] ?? 1),
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
    this.phase,
    this.targetLat,
    this.targetLng,
    this.driverLat,
    this.driverLng,
  });

  final String regionId;
  final double distanceMeters;
  final double durationSeconds;
  final List<LatLng> geometry;
  final double? estimatedPrice;
  final String? tariffName;
  // Only set on the live "driver active route" response: 'to_pickup' while
  // the driver is heading to the client, 'to_dropoff' once the trip has
  // started — lets the UI label distance/ETA for whichever leg is actually
  // happening right now instead of always assuming pickup.
  final String? phase;
  final double? targetLat;
  final double? targetLng;
  // Also only set on the driver-active-route response — lets the rider's
  // map place the driver marker immediately from this one call instead of
  // waiting for the next GPS-triggered socket event (which may be minutes
  // away if the driver hasn't moved 20m yet, e.g. right after a cold start).
  final double? driverLat;
  final double? driverLng;

  bool get isToDropoff => phase == 'to_dropoff';

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
      phase: json['phase']?.toString(),
      targetLat: _nullableDouble(json['targetLat']),
      targetLng: _nullableDouble(json['targetLng']),
      driverLat: _nullableDouble(json['driverLat']),
      driverLng: _nullableDouble(json['driverLng']),
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
    this.paymentMethod,
    this.riderPhone,
    this.riderName,
    this.regionId,
    this.pickupCoordinate,
    this.dropoffCoordinate,
    this.driverName,
    this.driverPhone,
    this.driverCarModel,
    this.driverCarColor,
    this.driverPlate,
    this.driverRating,
    this.offeredPriceKzt,
    this.shareToken,
    this.createdAt,
    this.driverOfferPriceKzt,
    this.driverOfferStatus,
    this.driverOfferByDriverId,
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
  final String? paymentMethod;
  final String? riderPhone;
  final String? riderName;
  final String? regionId;
  final Coordinate? pickupCoordinate;
  final Coordinate? dropoffCoordinate;
  final String? driverName;
  final String? driverPhone;
  final String? driverCarModel;
  final String? driverCarColor;
  final String? driverPlate;
  final double? driverRating;
  // Set when the rider raised/lowered the fare via the "своя цена" stepper
  // instead of accepting the calculated estimate as-is.
  final int? offeredPriceKzt;
  // Unguessable id for the public "поделиться поездкой" tracking link —
  // distinct from `id` so a shared link can't be used to look up other
  // orders.
  final String? shareToken;
  final DateTime? createdAt;
  // Torg: a driver may counter-propose a price on an open order via
  // POST /orders/:id/price-offer. driverOfferStatus is PENDING while the
  // rider hasn't answered yet, then ACCEPTED/DECLINED; null when no offer
  // has ever been made.
  final int? driverOfferPriceKzt;
  final String? driverOfferStatus;
  final String? driverOfferByDriverId;

  bool get hasPendingDriverOffer =>
      driverOfferStatus == 'PENDING' && driverOfferPriceKzt != null;

  OrderSummary copyWith({String? status}) {
    return OrderSummary(
      id: id,
      status: status ?? this.status,
      pickup: pickup,
      dropoff: dropoff,
      price: price,
      distanceKm: distanceKm,
      durationMin: durationMin,
      tariff: tariff,
      driverId: driverId,
      paymentMethod: paymentMethod,
      riderPhone: riderPhone,
      riderName: riderName,
      regionId: regionId,
      pickupCoordinate: pickupCoordinate,
      dropoffCoordinate: dropoffCoordinate,
      driverName: driverName,
      driverPhone: driverPhone,
      driverCarModel: driverCarModel,
      driverCarColor: driverCarColor,
      driverPlate: driverPlate,
      driverRating: driverRating,
      offeredPriceKzt: offeredPriceKzt,
      shareToken: shareToken,
      createdAt: createdAt,
      driverOfferPriceKzt: driverOfferPriceKzt,
      driverOfferStatus: driverOfferStatus,
      driverOfferByDriverId: driverOfferByDriverId,
    );
  }

  bool get isActive => const [
        'DRIVER_FOUND',
        'DRIVER_GOING_TO_CLIENT',
        'DRIVER_ASSIGNED',
        'DRIVER_ARRIVED',
        'WAITING_CLIENT',
        'TRIP_STARTED',
        'IN_PROGRESS'
      ].contains(status);
  bool get isOpen => const ['NEW', 'SEARCHING_DRIVER'].contains(status);

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
      // orders.price (or a "своя цена" bid) is the actual/final amount —
      // prefer it over the frozen pricing_snapshot.estimatedPrice, which
      // stays fixed at whatever was calculated when the order was created
      // and won't reflect a bid the rider placed instead.
      price: _nullableDouble(json['price'] ??
          json['estimated_price'] ??
          json['estimatedPrice'] ??
          snapshot['estimatedPrice']),
      distanceKm: _nullableDouble(
          json['distance_km'] ?? json['distanceKm'] ?? snapshot['distanceKm']),
      durationMin: _nullableDouble(json['duration_min'] ??
          json['durationMin'] ??
          snapshot['durationMin']),
      tariff: (json['tariff'] ?? snapshot['tariffName'])?.toString(),
      driverId: json['driver_id']?.toString() ?? json['driverId']?.toString(),
      paymentMethod:
          (json['payment_method'] ?? json['paymentMethod'])?.toString(),
      riderPhone: (json['rider_phone'] ??
              json['riderPhone'] ??
              json['clientPhone'] ??
              json['client_phone'])
          ?.toString(),
      riderName: (json['rider_name'] ?? json['riderName'])?.toString(),
      regionId: (json['region_id'] ?? json['regionId'])?.toString(),
      pickupCoordinate: _coordinateFromJson(json, 'pickup'),
      dropoffCoordinate: _coordinateFromJson(json, 'dropoff'),
      driverName: (json['driver_name'] ?? json['driverName'])?.toString(),
      driverPhone: (json['driver_phone'] ?? json['driverPhone'])?.toString(),
      driverCarModel:
          (json['driver_car_model'] ?? json['driverCarModel'])?.toString(),
      driverCarColor:
          (json['driver_car_color'] ?? json['driverCarColor'])?.toString(),
      driverPlate: (json['driver_plate'] ?? json['driverPlate'])?.toString(),
      driverRating:
          _nullableDouble(json['driver_rating'] ?? json['driverRating']),
      offeredPriceKzt: int.tryParse(
        '${json['offered_price_kzt'] ?? json['offeredPriceKzt'] ?? ''}',
      ),
      shareToken: (json['share_token'] ?? json['shareToken'])?.toString(),
      createdAt: DateTime.tryParse(
        '${json['created_at'] ?? json['createdAt'] ?? ''}',
      ),
      driverOfferPriceKzt: int.tryParse(
        '${json['driver_offer_price_kzt'] ?? json['driverOfferPriceKzt'] ?? ''}',
      ),
      driverOfferStatus:
          (json['driver_offer_status'] ?? json['driverOfferStatus'])
              ?.toString(),
      driverOfferByDriverId: (json['driver_offer_by_driver_id'] ??
              json['driverOfferByDriverId'])
          ?.toString(),
    );
  }
}

class PaymentInfo {
  const PaymentInfo({
    required this.id,
    required this.orderId,
    required this.method,
    required this.provider,
    required this.status,
    this.amount,
    this.failureReason,
    this.orderStatus,
  });

  final String id;
  final String orderId;
  final String method;
  final String provider;
  final String status;
  final double? amount;
  final String? failureReason;
  // The order's status as of this response — a PAID payment moves the order
  // to PAID server-side too, so the client can sync without a full refetch.
  final String? orderStatus;

  bool get isProcessing => status == 'PROCESSING';
  bool get isPaid => status == 'PAID';
  bool get isFailed => status == 'FAILED';

  factory PaymentInfo.fromJson(Map<String, dynamic> json) {
    return PaymentInfo(
      id: '${json['id']}',
      orderId: '${json['orderId'] ?? json['order_id']}',
      method: '${json['method'] ?? 'CASH'}',
      provider: '${json['provider'] ?? 'MANUAL'}',
      status: '${json['status'] ?? 'PENDING'}',
      amount: _nullableDouble(json['amount']),
      failureReason:
          (json['failureReason'] ?? json['failure_reason'])?.toString(),
      orderStatus:
          (json['orderStatus'] ?? json['order_status'])?.toString(),
    );
  }
}

class AppNotification {
  const AppNotification({
    required this.id,
    required this.title,
    required this.body,
    required this.type,
    this.orderId,
    this.readAt,
    required this.createdAt,
  });

  final String id;
  final String title;
  final String body;
  final String type;
  final String? orderId;
  final DateTime? readAt;
  final DateTime createdAt;

  bool get isUnread => readAt == null;

  factory AppNotification.fromJson(Map<String, dynamic> json) {
    final readAtRaw = (json['readAt'] ?? json['read_at'])?.toString();
    final createdAtRaw =
        (json['createdAt'] ?? json['created_at'])?.toString();
    return AppNotification(
      id: '${json['id']}',
      title: '${json['title'] ?? ''}',
      body: '${json['body'] ?? ''}',
      type: '${json['type'] ?? 'ORDER_STATUS'}',
      orderId: (json['orderId'] ?? json['order_id'])?.toString(),
      readAt: readAtRaw == null || readAtRaw.isEmpty
          ? null
          : DateTime.tryParse(readAtRaw),
      createdAt: createdAtRaw == null
          ? DateTime.now()
          : DateTime.tryParse(createdAtRaw) ?? DateTime.now(),
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

class NearbyDriver {
  const NearbyDriver({
    required this.id,
    required this.lat,
    required this.lng,
    required this.etaMin,
    this.bearing,
  });

  final String id;
  final double lat;
  final double lng;
  final int etaMin;
  final double? bearing;

  LatLng toLatLng() => LatLng(lat, lng);

  factory NearbyDriver.fromJson(Map<String, dynamic> json) {
    return NearbyDriver(
      id: '${json['id'] ?? ''}',
      lat: _toDouble(json['lat']),
      lng: _toDouble(json['lng']),
      etaMin: _toDouble(json['etaMin'] ?? json['eta_min'] ?? 3)
          .round()
          .clamp(1, 60)
          .toInt(),
      bearing: _nullableDouble(json['bearing'] ?? json['heading']),
    );
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
    this.dismissalsCount = 0,
    this.confidenceScore = 50,
    this.speedLimit,
    this.comment = '',
    this.heading,
  });

  final String id;
  final String regionId;
  final String type;
  final String label;
  final double lat;
  final double lng;
  final String status;
  final int confirmationsCount;
  final int dismissalsCount;
  final int confidenceScore;
  final int? speedLimit;
  final String comment;
  /// Compass heading (0-360, clockwise from north) the alert/camera faces,
  /// when known. Null means direction data isn't available — never guessed.
  final double? heading;

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
      dismissalsCount:
          _toDouble(json['dismissalsCount'] ?? json['dismissals_count'])
              .round(),
      confidenceScore:
          _toDouble(json['confidenceScore'] ?? json['confidence_score'] ?? 50)
              .round(),
      speedLimit:
          _nullableDouble(json['speedLimit'] ?? json['speed_limit'])?.round(),
      comment: (json['comment'] ?? '').toString(),
      heading: _nullableDouble(json['heading']),
    );
  }
}

/// 16-point compass abbreviation (Russian) for a 0-360 heading — used to
/// show which way a camera faces without relying on a rotated icon asset.
String compassLabel(double headingDegrees) {
  const labels = [
    'С', 'ССВ', 'СВ', 'ВСВ',
    'В', 'ВЮВ', 'ЮВ', 'ЮЮВ',
    'Ю', 'ЮЮЗ', 'ЮЗ', 'ЗЮЗ',
    'З', 'ЗСЗ', 'СЗ', 'ССЗ'
  ];
  final normalized = ((headingDegrees % 360) + 360) % 360;
  final index = ((normalized / 22.5) + 0.5).floor() % 16;
  return labels[index];
}

class SupportMessage {
  const SupportMessage({
    required this.id,
    required this.topic,
    required this.message,
    required this.status,
    this.adminResponse,
    this.respondedAt,
    this.createdAt,
  });

  final String id;
  final String topic;
  final String message;
  final String status;
  final String? adminResponse;
  final DateTime? respondedAt;
  final DateTime? createdAt;

  bool get isResolved => status == 'RESOLVED';

  factory SupportMessage.fromJson(Map<String, dynamic> json) {
    DateTime? parseDate(dynamic value) =>
        value == null ? null : DateTime.tryParse(value.toString());
    return SupportMessage(
      id: '${json['id']}',
      topic: '${json['topic'] ?? ''}',
      message: '${json['message'] ?? ''}',
      status: '${json['status'] ?? 'OPEN'}',
      adminResponse: json['adminResponse']?.toString(),
      respondedAt: parseDate(json['respondedAt']),
      createdAt: parseDate(json['createdAt']),
    );
  }
}

/// A mapped roadside sign (OSM `traffic_sign` tag) — distinct from
/// [RoadAlert] because it's a passive landmark the navigator calls out as
/// the driver passes it, not an incident someone reported and can confirm
/// or dismiss.
class OsmSign {
  const OsmSign({
    required this.id,
    required this.lat,
    required this.lng,
    required this.label,
    this.speedLimit,
    this.heading,
  });

  final String id;
  final double lat;
  final double lng;
  final String label;
  final int? speedLimit;
  final double? heading;

  LatLng toLatLng() => LatLng(lat, lng);

  factory OsmSign.fromJson(Map<String, dynamic> json) {
    return OsmSign(
      id: '${json['id']}',
      lat: _toDouble(json['lat']),
      lng: _toDouble(json['lng']),
      label: (json['label'] ?? 'Дорожный знак').toString(),
      speedLimit: _nullableDouble(json['speedLimit'])?.round(),
      heading: _nullableDouble(json['heading']),
    );
  }
}

class OsmNavigationInfo {
  const OsmNavigationInfo({
    required this.cameras,
    this.speedLimit,
    this.signs = const [],
  });

  final List<RoadAlert> cameras;
  final int? speedLimit;
  final List<OsmSign> signs;
}

const roadAlertTypes = <String>[
  'ROAD_HAZARD',
  'ACCIDENT',
  'ROAD_WORK',
  'SPEED_CAMERA',
  'POLICE',
  'TRAFFIC_JAM',
  'ROAD_CLOSED',
  'BAD_ROAD',
  'POTHOLE',
  'SPEED_BUMP',
  'ICY_ROAD',
  'SCHOOL_ZONE',
  'TEMPORARY_SPEED_LIMIT',
  'DANGEROUS_TURN',
  'RAILROAD_CROSSING',
  'PEDESTRIAN_CROSSING',
  'OTHER',
];

String roadAlertLabel(String type) {
  return const {
        'ROAD_HAZARD': 'Дорожная опасность',
        'ACCIDENT': 'ДТП',
        'ROAD_WORK': 'Ремонт дороги',
        'SPEED_CAMERA': 'Камера скорости',
        'POLICE': 'Контроль движения',
        'TRAFFIC_JAM': 'Пробка',
        'ROAD_CLOSED': 'Закрытая дорога',
        'BAD_ROAD': 'Плохая дорога',
        'POTHOLE': 'Яма',
        'SPEED_BUMP': 'Лежачий полицейский',
        'ICY_ROAD': 'Скользкая дорога',
        'SCHOOL_ZONE': 'Школьная зона',
        'TEMPORARY_SPEED_LIMIT': 'Временное ограничение',
        'DANGEROUS_TURN': 'Опасный поворот',
        'RAILROAD_CROSSING': 'Ж/д переезд',
        'PEDESTRIAN_CROSSING': 'Пешеходный переход',
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
