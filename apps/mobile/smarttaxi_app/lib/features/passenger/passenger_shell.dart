import 'dart:async';
import 'dart:math' as math;
import 'dart:ui';

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

const _tariffEconomyAsset =
    'assets/cars/tariff_economy_white_sedan_flutter.png';
const _tariffComfortAsset =
    'assets/cars/tariff_comfort_white_sedan_flutter.png';
const _tariffBusinessAsset =
    'assets/cars/tariff_business_white_premium_sedan_flutter.png';
const _driverCarMarkerAsset = 'assets/map/driver_car_topview_white.png';
const _userLocationMarkerAsset =
    'assets/map/user_location_marker_blue_gold.png';
const _destinationMarkerAsset = 'assets/map/destination_pin_gold_white.png';
const _navigationButtonAsset = 'assets/map/navigation_button_gold_white.png';
const _atakentFallbackCenter = LatLng(40.84719, 68.503834);

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
  final _supportController = TextEditingController();
  PassengerTab _tab = PassengerTab.home;
  PointTarget _target = PointTarget.pickup;
  bool _loading = false;
  bool _previewLoading = false;
  bool _locationLoading = false;
  bool _mapTilesUnavailable = false;
  bool _mapReady = false;
  bool _startupRegionPromptShown = false;
  bool _startupLocationPromptShown = false;
  bool _skipNextLocationIntro = false;
  int _mapTileErrorCount = 0;
  String? _error;
  List<RegionOption> _regions = const [];
  RegionOption? _selectedRegion;
  List<TariffOption> _tariffs = const [];
  String? _tariffId;
  Map<String, RoutePreview> _tariffEstimates = const {};
  Coordinate? _pickup;
  Coordinate? _dropoff;
  String _pickupLabel = 'Выберите точку подачи';
  String _dropoffLabel = 'Введите адрес назначения';
  PointSource _pickupSource = PointSource.none;
  PointSource _dropoffSource = PointSource.none;
  RoutePreview? _preview;
  RoutePreview? _driverPickupRoute;
  String? _driverRouteError;
  OrderSummary? _order;
  DriverLocation? _driverLocation;
  LatLng? _mapCenter;
  String _activeRegionLabel = 'Регион';
  String _driverFullName = '';
  String _driverPhone = '';
  String _driverCarModel = '';
  String _driverCarColor = '';
  String _driverPlate = '';
  String _driverYear = '';
  String _driverComment = '';
  String? _driverApplicationMessage;
  String _supportTopic = 'Проблема с поездкой';
  String? _supportMessage;
  String _paymentMethod = 'CASH';

  @override
  void initState() {
    super.initState();
    _deferMapStart();
    _bootstrap();
  }

  @override
  void dispose() {
    _supportController.dispose();
    widget.sockets.clearListeners();
    super.dispose();
  }

  Future<void> _bootstrap() async {
    try {
      await widget.sockets.connect();
      widget.sockets.onOrderUpdate(_handleOrderUpdate);
      widget.sockets.onDriverLocation(_handleDriverLocation);
    } catch (_) {
      if (mounted) {
        setState(() {
          _error =
              'Сервер временно недоступен. Можно выбрать маршрут, когда подключение восстановится.';
        });
      }
    }
    await _loadRegions();
  }

  void _deferMapStart() {
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      await Future<void>.delayed(const Duration(milliseconds: 180));
      if (!mounted) return;
      setState(() => _mapReady = true);
    });
  }

  Future<void> _loadRegions() async {
    try {
      final regions = await widget.api.getActiveRegions();
      if (!mounted) return;
      final activeRegion = regions.isEmpty ? null : regions.first;
      setState(() {
        _regions = regions;
        _selectedRegion = activeRegion;
        _mapCenter = activeRegion == null
            ? _atakentFallbackCenter
            : (activeRegion.center?.toLatLng() ?? _atakentFallbackCenter);
        _activeRegionLabel = activeRegion?.name ?? 'Регион';
      });
      if (activeRegion == null) return;
      if (regions.length > 1) {
        _maybeAskRegionOnStart();
      } else {
        _maybeAskLocationOnStart();
      }
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _regions = const [];
        _selectedRegion = null;
        _mapCenter = _atakentFallbackCenter;
      });
      _maybeAskLocationOnStart();
    }
  }

  Future<void> _chooseRegion({bool askLocationAfter = false}) async {
    if (_regions.isEmpty) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Активные регионы пока не загружены')),
      );
      return;
    }
    final selected = await showModalBottomSheet<RegionOption>(
      context: context,
      backgroundColor: Colors.transparent,
      builder: (context) => _RegionSelectSheet(
        regions: _regions,
        selectedId: _selectedRegion?.id,
      ),
    );
    if (selected == null || !mounted) return;
    setState(() {
      _selectedRegion = selected;
      _activeRegionLabel = selected.name;
      if (selected.center != null) {
        _mapCenter = selected.center!.toLatLng();
      }
      _pickup = null;
      _dropoff = null;
      _pickupSource = PointSource.none;
      _dropoffSource = PointSource.none;
      _preview = null;
      _tariffEstimates = const {};
      _tariffId = null;
      _error = null;
    });
    if (askLocationAfter) {
      _maybeAskLocationOnStart();
    }
  }

  void _maybeAskRegionOnStart() {
    if (_startupRegionPromptShown) return;
    _startupRegionPromptShown = true;
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      await Future<void>.delayed(const Duration(milliseconds: 300));
      if (!mounted || _pickup != null || _regions.length < 2) return;
      await _chooseRegion(askLocationAfter: true);
      if (mounted && !_startupLocationPromptShown) {
        _maybeAskLocationOnStart();
      }
    });
  }

  RegionOption? _regionForPoint(Coordinate point) {
    for (final region in _regions) {
      if (region.contains(point)) return region;
    }
    return null;
  }

  void _maybeAskLocationOnStart() {
    if (_startupLocationPromptShown) return;
    _startupLocationPromptShown = true;
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      await Future<void>.delayed(const Duration(milliseconds: 450));
      if (!mounted || _pickup != null) return;
      final permission = await Geolocator.checkPermission();
      if (!mounted || _pickup != null) return;
      if (permission == LocationPermission.denied ||
          permission == LocationPermission.deniedForever) {
        final approved = await _showLocationPermissionIntro();
        if (!mounted || approved != true) return;
        _skipNextLocationIntro = true;
        await _usePhoneLocation();
      } else {
        await _usePhoneLocation();
      }
    });
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
      final serviceEnabled = await Geolocator.isLocationServiceEnabled();
      if (!mounted) return;
      if (!serviceEnabled) {
        setState(
          () => _error =
              'Геолокация выключена. Включите её в настройках или выберите точку на карте.',
        );
        return;
      }

      var permission = await Geolocator.checkPermission();
      if (!mounted) return;
      if (permission == LocationPermission.denied) {
        final skipIntro = _skipNextLocationIntro;
        _skipNextLocationIntro = false;
        final approved =
            skipIntro ? true : await _showLocationPermissionIntro();
        if (!mounted) return;
        if (approved != true) {
          setState(
            () => _error =
                'Можно выбрать точку подачи на карте без доступа к геолокации.',
          );
          return;
        }
        permission = await Geolocator.requestPermission();
      }
      if (permission == LocationPermission.denied ||
          permission == LocationPermission.deniedForever) {
        if (!mounted) return;
        setState(
          () => _error =
              'Геолокация не включена. Выберите точку подачи на карте вручную.',
        );
        return;
      }
      final position = await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(
          accuracy: LocationAccuracy.high,
        ),
      );
      if (!mounted) return;
      final point = Coordinate(lat: position.latitude, lng: position.longitude);
      final selectedRegion = _selectedRegion;
      if (selectedRegion != null && !selectedRegion.contains(point)) {
        final matchingRegion = _regionForPoint(point);
        if (matchingRegion != null) {
          setState(() {
            _selectedRegion = matchingRegion;
            _activeRegionLabel = matchingRegion.name;
            _mapCenter = matchingRegion.center?.toLatLng() ?? point.toLatLng();
            _pickup = null;
            _dropoff = null;
            _pickupSource = PointSource.none;
            _dropoffSource = PointSource.none;
            _preview = null;
            _tariffEstimates = const {};
            _tariffId = null;
            _error = null;
          });
        } else {
          setState(() {
            _locationLoading = false;
            _error =
                'Ваше местоположение вне выбранного региона. Выберите точку подачи на карте или смените регион.';
            if (selectedRegion.center != null) {
              _mapCenter = selectedRegion.center!.toLatLng();
            }
          });
          return;
        }
      }
      var label = 'Текущее местоположение';
      try {
        final address = await widget.api.reverseAddress(point);
        if (address != null && address.label.trim().isNotEmpty) {
          label = address.label.trim();
        }
      } catch (_) {}
      if (!mounted) return;
      setState(() {
        _pickup = point;
        _pickupLabel = label;
        _pickupSource = PointSource.gps;
        _target = PointTarget.dropoff;
        _mapCenter = point.toLatLng();
      });
      await _refreshPreview();
    } catch (_) {
      if (mounted) {
        setState(
          () => _error =
              'Не удалось получить геолокацию. Выберите точку подачи на карте.',
        );
      }
    } finally {
      if (mounted) setState(() => _locationLoading = false);
    }
  }

  Future<bool?> _showLocationPermissionIntro() {
    return showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (context) => const _LocationPermissionSheet(),
    );
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
      builder: (context) => _AddressSearchSheet(
        api: widget.api,
        region: _selectedRegion?.name,
        title: target == PointTarget.pickup ? 'Откуда' : 'Куда',
        hint: target == PointTarget.pickup
            ? 'Введите улицу или место подачи'
            : 'Введите улицу или место назначения',
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
    final coordinate = Coordinate(lat: point.latitude, lng: point.longitude);
    final selectedRegion = _selectedRegion;
    if (selectedRegion != null && !selectedRegion.contains(coordinate)) {
      setState(() {
        _error =
            'Эта точка вне выбранного региона. Смените регион или выберите точку внутри зоны SmartTaxi.';
      });
      return;
    }
    var label = 'Точка выбрана';
    try {
      final address = await widget.api.reverseAddress(coordinate);
      if (address != null && address.label.trim().isNotEmpty) {
        label = address.label.trim();
      }
    } catch (_) {}
    await _applyPoint(
      target,
      coordinate,
      label,
      PointSource.map,
    );
    if (target == PointTarget.pickup) {
      setState(() => _target = PointTarget.dropoff);
    }
  }

  void _handleMapTileError() {
    if (_mapTilesUnavailable || !mounted) return;
    _mapTileErrorCount += 1;
    if (_mapTileErrorCount < 16) return;
    setState(() => _mapTilesUnavailable = true);
  }

  void _retryMap() {
    setState(() {
      _mapTileErrorCount = 0;
      _mapTilesUnavailable = false;
      _mapReady = false;
    });
    _deferMapStart();
  }

  Future<void> _applyPoint(
    PointTarget target,
    Coordinate coordinate,
    String label,
    PointSource source,
  ) async {
    final selectedRegion = _selectedRegion;
    if (selectedRegion != null && !selectedRegion.contains(coordinate)) {
      if (!mounted) return;
      setState(() {
        _error =
            'Адрес вне выбранного региона. Выберите адрес внутри зоны SmartTaxi или смените регион.';
      });
      return;
    }
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
      _tariffEstimates = const {};
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
      _tariffEstimates = const {};
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
      final passengerTariffs = _passengerTariffVisuals(tariffs);
      final passengerTariffIds =
          passengerTariffs.map((item) => item.tariff.id).toSet();
      if (selectedTariffId != null &&
          !passengerTariffIds.contains(selectedTariffId)) {
        selectedTariffId = null;
      }
      if (selectedTariffId == null && passengerTariffs.isNotEmpty) {
        selectedTariffId = passengerTariffs.first.tariff.id;
      }
      final estimates = <String, RoutePreview>{};
      for (final item in passengerTariffs) {
        try {
          estimates[item.tariff.id] = await widget.api.previewRoute(
            pickup: _pickup!,
            dropoff: _dropoff!,
            tariffId: item.tariff.id,
          );
        } catch (_) {}
      }
      if (selectedTariffId != null && estimates[selectedTariffId] != null) {
        preview = estimates[selectedTariffId]!;
      } else if (selectedTariffId != null) {
        preview = await widget.api.previewRoute(
          pickup: _pickup!,
          dropoff: _dropoff!,
          tariffId: selectedTariffId,
        );
        estimates[selectedTariffId] = preview;
      }
      setState(() {
        _preview = preview;
        _tariffs = tariffs;
        _tariffId = selectedTariffId;
        _tariffEstimates = estimates;
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
        paymentMethod: _paymentMethod,
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
              child: AnimatedSwitcher(
                duration: const Duration(milliseconds: 220),
                switchInCurve: Curves.easeOutCubic,
                switchOutCurve: Curves.easeInCubic,
                child: KeyedSubtree(
                  key: ValueKey(_tab),
                  child: _currentScreen(),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _currentScreen() {
    final builders = <PassengerTab, Widget Function()>{
      PassengerTab.home: _homeScreen,
      PassengerTab.trips: _tripsScreen,
      PassengerTab.profile: _profileScreen,
      PassengerTab.driverApplication: _driverApplicationScreen,
      PassengerTab.support: _supportScreen,
      PassengerTab.faq: _faqScreen,
      PassengerTab.about: _aboutScreen,
      PassengerTab.settings: _settingsScreen,
    };
    return (builders[_tab] ?? _unknownPassengerSection).call();
  }

  Widget _unknownPassengerSection() {
    return Padding(
      padding: const EdgeInsets.all(20),
      child: EmptyState(
        icon: Icons.apps_rounded,
        title: 'Раздел недоступен',
        text: 'Вернитесь на главный экран и попробуйте открыть раздел ещё раз.',
        action: 'На главную',
        onAction: () => setState(() => _tab = PassengerTab.home),
      ),
    );
  }

  Widget _homeScreen() {
    final screen = MediaQuery.sizeOf(context);
    final compact = screen.height < 720 || screen.width < 390;
    final geolocationNotice = _geolocationNotice;
    final mapRoute = _order?.driverId != null
        ? (_driverPickupRoute?.geometry ?? const <LatLng>[])
        : (_preview?.geometry ?? const <LatLng>[]);
    final mapRouteError = _order?.driverId != null
        ? _driverRouteError
        : (_routePreviewError ? _error : null);
    return Stack(
      children: [
        Positioned.fill(
          child: _MapCanvas(
            center: _mapCenter ?? _atakentFallbackCenter,
            pickup: _pickup,
            dropoff: _dropoff,
            driver: _order?.driverId == null ? null : _driverLocation,
            route: mapRoute,
            permissionNotice: geolocationNotice,
            routeLoading: _previewLoading,
            routeError: mapRouteError,
            mapUnavailable: _mapTilesUnavailable,
            mapReady: _mapReady,
            onTap: _applyMapTap,
            onTileError: _handleMapTileError,
            onUseLocation: _usePhoneLocation,
            onRetryMap: _retryMap,
            onMenu: _openDrawer,
            onNotifications: _openNotifications,
            onRegionTap: _chooseRegion,
            regionLabel: _activeRegionLabel,
          ),
        ),
        Positioned(
          left: compact ? 16 : 22,
          right: compact ? 16 : 22,
          top: compact ? 104 : 118,
          child: _FloatingAddressCard(
            pickupLabel: _pickupSource == PointSource.none
                ? 'Моё местоположение'
                : _pickupLabel,
            dropoffLabel: _dropoffSource == PointSource.none
                ? 'Куда едем?'
                : _dropoffLabel,
            pickupActive: _target == PointTarget.pickup,
            dropoffActive: _target == PointTarget.dropoff,
            loading: _locationLoading,
            onPickupTap: () => _selectPoint(target: PointTarget.pickup),
            onDropoffTap: () => _selectPoint(target: PointTarget.dropoff),
            onUseLocation: _usePhoneLocation,
          ),
        ),
        Align(
          alignment: Alignment.bottomCenter,
          child: ConstrainedBox(
            constraints: BoxConstraints(
              maxHeight: screen.height * (compact ? 0.46 : 0.41),
            ),
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
              paymentMethod: _paymentMethod,
              paymentLabel: _paymentMethodLabel,
              onPaymentTap: _choosePaymentMethod,
              tariffs: _tariffs,
              selectedTariffId: _tariffId,
              preview: _preview,
              tariffEstimates: _tariffEstimates,
              loading: _loading,
              previewLoading: _previewLoading,
              error: _error,
              onTariff: (id) async {
                final cached = _tariffEstimates[id];
                setState(() {
                  _tariffId = id;
                  if (cached != null) _preview = cached;
                });
                if (cached == null) await _refreshPreview();
              },
              onCreate: _createOrder,
              cta: _ctaText(),
            ),
          ),
        ),
      ],
    );
  }

  String get _paymentMethodLabel {
    return const {
          'CASH': 'Наличные',
          'KASPI': 'Kaspi',
          'CARD': 'Карта',
        }[_paymentMethod] ??
        'Наличные';
  }

  Future<void> _choosePaymentMethod() async {
    final selected = await showModalBottomSheet<String>(
      context: context,
      backgroundColor: Colors.transparent,
      builder: (context) => _PaymentMethodSheet(selected: _paymentMethod),
    );
    if (!mounted || selected == null) return;
    setState(() => _paymentMethod = selected);
  }

  void _openNotifications() {
    showModalBottomSheet<void>(
      context: context,
      backgroundColor: Colors.transparent,
      builder: (context) => const _NotificationsSheet(),
    );
  }

  String? get _geolocationNotice {
    final error = _error;
    if (error == null) return null;
    if (!error.toLowerCase().contains('геолокац')) return null;
    return 'Можно включить GPS для точной подачи или выбрать точку на карте.';
  }

  bool get _routePreviewError {
    final error = _error;
    if (error == null) return false;
    return error.toLowerCase().contains('маршрут') ||
        error.contains('В этом месте сервис пока недоступен') ||
        error.contains('Точка назначения вне активного региона') ||
        error.contains('Межгород пока не поддерживается');
  }

  String _ctaText() {
    if (_loading) return 'Создаём заказ...';
    if (_pickup == null || _dropoff == null) return 'Выбрать адрес';
    if (_tariffId == null) return 'Выберите тариф';
    if (_preview == null || _preview!.estimatedPrice == null) {
      return 'Рассчитать';
    }
    return 'Заказать';
  }

  Widget _tripsScreen() {
    if (_order == null) {
      return ListView(
        padding: const EdgeInsets.all(20),
        children: [
          const _TitleBlock(
            title: 'Мои поездки',
            text: 'Здесь появится активный заказ и его статус',
          ),
          const SizedBox(height: 16),
          EmptyState(
            icon: Icons.route_rounded,
            title: 'Активной поездки нет',
            text: 'Создайте заказ, и его статус появится здесь.',
            action: 'На главную',
            onAction: () => setState(() => _tab = PassengerTab.home),
          ),
        ],
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
                    _formatTenge(_order!.price!),
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
    final label =
        widget.accountLabel.isEmpty ? 'Пользователь' : widget.accountLabel;
    return ListView(
      padding: const EdgeInsets.all(20),
      children: [
        const _TitleBlock(
          title: 'Профиль',
          text: 'Аккаунт, поездки и настройки SmartTaxi',
        ),
        const SizedBox(height: 16),
        _PremiumCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Container(
                    width: 58,
                    height: 58,
                    alignment: Alignment.center,
                    decoration: BoxDecoration(
                      color: SmartTaxiColors.goldSurface,
                      border: Border.all(color: SmartTaxiColors.borderStrong),
                      borderRadius: BorderRadius.circular(22),
                    ),
                    child: const BrandLogo(),
                  ),
                  const SizedBox(width: 14),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          label,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                            fontSize: 22,
                            fontWeight: FontWeight.w900,
                          ),
                        ),
                        const Text(
                          'Клиент SmartTaxi',
                          style: TextStyle(
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
              _ProfileRow(label: 'Логин', value: label),
              if (widget.accountPhone.trim().isNotEmpty) ...[
                const SizedBox(height: 12),
                _ProfileRow(label: 'Телефон', value: widget.accountPhone),
              ],
            ],
          ),
        ),
        const SizedBox(height: 14),
        const _ProfileGroupLabel('Основное'),
        const SizedBox(height: 8),
        _PremiumCard(
          child: Column(
            children: [
              _MenuLine(
                icon: Icons.route_rounded,
                title: 'Мои поездки',
                onTap: () => setState(() => _tab = PassengerTab.trips),
              ),
              _MenuLine(
                icon: Icons.badge_outlined,
                title: 'Стать водителем',
                onTap: _openDriverEntry,
              ),
              _MenuLine(
                icon: Icons.support_agent_rounded,
                title: 'Поддержка',
                onTap: () => setState(() => _tab = PassengerTab.support),
              ),
            ],
          ),
        ),
        const SizedBox(height: 14),
        const _ProfileGroupLabel('Приложение'),
        const SizedBox(height: 8),
        _PremiumCard(
          child: Column(
            children: [
              _MenuLine(
                icon: Icons.tune_rounded,
                title: 'Настройки',
                onTap: () => setState(() => _tab = PassengerTab.settings),
              ),
              _MenuLine(
                icon: Icons.help_outline_rounded,
                title: 'FAQ',
                onTap: () => setState(() => _tab = PassengerTab.faq),
              ),
              _MenuLine(
                icon: Icons.info_outline_rounded,
                title: 'О нас',
                onTap: () => setState(() => _tab = PassengerTab.about),
              ),
            ],
          ),
        ),
        const SizedBox(height: 14),
        const _ProfileGroupLabel('Аккаунт'),
        const SizedBox(height: 8),
        _PremiumCard(
          child: _MenuLine(
            icon: Icons.logout_rounded,
            title: 'Выйти',
            danger: true,
            onTap: widget.onLogout,
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

  Widget _supportScreen() {
    const topics = [
      'Проблема с поездкой',
      'Водитель не приехал',
      'Забыл вещь',
      'Оплата',
      'Другое',
    ];
    return ListView(
      padding: const EdgeInsets.all(20),
      children: [
        const _TitleBlock(
          title: 'Поддержка',
          text: 'Опишите проблему, мы поможем',
        ),
        const SizedBox(height: 16),
        _PremiumCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const _SectionLabel(
                title: 'Тема обращения',
                text: 'Выберите, с чем нужна помощь',
              ),
              const SizedBox(height: 12),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: topics
                    .map(
                      (topic) => _SupportTopicChip(
                        label: topic,
                        selected: _supportTopic == topic,
                        onTap: () => setState(() => _supportTopic = topic),
                      ),
                    )
                    .toList(),
              ),
              const SizedBox(height: 16),
              TextField(
                controller: _supportController,
                minLines: 5,
                maxLines: 7,
                decoration: const InputDecoration(
                  labelText: 'Сообщение',
                  hintText: 'Напишите сообщение…',
                  alignLabelWithHint: true,
                ),
              ),
              if (_supportMessage != null) ...[
                const SizedBox(height: 12),
                _InlineMessage(text: _supportMessage!),
              ],
              const SizedBox(height: 16),
              ElevatedButton(
                onPressed: () {
                  setState(
                    () => _supportMessage =
                        'Сообщение подготовлено. Отправка будет подключена позже.',
                  );
                },
                child: const Text('Отправить'),
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _settingsScreen() {
    return ListView(
      padding: const EdgeInsets.all(20),
      children: [
        const _TitleBlock(
          title: 'Настройки',
          text: 'Аккаунт, поездки и информация о приложении',
        ),
        const SizedBox(height: 16),
        _SettingsGroup(
          title: 'Аккаунт',
          children: [
            _SettingsRow(
              title: 'Номер телефона',
              text: widget.accountPhone.isEmpty
                  ? 'Не указан'
                  : widget.accountPhone,
            ),
            _SettingsRow(
              title: 'Выход из аккаунта',
              text: 'Завершить текущую сессию',
              danger: true,
              onTap: widget.onLogout,
            ),
          ],
        ),
        const SizedBox(height: 14),
        const _SettingsGroup(
          title: 'Интерфейс',
          children: [
            _SettingsRow(title: 'Тема', text: 'Светлая', badge: 'Скоро'),
            _SettingsRow(title: 'Язык', text: 'Русский', badge: 'Скоро'),
          ],
        ),
        const SizedBox(height: 14),
        const _SettingsGroup(
          title: 'Поездки',
          children: [
            _SettingsRow(
              title: 'Уведомления о статусе',
              text: 'Появятся после подключения push',
              badge: 'Скоро',
            ),
            _SettingsRow(
              title: 'Геолокация',
              text: 'Разрешение управляется в настройках телефона',
            ),
          ],
        ),
        const SizedBox(height: 14),
        const _SettingsGroup(
          title: 'Безопасность аккаунта',
          children: [
            _SettingsRow(
              title: 'Изменить пароль',
              text: 'Раздел будет доступен позже',
              badge: 'Скоро',
            ),
          ],
        ),
        const SizedBox(height: 14),
        const _SettingsGroup(
          title: 'О приложении',
          children: [
            _SettingsRow(title: 'Версия', text: 'SmartTaxi mobile'),
            _SettingsRow(
              title: 'Условия сервиса',
              text: 'Документы будут добавлены перед запуском',
              badge: 'Скоро',
            ),
          ],
        ),
      ],
    );
  }

  Widget _faqScreen() {
    final items = const [
      (
        'Как заказать поездку?',
        'Выберите точки A и B на карте, выберите тариф, дождитесь расчёта и нажмите «Заказать».'
      ),
      (
        'Почему сервис работает только в выбранном регионе?',
        'SmartTaxi запускается по регионам, которые включены администратором. Так поездки остаются контролируемыми и честными.'
      ),
      (
        'Как считается цена?',
        'Цена рассчитывается сервером по маршруту, тарифу, расстоянию и времени поездки.'
      ),
      (
        'Как стать водителем?',
        'Откройте раздел «Стать водителем», заполните данные автомобиля и дождитесь проверки администратора.'
      ),
      (
        'Что делать, если водитель не приехал?',
        'Откройте поддержку и выберите тему «Водитель не приехал».'
      ),
      (
        'Как отменить заказ?',
        'Откройте «Мои поездки» и нажмите «Отменить поездку», если заказ ещё можно отменить.'
      ),
      (
        'Почему нужна геолокация?',
        'Геолокация помогает выбрать точку посадки и строить честный маршрут.'
      ),
      (
        'Как связаться с поддержкой?',
        'Откройте раздел «Поддержка» в меню и напишите сообщение.'
      ),
    ];
    return ListView(
      padding: const EdgeInsets.all(20),
      children: [
        const _TitleBlock(
          title: 'FAQ',
          text: 'Ответы на частые вопросы',
        ),
        const SizedBox(height: 16),
        ...items.map(
          (item) => Padding(
            padding: const EdgeInsets.only(bottom: 10),
            child: _PremiumCard(
              child: ExpansionTile(
                tilePadding: EdgeInsets.zero,
                childrenPadding: const EdgeInsets.only(top: 4),
                title: Text(
                  item.$1,
                  style: const TextStyle(fontWeight: FontWeight.w900),
                ),
                children: [
                  Align(
                    alignment: Alignment.centerLeft,
                    child: Text(
                      item.$2,
                      style: const TextStyle(
                        color: SmartTaxiColors.textSecondary,
                        height: 1.4,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ],
    );
  }

  Widget _aboutScreen() {
    return ListView(
      padding: const EdgeInsets.all(20),
      children: [
        _PremiumCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Center(child: BrandLogo(large: true)),
              const SizedBox(height: 18),
              const Text(
                'SmartTaxi',
                style: TextStyle(fontSize: 28, fontWeight: FontWeight.w900),
              ),
              const SizedBox(height: 8),
              const Text(
                'SmartTaxi — региональный сервис такси для быстрых, понятных и честных поездок внутри активных регионов.',
                style: TextStyle(
                  color: SmartTaxiColors.textSecondary,
                  height: 1.45,
                  fontWeight: FontWeight.w600,
                ),
              ),
              const SizedBox(height: 16),
              const _CompactNotice(
                icon: Icons.map_outlined,
                title: 'Региональная модель',
                text:
                    'Поездки доступны только внутри регионов, включённых администратором. Межгород на текущем этапе не поддерживается.',
              ),
              const SizedBox(height: 12),
              _CompactNotice(
                icon: Icons.support_agent_rounded,
                title: 'Связь',
                text: 'Если нужна помощь, откройте поддержку в левом меню.',
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _SupportTopicChip extends StatelessWidget {
  const _SupportTopicChip({
    required this.label,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return AnimatedContainer(
      duration: const Duration(milliseconds: 180),
      curve: Curves.easeOutCubic,
      decoration: BoxDecoration(
        color: selected ? SmartTaxiColors.goldPale : Colors.white,
        border: Border.all(
          color: selected ? SmartTaxiColors.gold : SmartTaxiColors.border,
          width: selected ? 1.6 : 1,
        ),
        borderRadius: BorderRadius.circular(999),
        boxShadow: selected
            ? const [
                BoxShadow(
                  color: Color(0x10785a14),
                  blurRadius: 14,
                  offset: Offset(0, 6),
                )
              ]
            : null,
      ),
      child: InkWell(
        borderRadius: BorderRadius.circular(999),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 13, vertical: 10),
          child: Text(
            label,
            style: TextStyle(
              color: selected
                  ? SmartTaxiColors.text
                  : SmartTaxiColors.textSecondary,
              fontSize: 13,
              fontWeight: FontWeight.w900,
            ),
          ),
        ),
      ),
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
    required this.permissionNotice,
    required this.routeLoading,
    required this.routeError,
    required this.mapUnavailable,
    required this.mapReady,
    required this.onTap,
    required this.onTileError,
    required this.onUseLocation,
    required this.onRetryMap,
    required this.onMenu,
    required this.onNotifications,
    required this.onRegionTap,
    required this.regionLabel,
  });

  final LatLng center;
  final Coordinate? pickup;
  final Coordinate? dropoff;
  final DriverLocation? driver;
  final List<LatLng> route;
  final String? permissionNotice;
  final bool routeLoading;
  final String? routeError;
  final bool mapUnavailable;
  final bool mapReady;
  final ValueChanged<LatLng> onTap;
  final VoidCallback onTileError;
  final VoidCallback onUseLocation;
  final VoidCallback onRetryMap;
  final VoidCallback onMenu;
  final VoidCallback onNotifications;
  final VoidCallback onRegionTap;
  final String regionLabel;

  @override
  Widget build(BuildContext context) {
    final cameraPoints = _cameraPoints();
    final initialFit = cameraPoints.length > 1
        ? CameraFit.coordinates(
            coordinates: cameraPoints,
            padding: const EdgeInsets.fromLTRB(54, 130, 54, 330),
            maxZoom: 15.5,
          )
        : null;
    final mapKey = ValueKey(cameraPoints.map(_pointKey).join('|'));
    final showMapFallback = !mapReady || mapUnavailable;
    return Stack(
      children: [
        if (showMapFallback)
          const Positioned.fill(child: _MapFallbackSurface())
        else
          FlutterMap(
            key: mapKey,
            options: MapOptions(
              initialCenter: center,
              initialZoom: pickup == null && dropoff == null ? 12 : 14,
              initialCameraFit: initialFit,
              onTap: (_, point) => onTap(point),
              backgroundColor: SmartTaxiColors.appBackground,
            ),
            children: [
              TileLayer(
                urlTemplate: AppConfig.osmTileUrl,
                userAgentPackageName: 'com.smarttaxi.app',
                errorTileCallback: (_, __, ___) => onTileError(),
              ),
              if (route.isNotEmpty)
                PolylineLayer(
                  polylines: [
                    Polyline(
                      points: route,
                      color: SmartTaxiColors.gold,
                      strokeWidth: 6,
                    ),
                  ],
                ),
              MarkerLayer(
                markers: [
                  if (pickup != null)
                    _assetMarker(
                      point: pickup!.toLatLng(),
                      asset: _userLocationMarkerAsset,
                      semanticLabel: 'Точка подачи',
                      fallbackIcon: Icons.radio_button_checked_rounded,
                    ),
                  if (dropoff != null)
                    _assetMarker(
                      point: dropoff!.toLatLng(),
                      asset: _destinationMarkerAsset,
                      semanticLabel: 'Точка назначения',
                      fallbackIcon: Icons.location_on_rounded,
                    ),
                  if (driver != null)
                    _assetMarker(
                      point: driver!.toLatLng(),
                      asset: _driverCarMarkerAsset,
                      semanticLabel: 'Автомобиль водителя',
                      size: 58,
                      rotationRadians: (driver!.heading ?? 0) * math.pi / 180,
                      fallbackIcon: Icons.local_taxi_rounded,
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
                    Color(0x55fffcf6),
                    Color(0x08fffcf6),
                    Color(0xaafffcf6),
                  ],
                ),
              ),
            ),
          ),
        ),
        Positioned(
          left: 22,
          top: 28,
          right: 22,
          child: _MapOverlayHeader(
            onMenu: onMenu,
            onNotifications: onNotifications,
            onRegionTap: onRegionTap,
            regionLabel: regionLabel,
          ),
        ),
        if (mapUnavailable)
          Positioned(
            left: 22,
            right: 22,
            top: 286,
            child: _MapUnavailableCard(onRetry: onRetryMap),
          ),
        if (!showMapFallback && permissionNotice != null)
          Positioned(
            left: 22,
            right: 22,
            top: 286,
            child: _MapPermissionCard(
              text: permissionNotice!,
              onUseLocation: onUseLocation,
            ),
          ),
        Positioned(
          right: 22,
          bottom: 310,
          child: _MapRoundButton(
            icon: Icons.my_location_rounded,
            label: 'Моё местоположение',
            asset: _navigationButtonAsset,
            onTap: onUseLocation,
          ),
        ),
        if (routeError != null || routeLoading)
          Positioned(
            left: 22,
            right: 92,
            top: 286,
            child: _MapRouteState(
              loading: routeLoading,
              routeReady: route.isNotEmpty,
              error: routeError,
            ),
          ),
        Positioned(
          left: 14,
          bottom: 292,
          child: DecoratedBox(
            decoration: BoxDecoration(
              color: Colors.white.withValues(alpha: 0.82),
              border: Border.all(color: SmartTaxiColors.border),
              borderRadius: BorderRadius.circular(12),
              boxShadow: const [
                BoxShadow(
                  color: Color(0x66000000),
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
    );
  }

  Marker _assetMarker({
    required LatLng point,
    required String asset,
    required String semanticLabel,
    required IconData fallbackIcon,
    double size = 50,
    double rotationRadians = 0,
  }) {
    return Marker(
      point: point,
      width: size + 18,
      height: size + 18,
      child: Semantics(
        label: semanticLabel,
        image: true,
        child: Transform.rotate(
          angle: rotationRadians,
          child: Image.asset(
            asset,
            width: size,
            height: size,
            fit: BoxFit.contain,
            errorBuilder: (_, __, ___) => Container(
              width: size,
              height: size,
              alignment: Alignment.center,
              decoration: BoxDecoration(
                color: Colors.white,
                shape: BoxShape.circle,
                border: Border.all(color: SmartTaxiColors.gold, width: 2),
                boxShadow: const [
                  BoxShadow(
                    color: Color(0x2ed4af37),
                    blurRadius: 18,
                    offset: Offset(0, 8),
                  ),
                ],
              ),
              child: Icon(
                fallbackIcon,
                color: SmartTaxiColors.goldDeep,
                size: size * 0.48,
              ),
            ),
          ),
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
    this.asset,
  });

  final IconData icon;
  final String label;
  final VoidCallback onTap;
  final String? asset;

  @override
  Widget build(BuildContext context) {
    return Tooltip(
      message: label,
      child: Material(
        color: Colors.white.withValues(alpha: 0.94),
        shape: const CircleBorder(),
        elevation: 0,
        child: InkWell(
          customBorder: const CircleBorder(),
          onTap: onTap,
          child: Container(
            width: 58,
            height: 58,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              border: Border.all(color: SmartTaxiColors.border),
              boxShadow: const [
                BoxShadow(
                  color: Color(0x1f141414),
                  blurRadius: 22,
                  offset: Offset(0, 10),
                ),
              ],
            ),
            child: asset == null
                ? Icon(icon, color: SmartTaxiColors.goldDeep, size: 28)
                : Image.asset(
                    asset!,
                    width: 34,
                    height: 34,
                    fit: BoxFit.contain,
                    errorBuilder: (_, __, ___) => Icon(
                      icon,
                      color: SmartTaxiColors.goldDeep,
                      size: 28,
                    ),
                  ),
          ),
        ),
      ),
    );
  }
}

class _MapFallbackSurface extends StatelessWidget {
  const _MapFallbackSurface();

  @override
  Widget build(BuildContext context) {
    return const DecoratedBox(
      decoration: BoxDecoration(
        gradient: RadialGradient(
          center: Alignment(0.25, -0.35),
          radius: 1.1,
          colors: [
            Color(0xfffff8e6),
            Color(0xfffffcf6),
            Color(0xffffffff),
          ],
        ),
      ),
      child: Center(
        child: Padding(
          padding: EdgeInsets.symmetric(horizontal: 32),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(Icons.map_outlined, color: SmartTaxiColors.gold, size: 38),
              SizedBox(height: 12),
              Text(
                'Карта загружается',
                textAlign: TextAlign.center,
                style: TextStyle(
                  color: SmartTaxiColors.text,
                  fontSize: 18,
                  fontWeight: FontWeight.w900,
                ),
              ),
              SizedBox(height: 6),
              Text(
                'Подключаем карту города',
                textAlign: TextAlign.center,
                style: TextStyle(
                    color: SmartTaxiColors.textSecondary,
                    fontWeight: FontWeight.w700),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _MapUnavailableCard extends StatelessWidget {
  const _MapUnavailableCard({required this.onRetry});

  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.95),
        border: Border.all(color: SmartTaxiColors.borderStrong),
        borderRadius: BorderRadius.circular(22),
        boxShadow: const [
          BoxShadow(
            color: Color(0x18785a14),
            blurRadius: 24,
            offset: Offset(0, 12),
          ),
        ],
      ),
      child: Row(
        children: [
          const Icon(
            Icons.map_outlined,
            color: SmartTaxiColors.goldDeep,
            size: 24,
          ),
          const SizedBox(width: 10),
          const Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  'Карта временно недоступна',
                  style: TextStyle(
                    color: SmartTaxiColors.text,
                    fontWeight: FontWeight.w900,
                    fontSize: 14,
                    height: 1.15,
                  ),
                ),
                SizedBox(height: 3),
                Text(
                  'Маршрут и заказ можно выбрать вручную. Карта появится после восстановления соединения.',
                  style: TextStyle(
                    color: SmartTaxiColors.textSecondary,
                    fontWeight: FontWeight.w600,
                    fontSize: 12.5,
                    height: 1.25,
                  ),
                ),
              ],
            ),
          ),
          TextButton(
            onPressed: onRetry,
            style:
                TextButton.styleFrom(foregroundColor: SmartTaxiColors.goldDeep),
            child: const Text('Повторить'),
          ),
        ],
      ),
    );
  }
}

class _MapPermissionCard extends StatelessWidget {
  const _MapPermissionCard({
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
        color: Colors.white.withValues(alpha: 0.95),
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
              color: SmartTaxiColors.gold,
              shape: BoxShape.circle,
            ),
            child: const Icon(
              Icons.near_me_disabled_outlined,
              size: 18,
              color: SmartTaxiColors.text,
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              text,
              style: const TextStyle(
                color: SmartTaxiColors.text,
                fontSize: 12.5,
                height: 1.25,
                fontWeight: FontWeight.w800,
              ),
            ),
          ),
          IconButton(
            onPressed: onUseLocation,
            tooltip: 'Разрешить геолокацию',
            icon: const Icon(Icons.my_location_rounded,
                color: SmartTaxiColors.gold),
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
              ? SmartTaxiColors.danger.withValues(alpha: 0.18)
              : Colors.white.withValues(alpha: 0.94),
          border: Border.all(
            color: danger
                ? SmartTaxiColors.danger.withValues(alpha: 0.34)
                : SmartTaxiColors.border,
          ),
          borderRadius: BorderRadius.circular(18),
          boxShadow: const [
            BoxShadow(
              color: Color(0x18785a14),
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

class _HomeOrderPanel extends StatelessWidget {
  const _HomeOrderPanel({required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    return ClipRRect(
      borderRadius: const BorderRadius.vertical(top: Radius.circular(38)),
      child: BackdropFilter(
        filter: ImageFilter.blur(sigmaX: 12, sigmaY: 12),
        child: Container(
          width: double.infinity,
          padding: EdgeInsets.fromLTRB(
            18,
            12,
            18,
            18 + MediaQuery.paddingOf(context).bottom,
          ),
          decoration: BoxDecoration(
            color: Colors.white.withValues(alpha: 0.985),
            border: Border.all(color: SmartTaxiColors.border),
            borderRadius: const BorderRadius.vertical(top: Radius.circular(38)),
            boxShadow: const [
              BoxShadow(
                color: Color(0x22785a14),
                blurRadius: 34,
                offset: Offset(0, -12),
              ),
            ],
          ),
          child: child,
        ),
      ),
    );
  }
}

class _FloatingAddressCard extends StatelessWidget {
  const _FloatingAddressCard({
    required this.pickupLabel,
    required this.dropoffLabel,
    required this.pickupActive,
    required this.dropoffActive,
    required this.loading,
    required this.onPickupTap,
    required this.onDropoffTap,
    required this.onUseLocation,
  });

  final String pickupLabel;
  final String dropoffLabel;
  final bool pickupActive;
  final bool dropoffActive;
  final bool loading;
  final VoidCallback onPickupTap;
  final VoidCallback onDropoffTap;
  final VoidCallback onUseLocation;

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 164,
      padding: const EdgeInsets.fromLTRB(20, 16, 16, 16),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.96),
        border: Border.all(color: SmartTaxiColors.border),
        borderRadius: BorderRadius.circular(28),
        boxShadow: const [
          BoxShadow(
            color: Color(0x1a785a14),
            blurRadius: 30,
            offset: Offset(0, 14),
          ),
        ],
      ),
      child: Row(
        children: [
          SizedBox(
            width: 34,
            child: Column(
              children: [
                Container(
                  width: 18,
                  height: 18,
                  decoration: BoxDecoration(
                    color: const Color(0xff1d6fff),
                    shape: BoxShape.circle,
                    boxShadow: [
                      BoxShadow(
                        color: const Color(0xff1d6fff).withValues(alpha: 0.26),
                        blurRadius: 12,
                      ),
                    ],
                  ),
                ),
                Expanded(
                  child: Container(
                    width: 2,
                    margin: const EdgeInsets.symmetric(vertical: 8),
                    decoration: BoxDecoration(
                      color: SmartTaxiColors.borderStrong,
                      borderRadius: BorderRadius.circular(999),
                    ),
                  ),
                ),
                Container(
                  width: 22,
                  height: 22,
                  decoration: BoxDecoration(
                    color: SmartTaxiColors.gold,
                    shape: BoxShape.circle,
                    boxShadow: [
                      BoxShadow(
                        color: SmartTaxiColors.gold.withValues(alpha: 0.28),
                        blurRadius: 12,
                      ),
                    ],
                  ),
                  child: const Center(
                    child: SizedBox(
                      width: 8,
                      height: 8,
                      child: DecoratedBox(
                        decoration: BoxDecoration(
                          color: Colors.white,
                          shape: BoxShape.circle,
                        ),
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              children: [
                _FloatingAddressRow(
                  title: 'Откуда',
                  label: pickupLabel,
                  active: pickupActive,
                  onTap: onPickupTap,
                ),
                Container(
                  height: 1,
                  margin: const EdgeInsets.symmetric(vertical: 8),
                  color: SmartTaxiColors.border,
                ),
                _FloatingAddressRow(
                  title: 'Куда',
                  label: dropoffLabel,
                  active: dropoffActive,
                  onTap: onDropoffTap,
                ),
              ],
            ),
          ),
          const SizedBox(width: 12),
          Material(
            color: SmartTaxiColors.gold,
            shape: const CircleBorder(),
            child: InkWell(
              customBorder: const CircleBorder(),
              onTap: loading ? null : onDropoffTap,
              child: SizedBox(
                width: 56,
                height: 56,
                child: Center(
                  child: loading
                      ? const SizedBox(
                          width: 20,
                          height: 20,
                          child: CircularProgressIndicator(
                            strokeWidth: 2,
                            color: Colors.white,
                          ),
                        )
                      : const Text(
                          '+',
                          style: TextStyle(
                            color: Colors.white,
                            fontSize: 36,
                            height: 0.9,
                            fontWeight: FontWeight.w500,
                          ),
                        ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _FloatingAddressRow extends StatelessWidget {
  const _FloatingAddressRow({
    required this.title,
    required this.label,
    required this.active,
    required this.onTap,
  });

  final String title;
  final String label;
  final bool active;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          borderRadius: BorderRadius.circular(16),
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 4),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    color: SmartTaxiColors.textSecondary,
                    fontSize: 12,
                    height: 1,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                const SizedBox(height: 5),
                Text(
                  label,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    color: active
                        ? SmartTaxiColors.goldDeep
                        : SmartTaxiColors.text,
                    fontSize: 19,
                    height: 1.05,
                    fontWeight: active ? FontWeight.w900 : FontWeight.w800,
                  ),
                ),
              ],
            ),
          ),
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
    required this.paymentMethod,
    required this.paymentLabel,
    required this.onPaymentTap,
    required this.tariffs,
    required this.selectedTariffId,
    required this.preview,
    required this.tariffEstimates,
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
  final String paymentMethod;
  final String paymentLabel;
  final VoidCallback onPaymentTap;
  final List<TariffOption> tariffs;
  final String? selectedTariffId;
  final RoutePreview? preview;
  final Map<String, RoutePreview> tariffEstimates;
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
    final routeSelected =
        pickupSource != PointSource.none && dropoffSource != PointSource.none;
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
      child: _HomeOrderPanel(
        child: AnimatedSize(
          duration: const Duration(milliseconds: 220),
          curve: Curves.easeOutCubic,
          alignment: Alignment.topCenter,
          child: SingleChildScrollView(
            physics: const BouncingScrollPhysics(),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const _SheetHandle(dark: false),
                if (routeSelected && !routeError)
                  _TariffSection(
                    tariffs: tariffs,
                    selectedId: selectedTariffId,
                    estimate: preview,
                    estimates: tariffEstimates,
                    loading: previewLoading,
                    onSelect: onTariff,
                    dark: false,
                    showHeader: false,
                  )
                else if (routeSelected && routeError)
                  const _CompactNotice(
                    icon: Icons.route_outlined,
                    title: 'Уточните маршрут',
                    text:
                        'Не удалось построить маршрут. Измените адрес или выберите точку на карте.',
                  )
                else
                  const _CompactNotice(
                    icon: Icons.alt_route_rounded,
                    title: 'Выберите адрес назначения',
                    text: 'Тарифы и стоимость появятся после выбора маршрута.',
                  ),
                if (error != null && !routeError) ...[
                  const SizedBox(height: 12),
                  _InlineMessage(text: error!, danger: true, dark: false),
                ],
                const SizedBox(height: 14),
                _PaymentMethodRow(
                  enabled: true,
                  method: paymentMethod,
                  label: paymentLabel,
                  onTap: onPaymentTap,
                ),
                const SizedBox(height: 14),
                _GoldCtaButton(
                  enabled: canSubmit,
                  loading: loading,
                  text: cta,
                  onTap: onCreate,
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _AddressSearchSheet extends StatefulWidget {
  const _AddressSearchSheet({
    required this.api,
    required this.region,
    required this.title,
    required this.hint,
  });

  final ApiClient api;
  final String? region;
  final String title;
  final String hint;

  @override
  State<_AddressSearchSheet> createState() => _AddressSearchSheetState();
}

class _AddressSearchSheetState extends State<_AddressSearchSheet> {
  final _query = TextEditingController();
  Timer? _debounce;
  bool _loading = false;
  String? _error;
  List<AddressSuggestion> _results = const [];

  @override
  void dispose() {
    _debounce?.cancel();
    _query.dispose();
    super.dispose();
  }

  void _onQueryChanged(String value) {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 360), () {
      _search(value);
    });
  }

  Future<void> _search(String value) async {
    final query = value.trim();
    if (query.length < 2) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = null;
        _results = const [];
      });
      return;
    }
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final results = await widget.api.searchAddresses(
        query,
        region: widget.region,
      );
      if (!mounted) return;
      setState(() => _results = results);
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _results = const [];
        _error = 'Поиск адреса временно недоступен. Выберите точку на карте.';
      });
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  void _select(AddressSuggestion item) {
    Navigator.pop(
      context,
      _PointResult(item.coordinate, item.label),
    );
  }

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      top: false,
      child: SingleChildScrollView(
        padding: EdgeInsets.fromLTRB(
          20,
          18,
          20,
          18 + MediaQuery.viewInsetsOf(context).bottom,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const _SheetHandle(dark: false),
            Row(
              children: [
                Expanded(
                  child: Text(
                    widget.title,
                    style: const TextStyle(
                      fontSize: 26,
                      height: 1.05,
                      fontWeight: FontWeight.w900,
                    ),
                  ),
                ),
                TextButton(
                  onPressed: () => Navigator.pop(context),
                  style: TextButton.styleFrom(
                    foregroundColor: SmartTaxiColors.goldDeep,
                  ),
                  child: const Text(
                    'Отмена',
                    style: TextStyle(fontWeight: FontWeight.w900),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 14),
            if ((widget.region ?? '').trim().isNotEmpty) ...[
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 12, vertical: 9),
                decoration: BoxDecoration(
                  color: SmartTaxiColors.goldPale,
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(color: SmartTaxiColors.border),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Icon(
                      Icons.location_city_rounded,
                      size: 17,
                      color: SmartTaxiColors.goldDeep,
                    ),
                    const SizedBox(width: 7),
                    Text(
                      widget.region!,
                      style: const TextStyle(
                        color: SmartTaxiColors.text,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 12),
            ],
            TextField(
              controller: _query,
              autofocus: true,
              textInputAction: TextInputAction.search,
              onChanged: _onQueryChanged,
              onSubmitted: _search,
              decoration: InputDecoration(
                hintText: widget.hint,
                prefixIcon: const Icon(Icons.search_rounded),
                suffixIcon: _loading
                    ? const Padding(
                        padding: EdgeInsets.all(14),
                        child: SizedBox(
                          width: 18,
                          height: 18,
                          child: CircularProgressIndicator(
                            strokeWidth: 2,
                            color: SmartTaxiColors.goldDeep,
                          ),
                        ),
                      )
                    : null,
              ),
            ),
            const SizedBox(height: 12),
            _CompactNotice(
              icon: Icons.touch_app_outlined,
              title: 'Адрес или точка на карте',
              text: 'Введите улицу, место или выберите точку прямо на карте.',
            ),
            if (_error != null) ...[
              const SizedBox(height: 12),
              _InlineMessage(text: _error!, danger: true),
            ],
            const SizedBox(height: 12),
            if (_query.text.trim().length < 2)
              const _AddressEmptyHint()
            else if (!_loading && _results.isEmpty && _error == null)
              const _AddressEmptyHint(
                title: 'Ничего не найдено',
                text: 'Уточните улицу, район или название места.',
              )
            else
              ..._results.map(
                (item) => _AddressResultTile(
                  item: item,
                  onTap: () => _select(item),
                ),
              ),
            const SizedBox(height: 12),
            OutlinedButton.icon(
              onPressed: () => Navigator.pop(context),
              icon: const Icon(Icons.map_outlined),
              label: const Text('Выбрать точку на карте'),
            ),
          ],
        ),
      ),
    );
  }
}

class _AddressResultTile extends StatelessWidget {
  const _AddressResultTile({required this.item, required this.onTap});

  final AddressSuggestion item;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final subtitle = [
      if ((item.city ?? '').trim().isNotEmpty) item.city,
      if ((item.region ?? '').trim().isNotEmpty) item.region,
      if ((item.subtitle ?? '').trim().isNotEmpty) item.subtitle,
    ].whereType<String>().join(' • ');
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Material(
        color: SmartTaxiColors.cardWarm,
        borderRadius: BorderRadius.circular(20),
        child: InkWell(
          borderRadius: BorderRadius.circular(20),
          onTap: onTap,
          child: Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              border: Border.all(color: SmartTaxiColors.border),
              borderRadius: BorderRadius.circular(20),
            ),
            child: Row(
              children: [
                Container(
                  width: 40,
                  height: 40,
                  alignment: Alignment.center,
                  decoration: const BoxDecoration(
                    color: SmartTaxiColors.goldPale,
                    shape: BoxShape.circle,
                  ),
                  child: const Icon(
                    Icons.place_rounded,
                    color: SmartTaxiColors.goldDeep,
                    size: 22,
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        item.label,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          fontWeight: FontWeight.w900,
                          fontSize: 15,
                        ),
                      ),
                      if (subtitle.trim().isNotEmpty) ...[
                        const SizedBox(height: 3),
                        Text(
                          subtitle,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            color: SmartTaxiColors.textSecondary,
                            fontSize: 12.5,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ],
                    ],
                  ),
                ),
                const Icon(Icons.chevron_right_rounded,
                    color: SmartTaxiColors.goldDeep),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _AddressEmptyHint extends StatelessWidget {
  const _AddressEmptyHint({
    this.title = 'Начните вводить адрес',
    this.text = 'Напишите улицу, район или название места.',
  });

  final String title;
  final String text;

  @override
  Widget build(BuildContext context) {
    return _CompactNotice(
      icon: Icons.manage_search_rounded,
      title: title,
      text: text,
    );
  }
}

class _LocationPermissionSheet extends StatelessWidget {
  const _LocationPermissionSheet();

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      top: false,
      child: Container(
        margin: const EdgeInsets.all(12),
        padding: const EdgeInsets.fromLTRB(22, 14, 22, 22),
        decoration: BoxDecoration(
          color: Colors.white,
          border:
              Border.all(color: SmartTaxiColors.gold.withValues(alpha: 0.30)),
          borderRadius: BorderRadius.circular(32),
          boxShadow: const [
            BoxShadow(
              color: Color(0x18785a14),
              blurRadius: 34,
              offset: Offset(0, 18),
            ),
          ],
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const _SheetHandle(dark: false),
            Container(
              width: 56,
              height: 56,
              alignment: Alignment.center,
              decoration: BoxDecoration(
                color: SmartTaxiColors.gold.withValues(alpha: 0.16),
                shape: BoxShape.circle,
                border: Border.all(
                    color: SmartTaxiColors.gold.withValues(alpha: 0.38)),
              ),
              child: const Icon(
                Icons.my_location_rounded,
                color: SmartTaxiColors.gold,
                size: 27,
              ),
            ),
            const SizedBox(height: 18),
            const Text(
              'Геолокация для подачи',
              style: TextStyle(
                color: SmartTaxiColors.text,
                fontSize: 24,
                fontWeight: FontWeight.w900,
              ),
            ),
            const SizedBox(height: 8),
            const Text(
              'SmartTaxi использует ваше реальное местоположение только для точки подачи и расчёта маршрута. Можно выбрать точку на карте вручную.',
              style: TextStyle(
                color: SmartTaxiColors.textSecondary,
                fontSize: 14,
                height: 1.45,
                fontWeight: FontWeight.w600,
              ),
            ),
            const SizedBox(height: 20),
            _GoldCtaButton(
              enabled: true,
              loading: false,
              text: 'Разрешить геолокацию',
              onTap: () => Navigator.pop(context, true),
            ),
            const SizedBox(height: 10),
            TextButton(
              onPressed: () => Navigator.pop(context, false),
              style: TextButton.styleFrom(
                foregroundColor: SmartTaxiColors.textSecondary,
                minimumSize: const Size.fromHeight(48),
              ),
              child: const Text(
                'Выбрать точку на карте',
                style: TextStyle(fontWeight: FontWeight.w800),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _PassengerTariffVisual {
  const _PassengerTariffVisual({
    required this.tariff,
    required this.title,
    required this.description,
    required this.asset,
  });

  final TariffOption tariff;
  final String title;
  final String description;
  final String asset;
}

List<_PassengerTariffVisual> _passengerTariffVisuals(
  List<TariffOption> tariffs,
) {
  final byClass = <String, _PassengerTariffVisual>{};
  for (final tariff in tariffs) {
    final visual = _passengerTariffVisual(tariff);
    if (visual != null) {
      byClass.putIfAbsent(visual.title, () => visual);
    }
  }
  return [
    if (byClass['Эконом'] != null) byClass['Эконом']!,
    if (byClass['Комфорт'] != null) byClass['Комфорт']!,
    if (byClass['Бизнес'] != null) byClass['Бизнес']!,
  ];
}

_PassengerTariffVisual? _passengerTariffVisual(TariffOption tariff) {
  final normalized = tariff.name.trim().toLowerCase();
  if (normalized.contains('econom') || normalized.contains('эконом')) {
    return _PassengerTariffVisual(
      tariff: tariff,
      title: 'Эконом',
      description: 'Быстро и доступно',
      asset: _tariffEconomyAsset,
    );
  }
  if (normalized.contains('comfort') || normalized.contains('комфорт')) {
    return _PassengerTariffVisual(
      tariff: tariff,
      title: 'Комфорт',
      description: 'Больше удобства',
      asset: _tariffComfortAsset,
    );
  }
  if (normalized.contains('business') || normalized.contains('бизнес')) {
    return _PassengerTariffVisual(
      tariff: tariff,
      title: 'Бизнес',
      description: 'Премиум класс',
      asset: _tariffBusinessAsset,
    );
  }
  return null;
}

String _formatTenge(num value) {
  final amount = value.round().toString();
  final spaced = amount.replaceAllMapped(
    RegExp(r'\B(?=(\d{3})+(?!\d))'),
    (_) => ' ',
  );
  return '$spaced ₸';
}

class _TariffSection extends StatelessWidget {
  const _TariffSection({
    required this.tariffs,
    required this.selectedId,
    required this.estimate,
    required this.estimates,
    required this.loading,
    required this.onSelect,
    this.dark = false,
    this.showHeader = true,
  });

  final List<TariffOption> tariffs;
  final String? selectedId;
  final RoutePreview? estimate;
  final Map<String, RoutePreview> estimates;
  final bool loading;
  final ValueChanged<String> onSelect;
  final bool dark;
  final bool showHeader;

  @override
  Widget build(BuildContext context) {
    if (loading) return _TariffSkeleton(dark: dark);
    final visibleTariffs = _passengerTariffVisuals(tariffs);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (showHeader) ...[
          _SectionLabel(
            title: 'Тариф',
            text: 'Выберите класс поездки',
            dark: dark,
          ),
          const SizedBox(height: 10),
        ],
        if (tariffs.isEmpty)
          _CompactNotice(
            icon: Icons.local_taxi_outlined,
            title: 'Тарифы пока не настроены',
            text: 'Администратор должен добавить тариф для активного региона.',
            dark: dark,
          )
        else if (visibleTariffs.isEmpty)
          _CompactNotice(
            icon: Icons.local_taxi_outlined,
            title: 'Тарифы недоступны',
            text: 'Для этого региона нужны тарифы Эконом, Комфорт или Бизнес.',
            dark: dark,
          )
        else
          SizedBox(
            height: 210,
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              itemCount: visibleTariffs.length,
              separatorBuilder: (_, __) => const SizedBox(width: 12),
              itemBuilder: (context, index) {
                final item = visibleTariffs[index];
                final tariff = item.tariff;
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
                      padding: const EdgeInsets.fromLTRB(12, 12, 12, 14),
                      clipBehavior: Clip.antiAlias,
                      decoration: BoxDecoration(
                        color: dark
                            ? (selected
                                ? SmartTaxiColors.gold.withValues(alpha: 0.14)
                                : Colors.white.withValues(alpha: 0.06))
                            : (selected
                                ? SmartTaxiColors.cardWarm
                                : Colors.white),
                        border: Border.all(
                          color: selected
                              ? SmartTaxiColors.gold
                              : (dark
                                  ? Colors.white.withValues(alpha: 0.08)
                                  : SmartTaxiColors.border),
                          width: selected ? 2 : 1,
                        ),
                        borderRadius: BorderRadius.circular(24),
                        boxShadow: const [
                          BoxShadow(
                            color: Color(0x12141414),
                            blurRadius: 22,
                            offset: Offset(0, 10),
                          ),
                        ],
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.center,
                        children: [
                          SizedBox(
                            height: 76,
                            width: double.infinity,
                            child: Stack(
                              alignment: Alignment.center,
                              children: [
                                Image.asset(
                                  item.asset,
                                  fit: BoxFit.contain,
                                  errorBuilder: (_, __, ___) => const Icon(
                                    Icons.local_taxi_rounded,
                                    color: SmartTaxiColors.goldDeep,
                                    size: 38,
                                  ),
                                ),
                                Positioned(
                                  right: 0,
                                  top: 0,
                                  child: AnimatedOpacity(
                                    opacity: selected ? 1 : 0,
                                    duration: const Duration(milliseconds: 160),
                                    child: const Icon(
                                      Icons.check_circle_rounded,
                                      size: 19,
                                      color: SmartTaxiColors.goldDeep,
                                    ),
                                  ),
                                ),
                              ],
                            ),
                          ),
                          const SizedBox(height: 10),
                          Text(
                            item.title,
                            textAlign: TextAlign.center,
                            style: TextStyle(
                              color: dark ? Colors.white : SmartTaxiColors.text,
                              fontSize: 14,
                              fontWeight: FontWeight.w900,
                            ),
                          ),
                          const Spacer(),
                          if (estimates[tariff.id]?.estimatedPrice != null)
                            Text(
                              _formatTenge(
                                estimates[tariff.id]!.estimatedPrice!,
                              ),
                              style: TextStyle(
                                color: dark
                                    ? SmartTaxiColors.gold
                                    : SmartTaxiColors.goldDeep,
                                fontSize: 21,
                                fontWeight: FontWeight.w900,
                              ),
                            )
                          else
                            Text(
                              'После расчёта',
                              style: TextStyle(
                                color: dark
                                    ? Colors.white54
                                    : SmartTaxiColors.textMuted,
                                fontSize: 10,
                                fontWeight: FontWeight.w800,
                              ),
                            ),
                          if (estimates[tariff.id] != null) ...[
                            const SizedBox(height: 7),
                            _TariffDuration(
                              preview: estimates[tariff.id]!,
                              dark: dark,
                            ),
                          ],
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
  const _TariffSkeleton({this.dark = false});

  final bool dark;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _SectionLabel(title: 'Тариф', text: 'Загружаем тарифы', dark: dark),
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
                  color: dark
                      ? Colors.white.withValues(alpha: 0.06)
                      : SmartTaxiColors.goldSurface,
                  border: dark
                      ? Border.all(color: Colors.white.withValues(alpha: 0.08))
                      : null,
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

class _TariffDuration extends StatelessWidget {
  const _TariffDuration({required this.preview, required this.dark});

  final RoutePreview preview;
  final bool dark;

  @override
  Widget build(BuildContext context) {
    final minutes = math.max(1, (preview.durationSeconds / 60).ceil());
    return Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        Icon(
          Icons.schedule_rounded,
          color: dark ? Colors.white60 : SmartTaxiColors.textSecondary,
          size: 15,
        ),
        const SizedBox(width: 4),
        Text(
          '$minutes мин',
          style: TextStyle(
            color: dark ? Colors.white60 : SmartTaxiColors.textSecondary,
            fontSize: 12,
            fontWeight: FontWeight.w700,
          ),
        ),
      ],
    );
  }
}

class _PaymentMethodRow extends StatelessWidget {
  const _PaymentMethodRow({
    required this.enabled,
    required this.method,
    required this.label,
    required this.onTap,
  });

  final bool enabled;
  final String method;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return AnimatedOpacity(
      duration: const Duration(milliseconds: 180),
      opacity: enabled ? 1 : 0.56,
      child: Container(
        height: 58,
        padding: const EdgeInsets.symmetric(horizontal: 16),
        decoration: BoxDecoration(
          color: Colors.white,
          border: Border.all(color: SmartTaxiColors.border),
          borderRadius: BorderRadius.circular(18),
          boxShadow: const [
            BoxShadow(
              color: Color(0x0f141414),
              blurRadius: 18,
              offset: Offset(0, 8),
            ),
          ],
        ),
        child: InkWell(
          borderRadius: BorderRadius.circular(18),
          onTap: enabled ? onTap : null,
          child: Row(
            children: [
              _PaymentIcon(method: method),
              const SizedBox(width: 14),
              Expanded(
                child: Text(
                  label,
                  style: const TextStyle(
                    color: SmartTaxiColors.text,
                    fontSize: 17,
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ),
              Icon(
                Icons.keyboard_arrow_down_rounded,
                color:
                    enabled ? SmartTaxiColors.text : SmartTaxiColors.textMuted,
                size: 25,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _PaymentIcon extends StatelessWidget {
  const _PaymentIcon({required this.method});

  final String method;

  @override
  Widget build(BuildContext context) {
    final icon = switch (method) {
      'KASPI' => Icons.credit_card_rounded,
      'CARD' => Icons.credit_card_rounded,
      _ => Icons.account_balance_wallet_rounded,
    };
    return Container(
      width: 38,
      height: 38,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: SmartTaxiColors.goldSurface,
        border: Border.all(color: SmartTaxiColors.borderStrong),
        borderRadius: BorderRadius.circular(14),
      ),
      child: Icon(icon, color: SmartTaxiColors.goldDeep, size: 21),
    );
  }
}

class _RegionSelectSheet extends StatelessWidget {
  const _RegionSelectSheet({
    required this.regions,
    required this.selectedId,
  });

  final List<RegionOption> regions;
  final String? selectedId;

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      top: false,
      child: Container(
        padding: const EdgeInsets.fromLTRB(20, 14, 20, 20),
        decoration: const BoxDecoration(
          color: SmartTaxiColors.card,
          borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Center(child: _SheetHandle(dark: false)),
            const SizedBox(height: 14),
            const Text(
              'Выберите регион',
              style: TextStyle(
                fontSize: 24,
                fontWeight: FontWeight.w900,
                color: SmartTaxiColors.text,
              ),
            ),
            const SizedBox(height: 6),
            const Text(
              'Адреса, тарифы и маршруты будут считаться для выбранной зоны.',
              style: TextStyle(
                color: SmartTaxiColors.textSecondary,
                height: 1.35,
              ),
            ),
            const SizedBox(height: 16),
            ...regions.map((region) {
              final selected = region.id == selectedId;
              return Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: Material(
                  color: Colors.transparent,
                  child: InkWell(
                    borderRadius: BorderRadius.circular(20),
                    onTap: () => Navigator.pop(context, region),
                    child: Ink(
                      padding: const EdgeInsets.all(16),
                      decoration: BoxDecoration(
                        color: selected
                            ? SmartTaxiColors.goldPale
                            : SmartTaxiColors.cardWarm,
                        borderRadius: BorderRadius.circular(20),
                        border: Border.all(
                          color: selected
                              ? SmartTaxiColors.gold
                              : SmartTaxiColors.border,
                        ),
                      ),
                      child: Row(
                        children: [
                          Container(
                            width: 40,
                            height: 40,
                            decoration: BoxDecoration(
                              color: selected
                                  ? SmartTaxiColors.gold
                                  : Colors.white,
                              shape: BoxShape.circle,
                              border: Border.all(color: SmartTaxiColors.border),
                            ),
                            child: Icon(
                              Icons.location_city_rounded,
                              color: selected
                                  ? SmartTaxiColors.text
                                  : SmartTaxiColors.goldDeep,
                            ),
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Text(
                              region.name,
                              style: const TextStyle(
                                color: SmartTaxiColors.text,
                                fontWeight: FontWeight.w900,
                                fontSize: 16,
                              ),
                            ),
                          ),
                          if (selected)
                            const Icon(
                              Icons.check_circle_rounded,
                              color: SmartTaxiColors.success,
                            ),
                        ],
                      ),
                    ),
                  ),
                ),
              );
            }),
          ],
        ),
      ),
    );
  }
}

class _PaymentMethodSheet extends StatelessWidget {
  const _PaymentMethodSheet({required this.selected});

  final String selected;

  @override
  Widget build(BuildContext context) {
    const items = [
      ('CASH', 'Наличные', 'Оплата водителю после поездки'),
      ('KASPI', 'Kaspi', 'Перевод по договорённости с водителем'),
      ('CARD', 'Карта', 'Безналичная оплата, если доступна'),
    ];
    return SafeArea(
      child: Container(
        margin: const EdgeInsets.all(12),
        padding: const EdgeInsets.fromLTRB(18, 14, 18, 18),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(30),
          boxShadow: const [
            BoxShadow(
              color: Color(0x33141414),
              blurRadius: 28,
              offset: Offset(0, 14),
            ),
          ],
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const _SheetHandle(),
            const Text(
              'Способ оплаты',
              style: TextStyle(fontSize: 22, fontWeight: FontWeight.w900),
            ),
            const SizedBox(height: 12),
            ...items.map((item) {
              final active = item.$1 == selected;
              return Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: InkWell(
                  borderRadius: BorderRadius.circular(18),
                  onTap: () => Navigator.pop(context, item.$1),
                  child: Container(
                    constraints: const BoxConstraints(minHeight: 62),
                    padding: const EdgeInsets.symmetric(
                      horizontal: 14,
                      vertical: 10,
                    ),
                    decoration: BoxDecoration(
                      color:
                          active ? SmartTaxiColors.goldSurface : Colors.white,
                      border: Border.all(
                        color: active
                            ? SmartTaxiColors.borderStrong
                            : SmartTaxiColors.border,
                      ),
                      borderRadius: BorderRadius.circular(18),
                    ),
                    child: Row(
                      children: [
                        _PaymentIcon(method: item.$1),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                item.$2,
                                style: const TextStyle(
                                  fontSize: 16,
                                  fontWeight: FontWeight.w900,
                                ),
                              ),
                              const SizedBox(height: 3),
                              Text(
                                item.$3,
                                style: const TextStyle(
                                  color: SmartTaxiColors.textSecondary,
                                  fontSize: 12,
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                            ],
                          ),
                        ),
                        if (active)
                          const Icon(
                            Icons.check_circle_rounded,
                            color: SmartTaxiColors.goldDeep,
                          ),
                      ],
                    ),
                  ),
                ),
              );
            }),
          ],
        ),
      ),
    );
  }
}

class _NotificationsSheet extends StatelessWidget {
  const _NotificationsSheet();

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: Container(
        margin: const EdgeInsets.all(12),
        padding: const EdgeInsets.fromLTRB(20, 14, 20, 20),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(30),
          boxShadow: const [
            BoxShadow(
              color: Color(0x33141414),
              blurRadius: 28,
              offset: Offset(0, 14),
            ),
          ],
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const _SheetHandle(),
            Row(
              children: [
                Container(
                  width: 46,
                  height: 46,
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    color: SmartTaxiColors.goldSurface,
                    border: Border.all(color: SmartTaxiColors.borderStrong),
                    borderRadius: BorderRadius.circular(18),
                  ),
                  child: const Icon(
                    Icons.notifications_none_rounded,
                    color: SmartTaxiColors.goldDeep,
                  ),
                ),
                const SizedBox(width: 12),
                const Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Уведомления',
                        style: TextStyle(
                          fontSize: 22,
                          fontWeight: FontWeight.w900,
                        ),
                      ),
                      SizedBox(height: 3),
                      Text(
                        'Здесь появятся статусы поездок и важные сообщения.',
                        style: TextStyle(
                          color: SmartTaxiColors.textSecondary,
                          fontSize: 13,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 18),
            const _CompactNotice(
              icon: Icons.check_circle_outline_rounded,
              title: 'Новых уведомлений нет',
              text:
                  'Когда водитель примет заказ или поездка изменит статус, сообщение появится здесь.',
            ),
          ],
        ),
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
    final width = MediaQuery.sizeOf(context).width;
    final drawerWidth = (width * 0.84).clamp(304.0, 382.0).toDouble();
    return Drawer(
      width: drawerWidth,
      backgroundColor: SmartTaxiColors.appBackground,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.horizontal(right: Radius.circular(32)),
      ),
      child: SafeArea(
        child: Column(
          children: [
            Container(
              margin: const EdgeInsets.fromLTRB(14, 14, 14, 10),
              width: double.infinity,
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 16),
              decoration: BoxDecoration(
                color: Colors.white,
                border: Border.all(color: SmartTaxiColors.border),
                borderRadius: BorderRadius.circular(26),
                boxShadow: const [
                  BoxShadow(
                    color: Color(0x10785a14),
                    blurRadius: 24,
                    offset: Offset(0, 10),
                  ),
                ],
              ),
              child: Row(
                children: [
                  Container(
                    width: 56,
                    height: 56,
                    alignment: Alignment.center,
                    decoration: BoxDecoration(
                      color: SmartTaxiColors.goldSurface,
                      border: Border.all(color: SmartTaxiColors.borderStrong),
                      borderRadius: BorderRadius.circular(22),
                    ),
                    child: const BrandLogo(),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        RichText(
                          text: const TextSpan(
                            style: TextStyle(
                              fontSize: 20,
                              fontWeight: FontWeight.w900,
                            ),
                            children: [
                              TextSpan(
                                text: 'Smart',
                                style: TextStyle(color: SmartTaxiColors.text),
                              ),
                              TextSpan(
                                text: 'Taxi',
                                style:
                                    TextStyle(color: SmartTaxiColors.goldDeep),
                              ),
                            ],
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
                        const SizedBox(height: 4),
                        Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 9,
                            vertical: 5,
                          ),
                          decoration: BoxDecoration(
                            color: SmartTaxiColors.goldSurface,
                            borderRadius: BorderRadius.circular(999),
                          ),
                          child: const Text(
                            'Региональное такси',
                            style: TextStyle(
                              color: SmartTaxiColors.goldDeep,
                              fontSize: 11,
                              fontWeight: FontWeight.w900,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 2),
            Expanded(
              child: ListView(
                padding: EdgeInsets.zero,
                children: [
                  _DrawerItem(
                    icon: Icons.map_rounded,
                    label: 'Главная',
                    active: active == PassengerTab.home,
                    onTap: () => onSelect(PassengerTab.home),
                  ),
                  _DrawerItem(
                    icon: Icons.route_rounded,
                    label: 'Мои поездки',
                    active: active == PassengerTab.trips,
                    onTap: () => onSelect(PassengerTab.trips),
                  ),
                  _DrawerItem(
                    icon: Icons.person_outline_rounded,
                    label: 'Профиль',
                    active: active == PassengerTab.profile,
                    onTap: () => onSelect(PassengerTab.profile),
                  ),
                  _DrawerItem(
                    icon: Icons.badge_outlined,
                    label: driverLabel,
                    active: active == PassengerTab.driverApplication,
                    onTap: onDriver,
                  ),
                  const _DrawerDivider(),
                  _DrawerItem(
                    icon: Icons.support_agent_rounded,
                    label: 'Поддержка',
                    active: active == PassengerTab.support,
                    onTap: () => onSelect(PassengerTab.support),
                  ),
                  _DrawerItem(
                    icon: Icons.help_outline_rounded,
                    label: 'FAQ',
                    active: active == PassengerTab.faq,
                    onTap: () => onSelect(PassengerTab.faq),
                  ),
                  _DrawerItem(
                    icon: Icons.info_outline_rounded,
                    label: 'О нас',
                    active: active == PassengerTab.about,
                    onTap: () => onSelect(PassengerTab.about),
                  ),
                  _DrawerItem(
                    icon: Icons.tune_rounded,
                    label: 'Настройки',
                    active: active == PassengerTab.settings,
                    onTap: () => onSelect(PassengerTab.settings),
                  ),
                ],
              ),
            ),
            _DrawerItem(
              icon: Icons.logout_rounded,
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
    required this.icon,
    required this.label,
    required this.active,
    required this.onTap,
    this.danger = false,
  });

  final IconData icon;
  final String label;
  final bool active;
  final bool danger;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final tone = danger
        ? SmartTaxiColors.danger
        : active
            ? SmartTaxiColors.text
            : SmartTaxiColors.textSecondary;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 3),
      child: Material(
        color: active ? Colors.white : Colors.transparent,
        borderRadius: BorderRadius.circular(20),
        child: InkWell(
          borderRadius: BorderRadius.circular(18),
          onTap: onTap,
          child: Container(
            constraints: const BoxConstraints(minHeight: 54),
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            decoration: BoxDecoration(
              color: active ? Colors.white : Colors.transparent,
              border: Border.all(
                color: active ? SmartTaxiColors.border : Colors.transparent,
              ),
              borderRadius: BorderRadius.circular(18),
              boxShadow: active
                  ? const [
                      BoxShadow(
                        color: Color(0x0f141414),
                        blurRadius: 18,
                        offset: Offset(0, 8),
                      ),
                    ]
                  : null,
            ),
            child: Row(
              children: [
                Container(
                  width: 40,
                  height: 40,
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    color: danger
                        ? const Color(0xfffff1f1)
                        : active
                            ? SmartTaxiColors.gold
                            : SmartTaxiColors.goldSurface,
                    borderRadius: BorderRadius.circular(15),
                  ),
                  child: Icon(
                    icon,
                    size: 20,
                    color: active && !danger ? Colors.white : tone,
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Text(
                    label,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(color: tone, fontWeight: FontWeight.w900),
                  ),
                ),
                if (active)
                  const Icon(
                    Icons.chevron_right_rounded,
                    color: SmartTaxiColors.goldDeep,
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _DrawerDivider extends StatelessWidget {
  const _DrawerDivider();

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 8),
      child: Container(height: 1, color: SmartTaxiColors.border),
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
  const _MapOverlayHeader({
    required this.onMenu,
    required this.onNotifications,
    required this.onRegionTap,
    required this.regionLabel,
  });

  final VoidCallback onMenu;
  final VoidCallback onNotifications;
  final VoidCallback onRegionTap;
  final String regionLabel;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 60,
      child: Stack(
        alignment: Alignment.center,
        children: [
          Align(
            alignment: Alignment.centerLeft,
            child: _MapChromeButton(
              icon: Icons.menu_rounded,
              label: 'Меню',
              onTap: onMenu,
            ),
          ),
          _MapBrandPill(
            regionLabel: regionLabel,
            onTap: onRegionTap,
          ),
          Align(
            alignment: Alignment.centerRight,
            child: _NotificationButton(onTap: onNotifications),
          ),
        ],
      ),
    );
  }
}

class _MapBrandPill extends StatelessWidget {
  const _MapBrandPill({required this.regionLabel, required this.onTap});

  final String regionLabel;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.transparent,
      child: InkWell(
        borderRadius: BorderRadius.circular(18),
        onTap: onTap,
        child: Ink(
          height: 54,
          padding: const EdgeInsets.fromLTRB(13, 7, 13, 7),
          decoration: BoxDecoration(
            color: Colors.white.withValues(alpha: 0.94),
            border: Border.all(color: SmartTaxiColors.border),
            borderRadius: BorderRadius.circular(18),
            boxShadow: const [
              BoxShadow(
                color: Color(0x1a141414),
                blurRadius: 18,
                offset: Offset(0, 8),
              ),
            ],
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              const BrandLogo(),
              const SizedBox(width: 8),
              Column(
                mainAxisAlignment: MainAxisAlignment.center,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  RichText(
                    text: const TextSpan(
                      style: TextStyle(
                        fontSize: 18,
                        fontWeight: FontWeight.w900,
                        letterSpacing: 0,
                      ),
                      children: [
                        TextSpan(
                          text: 'Smart',
                          style: TextStyle(color: SmartTaxiColors.text),
                        ),
                        TextSpan(
                          text: 'Taxi',
                          style: TextStyle(color: SmartTaxiColors.goldDeep),
                        ),
                      ],
                    ),
                  ),
                  Text(
                    regionLabel,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      color: SmartTaxiColors.textSecondary,
                      fontSize: 10,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                ],
              ),
              const SizedBox(width: 4),
              const Icon(
                Icons.keyboard_arrow_down_rounded,
                size: 18,
                color: SmartTaxiColors.goldDeep,
              ),
            ],
          ),
        ),
      ),
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
        color: Colors.transparent,
        borderRadius: BorderRadius.circular(18),
        child: InkWell(
          borderRadius: BorderRadius.circular(18),
          onTap: onTap,
          child: Container(
            width: 52,
            height: 52,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: Colors.white.withValues(alpha: 0.94),
              border: Border.all(color: SmartTaxiColors.border),
              borderRadius: BorderRadius.circular(18),
              boxShadow: const [
                BoxShadow(
                  color: Color(0x17141414),
                  blurRadius: 18,
                  offset: Offset(0, 8),
                ),
              ],
            ),
            child: Icon(icon, color: SmartTaxiColors.text, size: 28),
          ),
        ),
      ),
    );
  }
}

class _NotificationButton extends StatelessWidget {
  const _NotificationButton({required this.onTap});

  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Tooltip(
      message: 'Уведомления',
      child: Material(
        color: Colors.transparent,
        borderRadius: BorderRadius.circular(18),
        child: InkWell(
          borderRadius: BorderRadius.circular(18),
          onTap: onTap,
          child: SizedBox(
            width: 52,
            height: 52,
            child: Stack(
              alignment: Alignment.center,
              children: [
                Container(
                  width: 52,
                  height: 52,
                  decoration: BoxDecoration(
                    color: Colors.white.withValues(alpha: 0.94),
                    border: Border.all(color: SmartTaxiColors.border),
                    borderRadius: BorderRadius.circular(18),
                    boxShadow: const [
                      BoxShadow(
                        color: Color(0x17141414),
                        blurRadius: 18,
                        offset: Offset(0, 8),
                      ),
                    ],
                  ),
                ),
                const Icon(
                  Icons.notifications_none_rounded,
                  color: SmartTaxiColors.text,
                  size: 28,
                ),
                Positioned(
                  right: 9,
                  top: 9,
                  child: Container(
                    width: 8,
                    height: 8,
                    decoration: const BoxDecoration(
                      color: SmartTaxiColors.gold,
                      shape: BoxShape.circle,
                    ),
                  ),
                ),
              ],
            ),
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

class _SectionLabel extends StatelessWidget {
  const _SectionLabel({
    required this.title,
    required this.text,
    this.dark = false,
  });

  final String title;
  final String text;
  final bool dark;

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
                style: TextStyle(
                  color: dark ? Colors.white : SmartTaxiColors.text,
                  fontSize: 17,
                  fontWeight: FontWeight.w900,
                ),
              ),
              const SizedBox(height: 3),
              Text(
                text,
                style: TextStyle(
                  color: dark ? Colors.white60 : SmartTaxiColors.textSecondary,
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
        Text(text, maxLines: 1, overflow: TextOverflow.ellipsis),
      ],
    );
  }
}

class _GoldCtaButton extends StatelessWidget {
  const _GoldCtaButton({
    required this.enabled,
    required this.loading,
    required this.text,
    required this.onTap,
  });

  final bool enabled;
  final bool loading;
  final String text;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Opacity(
      opacity: enabled ? 1 : 0.52,
      child: DecoratedBox(
        decoration: BoxDecoration(
          gradient: const LinearGradient(
            colors: [
              Color(0xffffd96a),
              SmartTaxiColors.gold,
              Color(0xffcd9d2b)
            ],
          ),
          borderRadius: BorderRadius.circular(22),
          boxShadow: enabled
              ? const [
                  BoxShadow(
                    color: Color(0x55d4af37),
                    blurRadius: 26,
                    offset: Offset(0, 12),
                  ),
                ]
              : null,
        ),
        child: Material(
          color: Colors.transparent,
          borderRadius: BorderRadius.circular(22),
          child: InkWell(
            borderRadius: BorderRadius.circular(22),
            onTap: enabled ? onTap : null,
            child: SizedBox(
              height: 58,
              width: double.infinity,
              child: Center(
                child: loading
                    ? const _ButtonSpinner(text: 'Создаём заказ...')
                    : Text(
                        text,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 17,
                          fontWeight: FontWeight.w900,
                        ),
                      ),
              ),
            ),
          ),
        ),
      ),
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
    this.dark = false,
  });

  final IconData icon;
  final String title;
  final String text;
  final bool dark;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: dark
            ? Colors.white.withValues(alpha: 0.06)
            : SmartTaxiColors.goldSurface,
        border: Border.all(
          color: dark
              ? Colors.white.withValues(alpha: 0.08)
              : SmartTaxiColors.border,
        ),
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
              color: dark
                  ? SmartTaxiColors.gold.withValues(alpha: 0.16)
                  : Colors.white.withValues(alpha: 0.72),
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
                  style: TextStyle(
                    color: dark ? Colors.white : SmartTaxiColors.text,
                    fontWeight: FontWeight.w900,
                  ),
                ),
                const SizedBox(height: 3),
                Text(
                  text,
                  style: TextStyle(
                    color:
                        dark ? Colors.white70 : SmartTaxiColors.textSecondary,
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
  const _InlineMessage({
    required this.text,
    this.danger = false,
    this.dark = false,
  });

  final String text;
  final bool danger;
  final bool dark;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: dark
            ? (danger
                ? SmartTaxiColors.danger.withValues(alpha: 0.16)
                : Colors.white.withValues(alpha: 0.06))
            : (danger ? const Color(0xfffff1f1) : SmartTaxiColors.goldSurface),
        border: Border.all(
          color: dark
              ? (danger
                  ? SmartTaxiColors.danger.withValues(alpha: 0.30)
                  : Colors.white.withValues(alpha: 0.08))
              : (danger ? const Color(0xfffecaca) : SmartTaxiColors.border),
        ),
        borderRadius: BorderRadius.circular(16),
      ),
      child: Text(
        text,
        style: TextStyle(
          color: danger
              ? (dark ? const Color(0xffffb4b4) : SmartTaxiColors.danger)
              : (dark ? Colors.white70 : SmartTaxiColors.textSecondary),
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
        const SizedBox(width: 12),
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

class _SettingsGroup extends StatelessWidget {
  const _SettingsGroup({required this.title, required this.children});

  final String title;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    return _PremiumCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            title,
            style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w900),
          ),
          const SizedBox(height: 10),
          ...children,
        ],
      ),
    );
  }
}

class _SettingsRow extends StatelessWidget {
  const _SettingsRow({
    required this.title,
    required this.text,
    this.badge,
    this.danger = false,
    this.onTap,
  });

  final String title;
  final String text;
  final String? badge;
  final bool danger;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final titleColor = danger ? SmartTaxiColors.danger : SmartTaxiColors.text;
    return InkWell(
      borderRadius: BorderRadius.circular(16),
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 9),
        child: Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    style: TextStyle(
                      color: titleColor,
                      fontWeight: FontWeight.w900,
                    ),
                  ),
                  const SizedBox(height: 3),
                  Text(
                    text,
                    style: const TextStyle(
                      color: SmartTaxiColors.textSecondary,
                      fontSize: 13,
                      height: 1.3,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ],
              ),
            ),
            if (badge != null) ...[
              const SizedBox(width: 10),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 6),
                decoration: BoxDecoration(
                  color: SmartTaxiColors.goldPale,
                  border: Border.all(color: SmartTaxiColors.borderStrong),
                  borderRadius: BorderRadius.circular(999),
                ),
                child: Text(
                  badge!,
                  style: const TextStyle(
                      fontSize: 11, fontWeight: FontWeight.w900),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _ProfileGroupLabel extends StatelessWidget {
  const _ProfileGroupLabel(this.text);

  final String text;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 4),
      child: Text(
        text,
        style: const TextStyle(
          color: SmartTaxiColors.textSecondary,
          fontSize: 12,
          fontWeight: FontWeight.w900,
        ),
      ),
    );
  }
}

class _MenuLine extends StatelessWidget {
  const _MenuLine({
    required this.icon,
    required this.title,
    required this.onTap,
    this.danger = false,
  });

  final IconData icon;
  final String title;
  final bool danger;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final tone = danger ? SmartTaxiColors.danger : SmartTaxiColors.text;
    return InkWell(
      borderRadius: BorderRadius.circular(18),
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 7),
        child: Row(
          children: [
            Container(
              width: 42,
              height: 42,
              alignment: Alignment.center,
              decoration: BoxDecoration(
                color: danger
                    ? const Color(0xfffff1f1)
                    : SmartTaxiColors.goldSurface,
                border: Border.all(
                  color:
                      danger ? const Color(0xfffecaca) : SmartTaxiColors.border,
                ),
                borderRadius: BorderRadius.circular(16),
              ),
              child: Icon(icon, color: tone, size: 20),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Text(
                title,
                style: TextStyle(color: tone, fontWeight: FontWeight.w900),
              ),
            ),
            Icon(
              Icons.chevron_right_rounded,
              color:
                  danger ? SmartTaxiColors.danger : SmartTaxiColors.textMuted,
            ),
          ],
        ),
      ),
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
  const _SheetHandle({this.dark = false});

  final bool dark;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Container(
        width: 44,
        height: 5,
        margin: const EdgeInsets.only(bottom: 16),
        decoration: BoxDecoration(
          color: dark
              ? Colors.white.withValues(alpha: 0.22)
              : SmartTaxiColors.borderStrong,
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
            child: FittedBox(
              fit: BoxFit.scaleDown,
              child: Text(
                labels[stepIndex],
                maxLines: 1,
                style:
                    const TextStyle(fontSize: 11, fontWeight: FontWeight.w800),
              ),
            ),
          ),
        );
      }),
    );
  }
}

enum PassengerTab {
  home,
  trips,
  profile,
  driverApplication,
  support,
  faq,
  about,
  settings
}

enum PointTarget { pickup, dropoff }

enum PointSource { none, gps, map, manual }

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
