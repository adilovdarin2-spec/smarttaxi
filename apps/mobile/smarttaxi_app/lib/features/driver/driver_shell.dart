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
  const DriverShell({
    super.key,
    required this.api,
    required this.authStore,
    required this.sockets,
    required this.accountLabel,
    required this.onLogout,
    required this.onOpenPassengerMode,
  });

  final ApiClient api;
  final AuthStore authStore;
  final SocketService sockets;
  final String accountLabel;
  final Future<void> Function() onLogout;
  final Future<void> Function() onOpenPassengerMode;

  @override
  State<DriverShell> createState() => _DriverShellState();
}

class _DriverShellState extends State<DriverShell> {
  final _scaffoldKey = GlobalKey<ScaffoldState>();
  int _tab = 0;
  bool _loading = false;
  bool _online = false;
  String? _error;
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
    widget.sockets.clearListeners();
    super.dispose();
  }

  Future<void> _bootstrap() async {
    await widget.sockets.connect();
    widget.sockets.joinDrivers();
    widget.sockets.onOrderUpdate(_handleOrderUpdate);
    await _loadRegions();
    await _loadOrders();
  }

  void _handleOrderUpdate(dynamic data) {
    if (data is! Map) return;
    final order =
        OrderSummary.fromJson(Map<String, dynamic>.from(data['order'] ?? data));
    setState(() {
      _orders = _mergeOrder(_orders, order);
      if (order.isActive) _activeOrder = order;
    });
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
      setState(() => _error = 'Для работы на линии нужна геолокация');
      return false;
    }
    var permission = await Geolocator.checkPermission();
    if (permission == LocationPermission.denied) {
      permission = await Geolocator.requestPermission();
    }
    if (permission == LocationPermission.denied ||
        permission == LocationPermission.deniedForever) {
      setState(() => _error = 'Для работы на линии нужна геолокация');
      return false;
    }
    await _positionSub?.cancel();
    _positionSub = Geolocator.getPositionStream(
      locationSettings: const LocationSettings(
          accuracy: LocationAccuracy.high, distanceFilter: 20),
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
    setState(() => _loading = true);
    try {
      final orders = await widget.api.getOrders();
      final active =
          orders.where((order) => order.isActive).toList(growable: false);
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
        _online = true;
      });
      await _loadDriverRoute(accepted.id);
    } catch (error) {
      setState(() => _error = _readableError(error));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _tripAction(
      Future<OrderSummary> Function(String id) action) async {
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
        if (order.status == 'COMPLETED' || order.status == 'CANCELLED') {
          _driverRoute = null;
        }
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

  void _openDrawer() => _scaffoldKey.currentState?.openDrawer();

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      key: _scaffoldKey,
      backgroundColor: SmartTaxiColors.appBackground,
      drawerScrimColor: Colors.black.withValues(alpha: 0.26),
      drawer: _DriverDrawer(
        accountLabel: widget.accountLabel,
        activeTab: _tab,
        onTab: (index) {
          Navigator.pop(context);
          setState(() => _tab = index);
        },
        onPassenger: () {
          Navigator.pop(context);
          widget.onOpenPassengerMode();
        },
        onLogout: () {
          Navigator.pop(context);
          widget.onLogout();
        },
      ),
      body: SafeArea(
        child: Column(
          children: [
            _DriverHeader(
                onMenu: _openDrawer,
                status: _driverStatusLabel(),
                tone: _driverStatusTone()),
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
            _FloatingNav(
              child: NavigationBar(
                selectedIndex: _tab,
                onDestinationSelected: (index) => setState(() => _tab = index),
                destinations: const [
                  NavigationDestination(
                      icon: Icon(Icons.power_settings_new),
                      selectedIcon: Icon(Icons.power_settings_new_rounded),
                      label: 'Линия'),
                  NavigationDestination(
                      icon: Icon(Icons.receipt_long_outlined),
                      selectedIcon: Icon(Icons.receipt_long),
                      label: 'Заказы'),
                  NavigationDestination(
                      icon: Icon(Icons.route_outlined),
                      selectedIcon: Icon(Icons.route),
                      label: 'Поездка'),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _lineTab() {
    final disabledReason = _disabledReason();
    return ListView(
      padding: const EdgeInsets.all(20),
      children: [
        const _TitleBlock(
            title: 'Рабочая смена',
            text: 'Выходите на линию только в одобренном регионе'),
        const SizedBox(height: 16),
        _PremiumCard(
          child:
              Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text('Статус водителя',
                          style: TextStyle(
                              color: SmartTaxiColors.textSecondary,
                              fontWeight: FontWeight.w700)),
                      const SizedBox(height: 6),
                      StatusPill(
                          label: _driverStatusLabel(),
                          tone: _driverStatusTone()),
                    ],
                  ),
                ),
                _LineGlyph(online: _online, busy: _activeOrder != null),
              ],
            ),
            const SizedBox(height: 20),
            const _SectionLabel(
                title: 'Рабочий регион',
                text: 'Заказы поступают только из выбранного региона'),
            const SizedBox(height: 12),
            if (_loading && _regions.isEmpty)
              const _LoadingStrip(text: 'Загружаем регионы...')
            else if (_regions.isEmpty)
              const EmptyState(
                  title: 'Нет одобренных регионов',
                  text: 'Администратор должен одобрить вас для работы.',
                  icon: Icons.verified_user_outlined)
            else
              DropdownButtonFormField<String>(
                initialValue: _regionId,
                items: _regions
                    .map((region) => DropdownMenuItem(
                        value: region.id, child: Text(region.name)))
                    .toList(),
                onChanged: _online ? null : _selectRegion,
              ),
            if (disabledReason != null) ...[
              const SizedBox(height: 12),
              _InlineMessage(text: disabledReason),
            ],
            if (_error != null) ...[
              const SizedBox(height: 12),
              _InlineMessage(text: _error!, danger: true),
            ],
            const SizedBox(height: 16),
            ElevatedButton(
              onPressed: _loading || (!_online && disabledReason != null)
                  ? null
                  : () => _setOnline(!_online),
              child: _loading
                  ? const _ButtonSpinner(text: 'Обновляем статус...')
                  : Text(_online ? 'Уйти с линии' : 'Выйти на линию'),
            ),
          ]),
        ),
      ],
    );
  }

  Widget _ordersTab() {
    final openOrders =
        _orders.where((order) => order.isOpen).toList(growable: false);
    return RefreshIndicator(
      onRefresh: _loadOrders,
      child: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          const _TitleBlock(
              title: 'Заказы в регионе',
              text: 'Показываем заказы только в вашем рабочем регионе.'),
          const SizedBox(height: 16),
          if (!_online)
            const EmptyState(
                title: 'Выйдите на линию, чтобы получать заказы',
                text: 'После выхода на линию заказы появятся здесь.',
                icon: Icons.power_settings_new_rounded)
          else if (openOrders.isEmpty)
            const EmptyState(
                title: 'Заказов в вашем регионе пока нет',
                text:
                    'Новые заказы появятся здесь, когда пассажиры создадут поездку.',
                icon: Icons.receipt_long_outlined)
          else
            ...openOrders.map((order) => Padding(
                  padding: const EdgeInsets.only(bottom: 12),
                  child: _OrderCard(
                      order: order,
                      loading: _loading,
                      onAccept: () => _accept(order)),
                )),
          if (_error != null) _InlineMessage(text: _error!, danger: true),
        ],
      ),
    );
  }

  Widget _tripTab() {
    final action = _nextAction();
    return ListView(
      padding: const EdgeInsets.all(20),
      children: [
        const _TitleBlock(
            title: 'Активная поездка', text: 'Следующий шаг по поездке'),
        const SizedBox(height: 16),
        if (_activeOrder == null)
          const EmptyState(
              title: 'Активной поездки нет',
              text: 'Примите заказ, и поездка появится здесь.',
              icon: Icons.route_outlined)
        else ...[
          _TripMap(
              order: _activeOrder!, route: _driverRoute?.geometry ?? const []),
          const SizedBox(height: 12),
          _PremiumCard(
            child:
                Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              StatusPill(
                  label: _statusLabel(_activeOrder!.status),
                  tone: StatusTone.warning),
              const SizedBox(height: 16),
              _DriverStatusStepper(status: _activeOrder!.status),
              const SizedBox(height: 16),
              RouteFields(
                  pickupLabel: _activeOrder!.pickup,
                  dropoffLabel: _activeOrder!.dropoff,
                  onPickupTap: () {},
                  onDropoffTap: () {}),
              if (_activeOrder!.price != null) ...[
                const SizedBox(height: 14),
                Text('${_activeOrder!.price!.round()} ₸',
                    style: const TextStyle(
                        fontSize: 26, fontWeight: FontWeight.w900)),
              ],
              if (_routeMeta(_activeOrder!) != null) ...[
                const SizedBox(height: 8),
                Text(_routeMeta(_activeOrder!)!,
                    style:
                        const TextStyle(color: SmartTaxiColors.textSecondary)),
              ],
              const SizedBox(height: 16),
              if (action != null)
                ElevatedButton(
                    onPressed: _loading ? null : () => _tripAction(action.$2),
                    child: _loading
                        ? const _ButtonSpinner(text: 'Сохраняем...')
                        : Text(action.$1)),
              if (_activeOrder!.status == 'DRIVER_ASSIGNED' ||
                  _activeOrder!.status == 'DRIVER_ARRIVED') ...[
                const SizedBox(height: 10),
                OutlinedButton(
                    onPressed: _loading
                        ? null
                        : () => _tripAction(widget.api.cancelDriverOrder),
                    child: const Text('Отменить')),
              ],
            ]),
          ),
        ],
        if (_error != null) ...[
          const SizedBox(height: 12),
          _InlineMessage(text: _error!, danger: true)
        ],
      ],
    );
  }

  String? _disabledReason() {
    final region = _selectedRegion;
    if (_regions.isEmpty) return 'Нет одобренных регионов';
    if (_regionId == null) return 'Выберите рабочий регион';
    if (region?.isActive == false) return 'Регион временно отключён';
    if (region?.status == 'BLOCKED') {
      return 'Работа в этом регионе заблокирована';
    }
    if (region?.status != 'APPROVED') return 'Вы не одобрены для этого региона';
    return null;
  }

  (String, Future<OrderSummary> Function(String id))? _nextAction() {
    final status = _activeOrder?.status;
    if (status == 'DRIVER_ASSIGNED') return ('Прибыл', widget.api.arrived);
    if (status == 'DRIVER_ARRIVED') {
      return ('Начать поездку', widget.api.startTrip);
    }
    if (status == 'IN_PROGRESS') {
      return ('Завершить поездку', widget.api.completeTrip);
    }
    return null;
  }

  String _driverStatusLabel() {
    if (_activeOrder != null) return 'Занят';
    return _online ? 'На линии' : 'Не на линии';
  }

  StatusTone _driverStatusTone() {
    if (_activeOrder != null) return StatusTone.warning;
    return _online ? StatusTone.success : StatusTone.neutral;
  }
}

