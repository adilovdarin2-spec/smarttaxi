import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:smarttaxi_app/core/theme/app_theme.dart';
import 'package:smarttaxi_app/core/widgets/trip_details_disclosure.dart';

void main() {
  for (final scale in [1.0, 1.5, 2.0]) {
    testWidgets('Trip details preserve full addresses and actions at $scale',
        (tester) async {
      await tester.binding.setSurfaceSize(const Size(320, 600));
      addTearDown(() => tester.binding.setSurfaceSize(null));
      var cancelled = false;
      await tester.pumpWidget(MaterialApp(
        theme: buildSmartTaxiTheme(),
        home: MediaQuery(
          data: MediaQueryData(textScaler: TextScaler.linear(scale)),
          child: Scaffold(
            body: SingleChildScrollView(
              child: Column(children: [
                OutlinedButton(
                    onPressed: () => cancelled = true,
                    child: const Text('Отменить поиск')),
                const TripDetailsDisclosure(
                  title: 'Детали поездки',
                  child: TripAddressDetails(
                    fromLabel: 'Откуда',
                    toLabel: 'Куда',
                    pickup: 'улица Бектасова, 60, Мырзакент',
                    dropoff: 'улица Кожанова, 34, Мырзакент',
                  ),
                ),
              ]),
            ),
          ),
        ),
      ));
      expect(find.text('улица Кожанова, 34, Мырзакент'), findsNothing);
      expect(tester.takeException(), isNull);
      await tester.tap(find.text('Детали поездки'));
      await tester.pumpAndSettle();
      expect(find.text('улица Кожанова, 34, Мырзакент'), findsOneWidget);
      final address =
          tester.widget<Text>(find.text('улица Кожанова, 34, Мырзакент'));
      expect(address.maxLines, isNull);
      expect(address.overflow, isNot(TextOverflow.ellipsis));
      expect(tester.takeException(), isNull);
      await tester.tap(find.text('Детали поездки'));
      await tester.pumpAndSettle();
      expect(find.text('улица Кожанова, 34, Мырзакент'), findsNothing);
      await tester.tap(find.text('Отменить поиск'));
      expect(cancelled, isTrue);
    });
  }
}
