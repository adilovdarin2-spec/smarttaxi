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
  const PassengerShell({
    super.key,
    required this.api,
    required this.authStore,
    required this.sockets,
    required this.accountLabel,
    required this.accountPhone,
    required this.onLogout,
    required this.onOpenDriverMode,
  });

  final ApiClient api;
  final AuthStore authStore;
  final SocketService sockets;
  final String accountLabel;
  final String accountPhone;
  final Future<void> Function() onLogout;
  final Future<bool> Function() onOpenDriverMode;

  @override
  State<PassengerShell> createState() => _PassengerShellState();
}

class _PassengerShellState extends State<PassengerShell> {
  final _scaffoldKey = GlobalKey<ScaffoldState>();
  PassengerTab _tab = PassengerTab.home;
  PointTarget _target = PointTarget.pickup;
  bool _loading = false;
  bool _previewLoading = false;
  bool _locationLoading = false;
  String? _error;
  List<TariffOption> _tariffs = const [];
  String? _tariffId;
  Coordinate? _pickup;
  Coordinate? _dropoff;
  String _pickupLabel = 'Выберите точку посадки';
  String _dropoffLabel = 'Введите точку назначения';
  PointSource _pickupSource = PointSource.none;
  PointSource _dropoffSource = PointSource.none;
  RoutePreview? _preview;
  RoutePreview? _driverPickupRoute;
  String? _driverRouteError;
  OrderSummary? _order;
  DriverLocation? _driverLocation;
  LatLng? _mapCenter;
  String _driverFullName = '';
  String _driverPhone = '';
  String _driverCarModel = '';
  String _driverCarColor = '';
  String _driverPlate = '';
  String _driverYear = '';
  String _driverComment = '';
  String? _driverApplicationMessage;

  @override
  void initState() {
    super.initState();
    _bootstrap();
  }

  @override
  void dispose() {
    widget.sockets.clearListeners();
    super.dispose();
  }

  Future<void> _bootstrap() async {
    await widget.sockets.connect();
    widget.sockets.onOrderUpdate(_handleOrderUpdate);
    widget.sockets.onDriverLocation(_handleDriverLocation);
    await _loadRegions();
  }

  Future<void> _loadRegions() async {
    try {
      final regions = await widget.api.getActiveRegions();
      setState(() {
        _mapCenter = regions.isEmpty
            ? const LatLng(42.316, 69.596)
            : (regions.first.center?.toLatLng() ??
                const LatLng(42.316, 69.596));
      });
    } catch (_) {
      setState(() => _mapCenter = const LatLng(42.316, 69.596));
    }
  }

  void _handleOrderUpdate(dynamic data) {
    if (data is! Map) return;
    final order = OrderSummary.fromJson(
      Map<String, dynamic>.from(data['order'] ?? data),
    );
    if (_order?.id != order.id) return;
    setState(() {
      _order = order;
      if (order.driverId == null) {
        _driverLocation = null;
        _driverPickupRoute = null;
        _driverRouteError = null;
      }
    });
    if (order.driverId != null && _driverLocation != null) {
      _loadDriverRoute(order.id);
    }
  }

  void _handleDriverLocation(dynamic data) {
    if (_order?.driverId == null || data is! Map) return;
    final payload = Map<String, dynamic>.from(data);
    final orderId = payload['orderId']?.toString();
    if (orderId != null && orderId.isNotEmpty && orderId != _order!.id) {
      return;
    }
    setState(
      () => _driverLocation = DriverLocation.fromJson(
        payload,
      ),
    );
    _loadDriverRoute(_order!.id);
  }

  Future<void> _usePhoneLocation() async {
    setState(() {
      _error = null;
      _locationLoading = true;
    });
    try {
      final permission = await Geolocator.requestPermission();
      if (permission == LocationPermission.denied ||
          permission == LocationPermission.deniedForever) {
        setState(
          () => _error =
              'Разрешите геолокацию или выберите точку посадки вручную.',
        );
        return;
      }
      final position = await Geolocator.getCurrentPosition();
      final point = Coordinate(lat: position.latitude, lng: position.longitude);
      setState(() {
        _pickup = point;
        _pickupLabel = 'Текущее местоположение';
        _pickupSource = PointSource.gps;
        _target = PointTarget.dropoff;
        _mapCenter = point.toLatLng();
      });
      await _refreshPreview();
    } catch (_) {
      setState(() => _error = 'Не удалось получить геолокацию');
    } finally {
      if (mounted) setState(() => _locationLoading = false);
    }
  }

