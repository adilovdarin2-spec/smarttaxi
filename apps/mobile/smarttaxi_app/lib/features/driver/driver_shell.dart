import 'dart:async';

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

class DriverShell extends StatefulWidget {
  const DriverShell({super.key, required this.api, required this.authStore, required this.sockets});

  final ApiClient api;
  final AuthStore authStore;
  final SocketService sockets;

  @override
  State<DriverShell> createState() => _DriverShellState();
}

class _DriverShellState extends State<DriverShell> {
  int _tab = 0;
  bool _logged = false;
  bool _loading = false;
  bool _online = false;
  String? _error;
  String _phone = '';
  String _email = '';
  String _password = '';
  List<DriverRegion> _regions = const [];
  String? _regionId;
  List<OrderSummary> _orders = const [];
  OrderSummary? _activeOrder;
  StreamSubscription<Position>? _positionSub;
  RoutePreview? _driverRoute;

  DriverRegion? get _selectedRegion {
    for (final region in _regions) {
      if (region.id == _regionId) return region;
    }
    return null;
  }

  @override
  void initState() {
    super.initState();
    _bootstrap();
  }

  @override
  void dispose() {
    _positionSub?.cancel();
    widget.sockets.dispose();
    super.dispose();
  }

  Future<void> _bootstrap() async {
    _logged = (await widget.authStore.readToken()) != null;
    if (_logged) {
      await _afterLogin();
    }
    if (mounted) setState(() {});
  }

  Future<void> _afterLogin() async {
    await widget.sockets.connect();
    widget.sockets.joinDrivers();
    widget.sockets.onOrderUpdate(_handleOrderUpdate);
    await _loadRegions();
    await _loadOrders();
  }

  void _handleOrderUpdate(dynamic data) {
    if (data is! Map) return;
    final order = OrderSummary.fromJson(Map<String, dynamic>.from(data['order'] ?? data));
    setState(() {
      _orders = _mergeOrder(_orders, order);
      if (order.isActive) _activeOrder = order;
    });
  }

