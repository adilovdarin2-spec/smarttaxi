import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:smarttaxi_app/core/theme/app_theme.dart';
import 'package:smarttaxi_app/core/widgets/empty_state.dart';

void main() {
  for (final scale in [1.0, 1.3, 2.0]) {
    for (final dark in [false, true]) {
      testWidgets('empty sections stay readable at 360/$scale/dark=$dark',
          (tester) async {
        tester.view.physicalSize = const Size(360, 800);
        tester.view.devicePixelRatio = 1;
        addTearDown(tester.view.resetPhysicalSize);
        addTearDown(tester.view.resetDevicePixelRatio);
        var actions = 0;
        await tester.pumpWidget(MaterialApp(
          theme: dark ? buildSmartTaxiDarkTheme() : buildSmartTaxiTheme(),
          builder: (context, child) => MediaQuery(
            data: MediaQuery.of(context)
                .copyWith(textScaler: TextScaler.linear(scale)),
            child: child!,
          ),
          home: Scaffold(
            body: ListView(padding: const EdgeInsets.all(16), children: [
              EmptyState(
                title: 'Здесь будут ваши избранные адреса',
                text: 'Сохраните дом, работу или другое место, чтобы выбирать '
                    'его при заказе поездки.',
                icon: Icons.favorite_border,
                action: 'Добавить адрес',
                onAction: () => actions++,
              ),
            ]),
          ),
        ));
        await tester.pumpAndSettle();
        expect(tester.takeException(), isNull);
        if (scale == 1) {
          // Includes a two-line title, long description and a 56dp action.
          expect(tester.getSize(find.byType(EmptyState)).height, lessThan(320));
        }
        final button = find.byType(ElevatedButton);
        await tester.ensureVisible(button);
        expect(tester.getSize(button).height, greaterThanOrEqualTo(48));
        await tester.tap(button);
        expect(actions, 1);
        expect(tester.takeException(), isNull);
      });
    }
  }
}