  Future<void> _selectPoint({required PointTarget target}) async {
    setState(() => _target = target);
    final selected = await showModalBottomSheet<_PointResult>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
      ),
      builder: (context) => _CoordinateSheet(
        title: target == PointTarget.pickup ? 'Откуда' : 'Куда',
      ),
    );
    if (selected == null) return;
    await _applyPoint(
      target,
      selected.coordinate,
      selected.label,
      PointSource.manual,
    );
  }

  Future<void> _applyMapTap(LatLng point) async {
    final target = _target;
    const label = 'Точка на карте';
    await _applyPoint(
      target,
      Coordinate(lat: point.latitude, lng: point.longitude),
      label,
      PointSource.map,
    );
    if (target == PointTarget.pickup) {
      setState(() => _target = PointTarget.dropoff);
    }
  }

  Future<void> _applyPoint(
    PointTarget target,
    Coordinate coordinate,
    String label,
    PointSource source,
  ) async {
    setState(() {
      if (target == PointTarget.pickup) {
        _pickup = coordinate;
        _pickupLabel = label;
        _pickupSource = source;
      } else {
        _dropoff = coordinate;
        _dropoffLabel = label;
        _dropoffSource = source;
      }
      _mapCenter = coordinate.toLatLng();
      _preview = null;
      _driverPickupRoute = null;
      _driverRouteError = null;
    });
    await _refreshPreview();
  }

  Future<void> _refreshPreview() async {
    if (_pickup == null || _dropoff == null) return;
    setState(() {
      _previewLoading = true;
      _error = null;
      _preview = null;
    });
    try {
      var preview = await widget.api.previewRoute(
        pickup: _pickup!,
        dropoff: _dropoff!,
        tariffId: _tariffId,
      );
      var tariffs = _tariffs;
      if (tariffs.isEmpty || preview.regionId != _preview?.regionId) {
        tariffs = await widget.api.getTariffs(preview.regionId);
      }
      var selectedTariffId = _tariffId;
      if (selectedTariffId == null && tariffs.isNotEmpty) {
        selectedTariffId = tariffs.first.id;
        preview = await widget.api.previewRoute(
          pickup: _pickup!,
          dropoff: _dropoff!,
          tariffId: selectedTariffId,
        );
      }
      setState(() {
        _preview = preview;
        _tariffs = tariffs;
        _tariffId = selectedTariffId;
      });
    } catch (error) {
      setState(() => _error = _readableError(error));
    } finally {
      if (mounted) setState(() => _previewLoading = false);
    }
  }

  Future<void> _createOrder() async {
    if (widget.accountPhone.trim().isEmpty) {
      setState(() => _error = 'Для заказа войдите по номеру телефона.');
      return;
    }
    if (_pickup == null || _dropoff == null) {
      setState(() => _error = 'Укажите маршрут');
      return;
    }
    if (_tariffId == null) {
      setState(() => _error = 'Выберите тариф');
      return;
    }
    if (_preview == null || _preview!.estimatedPrice == null) {
      await _refreshPreview();
      return;
    }
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final order = await widget.api.createOrder(
        pickup: _pickup!,
        dropoff: _dropoff!,
        pickupText: _pickupLabel,
        dropoffText: _dropoffLabel,
        riderPhone: widget.accountPhone,
        tariffId: _tariffId!,
        distanceKm: _preview!.distanceMeters / 1000,
        durationMin: _preview!.durationSeconds / 60,
      );
      widget.sockets.joinOrder(order.id);
      setState(() {
        _order = order;
        _tab = PassengerTab.trips;
      });
    } catch (error) {
      setState(() => _error = _readableError(error));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _cancelOrder() async {
    if (_order == null) return;
    setState(() => _loading = true);
    try {
      await widget.api.cancelPublicOrder(
        _order!.id,
        riderPhone: widget.accountPhone,
      );
      setState(() {
        _order = null;
        _driverLocation = null;
        _driverPickupRoute = null;
        _driverRouteError = null;
      });
    } catch (error) {
      setState(() => _error = _readableError(error));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _loadDriverRoute(String orderId) async {
    if (_driverLocation == null) {
      setState(() {
        _driverPickupRoute = null;
        _driverRouteError = null;
      });
      return;
    }
    try {
      final route = await widget.api.driverToPickupRoute(orderId);
      if (mounted) {
        setState(() {
          _driverPickupRoute = route;
          _driverRouteError = null;
        });
      }
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _driverPickupRoute = null;
        _driverRouteError = _readableDriverRouteError(error);
      });
    }
  }

  Future<void> _openDriverEntry() async {
    final opened = await widget.onOpenDriverMode();
    if (!opened && mounted) {
      _driverPhone = widget.accountPhone;
      setState(() => _tab = PassengerTab.driverApplication);
    }
  }

  Future<void> _submitDriverApplication() async {
    setState(() {
      _loading = true;
      _error = null;
      _driverApplicationMessage = null;
    });
    try {
      if (_driverFullName.trim().length < 2) {
        throw const FormatException('DRIVER_NAME_REQUIRED');
      }
      if ((_driverPhone.isEmpty ? widget.accountPhone : _driverPhone)
              .trim()
              .length <
          6) {
        throw const FormatException('DRIVER_PHONE_REQUIRED');
      }
      if (_driverCarModel.trim().length < 2) {
        throw const FormatException('DRIVER_CAR_REQUIRED');
      }
      if (_driverPlate.trim().length < 2) {
        throw const FormatException('DRIVER_PLATE_REQUIRED');
      }
      await widget.api.submitDriverApplication(
        fullName: _driverFullName.trim(),
        phone:
            (_driverPhone.isEmpty ? widget.accountPhone : _driverPhone).trim(),
        carModel: _driverCarModel.trim(),
        carColor: _driverCarColor.trim(),
        plateNumber: _driverPlate.trim(),
        year: int.tryParse(_driverYear.trim()),
        comment: _driverComment.trim(),
      );
      setState(
        () => _driverApplicationMessage =
            'Заявка отправлена. Администратор проверит данные.',
      );
    } catch (error) {
      setState(() => _error = _readableError(error));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  void _openDrawer() => _scaffoldKey.currentState?.openDrawer();

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      key: _scaffoldKey,
      backgroundColor: SmartTaxiColors.appBackground,
      drawerScrimColor: Colors.black.withValues(alpha: 0.26),
      drawer: _SmartDrawer(
        accountLabel: widget.accountLabel,
        accountPhone: widget.accountPhone,
        active: _tab,
        driverLabel: 'Стать водителем',
        onSelect: (tab) {
          Navigator.pop(context);
          setState(() => _tab = tab);
        },
        onDriver: () {
          Navigator.pop(context);
          _openDriverEntry();
        },
        onLogout: () {
          Navigator.pop(context);
          widget.onLogout();
        },
      ),
      body: SafeArea(
        child: Column(
          children: [
            if (_tab != PassengerTab.home)
              _AppHeader(
                onMenu: _openDrawer,
                trailing: _HeaderProfileButton(
                  onTap: () => setState(() => _tab = PassengerTab.profile),
                ),
              ),
            Expanded(
              child: IndexedStack(
                index: _tab.index,
                children: [
                  _homeScreen(),
                  _tripsScreen(),
                  _profileScreen(),
                  _driverApplicationScreen(),
                  _simpleInfoScreen(
                    'Поддержка',
                    'Напишите в поддержку SmartTaxi, если нужна помощь с поездкой.',
                  ),
                ],
              ),
            ),
            _FloatingNav(
              child: NavigationBar(
                selectedIndex: _tab.index > 2 ? 2 : _tab.index,
                onDestinationSelected: (index) =>
                    setState(() => _tab = PassengerTab.values[index]),
                destinations: const [
                  NavigationDestination(
                    icon: Icon(Icons.map_outlined),
                    selectedIcon: Icon(Icons.map),
                    label: 'Главная',
                  ),
                  NavigationDestination(
                    icon: Icon(Icons.receipt_long_outlined),
                    selectedIcon: Icon(Icons.receipt_long),
                    label: 'Поездки',
                  ),
                  NavigationDestination(
                    icon: Icon(Icons.person_outline),
                    selectedIcon: Icon(Icons.person),
                    label: 'Профиль',
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _homeScreen() {
    final mapHeight = MediaQuery.sizeOf(context).height * 0.43;
    final geolocationNotice = _geolocationNotice;
    final mapRoute = _order?.driverId != null
        ? (_driverPickupRoute?.geometry ?? const <LatLng>[])
        : (_preview?.geometry ?? const <LatLng>[]);
    final mapRouteError = _order?.driverId != null
        ? _driverRouteError
        : (_routePreviewError ? _error : null);
    return ListView(
      padding: EdgeInsets.zero,
      children: [
        SizedBox(
          height: mapHeight.clamp(305.0, 410.0).toDouble(),
          child: _MapCanvas(
            center: _mapCenter ?? const LatLng(42.316, 69.596),
            pickup: _pickup,
            dropoff: _dropoff,
            driver: _order?.driverId == null ? null : _driverLocation,
            route: mapRoute,
            target: _target,
            permissionNotice: geolocationNotice,
            routeLoading: _previewLoading,
            routeError: mapRouteError,
            onTap: _applyMapTap,
            onUseLocation: _usePhoneLocation,
            onReset: _resetRoute,
            onMenu: _openDrawer,
            onProfile: () => setState(() => _tab = PassengerTab.profile),
          ),
        ),
        Transform.translate(
          offset: const Offset(0, -30),
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
            child: _OrderSheet(
              pickupLabel: _pickupLabel,
              dropoffLabel: _dropoffLabel,
              pickupActive: _target == PointTarget.pickup,
              dropoffActive: _target == PointTarget.dropoff,
              pickupSource: _pickupSource,
              dropoffSource: _dropoffSource,
              onPickupTap: () => _selectPoint(target: PointTarget.pickup),
              onDropoffTap: () => _selectPoint(target: PointTarget.dropoff),
              onUseLocation: _usePhoneLocation,
              locationLoading: _locationLoading,
              tariffs: _tariffs,
              selectedTariffId: _tariffId,
              preview: _preview,
              loading: _loading,
              previewLoading: _previewLoading,
              error: _error,
              onTariff: (id) async {
                setState(() => _tariffId = id);
                await _refreshPreview();
              },
              onCreate: _createOrder,
              cta: _ctaText(),
            ),
          ),
        ),
        const SizedBox(height: 2),
      ],
    );
  }

  String? get _geolocationNotice {
    final error = _error;
    if (error == null) return null;
    if (!error.toLowerCase().contains('геолокац')) return null;
    return 'Разрешите геолокацию или выберите точку посадки вручную.';
  }

  bool get _routePreviewError {
    final error = _error;
    if (error == null) return false;
    return error.toLowerCase().contains('маршрут') ||
        error.contains('В этом месте сервис пока недоступен') ||
        error.contains('Точка назначения вне активного региона') ||
        error.contains('Межгород пока не поддерживается');
  }

  void _resetRoute() {
    setState(() {
      _pickup = null;
      _dropoff = null;
      _pickupLabel = 'Выберите точку посадки';
      _dropoffLabel = 'Введите точку назначения';
      _pickupSource = PointSource.none;
      _dropoffSource = PointSource.none;
      _preview = null;
      _driverPickupRoute = null;
      _driverRouteError = null;
      _tariffId = null;
      _target = PointTarget.pickup;
      _error = null;
    });
  }

  String _ctaText() {
    if (_loading) return 'Создаём заказ...';
    if (_pickup == null || _dropoff == null) return 'Укажите маршрут';
    if (_tariffId == null) return 'Выберите тариф';
    if (_preview == null || _preview!.estimatedPrice == null) {
      return 'Рассчитать';
    }
    return 'Заказать';
  }

  Widget _tripsScreen() {
    if (_order == null) {
      return const Padding(
        padding: EdgeInsets.all(20),
        child: EmptyState(
          icon: Icons.route_rounded,
          title: 'Активной поездки нет',
          text: 'Создайте заказ, и его статус появится здесь.',
        ),
      );
    }
    final driverText = _order!.driverId == null
        ? 'Ищем водителя'
        : _driverLocation == null
            ? 'Ожидаем геолокацию водителя'
            : 'Водитель на связи';
    final driverRouteText = _driverPickupRoute == null
        ? null
        : _driverPickupMeta(_driverPickupRoute!);
    final orderShortId =
        _order!.id.length > 8 ? _order!.id.substring(0, 8) : _order!.id;
    return ListView(
      padding: const EdgeInsets.all(20),
      children: [
        const _TitleBlock(
          title: 'Текущая поездка',
          text: 'Статус обновляется автоматически',
        ),
        const SizedBox(height: 16),
        _PremiumCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(
                    child: Text(
                      'Поездка $orderShortId',
                      style: const TextStyle(
                        fontSize: 18,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                  ),
                  StatusPill(
                    label: _statusLabel(_order!.status),
                    tone: _statusTone(_order!.status),
                  ),
                ],
              ),
              const SizedBox(height: 16),
              _StatusStepper(status: _order!.status),
              const SizedBox(height: 18),
              RouteFields(
                pickupLabel: _order!.pickup,
                dropoffLabel: _order!.dropoff,
                onPickupTap: () {},
                onDropoffTap: () {},
              ),
              const SizedBox(height: 14),
              _CompactNotice(
                icon: _order!.driverId == null
                    ? Icons.person_search_rounded
                    : Icons.verified_user_outlined,
                title: driverText,
                text: _order!.driverId == null
                    ? 'Данные водителя появятся после принятия заказа.'
                    : _driverLocation == null
                        ? 'Покажем местоположение, когда водитель передаст геолокацию.'
                        : driverRouteText ??
                            _driverRouteError ??
                            'Местоположение получено из реального обновления водителя.',
              ),
              if (_order!.price != null) ...[
                const SizedBox(height: 14),
                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.all(14),
                  decoration: BoxDecoration(
                    color: SmartTaxiColors.goldSurface,
                    border: Border.all(color: SmartTaxiColors.border),
                    borderRadius: BorderRadius.circular(20),
                  ),
                  child: Text(
                    '${_order!.price!.round()} ₸',
                    style: const TextStyle(
                      fontSize: 30,
                      fontWeight: FontWeight.w900,
                    ),
                  ),
                ),
              ],
              const SizedBox(height: 16),
              OutlinedButton(
                onPressed: _loading ? null : _cancelOrder,
                style: OutlinedButton.styleFrom(
                  foregroundColor: SmartTaxiColors.danger,
                  side: const BorderSide(color: Color(0xfffecaca)),
                  backgroundColor: const Color(0xfffff1f1),
                ),
                child: const Text('Отменить поездку'),
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _profileScreen() {
    return ListView(
      padding: const EdgeInsets.all(20),
      children: [
        _PremiumCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  const BrandLogo(),
                  const SizedBox(width: 14),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text(
                          'SmartTaxi',
                          style: TextStyle(
                            fontSize: 22,
                            fontWeight: FontWeight.w900,
                          ),
                        ),
                        Text(
                          widget.accountLabel.isEmpty
                              ? 'Ваш аккаунт'
                              : widget.accountLabel,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            color: SmartTaxiColors.textSecondary,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 16),
              _ProfileRow(
                label: 'Аккаунт',
                value: widget.accountLabel.isEmpty
                    ? 'Пользователь'
                    : widget.accountLabel,
              ),
              if (widget.accountPhone.trim().isNotEmpty) ...[
                const SizedBox(height: 12),
                _ProfileRow(label: 'Телефон', value: widget.accountPhone),
              ],
              const SizedBox(height: 12),
              ElevatedButton(
                onPressed: _openDriverEntry,
                child: const Text('Стать водителем'),
              ),
              const SizedBox(height: 10),
              OutlinedButton(
                onPressed: widget.onLogout,
                child: const Text('Выйти'),
              ),
            ],
          ),
        ),
        const SizedBox(height: 14),
        _PremiumCard(
          child: Column(
            children: [
              _MenuLine(
                title: 'Поддержка',
                onTap: () => setState(() => _tab = PassengerTab.support),
              ),
              _MenuLine(
                title: 'Настройки',
                onTap: () => setState(() => _tab = PassengerTab.support),
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _driverApplicationScreen() {
    return ListView(
      padding: const EdgeInsets.all(20),
      children: [
        const _TitleBlock(
          title: 'Стать водителем',
          text: 'После заявки администратор одобрит вас для работы в регионе.',
        ),
        const SizedBox(height: 16),
        _PremiumCard(
          child: Column(
            children: [
              _ApplicationField(
                label: 'Имя и фамилия',
                onChanged: (value) => _driverFullName = value,
              ),
              const SizedBox(height: 12),
              _ApplicationField(
                label: 'Телефон',
                initialValue:
                    _driverPhone.isEmpty ? widget.accountPhone : _driverPhone,
                onChanged: (value) => _driverPhone = value,
              ),
              const SizedBox(height: 12),
              _ApplicationField(
                label: 'Марка и модель авто',
                onChanged: (value) => _driverCarModel = value,
              ),
              const SizedBox(height: 12),
              _ApplicationField(
                label: 'Цвет авто',
                onChanged: (value) => _driverCarColor = value,
              ),
              const SizedBox(height: 12),
              _ApplicationField(
                label: 'Госномер',
                onChanged: (value) => _driverPlate = value,
              ),
              const SizedBox(height: 12),
              _ApplicationField(
                label: 'Год выпуска',
                keyboardType: TextInputType.number,
                onChanged: (value) => _driverYear = value,
              ),
              const SizedBox(height: 12),
              _ApplicationField(
                label: 'Комментарий',
                onChanged: (value) => _driverComment = value,
              ),
              if (_driverApplicationMessage != null) ...[
                const SizedBox(height: 14),
                _InlineMessage(text: _driverApplicationMessage!),
              ],
              if (_error != null) ...[
                const SizedBox(height: 14),
                _InlineMessage(text: _error!, danger: true),
              ],
              const SizedBox(height: 14),
              ElevatedButton(
                onPressed: _loading ? null : _submitDriverApplication,
                child: Text(_loading ? 'Отправляем...' : 'Отправить заявку'),
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _simpleInfoScreen(String title, String text) {
    return ListView(
      padding: const EdgeInsets.all(20),
      children: [
        _PremiumCard(
          child: EmptyState(title: title, text: text),
        ),
      ],
    );
  }
}

class _MapCanvas extends StatelessWidget {
  const _MapCanvas({
    required this.center,
    required this.pickup,
    required this.dropoff,
    required this.driver,
    required this.route,
    required this.target,
    required this.permissionNotice,
    required this.routeLoading,
    required this.routeError,
    required this.onTap,
    required this.onUseLocation,
    required this.onReset,
    required this.onMenu,
    required this.onProfile,
  });

  final LatLng center;
  final Coordinate? pickup;
  final Coordinate? dropoff;
  final DriverLocation? driver;
  final List<LatLng> route;
  final PointTarget target;
  final String? permissionNotice;
  final bool routeLoading;
  final String? routeError;
  final ValueChanged<LatLng> onTap;
  final VoidCallback onUseLocation;
  final VoidCallback onReset;
  final VoidCallback onMenu;
  final VoidCallback onProfile;

  @override
  Widget build(BuildContext context) {
    final instruction = pickup == null
        ? 'Выберите точку посадки на карте'
        : dropoff == null
            ? 'Выберите точку назначения на карте'
            : route.isNotEmpty
                ? 'Маршрут построен по данным сервиса'
                : 'Маршрут выбран';
    final cameraPoints = _cameraPoints();
    final initialFit = cameraPoints.length > 1
        ? CameraFit.coordinates(
            coordinates: cameraPoints,
            padding: const EdgeInsets.fromLTRB(54, 120, 54, 92),
            maxZoom: 15.5,
          )
        : null;
    final mapKey = ValueKey(cameraPoints.map(_pointKey).join('|'));
    return ClipRRect(
      borderRadius: const BorderRadius.vertical(bottom: Radius.circular(30)),
      child: Stack(
        children: [
          FlutterMap(
            key: mapKey,
            options: MapOptions(
              initialCenter: center,
              initialZoom: pickup == null && dropoff == null ? 12 : 14,
              initialCameraFit: initialFit,
              onTap: (_, point) => onTap(point),
            ),
            children: [
              TileLayer(
                urlTemplate: AppConfig.osmTileUrl,
                userAgentPackageName: 'com.smarttaxi.app',
              ),
              if (route.isNotEmpty)
                PolylineLayer(
                  polylines: [
                    Polyline(
                      points: route,
                      color: SmartTaxiColors.goldDeep,
                      strokeWidth: 5,
                    ),
                  ],
                ),
              MarkerLayer(
                markers: [
                  if (pickup != null)
                    _marker(
                      pickup!.toLatLng(),
                      'A',
                      SmartTaxiColors.text,
                      Colors.white,
                    ),
                  if (dropoff != null)
                    _marker(
                      dropoff!.toLatLng(),
                      'B',
                      SmartTaxiColors.gold,
                      SmartTaxiColors.text,
                    ),
                  if (driver != null)
                    _marker(
                      driver!.toLatLng(),
                      'D',
                      SmartTaxiColors.success,
                      Colors.white,
                    ),
                ],
              ),
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
                      Color(0x14fff8e6),
                      Color(0x00fffcf6),
                      Color(0xd8fffcf6),
                    ],
                  ),
                ),
              ),
            ),
          ),
          Positioned(
            left: 14,
            top: 12,
            right: 14,
            child: _MapOverlayHeader(onMenu: onMenu, onProfile: onProfile),
          ),
          Positioned(
            left: 14,
            top: 84,
            right: 80,
            child: AnimatedSwitcher(
              duration: const Duration(milliseconds: 220),
              child: permissionNotice == null
                  ? _MapInstructionCard(
                      key: ValueKey(instruction),
                      title: instruction,
                      text: target == PointTarget.pickup
                          ? 'Нажмите на карту или заполните поле «Откуда».'
                          : 'Нажмите на карту или заполните поле «Куда».',
                      onHelp: () => ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(
                          content: Text(
                            'Карта ставит только выбранную точку A или B.',
                          ),
                        ),
                      ),
                    )
                  : _MapPermissionCard(
                      key: const ValueKey('permission-notice'),
                      text: permissionNotice!,
                      onUseLocation: onUseLocation,
                    ),
            ),
          ),
          Positioned(
            right: 14,
            top: 84,
            child: Column(
              children: [
                _MapRoundButton(
                  icon: Icons.my_location_rounded,
                  label: 'Разрешить геолокацию',
                  onTap: onUseLocation,
                ),
                const SizedBox(height: 10),
                _MapRoundButton(
                  icon: Icons.add_location_alt_outlined,
                  label: 'Выбрать точку на карте',
                  onTap: () => ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(
                      content: Text('Нажмите на карту, чтобы поставить точку'),
                    ),
                  ),
                ),
                const SizedBox(height: 10),
                _MapRoundButton(
                  icon: Icons.refresh_rounded,
                  label: 'Сбросить маршрут',
                  onTap: onReset,
                ),
              ],
            ),
          ),
          Positioned(
            left: 14,
            right: 80,
            bottom: 72,
            child: _MapRouteState(
              loading: routeLoading,
              routeReady: route.isNotEmpty,
              error: routeError,
            ),
          ),
          Positioned(
            left: 12,
            bottom: 36,
            child: DecoratedBox(
              decoration: BoxDecoration(
                color: Colors.white.withValues(alpha: 0.94),
                border: Border.all(color: SmartTaxiColors.border),
                borderRadius: BorderRadius.circular(12),
                boxShadow: const [
                  BoxShadow(
                    color: Color(0x12785a14),
                    blurRadius: 16,
                    offset: Offset(0, 8),
                  ),
                ],
              ),
              child: const Padding(
                padding: EdgeInsets.symmetric(horizontal: 9, vertical: 6),
                child: Text(
                  AppConfig.mapAttribution,
                  style: TextStyle(
                    fontSize: 11,
                    color: SmartTaxiColors.textSecondary,
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Marker _marker(
    LatLng point,
    String label,
    Color background,
    Color foreground,
  ) {
    return Marker(
      point: point,
      width: 46,
      height: 46,
      child: Container(
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: background,
          shape: BoxShape.circle,
          border: Border.all(color: Colors.white, width: 2),
          boxShadow: [
            BoxShadow(
              color: background.withValues(alpha: 0.32),
              blurRadius: 20,
              offset: const Offset(0, 10),
            ),
          ],
        ),
        child: Text(
          label,
          style: TextStyle(color: foreground, fontWeight: FontWeight.w900),
        ),
      ),
    );
  }

  List<LatLng> _cameraPoints() {
    if (route.isNotEmpty) {
      return [
        ...route,
        if (pickup != null) pickup!.toLatLng(),
        if (dropoff != null) dropoff!.toLatLng(),
        if (driver != null) driver!.toLatLng(),
      ];
    }
    return [
      if (pickup != null) pickup!.toLatLng(),
      if (dropoff != null) dropoff!.toLatLng(),
      if (driver != null) driver!.toLatLng(),
    ];
  }
}

String _pointKey(LatLng point) =>
    '${point.latitude.toStringAsFixed(5)},${point.longitude.toStringAsFixed(5)}';

class _MapRoundButton extends StatelessWidget {
  const _MapRoundButton({
    required this.icon,
    required this.label,
    required this.onTap,
  });

  final IconData icon;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Tooltip(
      message: label,
      child: Material(
        color: Colors.white.withValues(alpha: 0.96),
        shape: const CircleBorder(),
        elevation: 0,
        child: InkWell(
          customBorder: const CircleBorder(),
          onTap: onTap,
          child: Container(
            width: 46,
            height: 46,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              border: Border.all(color: SmartTaxiColors.border),
              boxShadow: const [
                BoxShadow(
                  color: Color(0x12785a14),
                  blurRadius: 18,
                  offset: Offset(0, 8),
                ),
              ],
            ),
            child: Icon(icon, color: SmartTaxiColors.text, size: 21),
          ),
        ),
      ),
    );
  }
}

class _MapInstructionCard extends StatelessWidget {
  const _MapInstructionCard({
    super.key,
    required this.title,
    required this.text,
    required this.onHelp,
  });

  final String title;
  final String text;
  final VoidCallback onHelp;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 11),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.94),
        border: Border.all(color: SmartTaxiColors.border),
        borderRadius: BorderRadius.circular(20),
        boxShadow: const [BoxShadow(color: Color(0x16785a14), blurRadius: 22)],
      ),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: const TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w900,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  text,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    color: SmartTaxiColors.textSecondary,
                    fontSize: 12,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ],
            ),
          ),
          TextButton(onPressed: onHelp, child: const Text('Как выбрать')),
        ],
      ),
    );
  }
}

class _MapPermissionCard extends StatelessWidget {
  const _MapPermissionCard({
    super.key,
    required this.text,
    required this.onUseLocation,
  });

  final String text;
  final VoidCallback onUseLocation;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: const Color(0xfffff8e6).withValues(alpha: 0.96),
        border: Border.all(color: SmartTaxiColors.borderStrong),
        borderRadius: BorderRadius.circular(20),
        boxShadow: const [
          BoxShadow(
            color: Color(0x18785a14),
            blurRadius: 22,
            offset: Offset(0, 10),
          ),
        ],
      ),
      child: Row(
        children: [
          Container(
            width: 34,
            height: 34,
            alignment: Alignment.center,
            decoration: const BoxDecoration(
              color: SmartTaxiColors.goldPale,
              shape: BoxShape.circle,
            ),
            child: const Icon(
              Icons.near_me_disabled_outlined,
              size: 18,
              color: SmartTaxiColors.goldDeep,
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              text,
              style: const TextStyle(
                fontSize: 12.5,
                height: 1.25,
                fontWeight: FontWeight.w800,
              ),
            ),
          ),
          IconButton(
            onPressed: onUseLocation,
            tooltip: 'Разрешить геолокацию',
            icon: const Icon(Icons.my_location_rounded),
          ),
        ],
      ),
    );
  }
}

class _MapRouteState extends StatelessWidget {
  const _MapRouteState({
    required this.loading,
    required this.routeReady,
    required this.error,
  });

  final bool loading;
  final bool routeReady;
  final String? error;

  @override
  Widget build(BuildContext context) {
    if (!loading && !routeReady && error == null) {
      return const SizedBox.shrink();
    }
    final text = loading ? 'Считаем маршрут...' : error ?? 'Маршрут готов';
    final icon = loading
        ? null
        : error == null
            ? Icons.route_rounded
            : Icons.error_outline_rounded;
    final danger = error != null;
    return AnimatedSwitcher(
      duration: const Duration(milliseconds: 180),
      child: Container(
        key: ValueKey(text),
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        decoration: BoxDecoration(
          color: danger
              ? const Color(0xfffff1f1).withValues(alpha: 0.96)
              : Colors.white.withValues(alpha: 0.94),
          border: Border.all(
            color: danger ? const Color(0xfffecaca) : SmartTaxiColors.border,
          ),
          borderRadius: BorderRadius.circular(18),
          boxShadow: const [
            BoxShadow(
              color: Color(0x14785a14),
              blurRadius: 18,
              offset: Offset(0, 8),
            ),
          ],
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (loading)
              const SizedBox(
                width: 16,
                height: 16,
                child: CircularProgressIndicator(
                  strokeWidth: 2,
                  color: SmartTaxiColors.goldDeep,
                ),
              )
            else
              Icon(
                icon,
                size: 17,
                color:
                    danger ? SmartTaxiColors.danger : SmartTaxiColors.goldDeep,
              ),
            const SizedBox(width: 8),
            Expanded(
              child: Text(
                text,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  color: danger ? SmartTaxiColors.danger : SmartTaxiColors.text,
                  fontSize: 12.5,
                  fontWeight: FontWeight.w800,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _OrderSheet extends StatelessWidget {
  const _OrderSheet({
    required this.pickupLabel,
    required this.dropoffLabel,
    required this.pickupActive,
    required this.dropoffActive,
    required this.pickupSource,
    required this.dropoffSource,
    required this.onPickupTap,
    required this.onDropoffTap,
    required this.onUseLocation,
    required this.locationLoading,
    required this.tariffs,
    required this.selectedTariffId,
    required this.preview,
    required this.loading,
    required this.previewLoading,
    required this.error,
    required this.onTariff,
    required this.onCreate,
    required this.cta,
  });

  final String pickupLabel;
  final String dropoffLabel;
  final bool pickupActive;
  final bool dropoffActive;
  final PointSource pickupSource;
  final PointSource dropoffSource;
  final VoidCallback onPickupTap;
  final VoidCallback onDropoffTap;
  final VoidCallback onUseLocation;
  final bool locationLoading;
  final List<TariffOption> tariffs;
  final String? selectedTariffId;
  final RoutePreview? preview;
  final bool loading;
  final bool previewLoading;
  final String? error;
  final ValueChanged<String> onTariff;
  final VoidCallback onCreate;
  final String cta;

  @override
  Widget build(BuildContext context) {
    final routeError =
        error != null && error!.toLowerCase().contains('маршрут');
    final canSubmit = !loading &&
        !previewLoading &&
        (cta == 'Рассчитать' || cta == 'Заказать');
    return TweenAnimationBuilder<double>(
      tween: Tween(begin: 0.96, end: 1),
      duration: const Duration(milliseconds: 260),
      curve: Curves.easeOutCubic,
      builder: (context, value, child) => Transform.scale(
        alignment: Alignment.topCenter,
        scale: value,
        child: child,
      ),
      child: _PremiumCard(
        child: AnimatedSize(
          duration: const Duration(milliseconds: 220),
          curve: Curves.easeOutCubic,
          alignment: Alignment.topCenter,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const _SheetHandle(),
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Expanded(
                    child: _TitleBlock(
                      title: 'Куда едем?',
                      text: 'Поездки только внутри активного региона',
                    ),
                  ),
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 10,
                      vertical: 7,
                    ),
                    decoration: BoxDecoration(
                      color: SmartTaxiColors.goldPale,
                      border: Border.all(color: SmartTaxiColors.borderStrong),
                      borderRadius: BorderRadius.circular(999),
                    ),
                    child: const Text(
                      'A/B',
                      style: TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 16),
              RouteFields(
                pickupLabel: pickupLabel,
                dropoffLabel: dropoffLabel,
                pickupActive: pickupActive,
                dropoffActive: dropoffActive,
                onPickupTap: onPickupTap,
                onDropoffTap: onDropoffTap,
              ),
              const SizedBox(height: 10),
              _RouteSourceSummary(
                pickupSource: pickupSource,
                dropoffSource: dropoffSource,
                pickupActive: pickupActive,
                dropoffActive: dropoffActive,
              ),
              const SizedBox(height: 12),
              OutlinedButton.icon(
                onPressed: locationLoading ? null : onUseLocation,
                icon: locationLoading
                    ? const SizedBox(
                        width: 18,
                        height: 18,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Icon(Icons.my_location_rounded, size: 19),
                label: Text(
                  locationLoading
                      ? 'Получаем геолокацию...'
                      : 'Разрешить геолокацию',
                ),
              ),
              const SizedBox(height: 18),
              _TariffSection(
                tariffs: tariffs,
                selectedId: selectedTariffId,
                estimate: preview,
                loading: previewLoading,
                onSelect: onTariff,
              ),
              const SizedBox(height: 16),
              _PriceSection(
                preview: preview,
                loading: previewLoading,
                routeError: routeError ? error : null,
              ),
              if (error != null && !routeError) ...[
                const SizedBox(height: 12),
                _InlineMessage(text: error!, danger: true),
              ],
              const SizedBox(height: 16),
              ElevatedButton(
                onPressed: canSubmit ? onCreate : null,
                child: loading
                    ? const _ButtonSpinner(text: 'Создаём заказ...')
                    : Text(cta),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _CoordinateSheet extends StatefulWidget {
  const _CoordinateSheet({required this.title});

  final String title;

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

  void _submit() {
    final lat = double.tryParse(_lat.text.replaceAll(',', '.'));
    final lng = double.tryParse(_lng.text.replaceAll(',', '.'));
    if (lat == null || lng == null) {
      setState(() => _error = 'Введите координаты');
      return;
    }
    Navigator.pop(
      context,
      _PointResult(
        Coordinate(lat: lat, lng: lng),
        _label.text.trim().isEmpty ? 'Координаты выбраны' : _label.text.trim(),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      top: false,
      child: SingleChildScrollView(
        padding: EdgeInsets.fromLTRB(
          20,
          20,
          20,
          20 + MediaQuery.viewInsetsOf(context).bottom,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              widget.title,
              style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w900),
            ),
            const SizedBox(height: 8),
            const Text(
              'Выберите точку на карте или укажите адрес с координатами.',
              style: TextStyle(color: SmartTaxiColors.textSecondary),
            ),
            const SizedBox(height: 16),
            TextField(
              controller: _label,
              decoration: const InputDecoration(
                labelText: 'Адрес или ориентир',
              ),
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: _lat,
                    decoration: const InputDecoration(
                      labelText: 'Широта',
                      hintText: '42.3167',
                    ),
                    keyboardType: const TextInputType.numberWithOptions(
                      signed: true,
                      decimal: true,
                    ),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: TextField(
                    controller: _lng,
                    decoration: const InputDecoration(
                      labelText: 'Долгота',
                      hintText: '69.5958',
                    ),
                    keyboardType: const TextInputType.numberWithOptions(
                      signed: true,
                      decimal: true,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            const _CompactNotice(
              icon: Icons.touch_app_outlined,
              title: 'Можно проще',
              text: 'Закройте окно и нажмите на карту, чтобы поставить точку.',
            ),
            if (_error != null) ...[
              const SizedBox(height: 12),
              _InlineMessage(text: _error!, danger: true),
            ],
            const SizedBox(height: 16),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton(
                    onPressed: () => Navigator.pop(context),
                    child: const Text('Выбрать на карте'),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: ElevatedButton(
                    onPressed: _submit,
                    child: const Text('Готово'),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _RouteSourceSummary extends StatelessWidget {
  const _RouteSourceSummary({
    required this.pickupSource,
    required this.dropoffSource,
    required this.pickupActive,
    required this.dropoffActive,
  });

  final PointSource pickupSource;
  final PointSource dropoffSource;
  final bool pickupActive;
  final bool dropoffActive;

  @override
  Widget build(BuildContext context) {
    return Wrap(
      spacing: 8,
      runSpacing: 8,
      children: [
        _PointSourceChip(
          label: 'Откуда',
          source: pickupSource,
          active: pickupActive,
        ),
        _PointSourceChip(
          label: 'Куда',
          source: dropoffSource,
          active: dropoffActive,
        ),
      ],
    );
  }
}

class _PointSourceChip extends StatelessWidget {
  const _PointSourceChip({
    required this.label,
    required this.source,
    required this.active,
  });

  final String label;
  final PointSource source;
  final bool active;

  @override
  Widget build(BuildContext context) {
    final text = source == PointSource.none
        ? (active ? 'выбирается' : 'не выбрано')
        : _pointSourceLabel(source);
    return AnimatedContainer(
      duration: const Duration(milliseconds: 180),
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
      decoration: BoxDecoration(
        color: active ? SmartTaxiColors.goldPale : Colors.white,
        border: Border.all(
          color: active ? SmartTaxiColors.gold : SmartTaxiColors.border,
        ),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        '$label: $text',
        style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w800),
      ),
    );
  }
}

class _TariffSection extends StatelessWidget {
  const _TariffSection({
    required this.tariffs,
    required this.selectedId,
    required this.estimate,
    required this.loading,
    required this.onSelect,
  });

  final List<TariffOption> tariffs;
  final String? selectedId;
  final RoutePreview? estimate;
  final bool loading;
  final ValueChanged<String> onSelect;

  @override
  Widget build(BuildContext context) {
    if (loading) return const _TariffSkeleton();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const _SectionLabel(title: 'Тариф', text: 'Выберите класс поездки'),
        const SizedBox(height: 10),
        if (tariffs.isEmpty)
          const _CompactNotice(
            icon: Icons.local_taxi_outlined,
            title: 'Тарифы пока не настроены',
            text: 'Администратор должен добавить тариф для активного региона.',
          )
        else
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
                  child: AnimatedScale(
                    scale: selected ? 1 : 0.97,
                    duration: const Duration(milliseconds: 180),
                    curve: Curves.easeOutCubic,
                    child: AnimatedContainer(
                      duration: const Duration(milliseconds: 180),
                      width: 154,
                      padding: const EdgeInsets.all(14),
                      decoration: BoxDecoration(
                        color:
                            selected ? SmartTaxiColors.cardWarm : Colors.white,
                        border: Border.all(
                          color: selected
                              ? SmartTaxiColors.gold
                              : SmartTaxiColors.border,
                          width: selected ? 2 : 1,
                        ),
                        borderRadius: BorderRadius.circular(22),
                        boxShadow: selected
                            ? const [
                                BoxShadow(
                                  color: Color(0x16785a14),
                                  blurRadius: 22,
                                  offset: Offset(0, 10),
                                ),
                              ]
                            : null,
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              Container(
                                width: 28,
                                height: 28,
                                alignment: Alignment.center,
                                decoration: BoxDecoration(
                                  color: selected
                                      ? SmartTaxiColors.gold
                                      : SmartTaxiColors.goldPale,
                                  shape: BoxShape.circle,
                                ),
                                child: const Icon(
                                  Icons.local_taxi_rounded,
                                  size: 16,
                                  color: SmartTaxiColors.text,
                                ),
                              ),
                              const Spacer(),
                              if (selected)
                                const Icon(
                                  Icons.check_circle_rounded,
                                  size: 18,
                                  color: SmartTaxiColors.goldDeep,
                                ),
                            ],
                          ),
                          const SizedBox(height: 10),
                          Text(
                            tariff.name,
                            style: const TextStyle(fontWeight: FontWeight.w900),
                          ),
                          if (tariff.description != null)
                            Text(
                              tariff.description!,
                              maxLines: 2,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(
                                color: SmartTaxiColors.textSecondary,
                                fontSize: 12,
                              ),
                            ),
                          const Spacer(),
                          if (selected && estimate?.estimatedPrice != null)
                            Text(
                              '${estimate!.estimatedPrice!.round()} ₸',
                              style: const TextStyle(
                                fontSize: 17,
                                fontWeight: FontWeight.w900,
                              ),
                            ),
                        ],
                      ),
                    ),
                  ),
                );
              },
            ),
          ),
      ],
    );
  }
}

class _TariffSkeleton extends StatelessWidget {
  const _TariffSkeleton();

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const _SectionLabel(title: 'Тариф', text: 'Загружаем тарифы'),
        const SizedBox(height: 10),
        Row(
          children: List.generate(
            3,
            (index) => Expanded(
              child: Container(
                height: 92,
                margin: EdgeInsets.only(right: index < 2 ? 10 : 0),
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(
                  color: SmartTaxiColors.goldSurface,
                  borderRadius: BorderRadius.circular(22),
                ),
                child: const Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    _SkeletonLine(width: 28, height: 28, radius: 999),
                    Spacer(),
                    _SkeletonLine(width: 70, height: 12),
                    SizedBox(height: 7),
                    _SkeletonLine(width: 52, height: 10),
                  ],
                ),
              ),
            ),
          ),
        ),
      ],
    );
  }
}

class _PriceSection extends StatelessWidget {
  const _PriceSection({
    required this.preview,
    required this.loading,
    required this.routeError,
  });

  final RoutePreview? preview;
  final bool loading;
  final String? routeError;

  @override
  Widget build(BuildContext context) {
    return AnimatedContainer(
      duration: const Duration(milliseconds: 220),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: SmartTaxiColors.goldSurface,
        border: Border.all(color: SmartTaxiColors.border),
        borderRadius: BorderRadius.circular(24),
      ),
      child: loading
          ? const _PriceSkeleton()
          : routeError != null
              ? Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const _SectionLabel(
                      title: 'Стоимость',
                      text: 'Маршрут не рассчитан',
                    ),
                    const SizedBox(height: 10),
                    Text(
                      routeError!,
                      style: const TextStyle(
                        color: SmartTaxiColors.danger,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                  ],
                )
              : preview?.estimatedPrice == null
                  ? const Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        _SectionLabel(
                            title: 'Стоимость', text: 'Расчёт поездки'),
                        SizedBox(height: 10),
                        Text(
                          'Укажите маршрут, чтобы рассчитать стоимость.',
                          style: TextStyle(
                            color: SmartTaxiColors.textSecondary,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ],
                    )
                  : Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const _SectionLabel(
                          title: 'Стоимость',
                          text: 'Цена рассчитана сервером',
                        ),
                        const SizedBox(height: 10),
                        Row(
                          crossAxisAlignment: CrossAxisAlignment.end,
                          children: [
                            Text(
                              '${preview!.estimatedPrice!.round()}',
                              style: const TextStyle(
                                fontSize: 36,
                                height: 0.95,
                                fontWeight: FontWeight.w900,
                              ),
                            ),
                            const SizedBox(width: 6),
                            const Padding(
                              padding: EdgeInsets.only(bottom: 2),
                              child: Text(
                                '₸',
                                style: TextStyle(
                                  fontSize: 20,
                                  fontWeight: FontWeight.w900,
                                ),
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 8),
                        _RouteEstimateMeta(preview: preview!),
                      ],
                    ),
    );
  }
}

class _PriceSkeleton extends StatelessWidget {
  const _PriceSkeleton();

  @override
  Widget build(BuildContext context) {
    return const Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _SkeletonLine(width: 112, height: 14),
        SizedBox(height: 12),
        _SkeletonLine(width: 170, height: 34),
        SizedBox(height: 10),
        _SkeletonLine(width: 210, height: 12),
      ],
    );
  }
}

class _RouteEstimateMeta extends StatelessWidget {
  const _RouteEstimateMeta({required this.preview});

  final RoutePreview preview;

  @override
  Widget build(BuildContext context) {
    final distance = (preview.distanceMeters / 1000).toStringAsFixed(1);
    final minutes = (preview.durationSeconds / 60).round();
    return Text(
      'Маршрут: $distance км · $minutes мин',
      style: const TextStyle(
        color: SmartTaxiColors.textSecondary,
        fontWeight: FontWeight.w700,
      ),
    );
  }
}

class _SmartDrawer extends StatelessWidget {
  const _SmartDrawer({
    required this.accountLabel,
    required this.accountPhone,
    required this.active,
    required this.driverLabel,
    required this.onSelect,
    required this.onDriver,
    required this.onLogout,
  });

  final String accountLabel;
  final String accountPhone;
  final PassengerTab active;
  final String driverLabel;
  final ValueChanged<PassengerTab> onSelect;
  final VoidCallback onDriver;
  final VoidCallback onLogout;

  @override
  Widget build(BuildContext context) {
    return Drawer(
      width: MediaQuery.sizeOf(context).width * 0.84,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.horizontal(right: Radius.circular(28)),
      ),
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
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text(
                          'SmartTaxi',
                          style: TextStyle(
                            fontSize: 18,
                            fontWeight: FontWeight.w900,
                          ),
                        ),
                        Text(
                          accountLabel.isEmpty ? 'Аккаунт' : accountLabel,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            color: SmartTaxiColors.textSecondary,
                          ),
                        ),
                        if (accountPhone.trim().isNotEmpty)
                          Text(
                            accountPhone,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                              color: SmartTaxiColors.textSecondary,
                              fontSize: 12,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 10),
            _DrawerItem(
              label: 'Главная',
              active: active == PassengerTab.home,
              onTap: () => onSelect(PassengerTab.home),
            ),
            _DrawerItem(
              label: 'Мои поездки',
              active: active == PassengerTab.trips,
              onTap: () => onSelect(PassengerTab.trips),
            ),
            _DrawerItem(
              label: driverLabel,
              active: active == PassengerTab.driverApplication,
              onTap: onDriver,
            ),
            _DrawerItem(
              label: 'Поддержка',
              active: active == PassengerTab.support,
              onTap: () => onSelect(PassengerTab.support),
            ),
            _DrawerItem(
              label: 'Настройки',
              active: false,
              onTap: () => onSelect(PassengerTab.support),
            ),
            const Spacer(),
            _DrawerItem(
              label: 'Выйти',
              active: false,
              danger: true,
              onTap: onLogout,
            ),
            const SizedBox(height: 12),
          ],
        ),
      ),
    );
  }
}

class _DrawerItem extends StatelessWidget {
  const _DrawerItem({
    required this.label,
    required this.active,
    required this.onTap,
    this.danger = false,
  });

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

class _AppHeader extends StatelessWidget {
  const _AppHeader({required this.onMenu, required this.trailing});

  final VoidCallback onMenu;
  final Widget trailing;

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
            color: Color(0x10785a14),
            blurRadius: 22,
            offset: Offset(0, 10),
          ),
        ],
      ),
      child: Row(
        children: [
          IconButton(
            onPressed: onMenu,
            icon: const Icon(Icons.menu_rounded),
            tooltip: 'Меню',
          ),
          const SizedBox(width: 4),
          const BrandLogo(),
          const Spacer(),
          trailing,
        ],
      ),
    );
  }
}

class _MapOverlayHeader extends StatelessWidget {
  const _MapOverlayHeader({required this.onMenu, required this.onProfile});

  final VoidCallback onMenu;
  final VoidCallback onProfile;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        _MapChromeButton(
          icon: Icons.menu_rounded,
          label: 'Меню',
          onTap: onMenu,
        ),
        const Spacer(),
        Container(
          width: 50,
          height: 50,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color: Colors.white.withValues(alpha: 0.96),
            border: Border.all(color: SmartTaxiColors.border),
            borderRadius: BorderRadius.circular(20),
            boxShadow: const [
              BoxShadow(
                color: Color(0x16785a14),
                blurRadius: 24,
                offset: Offset(0, 10),
              ),
            ],
          ),
          child: const BrandLogo(),
        ),
        const Spacer(),
        _MapChromeButton(
          icon: Icons.person_outline_rounded,
          label: 'Профиль',
          onTap: onProfile,
        ),
      ],
    );
  }
}

class _MapChromeButton extends StatelessWidget {
  const _MapChromeButton({
    required this.icon,
    required this.label,
    required this.onTap,
  });

  final IconData icon;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Tooltip(
      message: label,
      child: Material(
        color: Colors.white.withValues(alpha: 0.96),
        borderRadius: BorderRadius.circular(20),
        child: InkWell(
          borderRadius: BorderRadius.circular(20),
          onTap: onTap,
          child: Container(
            width: 50,
            height: 50,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              border: Border.all(color: SmartTaxiColors.border),
              borderRadius: BorderRadius.circular(20),
              boxShadow: const [
                BoxShadow(
                  color: Color(0x14785a14),
                  blurRadius: 22,
                  offset: Offset(0, 10),
                ),
              ],
            ),
            child: Icon(icon, color: SmartTaxiColors.text),
          ),
        ),
      ),
    );
  }
}