  Future<void> _login() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      await widget.api.login(phone: _phone, email: _email, password: _password);
      _logged = true;
      await _afterLogin();
    } catch (error) {
      setState(() => _error = _readableError(error));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _loadRegions() async {
    setState(() => _error = null);
    try {
      final regions = await widget.api.getDriverRegions();
      setState(() {
        _regions = regions;
        _regionId ??= regions.isNotEmpty ? regions.first.id : null;
      });
    } catch (error) {
      setState(() => _error = _readableError(error));
    }
  }

  Future<void> _selectRegion(String? regionId) async {
    if (regionId == null) return;
    setState(() {
      _loading = true;
      _error = null;
      _regionId = regionId;
    });
    try {
      await widget.api.selectDriverRegion(regionId);
      await _loadOrders();
    } catch (error) {
      setState(() => _error = _readableError(error));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _setOnline(bool nextOnline) async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      await widget.api.setDriverStatus(nextOnline ? 'FREE' : 'OFFLINE');
      if (nextOnline) {
        final locationStarted = await _startLocationFlow();
        if (!locationStarted) {
          await widget.api.setDriverStatus('OFFLINE');
          setState(() => _online = false);
          return;
        }
        widget.sockets.joinDrivers();
        await _loadOrders();
      } else {
        await _positionSub?.cancel();
        _positionSub = null;
      }
      setState(() => _online = nextOnline);
    } catch (error) {
      setState(() => _error = _readableError(error));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<bool> _startLocationFlow() async {
    final enabled = await Geolocator.isLocationServiceEnabled();
    if (!enabled) {
      setState(() => _error = 'Включите геолокацию, чтобы выйти на линию');
      return false;
    }
    var permission = await Geolocator.checkPermission();
    if (permission == LocationPermission.denied) {
      permission = await Geolocator.requestPermission();
    }
    if (permission == LocationPermission.denied || permission == LocationPermission.deniedForever) {
      setState(() => _error = 'Разрешите геолокацию, чтобы выйти на линию');
      return false;
    }
    await _positionSub?.cancel();
    _positionSub = Geolocator.getPositionStream(
      locationSettings: const LocationSettings(accuracy: LocationAccuracy.high, distanceFilter: 20),
    ).listen((position) {
      widget.api.updateDriverLocation(
        location: Coordinate(lat: position.latitude, lng: position.longitude),
        heading: position.heading.isFinite ? position.heading : null,
        speed: position.speed.isFinite ? position.speed : null,
        accuracy: position.accuracy.isFinite ? position.accuracy : null,
      );
    });
    final current = await Geolocator.getCurrentPosition();
    await widget.api.updateDriverLocation(
      location: Coordinate(lat: current.latitude, lng: current.longitude),
      heading: current.heading.isFinite ? current.heading : null,
      speed: current.speed.isFinite ? current.speed : null,
      accuracy: current.accuracy.isFinite ? current.accuracy : null,
    );
    return true;
  }

  Future<void> _loadOrders() async {
    if (!_logged) return;
    setState(() => _loading = true);
    try {
      final orders = await widget.api.getOrders();
      final active = orders.where((order) => order.isActive).toList(growable: false);
      setState(() {
        _orders = orders;
        _activeOrder = active.isEmpty ? null : active.first;
      });
    } catch (error) {
      setState(() => _error = _readableError(error));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _accept(OrderSummary order) async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final accepted = await widget.api.acceptOrder(order.id);
      widget.sockets.joinOrder(accepted.id);
      setState(() {
        _activeOrder = accepted;
        _orders = _mergeOrder(_orders, accepted);
        _tab = 2;
      });
      await _loadDriverRoute(accepted.id);
    } catch (error) {
      setState(() => _error = _readableError(error));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _tripAction(Future<OrderSummary> Function(String id) action) async {
    if (_activeOrder == null) return;
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final order = await action(_activeOrder!.id);
      setState(() {
        _activeOrder = order.isActive ? order : null;
        _orders = _mergeOrder(_orders, order);
        if (order.status == 'COMPLETED' || order.status == 'CANCELLED') _driverRoute = null;
      });
    } catch (error) {
      setState(() => _error = _readableError(error));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _loadDriverRoute(String orderId) async {
    try {
      final route = await widget.api.driverToPickupRoute(orderId);
      if (mounted) setState(() => _driverRoute = route);
    } catch (_) {
      if (mounted) setState(() => _driverRoute = null);
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
              _lineTab(),
              _ordersTab(),
              _tripTab(),
            ],
          ),
        ),
        NavigationBar(
          selectedIndex: _tab,
          onDestinationSelected: (index) => setState(() => _tab = index),
          destinations: const [
            NavigationDestination(icon: Icon(Icons.power_settings_new), label: 'Линия'),
            NavigationDestination(icon: Icon(Icons.receipt_long_outlined), label: 'Заказы'),
            NavigationDestination(icon: Icon(Icons.route_outlined), label: 'Поездка'),
          ],
        ),
      ],
    );
  }

  Widget _lineTab() {
    if (!_logged) {
      return ListView(
        padding: const EdgeInsets.all(20),
        children: [
          Center(child: BrandLogo(large: true)),
          const SizedBox(height: 20),
          _Card(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const _TitleBlock(title: 'Вход для водителя', text: 'Работайте только в одобренном регионе'),
                const SizedBox(height: 16),
                TextField(decoration: const InputDecoration(labelText: 'Телефон'), keyboardType: TextInputType.phone, onChanged: (value) => _phone = value),
                const SizedBox(height: 12),
                TextField(decoration: const InputDecoration(labelText: 'Email'), keyboardType: TextInputType.emailAddress, onChanged: (value) => _email = value),
                const SizedBox(height: 12),
                TextField(decoration: const InputDecoration(labelText: 'Пароль'), obscureText: true, onChanged: (value) => _password = value),
                if (_error != null) ...[const SizedBox(height: 12), _ErrorText(_error!)],
                const SizedBox(height: 16),
                ElevatedButton(onPressed: _loading ? null : _login, child: const Text('Войти')),
              ],
            ),
          ),
        ],
      );
    }
    final disabledReason = _disabledReason();
    return ListView(
      padding: const EdgeInsets.all(20),
      children: [
        const _TitleBlock(title: 'Рабочая смена', text: 'Выходите на линию только в одобренном регионе'),
        const SizedBox(height: 16),
        _Card(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            StatusPill(label: _online ? 'На линии' : 'Не на линии', tone: _online ? StatusTone.success : StatusTone.neutral),
            const SizedBox(height: 16),
            const Text('Рабочий регион', style: TextStyle(fontSize: 17, fontWeight: FontWeight.w900)),
            const SizedBox(height: 10),
            if (_regions.isEmpty)
              const EmptyState(title: 'Нет одобренных регионов', text: 'Администратор должен одобрить вас для работы в регионе.')
            else
              DropdownButtonFormField<String>(
                initialValue: _regionId,
                items: _regions.map((region) => DropdownMenuItem(value: region.id, child: Text(region.name))).toList(),
                onChanged: _online ? null : _selectRegion,
              ),
            if (disabledReason != null) ...[
              const SizedBox(height: 12),
              _WarningText(disabledReason),
            ],
            if (_error != null) ...[
              const SizedBox(height: 12),
              _ErrorText(_error!),
            ],
            const SizedBox(height: 16),
            ElevatedButton(
              onPressed: _loading || (!_online && disabledReason != null) ? null : () => _setOnline(!_online),
              child: Text(_online ? 'Уйти с линии' : 'Выйти на линию'),
            ),
          ]),
        ),
      ],
    );
  }

  Widget _ordersTab() {
    final openOrders = _orders.where((order) => order.isOpen).toList(growable: false);
    return RefreshIndicator(
      onRefresh: _loadOrders,
      child: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          const _TitleBlock(title: 'Заказы в регионе', text: 'Только backend-выдача выбранного одобренного региона'),
          const SizedBox(height: 16),
          if (!_online)
            const EmptyState(title: 'Выйдите на линию, чтобы получать заказы', text: 'Заказы появятся после backend-проверки региона и статуса.')
          else if (openOrders.isEmpty)
            const EmptyState(title: 'Заказов в вашем регионе пока нет', text: 'Новые заказы появятся здесь без выдуманных данных.')
          else
            ...openOrders.map((order) => Padding(
                  padding: const EdgeInsets.only(bottom: 12),
                  child: _OrderCard(order: order, loading: _loading, onAccept: () => _accept(order)),
                )),
          if (_error != null) _ErrorText(_error!),
        ],
      ),
    );
  }

  Widget _tripTab() {
    final action = _nextAction();
    return ListView(
      padding: const EdgeInsets.all(20),
      children: [
        const _TitleBlock(title: 'Активная поездка', text: 'Один следующий шаг по статусу заказа'),
        const SizedBox(height: 16),
        if (_activeOrder == null)
          const EmptyState(title: 'Активной поездки нет', text: 'Примите заказ, и поездка появится здесь.')
        else ...[
          _TripMap(order: _activeOrder!, route: _driverRoute?.geometry ?? const []),
          const SizedBox(height: 12),
          _Card(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              StatusPill(label: _statusLabel(_activeOrder!.status), tone: StatusTone.warning),
              const SizedBox(height: 16),
              RouteFields(
                pickupLabel: _activeOrder!.pickup,
                dropoffLabel: _activeOrder!.dropoff,
                onPickupTap: () {},
                onDropoffTap: () {},
              ),
              if (_activeOrder!.price != null) ...[
                const SizedBox(height: 14),
                Text('${_activeOrder!.price!.round()} ₸', style: const TextStyle(fontSize: 26, fontWeight: FontWeight.w900)),
              ],
              if (_routeMeta(_activeOrder!) != null) ...[
                const SizedBox(height: 8),
                Text(_routeMeta(_activeOrder!)!, style: const TextStyle(color: SmartTaxiColors.textSecondary)),
              ],
              const SizedBox(height: 16),
              if (action != null) ElevatedButton(onPressed: _loading ? null : () => _tripAction(action.$2), child: Text(action.$1)),
              if (_activeOrder!.status == 'DRIVER_ASSIGNED' || _activeOrder!.status == 'DRIVER_ARRIVED') ...[
                const SizedBox(height: 10),
                OutlinedButton(onPressed: _loading ? null : () => _tripAction(widget.api.cancelDriverOrder), child: const Text('Отменить')),
              ],
            ]),
          ),
        ],
        if (_error != null) ...[const SizedBox(height: 12), _ErrorText(_error!)],
      ],
    );
  }

  String? _disabledReason() {
    final region = _selectedRegion;
    if (_regions.isEmpty) return 'Нет одобренных регионов';
    if (_regionId == null) return 'Выберите рабочий регион';
    if (region?.isActive == false) return 'Регион временно отключён';
    if (region?.status == 'BLOCKED') return 'Работа в этом регионе заблокирована';
    if (region?.status != 'APPROVED') return 'Вы не одобрены для этого региона';
    return null;
  }

  (String, Future<OrderSummary> Function(String id))? _nextAction() {
    final status = _activeOrder?.status;
    if (status == 'DRIVER_ASSIGNED') return ('Прибыл', widget.api.arrived);
    if (status == 'DRIVER_ARRIVED') return ('Начать поездку', widget.api.startTrip);
    if (status == 'IN_PROGRESS') return ('Завершить поездку', widget.api.completeTrip);
    return null;
  }
}

