import 'package:flutter_test/flutter_test.dart';
import 'package:smarttaxi_app/features/shared/models.dart';

// The geofence is the one number in this feature that has to agree between the
// phone and the server. The phone uses it to decide whether to offer the "take
// a place in the line" button at all; the server uses the same haversine to
// refuse. If they disagree, a driver standing at the bazaar sees a button that
// only ever produces an error.

void main() {
  const standJson = {
    'id': 's1',
    'regionId': 'r1',
    'name': 'Базар, межгород',
    'kind': 'INTERCITY',
    'lat': 40.665495,
    'lng': 68.549994,
    'radiusM': 150,
    'boardingSlots': 1,
    'defaultSeats': 4,
    'driversCount': 3,
    'freeSeats': 2,
    'isActive': true,
    'note': 'Заезд со стороны улицы Абая',
  };

  test('a stand parses the point and radius the owner drew', () {
    final stand = TaxiStand.fromJson(standJson);
    expect(stand.name, 'Базар, межгород');
    expect(stand.isIntercity, isTrue);
    expect(stand.radiusM, 150);
    expect(stand.driversCount, 3);
    expect(stand.freeSeats, 2);
    expect(stand.note, isNotEmpty);
  });

  test('standing at the stand is inside; a street away is not', () {
    final stand = TaxiStand.fromJson(standJson);
    // ~55 m north of the centre — the far end of the same line of cars.
    const atTheStand = Coordinate(lat: 40.665990, lng: 68.549994);
    // ~330 m north — a different block.
    const downTheRoad = Coordinate(lat: 40.668470, lng: 68.549994);

    expect(stand.containsPoint(atTheStand), isTrue);
    expect(stand.distanceFrom(atTheStand), lessThan(150));
    expect(stand.containsPoint(downTheRoad), isFalse);
    expect(stand.distanceFrom(downTheRoad), greaterThan(150));
  });

  test('the boundary is the radius itself, not a generous approximation', () {
    final stand = TaxiStand.fromJson(standJson);
    // 111_320 m per degree of latitude: 150 m is 0.001347°.
    const justInside = Coordinate(lat: 40.665495 + 0.00130, lng: 68.549994);
    const justOutside = Coordinate(lat: 40.665495 + 0.00145, lng: 68.549994);
    expect(stand.containsPoint(justInside), isTrue);
    expect(stand.containsPoint(justOutside), isFalse);
  });

  test('the haversine agrees with a known distance', () {
    // One degree of latitude is ~111.3 km everywhere.
    final meters = standDistanceMeters(40.0, 68.0, 41.0, 68.0);
    expect(meters, closeTo(111195, 500));
  });

  test('free seats are derived, never taken from the payload', () {
    final entry = StandQueueEntry.fromJson({
      'id': 'e1',
      'standId': 's1',
      'driverId': 'd1',
      'status': 'BOARDING',
      'totalSeats': 4,
      'takenSeats': 3,
      // A server that ever sent a contradicting number must not win: the
      // rider is looking at "can I get in this car", and the total minus the
      // taken count is the only honest answer.
      'freeSeats': 99,
      'destinationLabel': 'Шымкент',
      'pricePerSeat': 2500,
      'position': 1,
      'driver': {
        'name': 'Ержан',
        'phone': '+77010000001',
        'carModel': 'Gentra',
        'carColor': 'белый',
        'plate': '123ABC13',
        'rating': 4.85,
      },
    });
    expect(entry.freeSeats, 1);
    expect(entry.isFull, isFalse);
    expect(entry.isBoarding, isTrue);
    expect(entry.carLabel, 'белый Gentra');
    expect(entry.driverPhone, '+77010000001');
    expect(entry.rating, 4.85);
  });

  test('a full car reports itself full rather than a negative count', () {
    final entry = StandQueueEntry.fromJson({
      'id': 'e2',
      'standId': 's1',
      'driverId': 'd2',
      'status': 'BOARDING',
      'totalSeats': 4,
      'takenSeats': 4,
    });
    expect(entry.freeSeats, 0);
    expect(entry.isFull, isTrue);
  });

  test('a driver reads only their own pending seat requests', () {
    final entry = StandQueueEntry.fromJson({
      'id': 'e3',
      'standId': 's1',
      'driverId': 'd1',
      'status': 'BOARDING',
      'totalSeats': 4,
      'takenSeats': 1,
      'reservations': [
        {'id': 'r1', 'entryId': 'e3', 'seats': 2, 'status': 'PENDING', 'source': 'APP'},
        {'id': 'r2', 'entryId': 'e3', 'seats': 1, 'status': 'CONFIRMED', 'source': 'PHONE'},
        {'id': 'r3', 'entryId': 'e3', 'seats': 1, 'status': 'DECLINED', 'source': 'APP'},
      ],
    });
    expect(entry.reservations, hasLength(3));
    expect(entry.pendingReservations.map((row) => row.id), ['r1']);
  });

  test('the queue view finds this driver among the cars in line', () {
    final view = StandQueueView.fromJson({
      'stand': standJson,
      'entries': [
        {'id': 'e1', 'standId': 's1', 'driverId': 'd1', 'status': 'BOARDING', 'position': 1, 'totalSeats': 4, 'takenSeats': 0},
        {'id': 'e2', 'standId': 's1', 'driverId': 'd2', 'status': 'WAITING', 'position': 2, 'totalSeats': 4, 'takenSeats': 0},
      ],
    });
    expect(view.entries, hasLength(2));
    expect(view.entryForDriver('d2')?.id, 'e2');
    expect(view.entryForDriver('missing'), isNull);
    expect(view.boarding.map((row) => row.id), ['e1']);
  });

  test('holding no place is a real state, not an empty one', () {
    final place = MyStandPlace.fromJson(const {'entry': null, 'stand': null, 'queue': []});
    expect(place.isInLine, isFalse);
    expect(place.entry, isNull);
    expect(place.queue, isEmpty);
  });

  test('presence reports being outside without guessing when it cannot tell',
      () {
    final outside = StandPresence.fromJson(const {
      'entryId': 'e1',
      'standId': 's1',
      'inside': false,
      'distanceM': 1240,
      'graceMinutes': 6,
    });
    expect(outside.isOutside, isTrue);
    expect(outside.distanceM, 1240);
    expect(outside.graceMinutes, 6);

    // No position was published, so "outside" is not a claim the app may make.
    final unknown = StandPresence.fromJson(const {
      'entryId': 'e1',
      'standId': 's1',
      'inside': null,
    });
    expect(unknown.isOutside, isFalse);
    expect(unknown.distanceM, isNull);
  });
}