class _HeaderProfileButton extends StatelessWidget {
  const _HeaderProfileButton({required this.onTap});

  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return IconButton(
      onPressed: onTap,
      icon: const Icon(Icons.person_outline_rounded),
      tooltip: 'Профиль',
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
            color: Color(0x18785a14),
            blurRadius: 42,
            offset: Offset(0, 18),
          ),
        ],
      ),
      child: child,
    );
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
                offset: Offset(0, 12),
              ),
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
    return Row(
      children: [
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                title,
                style: const TextStyle(
                  fontSize: 17,
                  fontWeight: FontWeight.w900,
                ),
              ),
              const SizedBox(height: 3),
              Text(
                text,
                style: const TextStyle(
                  color: SmartTaxiColors.textSecondary,
                  fontSize: 12,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _SkeletonLine extends StatelessWidget {
  const _SkeletonLine({
    required this.width,
    required this.height,
    this.radius = 8,
  });

  final double width;
  final double height;
  final double radius;

  @override
  Widget build(BuildContext context) {
    return TweenAnimationBuilder<double>(
      tween: Tween(begin: 0.38, end: 0.92),
      duration: const Duration(milliseconds: 820),
      curve: Curves.easeInOut,
      builder: (context, value, child) => Opacity(opacity: value, child: child),
      child: Container(
        width: width,
        height: height,
        decoration: BoxDecoration(
          color: Colors.white.withValues(alpha: 0.92),
          borderRadius: BorderRadius.circular(radius),
        ),
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
            strokeWidth: 2.2,
            color: SmartTaxiColors.text,
          ),
        ),
        const SizedBox(width: 10),
        Text(text),
      ],
    );
  }
}

class _TitleBlock extends StatelessWidget {
  const _TitleBlock({required this.title, required this.text});

  final String title;
  final String text;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          title,
          style: const TextStyle(
            fontSize: 27,
            height: 1.12,
            fontWeight: FontWeight.w900,
          ),
        ),
        const SizedBox(height: 6),
        Text(
          text,
          style: const TextStyle(
            color: SmartTaxiColors.textSecondary,
            fontSize: 14,
            height: 1.35,
          ),
        ),
      ],
    );
  }
}

