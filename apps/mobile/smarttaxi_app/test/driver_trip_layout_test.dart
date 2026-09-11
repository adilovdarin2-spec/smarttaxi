import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:smarttaxi_app/core/theme/app_theme.dart';
import 'package:smarttaxi_app/features/driver/widgets/driver_common_widgets.dart';
import 'package:smarttaxi_app/features/driver/models/driver_shell_helpers.dart';
import 'package:smarttaxi_app/features/shared/models.dart';
import 'package:smarttaxi_app/l10n/app_localizations.dart';

void main() {
  for (final scale in [1.0, 1.3, 2.0]) {
    testWidgets('trip action stays above navigation at 360/$scale',
        (tester) async {
      tester.view.physicalSize = const Size(360, 740);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      var actions = 0;
      await tester.pumpWidget(MaterialApp(
        theme: buildSmartTaxiTheme(),
        locale: const Locale('ru'),
        localizationsDelegates: AppLocalizations.localizationsDelegates,
        supportedLocales: AppLocalizations.supportedLocales,
        builder: (context, child) => MediaQuery(
          data: MediaQuery.of(context)
              .copyWith(textScaler: TextScaler.linear(scale)),
          child: child!,
        ),
        home: Scaffold(
          bottomNavigationBar: const SizedBox(height: 80),
          body: DriverTripLayout(
            body: ListView(children: const [SizedBox(height: 1500)]),
            action: DriverGradientButton(
              text: 'Выехал к клиенту',
              onTap: () => actions++,
            ),
          ),
        ),
      ));
      final action = find.byType(DriverGradientButton);
      final initial = tester.getRect(action);
      expect(initial.bottom, lessThanOrEqualTo(660));
      expect(initial.height, greaterThanOrEqualTo(56));
      await tester.drag(find.byType(ListView), const Offset(0, -500));
      await tester.pumpAndSettle();
      expect(tester.getRect(action), initial);
      await tester.tap(action);
      expect(actions, 1);
      expect(tester.takeException(), isNull);
      final context = tester.element(action);
      final l10n = AppLocalizations.of(context);
      expect(driverTariffTitle(l10n, 'Economy'), 'Эконом');
      expect(driverTariffTitle(l10n, 'Delivery'), 'Доставка');
      expect(driverTariffTitle(l10n, 'Legacy custom'), 'Legacy custom');
      for (final status in ['TRIP_STARTED', 'IN_PROGRESS']) {
        final order = OrderSummary(
            id: 'qa',
            status: status,
            pickup: 'улица Бектасова, 60',
            dropoff: 'Technodom');
        expect(driverTripMapLabel(l10n, order, hasRoute: true), 'Technodom');
        expect(driverTripMapLabel(l10n, order, hasRoute: false),
            l10n.driverRouteWillAppearAfterCalc);
      }
      const pickupOrder = OrderSummary(
          id: 'qa',
          status: 'DRIVER_ASSIGNED',
          pickup: 'улица Бектасова, 60',
          dropoff: 'Technodom');
      expect(driverTripMapLabel(l10n, pickupOrder, hasRoute: true),
          l10n.driverRouteToPickupPoint);
    });
  }
}
