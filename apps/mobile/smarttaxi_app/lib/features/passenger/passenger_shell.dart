import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:geolocator/geolocator.dart';
import 'package:latlong2/latlong.dart';

import '../../core/api/api_client.dart';
import '../../core/auth/auth_store.dart';
import '../../core/config/app_config.dart';
import '../../core/sockets/socket_service.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/brand_logo.dart';
import '../../core/widgets/empty_state.dart';
import '../../core/widgets/route_fields.dart';
import '../../core/widgets/status_pill.dart';
import '../shared/models.dart';

class PassengerShell extends StatefulWidget {
  const PassengerShell({super.key, required this.api, required this.authStore, required this.sockets});

  final ApiClient api;
  final AuthStore authStore;
  final SocketService sockets;

  @override
  State<PassengerShell> createState() => _PassengerShellState();
}

class _PassengerShellState extends State<PassengerShell> {
  int _tab = 0;
  bool _logged = false;
  bool _loading = false;
  bool _previewLoading = false;
  String? _error;
  Coordinate? _pickup;
  Coordinate? _dropoff;
  String _pickupLabel = 'Выберите точку посадки';
  String _dropoffLabel = 'Куда едем?';
  List<TariffOption> _tariffs = const [];
  String? _tariffId;
  RoutePreview? _preview;
  OrderSummary? _order;
  DriverLocation? _driverLocation;
  String _phone = '';
  String _email = '';
  String _password = '';

  @override
  void initState() {
    super.initState();
    _bootstrap();
  }

  @override
  void dispose() {
    widget.sockets.dispose();
    super.dispose();
  }

  Future<void> _bootstrap() async {
    _logged = (await widget.authStore.readToken()) != null;
    if (_logged) {
      await widget.sockets.connect();
      widget.sockets.onOrderUpdate(_handleOrderUpdate);
      widget.sockets.onDriverLocation(_handleDriverLocation);
    }
    if (mounted) setState(() {});
  }

  void _handleOrderUpdate(dynamic data) {
    if (data is! Map) return;
    final order = OrderSummary.fromJson(Map<String, dynamic>.from(data['order'] ?? data));
    if (_order?.id == order.id) {
      setState(() => _order = order);
      if (order.driverId != null) {
        _loadDriverRoute(order.id);
      }
    }
  }

  void _handleDriverLocation(dynamic data) {
    if (_order?.driverId == null || data is! Map) return;
    setState(() => _driverLocation = DriverLocation.fromJson(Map<String, dynamic>.from(data)));
    _loadDriverRoute(_order!.id);
  }