class _TripMap extends StatelessWidget {
  const _TripMap({required this.order, required this.route});

  final OrderSummary order;
  final List<LatLng> route;

  @override
  Widget build(BuildContext context) {
    final pickup = order.pickupCoordinate?.toLatLng();
    final dropoff = order.dropoffCoordinate?.toLatLng();
    if (pickup == null && dropoff == null && route.isEmpty) {
      return const SizedBox.shrink();
    }
    final center = pickup ?? dropoff ?? route.first;
    return ClipRRect(
      borderRadius: BorderRadius.circular(26),
      child: SizedBox(
        height: 260,
        child: Stack(
          children: [
            FlutterMap(
              options: MapOptions(initialCenter: center, initialZoom: 14),
              children: [
                TileLayer(urlTemplate: AppConfig.osmTileUrl, userAgentPackageName: 'com.smarttaxi.app'),
                if (route.isNotEmpty) PolylineLayer(polylines: [Polyline(points: route, color: SmartTaxiColors.goldDeep, strokeWidth: 5)]),
                MarkerLayer(markers: [
                  if (pickup != null) Marker(point: pickup, width: 42, height: 42, child: const Icon(Icons.trip_origin, color: SmartTaxiColors.text)),
                  if (dropoff != null) Marker(point: dropoff, width: 42, height: 42, child: const Icon(Icons.location_on, color: SmartTaxiColors.goldDeep)),
                ]),
              ],
            ),
            const Positioned(
              left: 12,
              bottom: 12,
              child: DecoratedBox(
                decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.all(Radius.circular(10))),
                child: Padding(
                  padding: EdgeInsets.symmetric(horizontal: 8, vertical: 5),
                  child: Text(AppConfig.mapAttribution, style: TextStyle(fontSize: 11, color: SmartTaxiColors.textSecondary)),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _OrderCard extends StatelessWidget {
  const _OrderCard({required this.order, required this.loading, required this.onAccept});

  final OrderSummary order;
  final bool loading;
  final VoidCallback onAccept;

  @override
  Widget build(BuildContext context) {
    return _Card(
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        RouteFields(pickupLabel: order.pickup, dropoffLabel: order.dropoff, onPickupTap: () {}, onDropoffTap: () {}),
        if (order.price != null) ...[
          const SizedBox(height: 10),
          Text('${order.price!.round()} ₸', style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w900)),
        ],
        if (_routeMeta(order) != null) ...[
          const SizedBox(height: 8),
          Text(_routeMeta(order)!, style: const TextStyle(color: SmartTaxiColors.textSecondary)),
        ],
        const SizedBox(height: 14),
        ElevatedButton(onPressed: loading ? null : onAccept, child: const Text('Принять')),
      ]),
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

class _WarningText extends StatelessWidget {
  const _WarningText(this.text);

  final String text;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(color: SmartTaxiColors.goldSoft, border: Border.all(color: SmartTaxiColors.borderStrong), borderRadius: BorderRadius.circular(16)),
      child: Text(text, style: const TextStyle(color: SmartTaxiColors.warning, fontWeight: FontWeight.w700)),
    );
  }
}

List<OrderSummary> _mergeOrder(List<OrderSummary> orders, OrderSummary next) {
  final updated = [...orders];
  final index = updated.indexWhere((order) => order.id == next.id);
  if (index >= 0) {
    updated[index] = next;
  } else {
    updated.insert(0, next);
  }
  return updated;
}

String? _routeMeta(OrderSummary order) {
  final parts = <String>[];
  if (order.distanceKm != null) parts.add('${order.distanceKm!.toStringAsFixed(1)} км');
  if (order.durationMin != null) parts.add('${order.durationMin!.round()} мин');
  if (parts.isEmpty) return null;
  return 'Маршрут: ${parts.join(' · ')}';
}

String _statusLabel(String status) {
  return const {
        'DRIVER_ASSIGNED': 'Принят',
        'DRIVER_ARRIVED': 'Прибыл',
        'IN_PROGRESS': 'В пути',
        'COMPLETED': 'Завершено',
        'CANCELLED': 'Отменён',
      }[status] ??
      status;
}

String _readableError(Object error) {
  final message = error.toString();
  const map = {
    'DRIVER_REGION_NOT_SELECTED': 'Выберите рабочий регион',
    'DRIVER_REGION_INACTIVE': 'Регион временно отключён',
    'DRIVER_REGION_NOT_APPROVED': 'Вы не одобрены для этого региона',
    'DRIVER_REGION_BLOCKED': 'Работа в этом регионе заблокирована',
    'DRIVER_HAS_ACTIVE_ORDER': 'У вас уже есть активный заказ',
    'ORDER_ALREADY_ACCEPTED': 'Заказ уже принят другим водителем',
    'DRIVER_OFFLINE': 'Выйдите на линию',
    'DRIVER_LOCATION_OUTSIDE_REGION': 'Геолокация вне рабочего региона',
    'ROUTE_UNAVAILABLE': 'Маршрут сейчас недоступен',
  };
  for (final entry in map.entries) {
    if (message.contains(entry.key)) return entry.value;
  }
  return 'Не удалось выполнить запрос';
}
