import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:flutter/material.dart';
import 'package:smarttaxi_app/core/widgets/map_point_name_sheet.dart';
import 'package:smarttaxi_app/l10n/app_localizations.dart';

String _read(String path) => File(path).readAsStringSync();

void main() {
  test('a point the map cannot name is named by the rider', () {
    final passenger = _read('lib/features/passenger/passenger_shell.dart');

    // Confirming an unnamed point asks for a name instead of applying it.
    expect(passenger,
        contains('final named = await showMapPointNameSheet(context)'));
    // Backing out must leave the picker where it was rather than quietly
    // applying the very point the rider was asked to describe.
    expect(passenger, contains('if (named == null || !mounted) return;'));
    expect(passenger,
        contains('await _applyMapTap(point, preferredLabel: label);'));

    // The name becomes the address, which is what reaches the driver: the
    // shell stores it as _pickupLabel/_dropoffLabel and createOrder sends
    // those as pickupText/dropoffText.
    expect(passenger, contains('_pickupLabel = label;'));
    expect(passenger, contains('_dropoffLabel = label;'));
  });

  test('confirming a point the map cannot name is not a no-op', () {
    final passenger = _read('lib/features/passenger/passenger_shell.dart');
    final confirm = passenger.substring(
      passenger.indexOf('Future<void> _confirmMapPointSelection()'),
      passenger.indexOf('void _cancelMapPointSelection()'),
    );

    // The confirm button is enabled the moment the lookup settles, but the
    // handler used to return early unless the geocoder had resolved a
    // coordinate — so in the four regions with no named streets at all,
    // tapping "Подтвердить" did nothing whatsoever. The fallback chain right
    // below that guard was written for this case and could never run.
    expect(confirm.contains('_mapPickerResolvedCoordinate == null'), isFalse,
        reason: 'a point with no address must still be confirmable');
    expect(confirm, contains('_mapPickerResolvedCoordinate?.toLatLng() ??'));
    expect(confirm, contains('_mapCenter ??'));

    // Nothing a name can fix is left to be discovered after the rider has
    // typed one. Found on a device: naming a point in Бирлик and only then
    // being told "the destination is the same as the pickup".
    expect(confirm, contains('_shouldBlockPointByRegion('));
    expect(confirm, contains('_wouldRepeatTripPoint('));
    for (final guard in ['_shouldBlockPointByRegion(', '_wouldRepeatTripPoint(']) {
      expect(confirm.indexOf(guard),
          lessThan(confirm.indexOf('showMapPointNameSheet(')),
          reason: 'do not ask for a name for a point that will then be refused');
    }

    // The inferred pickup has to match the one _applyPoint would use, or the
    // pre-check and the refusal disagree about which points are usable.
    final helper = passenger.substring(
      passenger.indexOf('bool _wouldRepeatTripPoint('),
      passenger.indexOf('Future<bool> _applyMapTap('),
    );
    expect(helper, contains('_isSameTripPoint(effectivePickup, coordinate)'));
    expect(helper, contains('_pickup ??'));
  });

  test('the rider is not kept waiting for a lookup that has an answer', () {
    final api = _read('lib/core/api/api_client.dart');
    // The picker has an instant answer for a failed lookup — the rider names
    // the place — so the client's default 30s receive timeout would buy
    // nothing and cost them the screen while it ran out.
    expect(api, contains('static const reverseAddressTimeout = Duration(seconds: 6);'));
    final reverse = api.substring(
      api.indexOf('Future<AddressSuggestion?> reverseAddress('),
      api.indexOf('Future<RoutePreview> previewRoute('),
    );
    expect(reverse, contains('receiveTimeout: reverseAddressTimeout'));
    expect(reverse, contains('sendTimeout: reverseAddressTimeout'));
  });

  test('whether an address was found is state, never translated text', () {
    final passenger = _read('lib/features/passenger/passenger_shell.dart');
    final confirm = passenger.substring(
      passenger.indexOf('Future<void> _confirmMapPointSelection()'),
      passenger.indexOf('void _cancelMapPointSelection()'),
    );

    // Found on a device with the app in Kazakh: the decision used to be made
    // by matching the label shown on screen against the Russian words "точка
    // на карте". In every other language the placeholder did not match, so it
    // was taken for a real address — the rider was never asked to name the
    // place and the driver was sent a destination literally called
    // "Картадағы нүкте".
    expect(confirm, contains('var label = _mapPickerResolvedLabel;'));
    expect(confirm.contains('_isUsablePassengerAddressLabel'), isFalse,
        reason: 'the display label is translated; it cannot decide this');
    expect(confirm.contains('_mapPickerAddressLabel'), isFalse,
        reason: 'the display label is translated; it cannot decide this');

    // The resolved label is set in exactly one place: where the geocoder
    // actually returned something usable.
    expect(passenger, contains('resolvedLabel = label;'));
    expect(passenger, contains('_mapPickerResolvedLabel = resolvedLabel;'));
  });

  test('the typed name is one the server will accept', () {
    // orders.routes.js validates pickupText/dropoffText as
    // z.string().trim().min(2).max(180). A name rejected after the rider has
    // typed it is the worst possible place to discover that.
    final routes =
        _read('../../../apps/api/src/modules/orders/orders.routes.js');
    expect(routes, contains('pickupText: z.string().trim().min(2).max(180)'));
    expect(routes, contains('dropoffText: z.string().trim().min(2).max(180)'));
    expect(mapPointNameMinLength, 2);
    expect(mapPointNameMaxLength, lessThanOrEqualTo(180));
  });

  test('the naming sheet reaches the driver in every language', () {
    for (final code in ['ru', 'kk', 'uz', 'zh']) {
      final arb =
          jsonDecode(_read('lib/l10n/app_$code.arb')) as Map<String, Object?>;
      for (final key in [
        'passengerNamePointTitle',
        'passengerNamePointSubtitle',
        'passengerNamePointHint',
        'passengerNamePointConfirm',
      ]) {
        expect(arb[key], isA<String>(),
            reason: '$key missing from app_$code.arb');
        expect((arb[key]! as String).trim(), isNotEmpty);
      }
    }
  });

  testWidgets('the name is only accepted once it says something',
      (tester) async {
    await tester.pumpWidget(_host());
    await tester.tap(find.text('open'));
    await tester.pumpAndSettle();

    final confirm = find.byType(FilledButton);
    expect(tester.widget<FilledButton>(confirm).onPressed, isNull,
        reason: 'an empty name is no better than "Точка на карте"');

    await tester.enterText(find.byType(TextField), ' a ');
    await tester.pump();
    expect(tester.widget<FilledButton>(confirm).onPressed, isNull,
        reason: 'one character after trimming is below what the server takes');

    await tester.enterText(
        find.byType(TextField), '  синие ворота за мечетью  ');
    await tester.pump();
    expect(tester.widget<FilledButton>(confirm).onPressed, isNotNull);

    await tester.tap(confirm);
    await tester.pumpAndSettle();
    expect(_result, 'синие ворота за мечетью',
        reason: 'the stored name is trimmed, the way the server stores it');
  });
}

String? _result;

Widget _host() => MaterialApp(
      localizationsDelegates: AppLocalizations.localizationsDelegates,
      supportedLocales: AppLocalizations.supportedLocales,
      locale: const Locale('ru'),
      home: Builder(
        builder: (context) => Scaffold(
          body: Center(
            child: TextButton(
              onPressed: () async {
                _result = await showMapPointNameSheet(context);
              },
              child: const Text('open'),
            ),
          ),
        ),
      ),
    );