class _CompactNotice extends StatelessWidget {
  const _CompactNotice({
    required this.icon,
    required this.title,
    required this.text,
  });

  final IconData icon;
  final String title;
  final String text;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: SmartTaxiColors.goldSurface,
        border: Border.all(color: SmartTaxiColors.border),
        borderRadius: BorderRadius.circular(20),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 36,
            height: 36,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: Colors.white.withValues(alpha: 0.72),
              shape: BoxShape.circle,
            ),
            child: Icon(icon, color: SmartTaxiColors.goldDeep, size: 19),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: const TextStyle(fontWeight: FontWeight.w900),
                ),
                const SizedBox(height: 3),
                Text(
                  text,
                  style: const TextStyle(
                    color: SmartTaxiColors.textSecondary,
                    height: 1.35,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
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
          color: danger ? const Color(0xfffecaca) : SmartTaxiColors.border,
        ),
        borderRadius: BorderRadius.circular(16),
      ),
      child: Text(
        text,
        style: TextStyle(
          color:
              danger ? SmartTaxiColors.danger : SmartTaxiColors.textSecondary,
          fontWeight: FontWeight.w700,
        ),
      ),
    );
  }
}

class _ProfileRow extends StatelessWidget {
  const _ProfileRow({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(
          label,
          style: const TextStyle(color: SmartTaxiColors.textSecondary),
        ),
        Flexible(
          child: Text(
            value,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(fontWeight: FontWeight.w800),
          ),
        ),
      ],
    );
  }
}