  Future<void> _login() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      await widget.api.login(phone: _phone, email: _email, password: _password);
      await widget.sockets.connect();
      widget.sockets.onOrderUpdate(_handleOrderUpdate);
      widget.sockets.onDriverLocation(_handleDriverLocation);
      setState(() {
        _logged = true;
        _tab = 0;
      });
    } catch (error) {
      setState(() => _error = _readableError(error));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _selectPoint({required bool pickup}) async {
    final selected = await showModalBottomSheet<_PointResult>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(28))),
      builder: (context) => _CoordinateSheet(title: pickup ? 'Точка посадки' : 'Точка назначения', allowDeviceLocation: pickup),
    );
    if (selected == null) return;
    setState(() {
      if (pickup) {
        _pickup = selected.coordinate;
        _pickupLabel = selected.label;
      } else {
        _dropoff = selected.coordinate;
        _dropoffLabel = selected.label;
      }
    });
    await _refreshPreview();
  }

  Future<void> _refreshPreview() async {
    if (_pickup == null || _dropoff == null) return;
    setState(() {
      _previewLoading = true;
      _error = null;
    });
    try {
      final preview = await widget.api.previewRoute(pickup: _pickup!, dropoff: _dropoff!, tariffId: _tariffId);
      List<TariffOption> tariffs = _tariffs;
      if (tariffs.isEmpty || preview.regionId != _preview?.regionId) {
        tariffs = await widget.api.getTariffs(preview.regionId);
      }
      setState(() {
        _preview = preview;
        _tariffs = tariffs;
        _tariffId ??= tariffs.isNotEmpty ? tariffs.first.id : null;
      });
      if (_tariffId != null && preview.estimatedPrice == null) {
        await _refreshPreview();
      }
    } catch (error) {
      setState(() => _error = _readableError(error));
    } finally {
      if (mounted) setState(() => _previewLoading = false);
    }
  }

  Future<void> _createOrder() async {
    if (!_logged) {
      setState(() => _tab = 2);
      return;
    }
    if (_pickup == null || _dropoff == null || _tariffId == null || _preview == null) return;
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final order = await widget.api.createOrder(
        pickup: _pickup!,
        dropoff: _dropoff!,
        tariffId: _tariffId!,
        distanceKm: _preview!.distanceMeters / 1000,
        durationMin: _preview!.durationSeconds / 60,
      );
      widget.sockets.joinOrder(order.id);
      setState(() {
        _order = order;
        _tab = 1;
      });
    } catch (error) {
      setState(() => _error = _readableError(error));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _cancelOrder() async {
    if (_order == null) return;
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      await widget.api.cancelPublicOrder(_order!.id);
      setState(() => _order = null);
    } catch (error) {
      setState(() => _error = _readableError(error));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _loadDriverRoute(String orderId) async {
    try {
      final route = await widget.api.driverToPickupRoute(orderId);
      if (mounted) setState(() => _preview = route);
    } catch (_) {
      if (mounted && _driverLocation == null) setState(() {});
    }
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Expanded(
          child: IndexedStack(
            index: _tab,
            children: [
              _buildHome(),
              _buildTrip(),
              _buildProfile(),
            ],
          ),
        ),
        NavigationBar(
          selectedIndex: _tab,
          onDestinationSelected: (index) => setState(() => _tab = index),
          destinations: const [
            NavigationDestination(icon: Icon(Icons.local_taxi_outlined), label: 'Заказ'),
            NavigationDestination(icon: Icon(Icons.route_outlined), label: 'Поездка'),
            NavigationDestination(icon: Icon(Icons.person_outline), label: 'Профиль'),
          ],
        ),
      ],
    );
  }

  Widget _buildHome() {
    return Stack(
      children: [
        _MapCanvas(
          pickup: _pickup,
          dropoff: _dropoff,
          driver: _order?.driverId == null ? null : _driverLocation,
          route: _preview?.geometry ?? const [],
        ),
        DraggableScrollableSheet(
          initialChildSize: 0.46,
          minChildSize: 0.28,
          maxChildSize: 0.82,
          builder: (context, controller) => _Sheet(
            controller: controller,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const _SheetHandle(),
                const _TitleBlock(title: 'Закажите поездку', text: 'Поездки только внутри активного региона'),
                const SizedBox(height: 18),
                RouteFields(
                  pickupLabel: _pickupLabel,
                  dropoffLabel: _dropoffLabel,
                  onPickupTap: () => _selectPoint(pickup: true),
                  onDropoffTap: () => _selectPoint(pickup: false),
                ),
                const SizedBox(height: 18),
                _TariffSection(
                  tariffs: _tariffs,
                  selectedId: _tariffId,
                  estimate: _preview,
                  loading: _previewLoading,
                  onSelect: (id) async {
                    setState(() => _tariffId = id);
                    await _refreshPreview();
                  },
                ),
                const SizedBox(height: 16),
                _PriceSection(preview: _preview, loading: _previewLoading),
                if (_error != null) ...[
                  const SizedBox(height: 12),
                  _ErrorText(_error!),
                ],
                const SizedBox(height: 16),
                ElevatedButton(
                  onPressed: _loading || _previewLoading ? null : _createOrder,
                  child: Text(!_logged ? 'Войдите, чтобы заказать' : _preview == null ? 'Рассчитать стоимость' : 'Заказать'),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildTrip() {
    if (_order == null) {
      return const Padding(
        padding: EdgeInsets.all(20),
        child: EmptyState(title: 'Активной поездки нет', text: 'Создайте заказ, и его статус появится здесь.'),
      );
    }
    final driverText = _order!.driverId == null
        ? 'Данные водителя появятся после принятия заказа'
        : _driverLocation == null
            ? 'Ожидаем геолокацию водителя'
            : 'Геолокация водителя получена от backend';
    return ListView(
      padding: const EdgeInsets.all(20),
      children: [
        const _TitleBlock(title: 'Текущая поездка', text: 'Статус обновляется через Socket.IO'),
        const SizedBox(height: 16),
        _Card(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              StatusPill(label: _statusLabel(_order!.status), tone: _statusTone(_order!.status)),
              const SizedBox(height: 16),
              _Stepper(status: _order!.status),
              const SizedBox(height: 18),
              _RouteSummary(pickup: _order!.pickup, dropoff: _order!.dropoff),
              const SizedBox(height: 14),
              Text(driverText, style: const TextStyle(color: SmartTaxiColors.textSecondary)),
              if (_order!.price != null) ...[
                const SizedBox(height: 14),
                Text('${_order!.price!.round()} ₸', style: const TextStyle(fontSize: 28, fontWeight: FontWeight.w900)),
              ],
              const SizedBox(height: 16),
              OutlinedButton(
                onPressed: _loading ? null : _cancelOrder,
                child: const Text('Отменить поездку'),
              ),
            ],
          ),
        ),
        if (_error != null) ...[
          const SizedBox(height: 12),
          _ErrorText(_error!),
        ],
      ],
    );
  }

  Widget _buildProfile() {
    return ListView(
      padding: const EdgeInsets.all(20),
      children: [
        Center(child: BrandLogo(large: true)),
        const SizedBox(height: 20),
        _Card(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const _TitleBlock(title: 'Профиль', text: 'Вход нужен для создания заказа через backend'),
              const SizedBox(height: 16),
              TextField(decoration: const InputDecoration(labelText: 'Телефон'), keyboardType: TextInputType.phone, onChanged: (value) => _phone = value),
              const SizedBox(height: 12),
              TextField(decoration: const InputDecoration(labelText: 'Email'), keyboardType: TextInputType.emailAddress, onChanged: (value) => _email = value),
              const SizedBox(height: 12),
              TextField(decoration: const InputDecoration(labelText: 'Пароль'), obscureText: true, onChanged: (value) => _password = value),
              if (_error != null) ...[
                const SizedBox(height: 12),
                _ErrorText(_error!),
              ],
              const SizedBox(height: 16),
              ElevatedButton(onPressed: _loading ? null : _login, child: Text(_logged ? 'Обновить вход' : 'Войти')),
            ],
          ),
        ),
      ],
    );
  }
}

class _MapCanvas extends StatelessWidget {
  const _MapCanvas({required this.pickup, required this.dropoff, required this.driver, required this.route});

  final Coordinate? pickup;
  final Coordinate? dropoff;
  final DriverLocation? driver;
  final List<LatLng> route;

  @override
  Widget build(BuildContext context) {
    final center = pickup?.toLatLng() ?? dropoff?.toLatLng() ?? const LatLng(42.316, 69.596);
    return Stack(
      children: [
        FlutterMap(
          options: MapOptions(initialCenter: center, initialZoom: pickup == null && dropoff == null ? 12 : 14),
          children: [
            TileLayer(urlTemplate: AppConfig.osmTileUrl, userAgentPackageName: 'com.smarttaxi.app'),
            if (route.isNotEmpty) PolylineLayer(polylines: [Polyline(points: route, color: SmartTaxiColors.goldDeep, strokeWidth: 5)]),
            MarkerLayer(markers: [
              if (pickup != null) _marker(pickup!.toLatLng(), Icons.trip_origin, SmartTaxiColors.text),
              if (dropoff != null) _marker(dropoff!.toLatLng(), Icons.location_on, SmartTaxiColors.goldDeep),
              if (driver != null) _marker(driver!.toLatLng(), Icons.navigation_rounded, SmartTaxiColors.success),
            ]),
          ],
        ),
        Positioned(
          left: 12,
          bottom: 12,
          child: DecoratedBox(
            decoration: BoxDecoration(color: Colors.white.withValues(alpha: 0.92), borderRadius: BorderRadius.circular(10)),
            child: const Padding(
              padding: EdgeInsets.symmetric(horizontal: 8, vertical: 5),
              child: Text(AppConfig.mapAttribution, style: TextStyle(fontSize: 11, color: SmartTaxiColors.textSecondary)),
            ),
          ),
        ),
      ],
    );
  }

  Marker _marker(LatLng point, IconData icon, Color color) {
    return Marker(
      point: point,
      width: 42,
      height: 42,
      child: DecoratedBox(
        decoration: BoxDecoration(color: Colors.white, shape: BoxShape.circle, boxShadow: const [BoxShadow(color: Color(0x1f000000), blurRadius: 14)]),
        child: Icon(icon, color: color),
      ),
    );
  }
}

class _CoordinateSheet extends StatefulWidget {
  const _CoordinateSheet({required this.title, required this.allowDeviceLocation});

  final String title;
  final bool allowDeviceLocation;

  @override
  State<_CoordinateSheet> createState() => _CoordinateSheetState();
}

class _CoordinateSheetState extends State<_CoordinateSheet> {
  final _lat = TextEditingController();
  final _lng = TextEditingController();
  final _label = TextEditingController();
  String? _error;

  @override
  void dispose() {
    _lat.dispose();
    _lng.dispose();
    _label.dispose();
    super.dispose();
  }

  Future<void> _useDeviceLocation() async {
    try {
      final permission = await Geolocator.requestPermission();
      if (permission == LocationPermission.denied || permission == LocationPermission.deniedForever) {
        setState(() => _error = 'Разрешите геолокацию или введите координаты вручную');
        return;
      }
      final position = await Geolocator.getCurrentPosition();
      if (!mounted) return;
      Navigator.pop(
        context,
        _PointResult(Coordinate(lat: position.latitude, lng: position.longitude), 'Моя геолокация'),
      );
    } catch (_) {
      setState(() => _error = 'Не удалось получить геолокацию');
    }
  }

  void _submit() {
    final lat = double.tryParse(_lat.text.replaceAll(',', '.'));
    final lng = double.tryParse(_lng.text.replaceAll(',', '.'));
    if (lat == null || lng == null) {
      setState(() => _error = 'Введите координаты');
      return;
    }
    Navigator.pop(context, _PointResult(Coordinate(lat: lat, lng: lng), _label.text.isEmpty ? 'Выбранная точка' : _label.text));
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.fromLTRB(20, 20, 20, 20 + MediaQuery.viewInsetsOf(context).bottom),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(widget.title, style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w900)),
          const SizedBox(height: 8),
          const Text('Геокодинг не имитируется: выберите реальную геолокацию или введите координаты.', style: TextStyle(color: SmartTaxiColors.textSecondary)),
          const SizedBox(height: 16),
          TextField(controller: _label, decoration: const InputDecoration(labelText: 'Название точки')),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(child: TextField(controller: _lat, decoration: const InputDecoration(labelText: 'Широта'), keyboardType: TextInputType.number)),
              const SizedBox(width: 12),
              Expanded(child: TextField(controller: _lng, decoration: const InputDecoration(labelText: 'Долгота'), keyboardType: TextInputType.number)),
            ],
          ),
          if (_error != null) ...[
            const SizedBox(height: 12),
            _ErrorText(_error!),
          ],
          const SizedBox(height: 16),
          if (widget.allowDeviceLocation) ...[
            OutlinedButton(onPressed: _useDeviceLocation, child: const Text('Использовать геолокацию')),
            const SizedBox(height: 10),
          ],
          ElevatedButton(onPressed: _submit, child: const Text('Выбрать точку')),
        ],
      ),
    );
  }
}