class _FloatingNav extends StatelessWidget {
  const _FloatingNav({required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    final bottom = MediaQuery.paddingOf(context).bottom;
    return Padding(
      padding: EdgeInsets.fromLTRB(14, 6, 14, 10 + bottom * 0.35),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(26),
        child: DecoratedBox(
          decoration: BoxDecoration(
            color: Colors.white.withValues(alpha: 0.96),
            border: Border.all(color: SmartTaxiColors.border),
            borderRadius: BorderRadius.circular(26),
            boxShadow: const [
              BoxShadow(
                  color: Color(0x16785a14),
                  blurRadius: 28,
                  offset: Offset(0, 12))
            ],
          ),
          child: child,
        ),
      ),
    );
  }
}

class _SectionLabel extends StatelessWidget {
  const _SectionLabel({required this.title, required this.text});

  final String title;
  final String text;

  @override
  Widget build(BuildContext context) {
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Text(title,
          style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w900)),
      const SizedBox(height: 3),
      Text(text,
          style: const TextStyle(
              color: SmartTaxiColors.textSecondary,
              fontSize: 12,
              fontWeight: FontWeight.w700)),
    ]);
  }
}

class _LineGlyph extends StatelessWidget {
  const _LineGlyph({required this.online, required this.busy});

  final bool online;
  final bool busy;

