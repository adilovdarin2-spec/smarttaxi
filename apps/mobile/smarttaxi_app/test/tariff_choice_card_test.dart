import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:smarttaxi_app/core/theme/app_theme.dart';
import 'package:smarttaxi_app/core/widgets/tariff_choice_card.dart';

void main() {
  for (final width in [280.0, 320.0]) {
    for (final scale in [1.0, 1.5, 2.0]) {
      testWidgets('Tariff remains readable at $width / $scale', (tester) async {
        await tester.binding.setSurfaceSize(Size(width, 850));
        addTearDown(() => tester.binding.setSurfaceSize(null));
        var selected = false;
        await tester.pumpWidget(MaterialApp(
          theme: buildSmartTaxiTheme(),
          home: MediaQuery(
            data: MediaQueryData(textScaler: TextScaler.linear(scale)),
            child: Scaffold(
                body: SingleChildScrollView(
                    child: TariffChoiceCard(
              title: 'Доставка',
              subtitle: 'Посылки до 20 кг',
              price: '125 000 ₸',
              art: const Icon(Icons.local_shipping_outlined),
              selected: true,
              onTap: () => selected = true,
            ))),
          ),
        ));
        expect(tester.takeException(), isNull);
        expect(find.text('125 000 ₸'), findsOneWidget);
        expect(find.text('Доставка'), findsOneWidget);
        await tester.tap(find.byType(TariffChoiceCard));
        expect(selected, isTrue);
      });
    }
  }
}
