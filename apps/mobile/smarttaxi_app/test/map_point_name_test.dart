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

    // Outside the region is not something a name can fix, and the message for
    // it belongs to _applyMapTap.
    expect(confirm, contains('_shouldBlockPointByRegion('));
    expect(confirm.indexOf('_shouldBlockPointByRegion('),
        lessThan(confirm.indexOf('showMapPointNameSheet(')),
        reason: 'do not ask for a name for a point that will then be refused');
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