  @override
  Widget build(BuildContext context) {
    final color = busy
        ? SmartTaxiColors.warning
        : online
            ? SmartTaxiColors.success
            : SmartTaxiColors.textMuted;
    return AnimatedContainer(
      duration: const Duration(milliseconds: 220),
      width: 58,
      height: 58,
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.1),
        border: Border.all(color: color.withValues(alpha: 0.28)),
        borderRadius: BorderRadius.circular(22),
      ),
      child: Icon(
          busy
              ? Icons.local_taxi_rounded
              : online
                  ? Icons.radio_button_checked_rounded
                  : Icons.power_settings_new_rounded,
          color: color),
    );
  }
}

class _LoadingStrip extends StatelessWidget {
  const _LoadingStrip({required this.text});

  final String text;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: SmartTaxiColors.goldSurface,
        border: Border.all(color: SmartTaxiColors.border),
        borderRadius: BorderRadius.circular(18),
      ),
      child: Row(
        children: [
          const SizedBox(
            width: 18,
            height: 18,
            child: CircularProgressIndicator(
                strokeWidth: 2.2, color: SmartTaxiColors.goldDeep),
          ),
          const SizedBox(width: 12),
          Text(text,
              style: const TextStyle(
                  color: SmartTaxiColors.textSecondary,
                  fontWeight: FontWeight.w700)),
        ],
      ),
    );
  }
}