class _MenuLine extends StatelessWidget {
  const _MenuLine({required this.title, required this.onTap});

  final String title;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return ListTile(
      contentPadding: EdgeInsets.zero,
      title: Text(title, style: const TextStyle(fontWeight: FontWeight.w800)),
      trailing: const Icon(Icons.chevron_right_rounded),
      onTap: onTap,
    );
  }
}

class _ApplicationField extends StatelessWidget {
  const _ApplicationField({
    required this.label,
    required this.onChanged,
    this.initialValue = '',
    this.keyboardType,
  });

  final String label;
  final String initialValue;
  final TextInputType? keyboardType;
  final ValueChanged<String> onChanged;

  @override
  Widget build(BuildContext context) => TextFormField(
        initialValue: initialValue,
        decoration: InputDecoration(labelText: label),
        keyboardType: keyboardType,
        onChanged: onChanged,
      );
}

class _PointResult {
  _PointResult(this.coordinate, this.label);

  final Coordinate coordinate;
  final String label;
}

class _SheetHandle extends StatelessWidget {
  const _SheetHandle();

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Container(
        width: 44,
        height: 5,
        margin: const EdgeInsets.only(bottom: 16),
        decoration: BoxDecoration(
          color: SmartTaxiColors.borderStrong,
          borderRadius: BorderRadius.circular(999),
        ),
      ),
    );
  }
}