class _PointResult {
  _PointResult(this.coordinate, this.label);

  final Coordinate coordinate;
  final String label;
}

class _Sheet extends StatelessWidget {
  const _Sheet({required this.controller, required this.child});

  final ScrollController controller;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: const BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.vertical(top: Radius.circular(30)),
        boxShadow: [BoxShadow(color: Color(0x1f000000), blurRadius: 24)],
      ),
      child: ListView(controller: controller, padding: const EdgeInsets.fromLTRB(20, 12, 20, 24), children: [child]),
    );
  }
}

class _TariffSection extends StatelessWidget {
  const _TariffSection({required this.tariffs, required this.selectedId, required this.estimate, required this.loading, required this.onSelect});

  final List<TariffOption> tariffs;
  final String? selectedId;
  final RoutePreview? estimate;
  final bool loading;
  final ValueChanged<String> onSelect;

  @override
  Widget build(BuildContext context) {
    if (loading) return const LinearProgressIndicator();
    if (tariffs.isEmpty) {
      return const EmptyState(title: 'Тарифы пока не настроены', text: 'Администратор должен добавить тариф для этого региона.');
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text('Выберите тариф', style: TextStyle(fontSize: 17, fontWeight: FontWeight.w900)),
        const SizedBox(height: 10),
        SizedBox(
          height: 112,
          child: ListView.separated(
            scrollDirection: Axis.horizontal,
            itemCount: tariffs.length,
            separatorBuilder: (_, __) => const SizedBox(width: 12),
            itemBuilder: (context, index) {
              final tariff = tariffs[index];
              final selected = tariff.id == selectedId;
              return InkWell(
                borderRadius: BorderRadius.circular(20),
                onTap: () => onSelect(tariff.id),
                child: Container(
                  width: 150,
                  padding: const EdgeInsets.all(14),
                  decoration: BoxDecoration(
                    color: selected ? SmartTaxiColors.cardWarm : Colors.white,
                    border: Border.all(color: selected ? SmartTaxiColors.gold : SmartTaxiColors.border, width: selected ? 2 : 1),
                    borderRadius: BorderRadius.circular(20),
                  ),
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text(tariff.name, style: const TextStyle(fontWeight: FontWeight.w900)),
                    if (tariff.description != null) Text(tariff.description!, maxLines: 2, overflow: TextOverflow.ellipsis),
                    const Spacer(),
                    if (selected && estimate?.estimatedPrice != null) Text('${estimate!.estimatedPrice!.round()} ₸', style: const TextStyle(fontWeight: FontWeight.w900)),
                  ]),
                ),
              );
            },
          ),
        ),
      ],
    );
  }
}