class _ButtonSpinner extends StatelessWidget {
  const _ButtonSpinner({required this.text});

  final String text;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        const SizedBox(
          width: 18,
          height: 18,
          child: CircularProgressIndicator(
              strokeWidth: 2.2, color: SmartTaxiColors.text),
        ),
        const SizedBox(width: 10),
        Text(text),
      ],
    );
  }
}

class _DriverStatusStepper extends StatelessWidget {
  const _DriverStatusStepper({required this.status});

  final String status;

  @override
  Widget build(BuildContext context) {
    const steps = [
      'DRIVER_ASSIGNED',
      'DRIVER_ARRIVED',
      'IN_PROGRESS',
      'COMPLETED'
    ];
    const labels = ['Принят', 'Прибыл', 'В пути', 'Завершён'];
    final index = steps.indexOf(status).clamp(0, steps.length - 1);
    return Row(
      children: List.generate(steps.length, (stepIndex) {
        final done = stepIndex <= index;
        return Expanded(
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 180),
            margin:
                EdgeInsets.only(right: stepIndex == steps.length - 1 ? 0 : 6),
            padding: const EdgeInsets.symmetric(vertical: 10),
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: done ? SmartTaxiColors.goldPale : Colors.white,
              border: Border.all(
                  color: done
                      ? SmartTaxiColors.borderStrong
                      : SmartTaxiColors.border),
              borderRadius: BorderRadius.circular(14),
            ),
            child: Text(labels[stepIndex],
                style:
                    const TextStyle(fontSize: 11, fontWeight: FontWeight.w900)),
          ),
        );
      }),
    );
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
      borderRadius: BorderRadius.circular(28),
      child: SizedBox(
        height: 246,
        child: Stack(
          children: [
            FlutterMap(
              options: MapOptions(initialCenter: center, initialZoom: 14),
              children: [
                TileLayer(
                    urlTemplate: AppConfig.osmTileUrl,
                    userAgentPackageName: 'com.smarttaxi.app'),
                if (route.isNotEmpty)
                  PolylineLayer(polylines: [
                    Polyline(
                        points: route,
                        color: SmartTaxiColors.goldDeep,
                        strokeWidth: 5)
                  ]),
                MarkerLayer(markers: [
                  if (pickup != null)
                    _letterMarker(
                        pickup, 'A', SmartTaxiColors.text, Colors.white),
                  if (dropoff != null)
                    _letterMarker(dropoff, 'B', SmartTaxiColors.gold,
                        SmartTaxiColors.text),
                ]),
              ],
            ),
            const Positioned.fill(
              child: IgnorePointer(
                child: DecoratedBox(
                  decoration: BoxDecoration(
                    gradient: LinearGradient(
                      begin: Alignment.topCenter,
                      end: Alignment.bottomCenter,
                      colors: [
                        Color(0x00fffcf6),
                        Color(0x1afff8e6),
                        Color(0xcafffcf6),
                      ],
                    ),
                  ),
                ),
              ),
            ),
            const Positioned(
              left: 12,
              bottom: 12,
              child: DecoratedBox(
                decoration: BoxDecoration(
                    color: Color(0xebffffff),
                    borderRadius: BorderRadius.all(Radius.circular(12))),
                child: Padding(
                  padding: EdgeInsets.symmetric(horizontal: 8, vertical: 5),
                  child: Text(AppConfig.mapAttribution,
                      style: TextStyle(
                          fontSize: 11, color: SmartTaxiColors.textSecondary)),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Marker _letterMarker(
      LatLng point, String label, Color background, Color foreground) {
    return Marker(
      point: point,
      width: 42,
      height: 42,
      child: Container(
        alignment: Alignment.center,
        decoration: BoxDecoration(
            color: background,
            shape: BoxShape.circle,
            boxShadow: const [
              BoxShadow(color: Color(0x24000000), blurRadius: 14)
            ]),
        child: Text(label,
            style: TextStyle(color: foreground, fontWeight: FontWeight.w900)),
      ),
    );
  }
}

class _OrderCard extends StatelessWidget {
  const _OrderCard(
      {required this.order, required this.loading, required this.onAccept});

  final OrderSummary order;
  final bool loading;
  final VoidCallback onAccept;

  @override
  Widget build(BuildContext context) {
    return TweenAnimationBuilder<double>(
      tween: Tween(begin: 0.98, end: 1),
      duration: const Duration(milliseconds: 180),
      curve: Curves.easeOutCubic,
      builder: (context, value, child) =>
          Transform.scale(scale: value, child: child),
      child: _PremiumCard(
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(
            children: [
              const Expanded(
                  child: _SectionLabel(
                      title: 'Новый заказ', text: 'В вашем рабочем регионе')),
              StatusPill(
                  label: _statusLabel(order.status), tone: StatusTone.neutral),
            ],
          ),
          const SizedBox(height: 14),
          RouteFields(
              pickupLabel: order.pickup,
              dropoffLabel: order.dropoff,
              onPickupTap: () {},
              onDropoffTap: () {}),
          if (order.price != null) ...[
            const SizedBox(height: 14),
            Text('${order.price!.round()} ₸',
                style:
                    const TextStyle(fontSize: 28, fontWeight: FontWeight.w900)),
          ],
          if (_routeMeta(order) != null) ...[
            const SizedBox(height: 8),
            Text(_routeMeta(order)!,
                style: const TextStyle(color: SmartTaxiColors.textSecondary)),
          ],
          const SizedBox(height: 14),
          ElevatedButton(
              onPressed: loading ? null : onAccept,
              child: loading
                  ? const _ButtonSpinner(text: 'Принимаем...')
                  : const Text('Принять')),
        ]),
      ),
    );
  }
}

class _DriverHeader extends StatelessWidget {
  const _DriverHeader(
      {required this.onMenu, required this.status, required this.tone});

  final VoidCallback onMenu;
  final String status;
  final StatusTone tone;

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 62,
      margin: const EdgeInsets.fromLTRB(12, 8, 12, 4),
      padding: const EdgeInsets.symmetric(horizontal: 8),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.96),
        border: Border.all(color: SmartTaxiColors.border),
        borderRadius: BorderRadius.circular(24),
        boxShadow: const [
          BoxShadow(
              color: Color(0x10785a14), blurRadius: 22, offset: Offset(0, 10))
        ],
      ),
      child: Row(
        children: [
          IconButton(
              onPressed: onMenu,
              icon: const Icon(Icons.menu_rounded),
              tooltip: 'Меню'),
          const SizedBox(width: 4),
          const BrandLogo(),
          const Spacer(),
          StatusPill(label: status, tone: tone),
        ],
      ),
    );
  }
}