class _StatusStepper extends StatelessWidget {
  const _StatusStepper({required this.status});

  final String status;

  @override
  Widget build(BuildContext context) {
    const steps = [
      'NEW',
      'DRIVER_ASSIGNED',
      'DRIVER_ARRIVED',
      'IN_PROGRESS',
      'COMPLETED',
    ];
    const labels = ['Поиск', 'Принят', 'Прибыл', 'В пути', 'Завершено'];
    final index = steps.indexOf(status).clamp(0, steps.length - 1);
    return Row(
      children: List.generate(steps.length, (stepIndex) {
        final done = stepIndex <= index;
        return Expanded(
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 180),
            curve: Curves.easeOutCubic,
            margin: EdgeInsets.only(
              right: stepIndex == steps.length - 1 ? 0 : 5,
            ),
            padding: const EdgeInsets.symmetric(vertical: 9),
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: done ? SmartTaxiColors.goldSoft : Colors.white,
              border: Border.all(
                color: done
                    ? SmartTaxiColors.borderStrong
                    : SmartTaxiColors.border,
              ),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Text(
              labels[stepIndex],
              style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w800),
            ),
          ),
        );
      }),
    );
  }
}

enum PassengerTab { home, trips, profile, driverApplication, support }

enum PointTarget { pickup, dropoff }

