import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:smarttaxi_app/core/theme/app_theme.dart';
import 'package:smarttaxi_app/core/widgets/startup_screen.dart';
import 'package:smarttaxi_app/l10n/app_localizations.dart';

void main() {
  for (final language in ['ru', 'kk']) {
    for (final scale in [1.0, 2.0]) {
      testWidgets('Premium startup content fits 360/$language/$scale',
          (tester) async {
        tester.view.physicalSize = const Size(360, 640);
        tester.view.devicePixelRatio = 1;
        addTearDown(tester.view.resetPhysicalSize);
        addTearDown(tester.view.resetDevicePixelRatio);
        await tester.pumpWidget(MaterialApp(
          theme: buildSmartTaxiTheme(),
          locale: Locale(language),
          localizationsDelegates: AppLocalizations.localizationsDelegates,
          supportedLocales: AppLocalizations.supportedLocales,
          builder: (context, child) => MediaQuery(
            data: MediaQuery.of(context)
                .copyWith(textScaler: TextScaler.linear(scale)),
            child: child!,
          ),
          home: const StartupScreen(),
        ));
        await tester.pump();
        expect(
          tester.getSize(find.byKey(const ValueKey('startup-brand-icon'))),
          const Size(148, 148),
        );
        expect(find.byKey(const ValueKey('startup-wordmark')), findsOneWidget);
        final loader = tester.getRect(find.byType(LinearProgressIndicator));
        expect(loader.bottom, lessThanOrEqualTo(616));
        expect(loader.left, greaterThanOrEqualTo(28));
        expect(loader.right, lessThanOrEqualTo(332));
        expect(tester.takeException(), isNull);
      });
    }
  }
}
