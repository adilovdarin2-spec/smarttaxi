import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:smarttaxi_app/core/theme/app_theme.dart';

void main() {
  test('presentation hierarchy reserves emphasis for titles and actions', () {
    expect(SmartTaxiTextStyles.title.fontWeight, FontWeight.w600);
    expect(SmartTaxiTextStyles.body.fontWeight, FontWeight.w400);
    expect(SmartTaxiTextStyles.caption.fontWeight, FontWeight.w400);
    expect(SmartTaxiTextStyles.button.fontWeight, FontWeight.w600);
    expect(SmartTaxiTextStyles.title.height, greaterThanOrEqualTo(1.2));
    expect(SmartTaxiRadius.sheet, 28);
    expect(SmartTaxiShadows.card.single.offset, const Offset(0, 4));
  });

  for (final dark in [false, true]) {
    testWidgets('readable ${dark ? 'dark' : 'light'} actions at compact width',
        (tester) async {
      tester.view.physicalSize = const Size(360, 740);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final theme = dark ? buildSmartTaxiDarkTheme() : buildSmartTaxiTheme();
      await tester.pumpWidget(MaterialApp(
        theme: theme,
        home: MediaQuery(
          data: const MediaQueryData(textScaler: TextScaler.linear(1.3)),
          child: Scaffold(
            body: Padding(
              padding: const EdgeInsets.all(20),
              child: Column(
                children: [
                  const SizedBox(height: 32),
                  ElevatedButton(
                      onPressed: () {}, child: const Text('Заказать')),
                  const SizedBox(height: 12),
                  FilledButton(
                      onPressed: () {}, child: const Text('Продолжить')),
                  const SizedBox(height: 12),
                  OutlinedButton(
                      onPressed: () {}, child: const Text('Изменить')),
                ],
              ),
            ),
          ),
        ),
      ));
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
      for (final type in [ElevatedButton, FilledButton, OutlinedButton]) {
        expect(
            tester.getSize(find.byType(type)).height, greaterThanOrEqualTo(56));
      }
      expect(
          theme.elevatedButtonTheme.style!.textStyle!.resolve({})!.fontWeight,
          FontWeight.w600);
      expect(
          theme.outlinedButtonTheme.style!.textStyle!.resolve({})!.fontWeight,
          FontWeight.w600);
    });
  }
}