class _DriverDrawer extends StatelessWidget {
  const _DriverDrawer({
    required this.accountLabel,
    required this.activeTab,
    required this.onTab,
    required this.onPassenger,
    required this.onLogout,
  });

  final String accountLabel;
  final int activeTab;
  final ValueChanged<int> onTab;
  final VoidCallback onPassenger;
  final VoidCallback onLogout;

  @override
  Widget build(BuildContext context) {
    return Drawer(
      width: MediaQuery.sizeOf(context).width * 0.84,
      shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.horizontal(right: Radius.circular(28))),
      child: SafeArea(
        child: Column(
          children: [
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(20),
              color: SmartTaxiColors.goldSurface,
              child: Row(
                children: [
                  const BrandLogo(),
                  const SizedBox(width: 12),
                  Expanded(
                      child: Text(
                          accountLabel.isEmpty
                              ? 'Водитель SmartTaxi'
                              : accountLabel,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(fontWeight: FontWeight.w900))),
                ],
              ),
            ),
            const SizedBox(height: 10),
            _DrawerItem(
                label: 'Линия', active: activeTab == 0, onTap: () => onTab(0)),
            _DrawerItem(
                label: 'Заказы', active: activeTab == 1, onTap: () => onTab(1)),
            _DrawerItem(
                label: 'Поездка',
                active: activeTab == 2,
                onTap: () => onTab(2)),
            _DrawerItem(
                label: 'Режим пассажира', active: false, onTap: onPassenger),
            const Spacer(),
            _DrawerItem(
                label: 'Выйти', active: false, danger: true, onTap: onLogout),
            const SizedBox(height: 12),
          ],
        ),
      ),
    );
  }
}

