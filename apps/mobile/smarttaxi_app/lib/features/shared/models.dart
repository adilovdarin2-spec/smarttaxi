import 'package:latlong2/latlong.dart';

import '../../l10n/app_localizations.dart';

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
      pickupText: _sanitizeAddressText(
          '${json['pickup_text'] ?? json['pickupText'] ?? 'Точка посадки'}',
          'Точка посадки'),
      pickupCoordinate: Coordinate(
        lat: _toDouble(json['pickup_lat'] ?? json['pickupLat']),
        lng: _toDouble(json['pickup_lng'] ?? json['pickupLng']),
      ),
      dropoffText: _sanitizeAddressText(
          '${json['dropoff_text'] ?? json['dropoffText'] ?? 'Точка назначения'}',
          'Точка назначения'),
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

/// Driver-side mirror of [DriverPreference] (which is the rider favoriting/
/// blocking a driver via /api/favorites/drivers) — same FAVORITE/BLOCKED
/// upsert shape, this time the driver favoriting/blocking a rider via
/// /api/favorites/clients. That backend module is being built in parallel
/// (see project memory); this model matches the documented contract so the
/// UI is ready as soon as it lands.
class ClientPreference {
  const ClientPreference({
    required this.id,
    required this.clientId,
    required this.type,
    this.clientName,
    this.clientPhone,
    this.createdAt,
  });

  final String id;
  final String clientId;
  // FAVORITE | BLOCKED
  final String type;
  final String? clientName;
  final String? clientPhone;
  final DateTime? createdAt;

  bool get isFavorite => type == 'FAVORITE';
  bool get isBlocked => type == 'BLOCKED';