enum PointSource { none, gps, map, manual }

String _pointSourceLabel(PointSource source) {
  return switch (source) {
    PointSource.gps => 'GPS',
    PointSource.map => 'карта',
    PointSource.manual => 'вручную',
    PointSource.none => 'не выбрано',
  };
}

String _driverPickupMeta(RoutePreview route) {
  final distance = (route.distanceMeters / 1000).toStringAsFixed(1);
  final minutes = (route.durationSeconds / 60).round();
  return 'До точки посадки: $distance км · $minutes мин';
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
  if (status == 'DRIVER_ASSIGNED' ||
      status == 'DRIVER_ARRIVED' ||
      status == 'IN_PROGRESS') {
    return StatusTone.warning;
  }
  return StatusTone.neutral;
}

String _readableDriverRouteError(Object error) {
  final message = error.toString();
  if (message.contains('DRIVER_LOCATION_UNAVAILABLE')) {
    return 'Ожидаем геолокацию водителя.';
  }
  if (message.contains('ROUTE_UNAVAILABLE')) {
    return 'Маршрут водителя временно недоступен.';
  }
  return 'Маршрут водителя временно недоступен.';
}

String _readableError(Object error) {
  final message = error.toString();
  if (message.contains('SocketException') ||
      message.contains('Connection') ||
      message.contains('connection') ||
      message.contains('timed out')) {
    return 'Сервер недоступен. Проверьте подключение.';
  }
  if (message.contains('DRIVER_NAME_REQUIRED')) return 'Введите имя и фамилию';
  if (message.contains('DRIVER_PHONE_REQUIRED')) return 'Введите телефон';
  if (message.contains('DRIVER_CAR_REQUIRED')) {
    return 'Введите марку и модель авто';
  }
  if (message.contains('DRIVER_PLATE_REQUIRED')) return 'Введите госномер';
  const map = {
    'PICKUP_REGION_INACTIVE': 'В этом месте сервис пока недоступен',
    'DROPOFF_REGION_INACTIVE': 'Точка назначения вне активного региона',
    'INTERCITY_NOT_SUPPORTED': 'Межгород пока не поддерживается',
    'TARIFF_INACTIVE': 'Этот тариф временно недоступен',
    'TARIFF_REGION_MISMATCH': 'Тариф недоступен для выбранного региона',
    'ROUTE_UNAVAILABLE': 'Маршрут временно недоступен.',
    'DRIVER_LOCATION_UNAVAILABLE': 'Ожидаем геолокацию водителя',
  };
  for (final entry in map.entries) {
    if (message.contains(entry.key)) return entry.value;
  }
  return 'Не удалось выполнить запрос';
}