class _PriceSection extends StatelessWidget {
  const _PriceSection({required this.preview, required this.loading});

  final RoutePreview? preview;
  final bool loading;

  @override
  Widget build(BuildContext context) {
    return _Card(
      child: loading
          ? const LinearProgressIndicator()
          : preview?.estimatedPrice == null
              ? const Text('Укажите маршрут, чтобы рассчитать стоимость')
              : Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text('Стоимость', style: TextStyle(fontSize: 17, fontWeight: FontWeight.w900)),
                    const SizedBox(height: 8),
                    Text('${preview!.estimatedPrice!.round()} ₸', style: const TextStyle(fontSize: 32, fontWeight: FontWeight.w900)),
                    const Text('Рассчитано сервером', style: TextStyle(color: SmartTaxiColors.textSecondary)),
                  ],
                ),
    );
  }
}

class _RouteSummary extends StatelessWidget {
  const _RouteSummary({required this.pickup, required this.dropoff});

  final String pickup;
  final String dropoff;

  @override
  Widget build(BuildContext context) {
    return RouteFields(pickupLabel: pickup, dropoffLabel: dropoff, onPickupTap: () {}, onDropoffTap: () {});
  }
}

class _Stepper extends StatelessWidget {
  const _Stepper({required this.status});

  final String status;