  factory ClientPreference.fromJson(Map<String, dynamic> json) {
    return ClientPreference(
      id: '${json['id']}',
      clientId: '${json['client_id'] ?? json['clientId']}',
      type: '${json['type'] ?? 'FAVORITE'}',
      clientName: (json['client_name'] ?? json['clientName'])?.toString(),
      clientPhone: (json['client_phone'] ?? json['clientPhone'])?.toString(),
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

// GET /clients/me returns the raw clients row (clients.routes.js), so this
// only parses the one field the app actually needs today rather than
// mirroring the whole row.
class ClientBalance {
  const ClientBalance({required this.cashbackBalanceKzt});

  final int cashbackBalanceKzt;

  factory ClientBalance.fromJson(Map<String, dynamic> json) {
    final client = json['client'] as Map<String, dynamic>? ?? json;
    return ClientBalance(
      cashbackBalanceKzt: int.tryParse(
            '${client['cashback_balance'] ?? client['cashbackBalance'] ?? 0}',
          ) ??
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

class AppVersionInfo {
  const AppVersionInfo({
    required this.latestVersion,
    required this.minSupportedVersion,
    this.updateUrl,
    this.updateNotes,
    this.updateRequired = false,
    this.updateAvailable = false,
  });

  final String latestVersion;
  final String minSupportedVersion;
  final String? updateUrl;
  final String? updateNotes;
  final bool updateRequired;
  final bool updateAvailable;

  factory AppVersionInfo.fromJson(Map<String, dynamic> json) {
    return AppVersionInfo(
      latestVersion: '${json['latestVersion'] ?? '1.0.0'}',
      minSupportedVersion: '${json['minSupportedVersion'] ?? '1.0.0'}',
      updateUrl: (json['updateUrl'] as String?)?.trim().isEmpty ?? true
          ? null
          : json['updateUrl'] as String?,
      updateNotes: (json['updateNotes'] as String?)?.trim().isEmpty ?? true
          ? null
          : json['updateNotes'] as String?,
      updateRequired: json['updateRequired'] == true,
      updateAvailable: json['updateAvailable'] == true,
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
      this.blockReason = '',
      this.center});

  final String id;
  final String name;
  final String status;
  final bool isActive;
  // Only meaningful when status == 'BLOCKED' (driver_region_approvals.
  // block_reason, set by the admin who blocked this driver for the region).
  final String blockReason;
  final Coordinate? center;

  factory DriverRegion.fromJson(Map<String, dynamic> json) {
    return DriverRegion(
      // GET /drivers/me/regions returns each row from
      // driver_region_approvals, where `id` is the *approval* row's own id
      // and `regionId` is the real regions.id this driver actually needs —
      // the one PATCH /drivers/me/region expects and the one that ends up
      // in drivers.current_region_id. Preferring `id` here (as this used
      // to) sent the approval-row id as "the region" everywhere in the
      // driver shell, which the backend's region lookup rejects as
      // REGION_NOT_FOUND. `regionId` first, `id` as a fallback only for a
      // hypothetical caller whose JSON shape has no separate approval
      // wrapper.
      id: '${json['regionId'] ?? json['id']}',
      name: '${json['name'] ?? json['regionName'] ?? 'Регион'}',
      status: '${json['status'] ?? 'APPROVED'}',
      isActive: json['is_active'] != false && json['isActive'] != false,
      blockReason: '${json['blockReason'] ?? json['block_reason'] ?? ''}',
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
    this.driverId,
  });

  final int ordersTotal;
  final int completedOrders;
  final int revenueTotal;
  final int debt;
  final int balance;
  // From the sibling top-level `driver` object on /drivers/me/stats — this
  // driver's own drivers.id, needed to tell "I made this price offer" apart
  // from "some other driver made this price offer on an order I can also
  // see" (open orders are visible to every driver in the region).
  final String? driverId;

  factory DriverStats.fromJson(Map<String, dynamic> json) {
    final today =
        json['today'] is Map ? Map<String, dynamic>.from(json['today']) : json;
    final driver =
        json['driver'] is Map ? Map<String, dynamic>.from(json['driver']) : null;
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
      driverId: driver?['id']?.toString(),
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
    this.minimumPrice = 0,
  });

  final String id;
  final String name;
  final String? description;
  // Real, server-computed pricing multipliers (tariffs.routes.js
  // publicTariff) — the only demand signal the backend actually exposes;
  // there is no separate spatial "demand zone"/heatmap endpoint.
  final double surgeMultiplier;
  final double demandCoefficient;
  // Floor price for this tariff regardless of distance/time (tariffs.min_price
  // via publicTariff's minimumPrice) — used as the cheapest-ride reference for
  // the "balance covers N more rides" estimate, since that has to work
  // without an active route preview (no pickup/dropoff chosen yet).
  final double minimumPrice;

  factory TariffOption.fromJson(Map<String, dynamic> json) {
    return TariffOption(
      id: '${json['id']}',
      name: '${json['displayName'] ?? json['name'] ?? 'Тариф'}',
      description: json['description']?.toString(),
      surgeMultiplier: _toDouble(json['surgeMultiplier'] ?? 1),
      demandCoefficient: _toDouble(json['demandCoefficient'] ?? 1),
      minimumPrice: _toDouble(
        json['minimumPrice'] ?? json['minimum_price'] ?? 0,
      ),
    );
  }
}

// One real OSRM turn-by-turn step (routing.service.js's requestRoute now
// asks OSRM for steps=true instead of false) — real street name and real
// maneuver type/modifier from the routing engine, not a guess derived from
// bearing changes in the plain route geometry.
class RouteStep {
  const RouteStep({
    required this.type,
    required this.modifier,
    required this.streetName,
    required this.distanceMeters,
    required this.location,
    this.exit,
  });

  // OSRM maneuver.type: 'turn', 'depart', 'arrive', 'merge', 'roundabout',
  // 'fork', 'end of road', 'on ramp', 'off ramp', 'new name', 'continue',
  // etc.
  final String type;
  // OSRM maneuver.modifier: 'left', 'right', 'slight left', 'slight right',
  // 'sharp left', 'sharp right', 'straight', 'uturn' — null for types that
  // don't carry one (e.g. most 'depart'/'arrive' steps).
  final String? modifier;
  // "" when OSRM has no name for the way (unnamed alley, parking-lot link,
  // etc.) — a real gap in the source data, not a parse failure.
  final String streetName;
  final double distanceMeters;
  final Coordinate location;
  // Only set for a 'roundabout'/'rotary'/'roundabout turn' maneuver — which
  // exit to take, counting from 1. Null for every other maneuver type.
  final int? exit;

  factory RouteStep.fromJson(Map<String, dynamic> json) {
    return RouteStep(
      type: '${json['type'] ?? 'turn'}',
      modifier: json['modifier']?.toString(),
      streetName: '${json['streetName'] ?? ''}',
      distanceMeters: _toDouble(json['distanceMeters']),
      location: Coordinate(
        lat: _toDouble(json['lat']),
        lng: _toDouble(json['lng']),
      ),
      exit: json['exit'] is num ? (json['exit'] as num).toInt() : null,
    );
  }
}

class RoutePreview {
  const RoutePreview({
    required this.regionId,
    required this.distanceMeters,
    required this.durationSeconds,
    required this.geometry,
    this.steps = const [],
    this.estimatedPrice,
    this.tariffName,
    this.phase,
    this.targetLat,
    this.targetLng,
    this.driverLat,
    this.driverLng,
    this.isFallback = false,
  });

  final String regionId;
  final double distanceMeters;
  final double durationSeconds;
  final List<LatLng> geometry;
  // True when OSRM was unreachable and routing.service.js drew a straight
  // line between the two points instead of a real road route
  // (straightLineRouteFallback) — distance/duration are rough estimates,
  // not what the road actually measures. Previously silent: the client had
  // no way to tell a real route from this guess even though the backend
  // already sent `fallback: true` on the response.
  final bool isFallback;
  // Empty when the route came from the straight-line fallback (no real OSRM
  // answer to draw steps from) — callers fall back to a geometry-derived
  // heuristic in that case, same as before this field existed.
  final List<RouteStep> steps;
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
      steps: json['steps'] is List
          ? (json['steps'] as List)
              .whereType<Map>()
              .map((step) => RouteStep.fromJson(Map<String, dynamic>.from(step)))
              .toList(growable: false)
          : const [],
      estimatedPrice:
          _nullableDouble(estimate['estimatedPrice'] ?? json['estimatedPrice']),
      tariffName: estimate['tariffName']?.toString(),
      phase: json['phase']?.toString(),
      targetLat: _nullableDouble(json['targetLat']),
      targetLng: _nullableDouble(json['targetLng']),
      driverLat: _nullableDouble(json['driverLat']),
      driverLng: _nullableDouble(json['driverLng']),
      isFallback: json['fallback'] == true,
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
    this.driverAvatarUrl,
    this.driverRating,
    this.offeredPriceKzt,
    this.shareToken,
    this.createdAt,
    this.driverOfferPriceKzt,
    this.driverOfferStatus,
    this.driverOfferByDriverId,
    this.driverOfferProposedBy,
    this.offerDriverName,
    this.offerDriverRating,
    this.offerDriverAvatarUrl,
    this.searchTimedOut = false,
    this.notes,
    this.driverArrivedAt,
    this.waitingStartedAt,
    this.freeWaitingUntil,
    this.waitingPricePerMinute = 0,
    this.clientId,
    this.serviceCommission,
    this.distanceTraveledM,
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
  final String? driverAvatarUrl;
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
  // Whose number is currently on the table: 'DRIVER' right after a fresh
  // price-offer, flips to 'CLIENT' once the rider counters back via
  // POST /orders/:id/price-offer/counter. Null before any offer exists.
  final String? driverOfferProposedBy;
  // The OFFERING driver's own name/rating/avatar (order-dispatch.service.js
  // joins on driver_offer_by_driver_id) — distinct from driverName/
  // driverRating/driverAvatarUrl above, which stay null until the order is
  // actually assigned (driver_id set). The negotiation banner needs to show
  // who's making the offer before either side has accepted anything.
  final String? offerDriverName;
  final double? offerDriverRating;
  final String? offerDriverAvatarUrl;
  // Server-authoritative — the order has sat open (SEARCHING_DRIVER/NEW,
  // no driver_id) for >75s (DRIVER_SEARCH_TIMEOUT_MS,
  // order-dispatch.service.js isOrderSearchTimedOut). Recomputed live on
  // every read/socket event, not a stored flag — always reflects the real
  // wait, including across app restarts/reconnects, unlike a purely
  // client-side timer.
  final bool searchTimedOut;
  // Free-text note the rider attaches at order creation — which entrance,
  // floor, door, landmark. Whole-order field on the backend (orders.notes),
  // not split per pickup/dropoff.
  final String? notes;
  // Set once the driver taps "Я на месте" (orders.routes.js sets both
  // arrived_at and driver_arrived_at on the DRIVER_ARRIVED transition).
  final DateTime? driverArrivedAt;
  // Server-authoritative waiting-timer fields, set on the WAITING_CLIENT
  // transition (orders.routes.js): waitingStartedAt is when the free window
  // began, freeWaitingUntil is its precomputed expiry (waitingStartedAt +
  // tariff.freeWaitingMinutes) — comparing against freeWaitingUntil directly
  // keeps the client's paid/free split byte-for-byte in sync with what
  // TRIP_COMPLETED actually bills, instead of re-deriving it locally.
  final DateTime? waitingStartedAt;
  final DateTime? freeWaitingUntil;
  final int waitingPricePerMinute;
  // Rider's account id — needed for the post-trip "add to favorites"/"never
  // accept again" actions (POST/DELETE /api/favorites/clients) and for
  // POST /api/orders/:id/rate-client.
  final String? clientId;
  // service_commission on `orders` — driver payout is price - serviceCommission.
  final double? serviceCommission;
  // Live "km driven so far" for the trip in progress (orders.distance_traveled_m,
  // accumulated server-side from real GPS pings — see updateDriverLocation in
  // routing.service.js). Only ever non-zero once TRIP_STARTED; seeds the
  // live counter on a fresh REST fetch (app resume/restart mid-trip) until
  // the next socket ping arrives with a more current value.
  final int? distanceTraveledM;

  bool get hasPendingDriverOffer =>
      driverOfferStatus == 'PENDING' && driverOfferPriceKzt != null;
  // Whose turn it actually is to act right now, for a rider viewing this
  // order: true means the driver's price is the one on the table and the
  // rider can accept/decline/counter it; false means the rider already
  // countered and is waiting on the driver instead (driverOfferProposedBy
  // defaults to 'DRIVER' semantics for pre-negotiation-feature orders that
  // never got the column populated).
  bool get isDriverOfferAwaitingClient =>
      hasPendingDriverOffer && driverOfferProposedBy != 'CLIENT';
  bool get isClientCounterAwaitingDriver =>
      hasPendingDriverOffer && driverOfferProposedBy == 'CLIENT';

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
      driverAvatarUrl: driverAvatarUrl,
      driverRating: driverRating,
      offeredPriceKzt: offeredPriceKzt,
      shareToken: shareToken,
      createdAt: createdAt,
      driverOfferPriceKzt: driverOfferPriceKzt,
      driverOfferStatus: driverOfferStatus,
      driverOfferByDriverId: driverOfferByDriverId,
      driverOfferProposedBy: driverOfferProposedBy,
      offerDriverName: offerDriverName,
      offerDriverRating: offerDriverRating,
      offerDriverAvatarUrl: offerDriverAvatarUrl,
      searchTimedOut: searchTimedOut,
      notes: notes,
      driverArrivedAt: driverArrivedAt,
      waitingStartedAt: waitingStartedAt,
      freeWaitingUntil: freeWaitingUntil,
      waitingPricePerMinute: waitingPricePerMinute,
      clientId: clientId,
      serviceCommission: serviceCommission,
      distanceTraveledM: distanceTraveledM,
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
      pickup: _sanitizeAddressText(
          '${json['pickup_text'] ?? json['pickupText'] ?? json['pickup'] ?? 'Точка посадки'}',
          'Точка посадки'),
      dropoff: _sanitizeAddressText(
          '${json['dropoff_text'] ?? json['dropoffText'] ?? json['dropoff'] ?? 'Точка назначения'}',
          'Точка назначения'),
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
      driverAvatarUrl:
          (json['driver_avatar_url'] ?? json['driverAvatarUrl'])?.toString(),
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
      driverOfferProposedBy: (json['driver_offer_proposed_by'] ??
              json['driverOfferProposedBy'])
          ?.toString(),
      offerDriverName:
          (json['offer_driver_name'] ?? json['offerDriverName'])?.toString(),
      offerDriverRating: _nullableDouble(
          json['offer_driver_rating'] ?? json['offerDriverRating']),
      offerDriverAvatarUrl: (json['offer_driver_avatar_url'] ??
              json['offerDriverAvatarUrl'])
          ?.toString(),
      searchTimedOut:
          json['search_timed_out'] == true || json['searchTimedOut'] == true,
      notes: (json['notes'] as String?)?.trim().isNotEmpty == true
          ? (json['notes'] as String).trim()
          : null,
      driverArrivedAt: DateTime.tryParse('${json['driver_arrived_at'] ?? json['driverArrivedAt'] ?? json['arrived_at'] ?? json['arrivedAt'] ?? ''}'),
      waitingStartedAt: DateTime.tryParse(
          '${json['waiting_started_at'] ?? json['waitingStartedAt'] ?? ''}'),
      freeWaitingUntil: DateTime.tryParse(
          '${json['free_waiting_until'] ?? json['freeWaitingUntil'] ?? ''}'),
      waitingPricePerMinute: int.tryParse(
              '${json['waiting_price_per_minute'] ?? json['waitingPricePerMinute'] ?? snapshot['waitingPricePerMinute'] ?? ''}') ??
          0,
      clientId: (json['client_id'] ?? json['clientId'])?.toString(),
      serviceCommission: _nullableDouble(
          json['service_commission'] ?? json['serviceCommission']),
      distanceTraveledM: int.tryParse(
          '${json['distance_traveled_m'] ?? json['distanceTraveledM'] ?? ''}'),
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

  NotificationCategory get category => notificationCategoryForType(type);
}

// Grouping is derived purely from the backend's existing `type` string —
// no new column/migration needed. `type` values are added freely across
// orders.routes.js, referrals.service.js, support.routes.js etc; anything
// not explicitly listed here falls into `service` rather than being lost,
// so a forgotten mapping shows up as "misfiled", never as "missing".
enum NotificationCategory { orders, support, bonus, service }

NotificationCategory notificationCategoryForType(String type) {
  const orderTypes = {
    'ORDER_STATUS',
    'DRIVER_FOUND',
    'DRIVER_ARRIVED',
    'TRIP_COMPLETED',
    'DRIVER_CANCELLED',
    'ORDER_CANCELLED',
    'DRIVER_PRICE_OFFER',
    'DRIVER_PRICE_OFFER_ACCEPTED',
    'DRIVER_PRICE_OFFER_DECLINED',
    'CLIENT_COUNTER_OFFER',
    'CLIENT_COUNTER_OFFER_ACCEPTED',
    'CLIENT_COUNTER_OFFER_DECLINED',
    'QUICK_MESSAGE',
    'RECURRING_BOOKING_ORDER_CREATED',
    'RECURRING_BOOKING_REQUEST',
    'RECURRING_BOOKING_ACCEPTED',
    'RECURRING_BOOKING_DECLINED',
  };
  const supportTypes = {'SOS_ALERT', 'LOST_ITEM', 'SUPPORT_REPLY'};
  const bonusTypes = {'CASHBACK_EARNED', 'REFERRAL_BONUS'};
  if (orderTypes.contains(type)) return NotificationCategory.orders;
  if (supportTypes.contains(type)) return NotificationCategory.support;
  if (bonusTypes.contains(type)) return NotificationCategory.bonus;
  return NotificationCategory.service;
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
      label: _roadAlertLabelFallback(type),
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

// Localized display label for a road-alert type. RoadAlert.label (below)
// is a separate, permanently-Russian value baked in at JSON-parse time
// (no BuildContext available there) — UI code should call this function
// with the current locale's l10n instead of reading that stored field.
String roadAlertLabel(AppLocalizations l10n, String type) {
  return {
        'ROAD_HAZARD': l10n.roadAlertHazard,
        'ACCIDENT': l10n.roadAlertAccident,
        'ROAD_WORK': l10n.roadAlertRoadWork,
        'SPEED_CAMERA': l10n.roadAlertSpeedCamera,
        'POLICE': l10n.roadAlertPolice,
        'TRAFFIC_JAM': l10n.roadAlertTrafficJam,
        'ROAD_CLOSED': l10n.roadAlertRoadClosed,
        'BAD_ROAD': l10n.roadAlertBadRoad,
        'POTHOLE': l10n.roadAlertPothole,
        'SPEED_BUMP': l10n.roadAlertSpeedBump,
        'ICY_ROAD': l10n.roadAlertIcyRoad,
        'SCHOOL_ZONE': l10n.roadAlertSchoolZone,
        'TEMPORARY_SPEED_LIMIT': l10n.roadAlertTemporarySpeedLimit,
        'DANGEROUS_TURN': l10n.roadAlertDangerousTurn,
        'RAILROAD_CROSSING': l10n.roadAlertRailroadCrossing,
        'PEDESTRIAN_CROSSING': l10n.roadAlertPedestrianCrossing,
        'OTHER': l10n.roadAlertOther,
      }[type] ??
      l10n.roadAlertOther;
}

String _roadAlertLabelFallback(String type) {
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

// A handful of historical orders have pickup/dropoff text that was
// corrupted server-side before this was fixed (multi-byte Cyrillic split
// across a TCP chunk boundary landed as literal U+FFFD replacement
// characters, and that's what got stored — the original bytes are gone,
// not just misencoded, so there's nothing to recover). Showing a row of
// "�" boxes in trip history reads as broken; a plain, honest label reads
// as intentional.
String _sanitizeAddressText(String value, String fallback) {
  return value.contains('�') ? fallback : value;
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
