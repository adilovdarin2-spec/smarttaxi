import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:smarttaxi_app/core/theme/app_theme.dart';
import 'package:smarttaxi_app/core/widgets/startup_screen.dart';
import 'package:smarttaxi_app/l10n/app_localizations.dart';

void main() {
  for (final language in ['ru', 'kk']) {
    for (final scale in [1.0, 2.0]) {
      testWidgets('Startup mark and feedback fit 360/$language/$scale',
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
        expect(tester.getSize(find.byType(Image)), const Size(96, 96));
        final loader = tester.getRect(find.byType(CircularProgressIndicator));
        expect(loader.bottom, lessThan(640));
        expect(tester.takeException(), isNull);
      });
    }
  }
}
