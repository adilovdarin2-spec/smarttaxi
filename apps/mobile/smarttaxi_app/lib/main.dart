import 'package:flutter/material.dart';

import 'core/api/api_client.dart';
import 'core/auth/auth_store.dart';
import 'core/sockets/socket_service.dart';
import 'core/theme/app_theme.dart';
import 'core/widgets/brand_logo.dart';
import 'features/driver/driver_shell.dart';
import 'features/passenger/passenger_shell.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  final authStore = AuthStore();
  final api = ApiClient(authStore);
  final sockets = SocketService(authStore);
  runApp(SmartTaxiApp(api: api, authStore: authStore, sockets: sockets));
}

class SmartTaxiApp extends StatefulWidget {
  const SmartTaxiApp({
    super.key,
    required this.api,
    required this.authStore,
    required this.sockets,
  });

  final ApiClient api;
  final AuthStore authStore;
  final SocketService sockets;

  @override
  State<SmartTaxiApp> createState() => _SmartTaxiAppState();
}

class _SmartTaxiAppState extends State<SmartTaxiApp> {
  AppRole _role = AppRole.passenger;

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'SmartTaxi',
      debugShowCheckedModeBanner: false,
      theme: buildSmartTaxiTheme(),
      home: Scaffold(
        appBar: AppBar(
          title: const BrandLogo(),
          actions: [
            Padding(
              padding: const EdgeInsets.only(right: 12),
              child: SegmentedButton<AppRole>(
                showSelectedIcon: false,
                segments: const [
                  ButtonSegment(value: AppRole.passenger, label: Text('Пассажир')),
                  ButtonSegment(value: AppRole.driver, label: Text('Водитель')),
                ],
                selected: {_role},
                onSelectionChanged: (selection) => setState(() => _role = selection.first),
              ),
            ),
          ],
        ),
        body: _role == AppRole.passenger
            ? PassengerShell(api: widget.api, authStore: widget.authStore, sockets: widget.sockets)
            : DriverShell(api: widget.api, authStore: widget.authStore, sockets: widget.sockets),
      ),
    );
  }
}

enum AppRole { passenger, driver }