  @override
  Widget build(BuildContext context) {
    const steps = ['NEW', 'DRIVER_ASSIGNED', 'DRIVER_ARRIVED', 'IN_PROGRESS', 'COMPLETED'];
    const labels = ['Поиск', 'Принят', 'Прибыл', 'В пути', 'Завершено'];
    final index = steps.indexOf(status).clamp(0, steps.length - 1);
    return Row(
      children: List.generate(steps.length, (stepIndex) {
        final done = stepIndex <= index;
        return Expanded(
          child: Container(
            margin: const EdgeInsets.only(right: 5),
            padding: const EdgeInsets.symmetric(vertical: 9),
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: done ? SmartTaxiColors.goldSoft : Colors.white,
              border: Border.all(color: done ? SmartTaxiColors.borderStrong : SmartTaxiColors.border),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Text(labels[stepIndex], style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w800)),
          ),
        );
      }),
    );
  }
}

class _Card extends StatelessWidget {
  const _Card({required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: Colors.white,
        border: Border.all(color: SmartTaxiColors.border),
        borderRadius: BorderRadius.circular(26),
        boxShadow: const [BoxShadow(color: Color(0x14785a14), blurRadius: 35, offset: Offset(0, 16))],
      ),
      child: child,
    );
  }
}

class _TitleBlock extends StatelessWidget {
  const _TitleBlock({required this.title, required this.text});