class _DrawerItem extends StatelessWidget {
  const _DrawerItem(
      {required this.label,
      required this.active,
      required this.onTap,
      this.danger = false});

  final String label;
  final bool active;
  final bool danger;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 3),
      child: ListTile(
        minTileHeight: 52,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        selected: active,
        selectedTileColor: SmartTaxiColors.goldSurface,
        textColor: danger ? SmartTaxiColors.danger : SmartTaxiColors.text,
        title: Text(label, style: const TextStyle(fontWeight: FontWeight.w800)),
        onTap: onTap,
      ),
    );
  }
}

class _PremiumCard extends StatelessWidget {
  const _PremiumCard({required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: Colors.white,
        border: Border.all(color: SmartTaxiColors.border),
        borderRadius: BorderRadius.circular(30),
        boxShadow: const [
          BoxShadow(
              color: Color(0x18785a14), blurRadius: 42, offset: Offset(0, 18))
        ],
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
      Text(title,
          style: const TextStyle(
              fontSize: 27, height: 1.12, fontWeight: FontWeight.w900)),
      const SizedBox(height: 6),
      Text(text,
          style: const TextStyle(
              color: SmartTaxiColors.textSecondary,
              fontSize: 14,
              height: 1.35)),
    ]);
  }
}

class _InlineMessage extends StatelessWidget {
  const _InlineMessage({required this.text, this.danger = false});

  final String text;
  final bool danger;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: danger ? const Color(0xfffff1f1) : SmartTaxiColors.goldSurface,
        border: Border.all(
            color: danger ? const Color(0xfffecaca) : SmartTaxiColors.border),
        borderRadius: BorderRadius.circular(16),
      ),
      child: Text(text,
          style: TextStyle(
              color: danger
                  ? SmartTaxiColors.danger
                  : SmartTaxiColors.textSecondary,
              fontWeight: FontWeight.w700)),
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
  if (order.distanceKm != null) {
    parts.add('${order.distanceKm!.toStringAsFixed(1)} км');
  }
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
    'DRIVER_BLOCKED': 'Водитель заблокирован',
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