  final String title;
  final String text;

  @override
  Widget build(BuildContext context) {
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Text(title, style: const TextStyle(fontSize: 28, height: 1.12, fontWeight: FontWeight.w900)),
      const SizedBox(height: 6),
      Text(text, style: const TextStyle(color: SmartTaxiColors.textSecondary, fontSize: 14)),
    ]);
  }
}

class _SheetHandle extends StatelessWidget {
  const _SheetHandle();

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Container(width: 42, height: 5, margin: const EdgeInsets.only(bottom: 16), decoration: BoxDecoration(color: SmartTaxiColors.borderStrong, borderRadius: BorderRadius.circular(999))),
    );
  }
}

class _ErrorText extends StatelessWidget {
  const _ErrorText(this.text);

  final String text;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(color: const Color(0xfffff1f1), border: Border.all(color: const Color(0xfffecaca)), borderRadius: BorderRadius.circular(16)),
      child: Text(text, style: const TextStyle(color: SmartTaxiColors.danger, fontWeight: FontWeight.w700)),
    );
  }
}

String _statusLabel(String status) {
  return const {
        'NEW': 'Ищем водителя',
        'DRIVER_ASSIGNED': 'Водитель принят',
        'DRIVER_ARRIVED': 'Водитель прибыл',
        'IN_PROGRESS': 'В пути',
        'COMPLETED': 'Завершено',
        'CANCELLED': 'Отменён',
      }[status] ??
      status;
}

StatusTone _statusTone(String status) {
  if (status == 'COMPLETED') return StatusTone.success;
  if (status == 'CANCELLED') return StatusTone.danger;
  if (status == 'DRIVER_ASSIGNED' || status == 'DRIVER_ARRIVED' || status == 'IN_PROGRESS') return StatusTone.warning;
  return StatusTone.neutral;
}

String _readableError(Object error) {
  final message = error.toString();
  const map = {
    'PICKUP_REGION_INACTIVE': 'В этом месте сервис пока недоступен',
    'DROPOFF_REGION_INACTIVE': 'Точка назначения вне активного региона',
    'INTERCITY_NOT_SUPPORTED': 'Межгород пока не поддерживается',
    'TARIFF_INACTIVE': 'Этот тариф временно недоступен',
    'TARIFF_REGION_MISMATCH': 'Тариф недоступен для выбранного региона',
    'ROUTE_UNAVAILABLE': 'Маршрут сейчас недоступен',
    'DRIVER_LOCATION_UNAVAILABLE': 'Ожидаем геолокацию водителя',
  };
  for (final entry in map.entries) {
    if (message.contains(entry.key)) return entry.value;
  }
  return 'Не удалось выполнить запрос';
}
