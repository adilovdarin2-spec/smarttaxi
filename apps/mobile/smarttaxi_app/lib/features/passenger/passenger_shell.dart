import 'dart:async';
import 'dart:math' as math;
import 'dart:ui' show ImageFilter;

import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'package:geolocator/geolocator.dart';
import 'package:latlong2/latlong.dart';
import 'package:share_plus/share_plus.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/api/api_client.dart';
import '../../core/auth/auth_store.dart';
import '../../core/config/app_config.dart';
import '../../core/legal/legal_content.dart';
import '../../core/sockets/socket_service.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/app_toast.dart';
import '../../core/widgets/brand_logo.dart';
import '../../core/widgets/empty_state.dart';
import '../../core/widgets/exit_on_double_back.dart';
import '../../core/widgets/route_fields.dart';
import '../../core/widgets/status_pill.dart';
import '../../l10n/app_localizations.dart';
import '../driver/screens/onboarding/driver_application_documents_screen.dart';
import '../shared/models.dart';

const _tariffEconomyAsset = 'assets/cars/tariff_v11_economy.png';
const _tariffComfortAsset =
    'assets/cars/tariff_comfort_white_sedan_flutter.png';
const _tariffBusinessAsset =
    'assets/cars/tariff_business_white_premium_sedan_flutter.png';
const _tariffDeliveryAsset = 'assets/cars/tariff_v11_delivery.png';
const _driverCarMarkerAsset = 'assets/map/driver_car_topview_white.png';
// One consistent marker family app-wide (client, driver, tracking, share
// links, recurring bookings): a pulsing dot for "my location", one pin
// style while actively choosing an address (pickup or dropoff — same
// pin, the field label is what tells them apart), and a checkered-flag
// pin for a confirmed/selected address.
const _userLocationMarkerAsset = 'assets/map/marker_my_location_2026.png';
const _destinationMarkerAsset = 'assets/map/marker_destination_2026.png';
const _addressPickMarkerAsset = 'assets/map/marker_address_pick_2026.png';
const _addressPickMarkerColor = SmartTaxiColors.gold;
const _iconMenu = 'assets/icons/menu.svg';
const _iconBell = 'assets/icons/bell.svg';
const _iconChevronDown = 'assets/icons/chevron_down.svg';
const _iconChevronRight = 'assets/icons/chevron_right.svg';
const _iconBanknote = 'assets/icons/banknote.svg';
const _iconCreditCard = 'assets/icons/credit_card.svg';
const _iconCar = 'assets/icons/car.svg';
const _iconDelivery = 'assets/icons/delivery.svg';
const _atakentFallbackCenter = LatLng(40.84719, 68.503834);
const _appVersion = '1.0.0';

class PassengerShell extends StatefulWidget {
  const PassengerShell({
    super.key,
    required this.api,
    required this.authStore,
    required this.sockets,
    required this.accountLabel,
    required this.accountPhone,
    this.accountId = '',
    required this.onLogout,
    required this.onOpenDriverMode,
    required this.currentLocale,
    required this.onChangeLocale,
    this.themeMode = ThemeMode.light,
    this.onChangeThemeMode,
  });

  final ApiClient api;
  final AuthStore authStore;
  final SocketService sockets;
  final String accountLabel;
  final String accountPhone;
  final String accountId;
  final Future<void> Function() onLogout;
  final Future<bool> Function() onOpenDriverMode;
  final Locale? currentLocale;
  final ValueChanged<Locale> onChangeLocale;
  final ThemeMode themeMode;
  final ValueChanged<ThemeMode>? onChangeThemeMode;

  @override
  State<PassengerShell> createState() => _PassengerShellState();
}

class _PassengerShellState extends State<PassengerShell>
    with WidgetsBindingObserver {
  final _scaffoldKey = GlobalKey<ScaffoldState>();
  final _supportController = TextEditingController();
  final _exitGuard = ExitOnDoubleBack();
  PassengerTab _tab = PassengerTab.home;
  PointTarget _target = PointTarget.pickup;
  bool _loading = false;
  bool _previewLoading = false;
  bool _locationLoading = false;
  bool _mapTilesUnavailable = false;
  bool _startupRegionPromptShown = false;
  bool _locationServiceDisabled = false;
  bool _locationPermissionDeniedForever = false;
  bool _locationBlockDismissed = false;
  bool _startupLocationPromptShown = false;
  bool _skipNextLocationIntro = false;
  bool _mapPointPickerActive = false;
  bool _sheetMinimized = false;
  int _mapTileErrorCount = 0;
  String? _error;
  List<RegionOption> _regions = const [];
  RegionOption? _selectedRegion;
  List<TariffOption> _tariffs = const [];
  String? _tariffId;
  Map<String, RoutePreview> _tariffEstimates = const {};
  // "Своя цена": null means the rider hasn't touched the stepper yet, so the
  // server-calculated estimate is used as-is.
  int? _offeredPriceKzt;
  final _promoController = TextEditingController();
  String? _appliedPromoCode;
  int _promoDiscountKzt = 0;
  bool _promoApplying = false;
  String? _promoError;
  // Standalone "check a code" tool on the Промокоды screen — separate from
  // the order-flow promo state above, since this screen lets a rider check
  // a code before they've picked a route/tariff at all.
  final _promoCheckController = TextEditingController();
  bool _promoCheckLoading = false;
  String? _promoCheckError;
  ({String code, int discountAmountKzt, int finalPriceKzt})?
      _promoCheckResult;
  String? _sosPhone;
  String? _supportPhone;
  List<AddressSuggestion> _recentAddresses = const [];
  List<NearbyDriver> _nearbyDrivers = const [];
  List<OrderSummary> _tripHistory = const [];
  bool _tripHistoryLoading = false;
  bool _tripHistoryError = false;
  List<RecurringBooking> _recurringBookings = const [];
  bool _recurringBookingsLoading = false;
  bool _recurringBookingsError = false;
  bool _creatingRecurringBooking = false;
  final Set<String> _recurringBookingStatusUpdating = {};
  List<FavoriteAddress> _favoriteAddresses = const [];
  bool _favoriteAddressesLoading = false;
  bool _favoriteAddressesError = false;
  bool _creatingFavoriteAddress = false;
  final Set<String> _favoriteAddressDeleting = {};
  List<DriverPreference> _driverPreferences = const [];
  bool _driverPreferencesLoading = false;
  bool _driverPreferencesError = false;
  bool _settingDriverPreference = false;
  final Set<String> _driverPreferenceRemoving = {};
  Timer? _mapPickerReverseDebounce;
  Coordinate? _pickup;
  Coordinate? _dropoff;
  String _pickupLabel = 'Выберите точку подачи';
  String _dropoffLabel = 'Введите адрес назначения';
  PointSource _pickupSource = PointSource.none;
  PointSource _dropoffSource = PointSource.none;
  RoutePreview? _preview;
  // Holds whichever live driver leg is active — route to pickup before the
  // trip starts, route to dropoff once the rider is on board. The name is
  // kept for a smaller diff; RoutePreview.phase says which one it actually
  // is, and the UI reads that instead of assuming pickup.
  RoutePreview? _driverPickupRoute;
  String? _driverRouteError;
  DateTime? _lastDriverRouteFetchAt;
  int _driverRouteRequestId = 0;
  OrderSummary? _order;
  DriverLocation? _driverLocation;
  DateTime? _tripStartedAt;
  // False when _tripStartedAt was seeded from an order that was already
  // TRIP_STARTED/IN_PROGRESS the first time we saw it this session (e.g. the
  // app was killed mid-trip and just resumed) — we have no idea how long it
  // had actually been running, so the elapsed counter shouldn't confidently
  // claim "just started" in that case.
  bool _tripElapsedReliable = true;
  Timer? _tripElapsedTimer;
  // ValueNotifier instead of a plain field + setState: the ticking "N мин в
  // пути" text is the only thing that needs to update every 30s, and routing
  // it through a listener avoids rebuilding the entire passenger shell (map,
  // sheets, everything) on a timer while a trip is active.
  final ValueNotifier<Duration> _tripElapsed = ValueNotifier(Duration.zero);
  int _ratingStars = 0;
  final Set<String> _ratingTags = {};
  final _ratingCommentController = TextEditingController();
  bool _ratingSubmitting = false;
  bool _ratingJustSubmitted = false;
  bool _receiptAcknowledged = false;
  bool _noDriversFound = false;
  Timer? _noDriversTimer;
  PaymentInfo? _payment;
  Timer? _paymentPollTimer;
  String? _paymentInitiatedForOrderId;
  int _paymentPollAttempts = 0;
  bool _paymentTimedOut = false;
  LatLng? _mapCenter;
  String _activeRegionLabel = 'Атакент';
  String _driverFullName = '';
  String _driverPhone = '';
  String _driverCarModel = '';
  String _driverCarColor = '';
  String _driverPlate = '';
  String _driverYear = '';
  String _driverComment = '';
  bool _driverTermsAccepted = false;
  String? _driverApplicationMessage;
  String _supportTopic = 'Проблема с поездкой';
  String? _supportMessage;
  bool _supportMessageDanger = false;
  bool _supportSending = false;
  // Which trip a "Забыл вещь" report is about — the backend only notifies
  // the driver when an orderId is attached, so this needs its own explicit
  // pick rather than silently falling back to whatever _order happens to be.
  String? _lostItemOrderId;
  List<SupportMessage> _mySupportMessages = const [];
  bool _supportHistoryLoading = false;
  bool _supportHistoryError = false;
  String _paymentMethod = 'CASH';
  Timer? _nearbyDriversTimer;
  StreamSubscription<bool>? _socketConnectionSub;
  Timer? _socketFallbackPollTimer;
  int _nearbyDriversRequest = 0;
  int _mapPickerReverseRequest = 0;
  String _mapPickerAddressLabel = 'Точка на карте';
  bool _mapPickerAddressLoading = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _bootstrap();
    unawaited(_restoreDriverApplicationStatus());
  }

  Future<void> _restoreDriverApplicationStatus() async {
    final submitted = await widget.authStore.readDriverApplicationSubmitted();
    if (!submitted || !mounted) return;
    setState(
      () => _driverApplicationMessage ??=
          'Заявка отправлена. Администратор проверит данные.',
    );
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _supportController.dispose();
    _promoController.dispose();
    _promoCheckController.dispose();
    _nearbyDriversTimer?.cancel();
    _noDriversTimer?.cancel();
    _paymentPollTimer?.cancel();
    _mapPickerReverseDebounce?.cancel();
    _tripElapsedTimer?.cancel();
    _tripElapsed.dispose();
    _ratingCommentController.dispose();
    _socketConnectionSub?.cancel();
    _socketFallbackPollTimer?.cancel();
    widget.sockets.clearListeners();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    // The only way out of a permanently-denied/service-disabled location
    // block is the OS Settings app, which suspends us — re-check as soon as
    // the user comes back instead of leaving them stuck on the block screen.
    if (state == AppLifecycleState.resumed &&
        (_locationServiceDisabled || _locationPermissionDeniedForever) &&
        _pickup == null) {
      unawaited(_usePhoneLocation());
    }
  }

  Future<void> _bootstrap() async {
    try {
      await widget.sockets.connect();
      widget.sockets.onOrderUpdate(_handleOrderUpdate);
      widget.sockets.onDriverLocation(_handleDriverLocation);
      _socketConnectionSub =
          widget.sockets.connectionChanges.listen(_handleSocketConnectionChange);
    } catch (_) {
      if (mounted) {
        setState(() {
          _error =
              'Сервер временно недоступен. Можно выбрать маршрут, когда подключение восстановится.';
        });
      }
    }
    await _loadRegions();
    _startNearbyDriverPolling();
    unawaited(_loadServiceContacts());
    unawaited(_loadMySupportMessages());
    unawaited(_restoreActiveOrder());
    unawaited(_loadTripHistory());
  }

  // While the socket is down (network blip, backgrounded app, server
  // restart), order status and driver-location pushes stop arriving —
  // fall back to polling REST so an active trip doesn't look frozen.
  void _handleSocketConnectionChange(bool connected) {
    if (connected) {
      _socketFallbackPollTimer?.cancel();
      _socketFallbackPollTimer = null;
      return;
    }
    _socketFallbackPollTimer ??= Timer.periodic(
      const Duration(seconds: 6),
      (_) => unawaited(_pollActiveOrderFallback()),
    );
  }

  Future<void> _pollActiveOrderFallback() async {
    if (!mounted || _order == null) return;
    try {
      final order = await widget.api.getMyActiveOrder();
      if (!mounted || order == null || order.id != _order!.id) return;
      _applyOrderSnapshot(order);
    } catch (_) {
      // Keep retrying on the next tick — a hiccup here shouldn't surface an
      // error while the socket itself is already down.
    }
  }

  Future<void> _loadTripHistory() async {
    if (!mounted) return;
    setState(() {
      _tripHistoryLoading = true;
      _tripHistoryError = false;
    });
    try {
      final history = await widget.api.getMyOrderHistory();
      if (!mounted) return;
      setState(() => _tripHistory = history);
    } catch (_) {
      // Best-effort at bootstrap time (history isn't a blocker for
      // ordering), but the Trips tab still needs to tell a failed refresh
      // apart from "no trips yet" — see _tripHistoryError below.
      if (mounted) setState(() => _tripHistoryError = true);
    } finally {
      if (mounted) setState(() => _tripHistoryLoading = false);
    }
  }

  Future<void> _loadRecurringBookings() async {
    if (!mounted) return;
    setState(() {
      _recurringBookingsLoading = true;
      _recurringBookingsError = false;
    });
    try {
      final bookings = await widget.api.getMyRecurringBookings();
      if (!mounted) return;
      setState(() => _recurringBookings = bookings);
    } catch (_) {
      if (mounted) setState(() => _recurringBookingsError = true);
    } finally {
      if (mounted) setState(() => _recurringBookingsLoading = false);
    }
  }

  Future<void> _createRecurringBooking({
    required String driverId,
    required String pickupText,
    required Coordinate pickupCoordinate,
    required String dropoffText,
    required Coordinate dropoffCoordinate,
    required List<int> daysOfWeek,
    required String timeOfDay,
    required int priceKzt,
    String notes = '',
  }) async {
    if (_creatingRecurringBooking) return;
    setState(() => _creatingRecurringBooking = true);
    try {
      final booking = await widget.api.createRecurringBooking(
        driverId: driverId,
        pickupText: pickupText,
        pickupCoordinate: pickupCoordinate,
        dropoffText: dropoffText,
        dropoffCoordinate: dropoffCoordinate,
        daysOfWeek: daysOfWeek,
        timeOfDay: timeOfDay,
        priceKzt: priceKzt,
        notes: notes,
      );
      if (!mounted) return;
      setState(() => _recurringBookings = [booking, ..._recurringBookings]);
      if (mounted) Navigator.of(context).pop();
      AppToast.showSuccess(
        context,
        'Заявка отправлена водителю, ждём подтверждения',
      );
    } catch (error) {
      if (!mounted) return;
      AppToast.showError(context, _readableError(error));
    } finally {
      if (mounted) setState(() => _creatingRecurringBooking = false);
    }
  }

  Future<void> _updateRecurringBookingStatus(
    RecurringBooking booking,
    String status,
  ) async {
    if (_recurringBookingStatusUpdating.contains(booking.id)) return;
    setState(() => _recurringBookingStatusUpdating.add(booking.id));
    try {
      final updated = await widget.api.updateRecurringBookingStatus(
        id: booking.id,
        status: status,
      );
      if (!mounted) return;
      setState(() {
        _recurringBookings = _recurringBookings
            .map((item) => item.id == updated.id ? updated : item)
            .toList();
      });
      AppToast.showSuccess(
        context,
        status == 'CANCELLED'
            ? 'Регулярная поездка отменена'
            : status == 'PAUSED'
                ? 'Регулярная поездка приостановлена'
                : 'Регулярная поездка возобновлена',
      );
    } catch (error) {
      if (!mounted) return;
      AppToast.showError(context, _readableError(error));
    } finally {
      if (mounted) {
        setState(() => _recurringBookingStatusUpdating.remove(booking.id));
      }
    }
  }

  Future<void> _loadFavoriteAddresses() async {
    if (!mounted) return;
    setState(() {
      _favoriteAddressesLoading = true;
      _favoriteAddressesError = false;
    });
    try {
      final addresses = await widget.api.getFavoriteAddresses();
      if (!mounted) return;
      setState(() => _favoriteAddresses = addresses);
    } catch (_) {
      if (mounted) setState(() => _favoriteAddressesError = true);
    } finally {
      if (mounted) setState(() => _favoriteAddressesLoading = false);
    }
  }

  Future<void> _createFavoriteAddress({
    required String label,
    required String title,
    required String addressText,
    required Coordinate coordinate,
  }) async {
    if (_creatingFavoriteAddress) return;
    setState(() => _creatingFavoriteAddress = true);
    try {
      final address = await widget.api.createFavoriteAddress(
        label: label,
        title: title,
        addressText: addressText,
        lat: coordinate.lat,
        lng: coordinate.lng,
      );
      if (!mounted) return;
      setState(
          () => _favoriteAddresses = [address, ..._favoriteAddresses]);
      if (mounted) Navigator.of(context).pop();
      AppToast.showSuccess(context, 'Адрес добавлен в избранное');
    } catch (error) {
      if (!mounted) return;
      AppToast.showError(context, _readableError(error));
    } finally {
      if (mounted) setState(() => _creatingFavoriteAddress = false);
    }
  }

  Future<void> _deleteFavoriteAddress(FavoriteAddress address) async {
    if (_favoriteAddressDeleting.contains(address.id)) return;
    setState(() => _favoriteAddressDeleting.add(address.id));
    try {
      await widget.api.deleteFavoriteAddress(address.id);
      if (!mounted) return;
      setState(() => _favoriteAddresses =
          _favoriteAddresses.where((item) => item.id != address.id).toList());
      AppToast.showSuccess(context, 'Адрес удалён из избранного');
    } catch (error) {
      if (!mounted) return;
      AppToast.showError(context, _readableError(error));
    } finally {
      if (mounted) {
        setState(() => _favoriteAddressDeleting.remove(address.id));
      }
    }
  }

  Future<void> _loadDriverPreferences() async {
    if (!mounted) return;
    setState(() {
      _driverPreferencesLoading = true;
      _driverPreferencesError = false;
    });
    try {
      final preferences = await widget.api.getDriverPreferences();
      if (!mounted) return;
      setState(() => _driverPreferences = preferences);
    } catch (_) {
      if (mounted) setState(() => _driverPreferencesError = true);
    } finally {
      if (mounted) setState(() => _driverPreferencesLoading = false);
    }
  }

  Future<void> _setDriverPreference({
    required String driverId,
    required String type,
  }) async {
    if (_settingDriverPreference) return;
    setState(() => _settingDriverPreference = true);
    try {
      final preference = await widget.api.setDriverPreference(
        driverId: driverId,
        type: type,
      );
      if (!mounted) return;
      setState(() {
        _driverPreferences = [
          preference,
          ..._driverPreferences.where((item) => item.driverId != driverId),
        ];
      });
      if (mounted) Navigator.of(context).pop();
      AppToast.showSuccess(
        context,
        type == 'BLOCKED'
            ? 'Водитель заблокирован'
            : 'Водитель добавлен в избранное',
      );
    } catch (error) {
      if (!mounted) return;
      AppToast.showError(context, _readableError(error));
    } finally {
      if (mounted) setState(() => _settingDriverPreference = false);
    }
  }

  Future<void> _removeDriverPreference(DriverPreference preference) async {
    if (_driverPreferenceRemoving.contains(preference.driverId)) return;
    setState(() => _driverPreferenceRemoving.add(preference.driverId));
    try {
      await widget.api.removeDriverPreference(preference.driverId);
      if (!mounted) return;
      setState(() => _driverPreferences = _driverPreferences
          .where((item) => item.driverId != preference.driverId)
          .toList());
      AppToast.showSuccess(context, 'Запись удалена');
    } catch (error) {
      if (!mounted) return;
      AppToast.showError(context, _readableError(error));
    } finally {
      if (mounted) {
        setState(
            () => _driverPreferenceRemoving.remove(preference.driverId));
      }
    }
  }

  // Without this, killing the app mid-trip (OS memory pressure, a lock
  // screen timeout, a crash) and reopening SmartTaxi drops the rider back
  // on the empty home screen with no sign a driver is already en route —
  // so on every cold start, ask the backend if there's a trip in progress.
  Future<void> _restoreActiveOrder() async {
    if (_order != null) return;
    try {
      final order = await widget.api.getMyActiveOrder();
      if (order == null || !mounted || _order != null) return;
      widget.sockets.joinOrder(order.id);
      _applyOrderSnapshot(order);
      setState(() => _tab = PassengerTab.trips);
    } catch (_) {
      // Best-effort — the rider can still see the trip once the next
      // order_update/driver_location socket event arrives.
    }
  }

  Future<void> _loadMySupportMessages() async {
    if (!mounted) return;
    setState(() {
      _supportHistoryLoading = true;
      _supportHistoryError = false;
    });
    try {
      final messages = await widget.api.getMySupportMessages();
      if (!mounted) return;
      setState(() => _mySupportMessages = messages);
    } catch (_) {
      // The submit form still works without history, but a failed refresh
      // should say so instead of just leaving the list empty.
      if (mounted) setState(() => _supportHistoryError = true);
    } finally {
      if (mounted) setState(() => _supportHistoryLoading = false);
    }
  }

  Future<void> _loadServiceContacts() async {
    try {
      final contacts = await widget.api.getServiceContacts();
      if (!mounted) return;
      setState(() {
        if (contacts.sosPhone != null) _sosPhone = contacts.sosPhone;
        if (contacts.supportPhone != null) {
          _supportPhone = contacts.supportPhone;
        }
      });
    } catch (_) {
      // Best-effort — Safety sheet keeps its 112 fallback if this fails.
    }
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
        _activeRegionLabel = activeRegion?.name ?? 'Атакент';
      });
      _maybeAskLocationOnStart();
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _regions = const [];
        _selectedRegion = null;
        _mapCenter = _atakentFallbackCenter;
      });
      _maybeAskLocationOnStart();
    }
    unawaited(_refreshNearbyDrivers(silent: true));
  }

  void _startNearbyDriverPolling() {
    _nearbyDriversTimer?.cancel();
    _nearbyDriversTimer = Timer.periodic(
      const Duration(seconds: 22),
      (_) => unawaited(_refreshNearbyDrivers(silent: true)),
    );
  }

  void _startNoDriversTimer() {
    _noDriversTimer?.cancel();
    _noDriversTimer = Timer(const Duration(seconds: 25), () {
      if (!mounted) return;
      final status = _order?.status;
      final stillSearching =
          status != null && const {'SEARCHING_DRIVER', 'NEW'}.contains(status);
      if (stillSearching && _nearbyDrivers.isEmpty) {
        setState(() => _noDriversFound = true);
      }
    });
  }

  void _retryDriverSearch() {
    setState(() => _noDriversFound = false);
    _startNoDriversTimer();
    unawaited(_refreshNearbyDrivers(silent: true));
  }

  Coordinate? _nearbyDriversAnchor() {
    if (_order?.driverId != null) return null;
    if (_pickup != null) return _pickup;
    final regionCenter = _selectedRegion?.center;
    if (regionCenter != null) return regionCenter;
    final center = _mapCenter;
    if (center == null) return const Coordinate(lat: 40.84719, lng: 68.503834);
    return Coordinate(lat: center.latitude, lng: center.longitude);
  }

  Future<void> _refreshNearbyDrivers({bool silent = false}) async {
    final anchor = _nearbyDriversAnchor();
    if (anchor == null) {
      if (mounted && _nearbyDrivers.isNotEmpty) {
        setState(() => _nearbyDrivers = const []);
      }
      return;
    }
    final requestId = ++_nearbyDriversRequest;
    try {
      final drivers =
          await widget.api.getNearbyDrivers(location: anchor, limit: 5);
      if (!mounted || requestId != _nearbyDriversRequest) return;
      setState(() => _nearbyDrivers = drivers.take(5).toList(growable: false));
    } catch (_) {
      if (!mounted || requestId != _nearbyDriversRequest) return;
      if (!silent && _nearbyDrivers.isNotEmpty) {
        setState(() => _nearbyDrivers = const []);
      }
    }
  }

  Future<RegionOption?> _chooseRegion({
    bool askLocationAfter = false,
    bool resetRoute = true,
    String title = 'Выберите регион',
    String subtitle = 'Выберите регион, где хотите заказать такси.',
  }) async {
    if (_regions.isEmpty) {
      if (!mounted) return null;
      AppToast.showError(context, 'Активные регионы пока не загружены');
      return null;
    }
    final selected =
        _selectedRegion ?? (_regions.isNotEmpty ? _regions.first : null);
    if (selected == null || !mounted) return null;
    _applyRegion(selected, resetRoute: resetRoute);
    if (askLocationAfter) {
      _maybeAskLocationOnStart();
    }
    return selected;
  }

  void _applyRegion(
    RegionOption selected, {
    bool resetRoute = true,
    LatLng? center,
  }) {
    setState(() {
      _selectedRegion = selected;
      _activeRegionLabel = selected.name;
      _mapCenter = center ?? selected.center?.toLatLng() ?? _mapCenter;
      if (resetRoute) {
        _pickup = null;
        _dropoff = null;
        _pickupSource = PointSource.none;
        _dropoffSource = PointSource.none;
        _preview = null;
        _tariffEstimates = const {};
        _tariffId = null;
      }
      _error = null;
    });
    unawaited(_refreshNearbyDrivers(silent: true));
  }

  Future<_RegionConfirmAction?> _confirmDetectedRegion(RegionOption region) {
    return Future.value(_RegionConfirmAction.accept);
  }

  RegionOption? _regionForPoint(Coordinate point) {
    for (final region in _regions) {
      if (region.contains(point)) return region;
    }
    return null;
  }

  bool _shouldBlockPointByRegion(
    RegionOption? selectedRegion,
    Coordinate coordinate,
  ) {
    return selectedRegion != null &&
        coordinate.lat.isNaN &&
        coordinate.lng.isNaN;
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
        if (!mounted) return;
        if (approved != true) {
          await _useMapCenterAsPickup();
          return;
        }
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
    _applyOrderSnapshot(order);
  }

  void _applyOrderSnapshot(OrderSummary order) {
    final driverJustAssigned =
        _order?.driverId == null && order.driverId != null;
    const arrivedStatuses = {'DRIVER_ARRIVED', 'WAITING_CLIENT'};
    final driverJustArrived = !arrivedStatuses.contains(_order?.status) &&
        arrivedStatuses.contains(order.status);
    const inProgressStatuses = {'TRIP_STARTED', 'IN_PROGRESS'};
    final tripInProgress = inProgressStatuses.contains(order.status);
    final hadPreviousOrder = _order != null;
    final wasTripInProgress = inProgressStatuses.contains(_order?.status);
    setState(() {
      _order = order;
      if (order.driverId == null) {
        _driverLocation = null;
        _driverPickupRoute = null;
        _driverRouteError = null;
      } else {
        _nearbyDrivers = const [];
      }
      if (driverJustAssigned) {
        _noDriversFound = false;
        _noDriversTimer?.cancel();
      }
      if (tripInProgress && _tripStartedAt == null) {
        _tripStartedAt = DateTime.now();
        _tripElapsed.value = Duration.zero;
        _tripElapsedReliable = hadPreviousOrder && !wasTripInProgress;
      } else if (!tripInProgress) {
        _tripStartedAt = null;
        _tripElapsed.value = Duration.zero;
        _tripElapsedReliable = true;
      }
    });
    _tripElapsedTimer?.cancel();
    _tripElapsedTimer = tripInProgress
        ? Timer.periodic(const Duration(seconds: 30), (_) {
            if (!mounted || _tripStartedAt == null) return;
            _tripElapsed.value = DateTime.now().difference(_tripStartedAt!);
          })
        : null;
    if (driverJustAssigned) {
      unawaited(HapticFeedback.mediumImpact());
    }
    if (driverJustArrived) {
      unawaited(HapticFeedback.heavyImpact());
    }
    if (order.driverId != null) {
      // force: true even with no _driverLocation yet — the route response
      // itself seeds the driver marker (see _loadDriverRoute), which is what
      // makes a cold-start restore show the driver immediately instead of
      // waiting for their next GPS ping.
      _loadDriverRoute(order.id, force: true);
    } else {
      unawaited(_refreshNearbyDrivers(silent: true));
    }
    _maybeStartPaymentFlow(order);
  }

  // CASH/KASPI are settled directly between rider and driver and confirmed
  // by an operator (no electronic step to kick off). CARD is the one method
  // that goes through the payments module's provider abstraction, so it's
  // the only one that needs an automatic initiate + poll here.
  void _maybeStartPaymentFlow(OrderSummary order) {
    final awaitingPayment =
        const {'TRIP_COMPLETED', 'PAYMENT_PENDING'}.contains(order.status);
    if (!awaitingPayment || order.paymentMethod != 'CARD') return;
    if (_paymentInitiatedForOrderId == order.id) return;
    _paymentInitiatedForOrderId = order.id;
    unawaited(_initiatePayment(order.id));
  }

  void _applyPaymentResult(PaymentInfo payment) {
    setState(() {
      _payment = payment;
      final orderStatus = payment.orderStatus;
      if (orderStatus != null &&
          _order != null &&
          _order!.id == payment.orderId &&
          _order!.status != orderStatus) {
        _order = _order!.copyWith(status: orderStatus);
      }
    });
  }

  // At 3s per poll, 30 attempts is ~90s of "Обрабатываем оплату..." before
  // we stop pretending it'll resolve any second and offer a way out instead
  // of leaving the rider on an indefinite spinner if the provider webhook
  // never lands.
  static const _paymentPollTimeoutAttempts = 30;

  Future<void> _initiatePayment(String orderId) async {
    _paymentPollTimer?.cancel();
    _paymentPollAttempts = 0;
    if (mounted) setState(() => _paymentTimedOut = false);
    try {
      final payment = await widget.api.initiatePayment(orderId);
      if (!mounted) return;
      _applyPaymentResult(payment);
      if (payment.isProcessing) {
        _paymentPollTimer = Timer.periodic(
          const Duration(seconds: 3),
          (_) => unawaited(_pollPaymentStatus(orderId)),
        );
      }
    } catch (_) {
      if (!mounted) return;
      setState(() => _payment = const PaymentInfo(
            id: '',
            orderId: '',
            method: 'CARD',
            provider: 'KASPI_PAY',
            status: 'FAILED',
            failureReason: 'Не удалось начать оплату. Проверьте соединение.',
          ));
    }
  }

  Future<void> _pollPaymentStatus(String orderId) async {
    if (!mounted) return;
    try {
      final payment = await widget.api.getPaymentStatus(orderId);
      if (!mounted) return;
      _applyPaymentResult(payment);
      if (!payment.isProcessing) {
        _paymentPollTimer?.cancel();
        return;
      }
      _paymentPollAttempts += 1;
      if (_paymentPollAttempts >= _paymentPollTimeoutAttempts) {
        _paymentPollTimer?.cancel();
        setState(() => _paymentTimedOut = true);
      }
    } catch (_) {
      // Transient network hiccup while polling — keep the timer running and
      // try again on the next tick instead of surfacing a failure state for
      // what may just be a dropped request.
    }
  }

  void _retryPayment() {
    final order = _order;
    if (order == null) return;
    unawaited(_initiatePayment(order.id));
  }

  void _handleDriverLocation(dynamic data) {
    if (_order?.driverId == null || data is! Map) return;
    final payload = Map<String, dynamic>.from(data);
    final orderId = payload['orderId']?.toString();
    if (orderId != null && orderId.isNotEmpty && orderId != _order!.id) {
      return;
    }
    final next = DriverLocation.fromJson(payload);
    setState(
      () => _driverLocation = next.heading == null && _driverLocation != null
          ? DriverLocation(
              lat: next.lat,
              lng: next.lng,
              heading: _driverLocation!.heading,
            )
          : next,
    );
    _loadDriverRoute(_order!.id);
  }

  // Requests the most precise fix the device can give within a bounded
  // wait, instead of the previous plain getCurrentPosition() call, which had
  // no time limit and could leave "Моё местоположение" spinning forever on a
  // cold GPS start or weak signal (e.g. indoors). LocationAccuracy.best asks
  // for the tightest fix available (GPS chip, not just network/cell
  // triangulation); if that doesn't resolve within the deadline, a cached
  // last-known fix (if any and not stale) is a better outcome than an
  // indefinite spinner or a hard failure.
  Future<Coordinate> _getPreciseLocation() async {
    try {
      final position = await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(
          accuracy: LocationAccuracy.best,
          timeLimit: Duration(seconds: 12),
        ),
      );
      return Coordinate(lat: position.latitude, lng: position.longitude);
    } on TimeoutException {
      final last = await Geolocator.getLastKnownPosition();
      final fresh = last != null &&
          DateTime.now().difference(last.timestamp).inMinutes < 5;
      if (fresh) {
        return Coordinate(lat: last.latitude, lng: last.longitude);
      }
      rethrow;
    }
  }

  Future<void> _usePhoneLocation() async {
    setState(() {
      _error = null;
      _locationLoading = true;
    });
    try {
      final serviceEnabled =
          kIsWeb ? true : await Geolocator.isLocationServiceEnabled();
      if (!mounted) return;
      if (!serviceEnabled) {
        setState(() {
          _error =
              'Геолокация выключена. Включите её в настройках или выберите точку на карте.';
          _locationServiceDisabled = true;
          _locationBlockDismissed = false;
        });
        if (_selectedRegion == null) {
          await _chooseRegion(
            title: 'Выберите регион',
            subtitle: 'Выберите регион, где хотите заказать такси.',
          );
        }
        return;
      }
      if (_locationServiceDisabled) {
        setState(() => _locationServiceDisabled = false);
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
          if (_selectedRegion == null) {
            await _chooseRegion(
              title: 'Выберите регион',
              subtitle: 'Выберите регион, где хотите заказать такси.',
            );
          }
          return;
        }
        permission = await Geolocator.requestPermission();
      }
      if (permission == LocationPermission.denied ||
          permission == LocationPermission.deniedForever) {
        if (!mounted) return;
        setState(() {
          _error =
              'Геолокация не включена. Выберите точку подачи на карте вручную.';
          _locationPermissionDeniedForever =
              permission == LocationPermission.deniedForever;
          if (permission == LocationPermission.deniedForever) {
            _locationBlockDismissed = false;
          }
        });
        if (_selectedRegion == null) {
          await _chooseRegion(
            title: 'Выберите регион',
            subtitle: 'Выберите регион, где хотите заказать такси.',
          );
        }
        return;
      }
      if (_locationPermissionDeniedForever) {
        setState(() => _locationPermissionDeniedForever = false);
      }
      final point = await _getPreciseLocation();
      if (!mounted) return;
      final detectedRegion = _regionForPoint(point);
      if (!_startupRegionPromptShown &&
          detectedRegion != null &&
          _regions.length > 1) {
        _startupRegionPromptShown = true;
        final action = await _confirmDetectedRegion(detectedRegion);
        if (!mounted) return;
        if (action == _RegionConfirmAction.change) {
          final manualRegion = await _chooseRegion(
            resetRoute: true,
            title: 'Выберите регион',
            subtitle: 'Выберите регион, где хотите заказать такси.',
          );
          if (!mounted) return;
          if (manualRegion == null || !manualRegion.contains(point)) {
            setState(() {
              _target = PointTarget.pickup;
              _mapCenter = manualRegion?.center?.toLatLng() ??
                  _mapCenter ??
                  point.toLatLng();
              _error = null;
            });
            return;
          }
        } else {
          _applyRegion(
            detectedRegion,
            resetRoute: false,
            center: detectedRegion.center?.toLatLng() ?? point.toLatLng(),
          );
        }
      }
      final selectedRegion = _selectedRegion;
      if (selectedRegion != null && !selectedRegion.contains(point)) {
        final matchingRegion = _regionForPoint(point);
        if (matchingRegion != null) {
          _applyRegion(
            matchingRegion,
            resetRoute: false,
            center: matchingRegion.center?.toLatLng() ?? point.toLatLng(),
          );
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
      unawaited(_refreshNearbyDrivers(silent: true));
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
    final sheetAddresses = _recentAddresses.isNotEmpty
        ? _recentAddresses
        : _popularAddressesForRegion(
            _selectedRegion?.name ?? _activeRegionLabel,
          ).take(5).toList();
    final sheetAddressTitle =
        _recentAddresses.isNotEmpty ? 'Недавние адреса' : 'Популярные места';
    final selected = await showModalBottomSheet<_PointResult>(
      context: context,
      isScrollControlled: true,
      barrierColor: const Color(0xf6fffcf6),
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
      ),
      builder: (context) => _AddressSearchSheet(
        api: widget.api,
        region: _selectedRegion?.name,
        suggestedAddresses: sheetAddresses,
        suggestionTitle: sheetAddressTitle,
        mapCenter: _mapCenter ?? _selectedRegion?.center?.toLatLng(),
        title: target == PointTarget.pickup ? 'Откуда' : 'Куда',
        hint: 'Улица, дом или место',
      ),
    );
    if (selected == null) return;
    if (selected.action == _PointResultAction.openMapPicker) {
      if (!mounted) return;
      final center = _mapCenter ??
          _selectedRegion?.center?.toLatLng() ??
          _atakentFallbackCenter;
      setState(() {
        _target = target;
        _mapPointPickerActive = true;
        _mapCenter = center;
        _mapPickerAddressLabel = 'Определяем адрес...';
        _mapPickerAddressLoading = true;
        _error = null;
      });
      _scheduleMapPickerReverse(center, immediate: true);
      return;
    }
    final coordinate = selected.coordinate;
    if (coordinate == null) return;
    await _applyPoint(
      target,
      coordinate,
      selected.label,
      PointSource.manual,
    );
  }

  Future<void> _useMapCenterAsPickup() async {
    final point = _mapCenter ??
        _selectedRegion?.center?.toLatLng() ??
        _atakentFallbackCenter;
    await _applyMapTap(point);
  }

  Future<void> _confirmMapPointSelection() async {
    final point = _mapCenter ??
        _selectedRegion?.center?.toLatLng() ??
        _atakentFallbackCenter;
    final knownLabel = _mapPickerAddressLoading
        ? null
        : _mapPickerAddressLabel.trim().isEmpty
            ? null
            : _mapPickerAddressLabel.trim();
    if (mounted) {
      setState(() {
        _mapPointPickerActive = false;
        _mapPickerAddressLoading = false;
        _error = null;
      });
    }
    _mapPickerReverseDebounce?.cancel();
    await _applyMapTap(point, preferredLabel: knownLabel);
  }

  void _cancelMapPointSelection() {
    _mapPickerReverseDebounce?.cancel();
    setState(() {
      _mapPointPickerActive = false;
      _mapPickerAddressLoading = false;
    });
  }

  void _handleMapCenterChanged(LatLng point) {
    _mapCenter = point;
    if (!_mapPointPickerActive) return;
    _scheduleMapPickerReverse(point);
  }

  void _scheduleMapPickerReverse(LatLng point, {bool immediate = false}) {
    _mapPickerReverseDebounce?.cancel();
    if (!_mapPickerAddressLoading && mounted) {
      setState(() => _mapPickerAddressLoading = true);
    }
    final delay = immediate ? Duration.zero : const Duration(milliseconds: 340);
    _mapPickerReverseDebounce = Timer(
      delay,
      () => unawaited(_resolveMapPickerAddress(point)),
    );
  }

  Future<void> _resolveMapPickerAddress(LatLng point) async {
    final requestId = ++_mapPickerReverseRequest;
    final coordinate = Coordinate(lat: point.latitude, lng: point.longitude);
    var label = 'Точка на карте';
    final selectedRegion = _selectedRegion;
    if (_shouldBlockPointByRegion(selectedRegion, coordinate)) {
      label = 'Пока не работаем в этом районе';
    } else {
      try {
        final address = await widget.api.reverseAddress(coordinate);
        if (address != null && address.label.trim().isNotEmpty) {
          label = address.label.trim();
        }
      } catch (_) {}
    }
    if (!mounted ||
        !_mapPointPickerActive ||
        requestId != _mapPickerReverseRequest) {
      return;
    }
    setState(() {
      _mapPickerAddressLabel = label;
      _mapPickerAddressLoading = false;
    });
  }

  Future<void> _applyMapTap(LatLng point, {String? preferredLabel}) async {
    final target = _target;
    final coordinate = Coordinate(lat: point.latitude, lng: point.longitude);
    final selectedRegion = _selectedRegion;
    if (_shouldBlockPointByRegion(selectedRegion, coordinate)) {
      setState(() {
        _error =
            'Эта точка вне выбранного региона. Смените регион или выберите точку внутри зоны SmartTaxi.';
      });
      return;
    }
    var resolvedLabel = preferredLabel?.trim();
    if (resolvedLabel == null ||
        resolvedLabel.isEmpty ||
        resolvedLabel == 'Определяем адрес...') {
      resolvedLabel = 'Точка на карте';
      try {
        final address = await widget.api.reverseAddress(coordinate);
        if (address != null && address.label.trim().isNotEmpty) {
          resolvedLabel = address.label.trim();
        }
      } catch (_) {}
    }
    final label = resolvedLabel ?? 'Точка на карте';
    await _applyPoint(
      target,
      coordinate,
      label,
      PointSource.map,
    );
    if (mounted && _mapPointPickerActive) {
      setState(() => _mapPointPickerActive = false);
    }
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
    });
  }

  Future<void> _applyPoint(
    PointTarget target,
    Coordinate coordinate,
    String label,
    PointSource source,
  ) async {
    final selectedRegion = _selectedRegion;
    if (false &&
        selectedRegion != null &&
        !selectedRegion.contains(coordinate)) {
      if (!mounted) return;
      setState(() {
        _error =
            'Адрес вне выбранного региона. Выберите адрес внутри зоны SmartTaxi или смените регион.';
      });
      return;
    }
    final inferredPickupCenter = _mapCenter ??
        selectedRegion?.center?.toLatLng() ??
        _atakentFallbackCenter;
    final inferredPickup = target == PointTarget.dropoff && _pickup == null
        ? Coordinate(
            lat: inferredPickupCenter.latitude,
            lng: inferredPickupCenter.longitude,
          )
        : null;
    setState(() {
      if (inferredPickup != null) {
        _pickup = inferredPickup;
        _pickupLabel = 'Моё местоположение';
        _pickupSource = PointSource.map;
      }
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
      if (source != PointSource.gps && label.trim().isNotEmpty) {
        _recentAddresses = _mergeRecentAddress(
          _recentAddresses,
          AddressSuggestion(
            label: label.trim(),
            coordinate: coordinate,
            region: _selectedRegion?.name,
          ),
        );
      }
    });
    unawaited(_refreshNearbyDrivers(silent: true));
    await _refreshPreview();
  }

  void _swapPickupDropoff() {
    if (_dropoffSource == PointSource.none) return;
    setState(() {
      final swappedCoordinate = _pickup;
      final swappedLabel = _pickupLabel;
      final swappedSource = _pickupSource;
      _pickup = _dropoff;
      _pickupLabel = _dropoffLabel;
      _pickupSource = _dropoffSource;
      _dropoff = swappedCoordinate;
      _dropoffLabel = swappedLabel;
      _dropoffSource = swappedSource;
      _preview = null;
      _tariffEstimates = const {};
      _driverPickupRoute = null;
      _driverRouteError = null;
    });
    unawaited(HapticFeedback.selectionClick());
    unawaited(_refreshPreview());
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

  Future<void> _applyPromoCode() async {
    final code = _promoController.text.trim();
    if (code.isEmpty || _selectedRegion == null) return;
    final basePrice = (_offeredPriceKzt ?? _preview?.estimatedPrice?.round());
    if (basePrice == null) return;
    setState(() {
      _promoApplying = true;
      _promoError = null;
    });
    try {
      final result = await widget.api.validatePromoCode(
        code: code,
        regionId: _selectedRegion!.id,
        orderPriceKzt: basePrice,
      );
      if (!mounted) return;
      setState(() {
        _appliedPromoCode = result.code;
        _promoDiscountKzt = result.discountAmountKzt;
      });
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _appliedPromoCode = null;
        _promoDiscountKzt = 0;
        _promoError = _readableError(error);
      });
    } finally {
      if (mounted) setState(() => _promoApplying = false);
    }
  }

  void _clearPromoCode() {
    setState(() {
      _appliedPromoCode = null;
      _promoDiscountKzt = 0;
      _promoError = null;
      _promoController.clear();
    });
  }

  Future<void> _createOrder() async {
    if (widget.accountPhone.trim().isEmpty) {
      setState(() => _error = 'Для заказа войдите по номеру телефона.');
      return;
    }
    if (_pickup == null) {
      await _selectPoint(target: PointTarget.pickup);
      return;
    }
    if (_dropoff == null) {
      await _selectPoint(target: PointTarget.dropoff);
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
        riderName: widget.accountLabel,
        tariffId: _tariffId!,
        distanceKm: _preview!.distanceMeters / 1000,
        durationMin: _preview!.durationSeconds / 60,
        paymentMethod: _paymentMethod,
        offeredPriceKzt: _offeredPriceKzt,
        promoCode: _offeredPriceKzt == null ? _appliedPromoCode : null,
      );
      widget.sockets.joinOrder(order.id);
      _paymentPollTimer?.cancel();
      _paymentPollTimer = null;
      _paymentInitiatedForOrderId = null;
      _paymentPollAttempts = 0;
      setState(() {
        _order = order;
        _tab = PassengerTab.trips;
        _receiptAcknowledged = false;
        _payment = null;
        _paymentTimedOut = false;
        _offeredPriceKzt = null;
        _appliedPromoCode = null;
        _promoDiscountKzt = 0;
        _promoError = null;
      });
      _promoController.clear();
      _startNoDriversTimer();
    } catch (error) {
      setState(() => _error = _readableError(error));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _confirmCancelOrder() async {
    if (_order == null) return;
    final confirmed = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) =>
          _CancelConfirmSheet(driverAssigned: _order!.driverId != null),
    );
    if (confirmed == true) {
      await _cancelOrder();
    }
  }

  Future<void> _cancelOrder() async {
    if (_order == null) return;
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      await widget.api.cancelPublicOrder(
        _order!.id,
        riderPhone: widget.accountPhone,
      );
      _startNewPassengerTrip();
    } catch (error) {
      setState(() => _error = _readableError(error));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  bool _respondingToPriceOffer = false;

  Future<void> _respondToDriverPriceOffer(bool accept) async {
    final order = _order;
    if (order == null || _respondingToPriceOffer) return;
    setState(() => _respondingToPriceOffer = true);
    try {
      final updated = await widget.api.respondToDriverPriceOffer(
        orderId: order.id,
        accept: accept,
      );
      if (!mounted) return;
      setState(() => _order = updated);
      if (accept) {
        AppToast.showSuccess(
          context,
          'Вы согласились на новую цену: ${_formatTenge(updated.driverOfferPriceKzt?.toDouble() ?? updated.price ?? 0)}',
        );
      } else {
        AppToast.showInfo(context, 'Вы отклонили предложенную цену');
      }
    } catch (error) {
      if (!mounted) return;
      AppToast.showError(context, _readableError(error));
    } finally {
      if (mounted) setState(() => _respondingToPriceOffer = false);
    }
  }


  // Called both on every driver GPS ping (frequent — needs throttling so we
  // don't hammer the routing provider) and on order status changes (rare —
  // always fetch immediately, e.g. so the line switches from "to pickup" to
  // "to dropoff" the moment the trip starts, not up to 8s later).
  Future<void> _loadDriverRoute(String orderId, {bool force = false}) async {
    // Normally we wait for a live driver location (from the socket) before
    // asking for a route, since there'd be nothing to draw it from yet. The
    // one exception is a forced restore call (cold start, order just
    // switched legs) — the route response itself carries the driver's
    // current lat/lng, so it can seed the marker instead of waiting for the
    // next GPS ping, which may be minutes away if the driver hasn't moved.
    if (_driverLocation == null && !force) {
      setState(() {
        _driverPickupRoute = null;
        _driverRouteError = null;
      });
      return;
    }
    if (!force && _lastDriverRouteFetchAt != null) {
      final elapsed = DateTime.now().difference(_lastDriverRouteFetchAt!);
      if (elapsed.inSeconds < 8) return;
    }
    // Stamp the throttle window at request start, not completion — a slow
    // OSRM round-trip previously left the window "open" for its whole
    // duration, letting a second GPS ping sneak in a concurrent fetch.
    _lastDriverRouteFetchAt = DateTime.now();
    // Two fetches can end up in flight together (a force:true phase-change
    // call racing a throttled one). Only the response to the most recently
    // issued request should ever be applied, otherwise a slower, older
    // response can land after a newer one and paint a stale route/driver
    // position back onto the map.
    final requestId = ++_driverRouteRequestId;
    try {
      final route = await widget.api.driverToPickupRoute(orderId);
      if (requestId != _driverRouteRequestId) return;
      if (mounted) {
        setState(() {
          _driverPickupRoute = route;
          _driverRouteError = null;
          if (_driverLocation == null &&
              route.driverLat != null &&
              route.driverLng != null) {
            _driverLocation =
                DriverLocation(lat: route.driverLat!, lng: route.driverLng!);
          }
        });
      }
    } catch (error) {
      if (requestId != _driverRouteRequestId) return;
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
      if (!_driverTermsAccepted) {
        throw const FormatException('DRIVER_TERMS_REQUIRED');
      }
      final applicationId = await widget.api.submitDriverApplication(
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
      unawaited(widget.authStore.saveDriverApplicationSubmitted());
      if (mounted && applicationId.isNotEmpty) {
        unawaited(
          Navigator.of(context).push(
            MaterialPageRoute<void>(
              builder: (_) => DriverApplicationDocumentsScreen(
                api: widget.api,
                applicationId: applicationId,
              ),
            ),
          ),
        );
      }
    } catch (error) {
      setState(() => _error = _readableError(error));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  void _openDrawer() => _scaffoldKey.currentState?.openDrawer();

  @override
  Widget build(BuildContext context) {
    final showTopHeader = _tab != PassengerTab.home &&
        !(_tab == PassengerTab.trips && _order != null);
    // Every tab besides Home, and every step of the booking flow inside
    // Home (map-point picker, address/tariff sheet), is reached via local
    // state instead of a pushed route, so there is nothing on the Navigator
    // stack for the OS/gesture back action to pop. Walk back one step at a
    // time instead of exiting, and only offer to close the app once we're
    // truly at the root with nowhere left to go.
    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, result) {
        if (didPop) return;
        if (_mapPointPickerActive) {
          _cancelMapPointSelection();
          return;
        }
        if (_tab == PassengerTab.home && _dropoff != null) {
          _backToAddressSelection();
          return;
        }
        if (_tab != PassengerTab.home) {
          setState(() => _tab = PassengerTab.home);
          return;
        }
        _exitGuard.handle(context);
      },
      child: Scaffold(
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
            unawaited(_confirmAndLogout());
          },
        ),
        body: SafeArea(
          child: Column(
            children: [
              if (showTopHeader)
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
      ),
    );
  }

  Widget _currentScreen() {
    final builders = <PassengerTab, Widget Function()>{
      PassengerTab.home: _homeScreen,
      PassengerTab.trips: _tripsScreen,
      PassengerTab.profile: _profileScreen,
      PassengerTab.promoCodes: _promoCodesScreen,
      PassengerTab.notifications: _notificationsScreen,
      PassengerTab.driverApplication: _driverApplicationScreen,
      PassengerTab.support: _supportScreen,
      PassengerTab.faq: _faqScreen,
      PassengerTab.about: _aboutScreen,
      PassengerTab.legalHub: _legalHubScreen,
      PassengerTab.legalTerms: () => _legalDocumentScreen(legalDocuments[0]),
      PassengerTab.legalPrivacy: () => _legalDocumentScreen(legalDocuments[1]),
      PassengerTab.legalPayment: () => _legalDocumentScreen(legalDocuments[2]),
      PassengerTab.legalCancellation: () =>
          _legalDocumentScreen(legalDocuments[3]),
      PassengerTab.legalSafety: () => _legalDocumentScreen(legalDocuments[4]),
      PassengerTab.settings: _settingsScreen,
      PassengerTab.recurringBookings: _recurringBookingsScreen,
      PassengerTab.favoriteAddresses: _favoriteAddressesScreen,
      PassengerTab.driverPreferences: _driverPreferencesScreen,
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
    if (_pickup == null &&
        !_locationBlockDismissed &&
        (_locationServiceDisabled || _locationPermissionDeniedForever)) {
      return _LocationRequiredScreen(
        serviceDisabled: _locationServiceDisabled,
        onOpenSettings: () => _locationServiceDisabled
            ? Geolocator.openLocationSettings()
            : Geolocator.openAppSettings(),
        onPickManually: () => setState(() => _locationBlockDismissed = true),
      );
    }
    final screen = MediaQuery.sizeOf(context);
    final compact = screen.height < 720 || screen.width < 390;
    final geolocationNotice = _geolocationNotice;
    final routeComplete = _pickup != null && _dropoff != null;
    final pickingMapPoint = _mapPointPickerActive;
    final routeSummaryLabel = routeComplete && _preview != null
        ? '${_formatMinutes(_preview!)}  \u2022  ${_formatDistance(_preview!)}'
        : null;
    final sheetFraction = pickingMapPoint
        ? (compact ? 0.42 : 0.39)
        : routeComplete
            ? (compact ? 0.66 : 0.60)
            : (compact ? 0.50 : 0.46);
    final mapControlsBottom = screen.height * sheetFraction + 12;
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
            nearbyDrivers: _order?.driverId == null ? _nearbyDrivers : const [],
            route: mapRoute,
            permissionNotice: geolocationNotice,
            routeLoading: _previewLoading,
            routeError: mapRouteError,
            mapUnavailable: _mapTilesUnavailable,
            onTap: pickingMapPoint ? (_) {} : _applyMapTap,
            onCenterChanged: _handleMapCenterChanged,
            onTileError: _handleMapTileError,
            onUseLocation: _usePhoneLocation,
            onRetryMap: _retryMap,
            onMenu: _openDrawer,
            onNotifications: _openNotifications,
            routeSummaryLabel: routeSummaryLabel,
            onRouteBack: _backToAddressSelection,
            controlsBottom: mapControlsBottom,
            showLocationButton: !routeComplete,
            showCenterMarker: pickingMapPoint,
            activeTarget: _target,
          ),
        ),
        Align(
          alignment: Alignment.bottomCenter,
          child: _CollapsibleOrderSheet(
            minimized: _sheetMinimized,
            onMinimizedChanged: (value) =>
                setState(() => _sheetMinimized = value),
            maxHeight: screen.height * sheetFraction,
            child: pickingMapPoint
                ? _MapPointPickerSheet(
                    target: _target,
                    addressLabel: _mapPickerAddressLabel,
                    addressLoading: _mapPickerAddressLoading,
                    onCancel: _cancelMapPointSelection,
                    onConfirm: _confirmMapPointSelection,
                  )
                : _OrderSheet(
                    pickupSource: _pickupSource,
                    dropoffSource: _dropoffSource,
                    pickupLabel: _pickupSource == PointSource.none
                        ? 'Моё местоположение'
                        : _pickupLabel,
                    dropoffLabel: _dropoffSource == PointSource.none
                        ? 'Выберите пункт назначения'
                        : _dropoffLabel,
                    pickupActive: _target == PointTarget.pickup,
                    dropoffActive: _target == PointTarget.dropoff,
                    onSwap: _swapPickupDropoff,
                    locationLoading: _locationLoading,
                    paymentMethod: _paymentMethod,
                    paymentLabel: _paymentMethodLabel,
                    onPickupTap: () => _selectPoint(target: PointTarget.pickup),
                    onDropoffTap: () =>
                        _selectPoint(target: PointTarget.dropoff),
                    onUseLocation: _usePhoneLocation,
                    onPaymentTap: _choosePaymentMethod,
                    tariffs: _tariffs,
                    selectedTariffId: _tariffId,
                    preview: _preview,
                    tariffEstimates: _tariffEstimates,
                    offeredPriceKzt: _offeredPriceKzt,
                    onOfferedPriceChanged: (value) =>
                        setState(() => _offeredPriceKzt = value),
                    promoController: _promoController,
                    promoApplying: _promoApplying,
                    promoError: _promoError,
                    appliedPromoCode: _appliedPromoCode,
                    promoDiscountKzt: _promoDiscountKzt,
                    onApplyPromo: _applyPromoCode,
                    onClearPromo: _clearPromoCode,
                    loading: _loading,
                    previewLoading: _previewLoading,
                    error: _error,
                    onTariff: (id) async {
                      final cached = _tariffEstimates[id];
                      setState(() {
                        _tariffId = id;
                        _offeredPriceKzt = null;
                        _appliedPromoCode = null;
                        _promoDiscountKzt = 0;
                        _promoError = null;
                        if (cached != null) _preview = cached;
                      });
                      _promoController.clear();
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

  void _backToAddressSelection() {
    setState(() {
      _dropoff = null;
      _dropoffSource = PointSource.none;
      _preview = null;
      _tariffEstimates = const {};
      _tariffId = null;
      _target = PointTarget.dropoff;
      _error = null;
    });
  }

  String get _paymentMethodLabel {
    return _paymentLabel(_paymentMethod);
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
    setState(() => _tab = PassengerTab.notifications);
  }

  Future<void> _chooseLanguage() async {
    final current = widget.currentLocale?.languageCode ?? 'ru';
    final code = await showModalBottomSheet<String>(
      context: context,
      showDragHandle: true,
      builder: (sheetContext) {
        final l10n = AppLocalizations.of(sheetContext);
        return SafeArea(
          child: RadioGroup<String>(
            groupValue: current,
            onChanged: (value) => Navigator.pop(sheetContext, value),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                RadioListTile<String>(
                    value: 'ru', title: Text(l10n.languageRussian)),
                RadioListTile<String>(
                    value: 'kk', title: Text(l10n.languageKazakh)),
                const SizedBox(height: 8),
              ],
            ),
          ),
        );
      },
    );
    if (code == null || code == current) return;
    widget.onChangeLocale(Locale(code));
  }

  Future<void> _confirmAndLogout() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        backgroundColor: Colors.white,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(22)),
        title: const Text(
          'Выйти из аккаунта?',
          style: TextStyle(fontWeight: FontWeight.w900),
        ),
        content: const Text(
          'Придётся снова войти по номеру телефона, чтобы продолжить пользоваться SmartTaxi.',
          style: TextStyle(
            color: SmartTaxiColors.textSecondary,
            fontWeight: FontWeight.w600,
            height: 1.4,
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, false),
            child: const Text('Отмена'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, true),
            style: TextButton.styleFrom(foregroundColor: SmartTaxiColors.danger),
            child: const Text('Выйти', style: TextStyle(fontWeight: FontWeight.w900)),
          ),
        ],
      ),
    );
    if (confirmed == true) widget.onLogout();
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
    if (_pickup == null) return 'Выбрать точку подачи';
    if (_dropoff == null) return 'Выбрать адрес назначения';
    if (_tariffId == null) return 'Выберите тариф';
    if (_preview == null || _preview!.estimatedPrice == null) {
      return 'Рассчитать';
    }
    TariffOption? selectedTariff;
    for (final tariff in _tariffs) {
      if (tariff.id == _tariffId) {
        selectedTariff = tariff;
        break;
      }
    }
    final name = (selectedTariff?.name ?? '').toLowerCase();
    final label = name.contains('comfort') || name.contains('комфорт')
        ? 'Комфорт'
        : name.contains('delivery') || name.contains('достав')
            ? 'Доставка'
            : name.contains('econom') || name.contains('экон')
                ? 'Эконом'
                : selectedTariff?.name;
    if (label == 'Доставка') return 'Оформить доставку';
    return label == null ? 'Заказать' : 'Заказать $label';
  }

  Widget _tripsScreen() {
    if (_order == null) {
      final groups = _groupTripsByDay(_tripHistory);
      return RefreshIndicator(
        color: SmartTaxiColors.goldDeep,
        onRefresh: _loadTripHistory,
        child: ListView(
          padding: const EdgeInsets.all(20),
          physics: const AlwaysScrollableScrollPhysics(
            parent: BouncingScrollPhysics(),
          ),
          children: [
            const _TitleBlock(
              title: 'Мои поездки',
              text: 'Активный заказ, статус поездки и детали маршрута',
            ),
            const SizedBox(height: 16),
            if (_tripHistory.isEmpty) ...[
              EmptyState(
                icon: _tripHistoryError
                    ? Icons.wifi_off_rounded
                    : Icons.route_rounded,
                title: _tripHistoryLoading
                    ? 'Загружаем историю...'
                    : _tripHistoryError
                        ? 'Не удалось загрузить историю'
                        : 'Активной поездки нет',
                text: _tripHistoryError
                    ? 'Проверьте связь и потяните экран вниз, чтобы попробовать снова.'
                    : 'Создайте заказ, и SmartTaxi откроет статус поездки здесь.',
                action: _tripHistoryError ? null : 'На главную',
                onAction: _tripHistoryError
                    ? null
                    : () => setState(() => _tab = PassengerTab.home),
              ),
            ] else ...[
              for (final group in groups) ...[
                _ProfileGroupLabel(group.label),
                const SizedBox(height: 8),
                for (final trip in group.trips) ...[
                  _TripHistoryCard(
                    trip: trip,
                    onTap: () => _showTripDetails(trip),
                  ),
                  const SizedBox(height: 10),
                ],
                const SizedBox(height: 6),
              ],
            ],
          ],
        ),
      );
    }
    final order = _order!;
    final driverText = _order!.driverId == null
        ? 'Ищем водителя'
        : _driverLocation == null
            ? 'Ожидаем геолокацию водителя'
            : 'Водитель на связи';
    final driverRouteText = _driverPickupRoute == null
        ? null
        : _driverPickupMeta(_driverPickupRoute!);
    final route = _order!.driverId == null
        ? (_preview?.geometry ?? const <LatLng>[])
        : (_driverPickupRoute?.geometry ??
            _preview?.geometry ??
            const <LatLng>[]);
    final screen = MediaQuery.sizeOf(context);
    final compact = screen.height < 740 || screen.width < 390;
    final sheetFraction = compact ? 0.44 : 0.40;
    final routeMeta = driverRouteText ?? _orderRouteMeta(order);
    return Stack(
      children: [
        Positioned.fill(
          child: _MapCanvas(
            center: order.pickupCoordinate?.toLatLng() ??
                _pickup?.toLatLng() ??
                _mapCenter ??
                _atakentFallbackCenter,
            pickup: order.pickupCoordinate ?? _pickup,
            dropoff: order.dropoffCoordinate ?? _dropoff,
            driver: order.driverId == null ? null : _driverLocation,
            nearbyDrivers: order.driverId == null ? _nearbyDrivers : const [],
            route: route,
            permissionNotice: null,
            routeLoading: false,
            routeError: order.driverId == null ? null : _driverRouteError,
            mapUnavailable: _mapTilesUnavailable,
            onTap: (_) {},
            onCenterChanged: _handleMapCenterChanged,
            onTileError: _handleMapTileError,
            onUseLocation: _usePhoneLocation,
            onRetryMap: _retryMap,
            onMenu: _openDrawer,
            onNotifications: _openNotifications,
            routeSummaryLabel: routeMeta,
            onRouteBack: () => setState(() => _tab = PassengerTab.home),
            controlsBottom: screen.height * sheetFraction + 12,
            showLocationButton: false,
            showCenterMarker: false,
            activeTarget: PointTarget.dropoff,
          ),
        ),
        Align(
          alignment: Alignment.bottomCenter,
          child: ConstrainedBox(
            constraints:
                BoxConstraints(maxHeight: screen.height * sheetFraction),
            child: _TripStatusPanel(
              api: widget.api,
              order: order,
              statusText: _statusLabel(order.status),
              statusTone: _statusTone(order.status),
              driverText: driverText,
              driverRouteText: routeMeta,
              nearbyDriverCount:
                  order.driverId == null ? _nearbyDrivers.length : 0,
              loading: _loading,
              canCancel: _canCancelPassengerOrder(order.status),
              isTerminal: _isPassengerOrderTerminal(order.status),
              tripElapsedListenable: _tripElapsed,
              tripElapsedReliable: _tripElapsedReliable,
              ratingStars: _ratingStars,
              ratingTags: _ratingTags,
              ratingCommentController: _ratingCommentController,
              ratingSubmitting: _ratingSubmitting,
              ratingJustSubmitted: _ratingJustSubmitted,
              receiptAcknowledged: _receiptAcknowledged,
              noDriversFound: _noDriversFound,
              payment: _payment,
              paymentTimedOut: _paymentTimedOut,
              sosPhone: _sosPhone,
              error: _error,
              onRatingStarsChanged: (value) => setState(() {
                if ((_ratingStars >= 4) != (value >= 4)) {
                  _ratingTags.clear();
                }
                _ratingStars = value;
              }),
              onRatingTagToggle: _toggleRatingTag,
              onSubmitRating: _submitRating,
              onAcknowledgeReceipt: () =>
                  setState(() => _receiptAcknowledged = true),
              onRetrySearch: _retryDriverSearch,
              onRetryPayment: _retryPayment,
              onCancel: _confirmCancelOrder,
              onNewTrip: _startNewPassengerTrip,
              respondingToPriceOffer: _respondingToPriceOffer,
              onRespondToPriceOffer: _respondToDriverPriceOffer,
            ),
          ),
        ),
      ],
    );
  }

  void _showTripDetails(OrderSummary trip) {
    unawaited(
      Navigator.of(context).push(
        MaterialPageRoute<void>(
          builder: (_) => _TripDetailScreen(
            trip: trip,
            onContactSupport: () {
              Navigator.of(context).pop();
              setState(() => _tab = PassengerTab.support);
            },
          ),
        ),
      ),
    );
  }

  void _startNewPassengerTrip() {
    if (_order != null) widget.sockets.leaveOrder(_order!.id);
    _tripElapsedTimer?.cancel();
    _tripElapsedTimer = null;
    _tripElapsed.value = Duration.zero;
    _noDriversTimer?.cancel();
    _noDriversTimer = null;
    _paymentPollTimer?.cancel();
    _paymentPollTimer = null;
    _paymentInitiatedForOrderId = null;
    _paymentPollAttempts = 0;
    setState(() {
      _order = null;
      _driverLocation = null;
      _driverPickupRoute = null;
      _driverRouteError = null;
      _dropoff = null;
      _dropoffSource = PointSource.none;
      _preview = null;
      _tariffEstimates = const {};
      _target = PointTarget.dropoff;
      _tab = PassengerTab.home;
      _error = null;
      _tripStartedAt = null;
      _ratingStars = 0;
      _ratingTags.clear();
      _ratingSubmitting = false;
      _ratingJustSubmitted = false;
      _receiptAcknowledged = false;
      _noDriversFound = false;
      _payment = null;
      _paymentTimedOut = false;
    });
    _ratingCommentController.clear();
    unawaited(_refreshNearbyDrivers(silent: true));
    unawaited(_loadTripHistory());
  }

  Future<void> _submitRating() async {
    if (_order == null || _ratingStars == 0) return;
    setState(() {
      _ratingSubmitting = true;
      _error = null;
    });
    try {
      await widget.api.rateOrder(
        _order!.id,
        rating: _ratingStars,
        tags: _ratingTags.toList(),
        comment: _ratingCommentController.text.trim(),
      );
      if (!mounted) return;
      setState(() {
        _ratingSubmitting = false;
        _ratingJustSubmitted = true;
      });
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _ratingSubmitting = false;
        _error = _readableError(error);
      });
    }
  }

  void _toggleRatingTag(String tag) {
    setState(() {
      if (!_ratingTags.remove(tag)) _ratingTags.add(tag);
    });
  }

  bool _canCancelPassengerOrder(String status) {
    return const {
      'NEW',
      'SEARCHING_DRIVER',
      'DRIVER_FOUND',
      'DRIVER_ASSIGNED',
      'DRIVER_GOING_TO_CLIENT',
      'DRIVER_ARRIVED',
      'WAITING_CLIENT',
    }.contains(status);
  }

  bool _isPassengerOrderTerminal(String status) {
    return const {
      'COMPLETED',
      'TRIP_COMPLETED',
      'CANCELLED_BY_CLIENT',
      'CANCELLED_BY_DRIVER',
      'CANCELLED_BY_OPERATOR',
      'CANCELLED',
      'NO_SHOW',
      'PAYMENT_PENDING',
      'PAID',
      'RATED',
    }.contains(status);
  }

  String? _orderRouteMeta(OrderSummary order) {
    final distance = order.distanceKm;
    final duration = order.durationMin;
    if (distance == null && duration == null) return null;
    final parts = <String>[
      if (duration != null) '${duration.round()} мин',
      if (distance != null)
        '${distance.toStringAsFixed(1).replaceAll('.', ',')} км',
    ];
    return parts.join(' · ');
  }

  static const _profileCompletedStatuses = {'RATED', 'PAID', 'COMPLETED'};

  Widget _profileScreen() {
    final label =
        widget.accountLabel.isEmpty ? 'Пользователь' : widget.accountLabel;
    final completedTrips = _tripHistory
        .where((trip) => _profileCompletedStatuses.contains(trip.status))
        .toList(growable: false);
    final totalSpent = completedTrips.fold<double>(
      0,
      (sum, trip) => sum + (trip.price ?? 0),
    );
    final ratedTrips = completedTrips
        .where((trip) => trip.status == 'RATED')
        .toList(growable: false);
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
                    width: 56,
                    height: 56,
                    alignment: Alignment.center,
                    decoration: BoxDecoration(
                      gradient: const LinearGradient(
                        begin: Alignment.topLeft,
                        end: Alignment.bottomRight,
                        colors: [
                          SmartTaxiColors.gold,
                          SmartTaxiColors.goldDeep,
                        ],
                      ),
                      shape: BoxShape.circle,
                      boxShadow: [
                        BoxShadow(
                          color: SmartTaxiColors.gold.withValues(alpha: 0.32),
                          blurRadius: 16,
                          offset: const Offset(0, 8),
                        ),
                      ],
                    ),
                    child: Text(
                      label.isEmpty ? '?' : label.substring(0, 1).toUpperCase(),
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 22,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
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
                          style: const TextStyle(
                            fontSize: 19,
                            fontWeight: FontWeight.w900,
                          ),
                        ),
                        const SizedBox(height: 2),
                        const Text(
                          'Клиент SmartTaxi',
                          style: TextStyle(
                            color: SmartTaxiColors.textSecondary,
                            fontSize: 13,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 18),
              Row(
                children: [
                  Expanded(
                    child: _ProfileStatTile(
                      icon: Icons.route_rounded,
                      value: '${completedTrips.length}',
                      label: 'Поездок',
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: _ProfileStatTile(
                      icon: Icons.payments_rounded,
                      value: _formatTenge(totalSpent),
                      label: 'Потрачено',
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: _ProfileStatTile(
                      icon: Icons.star_rounded,
                      value: ratedTrips.isEmpty ? '—' : '${ratedTrips.length}',
                      label: 'С оценкой',
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 18),
              if (widget.accountId.trim().isNotEmpty) ...[
                _ProfileRow(
                  label: '№ аккаунта',
                  value: widget.accountId,
                  copyable: true,
                ),
                const SizedBox(height: 12),
              ],
              if (widget.accountPhone.trim().isNotEmpty)
                _ProfileRow(
                  label: 'Телефон',
                  value: widget.accountPhone,
                  copyable: true,
                ),
            ],
          ),
        ),
        const SizedBox(height: 14),
        const _ProfileGroupLabel('Быстрые действия'),
        const SizedBox(height: 8),
        _PremiumCard(
          child: Column(
            children: [
              _MenuLine(
                icon: Icons.history_rounded,
                title: 'Мои поездки',
                subtitle: 'История и статус текущей поездки',
                badge: completedTrips.isEmpty
                    ? null
                    : '${completedTrips.length}',
                onTap: () => setState(() => _tab = PassengerTab.trips),
              ),
              const Divider(height: 20),
              _MenuLine(
                icon: Icons.local_offer_outlined,
                title: 'Промокоды',
                subtitle: 'Проверить и применить скидку',
                onTap: () => setState(() => _tab = PassengerTab.promoCodes),
              ),
              const Divider(height: 20),
              _MenuLine(
                icon: Icons.notifications_outlined,
                title: 'Уведомления',
                subtitle: 'Статусы поездок и сообщения',
                onTap: () =>
                    setState(() => _tab = PassengerTab.notifications),
              ),
              const Divider(height: 20),
              _MenuLine(
                icon: Icons.headset_mic_outlined,
                title: 'Поддержка',
                subtitle: 'Напишите нам, если нужна помощь',
                onTap: () => setState(() => _tab = PassengerTab.support),
              ),
              const Divider(height: 20),
              _MenuLine(
                icon: Icons.event_repeat_rounded,
                title: 'Регулярные поездки',
                subtitle: 'Школьный маршрут и другие поездки по расписанию',
                onTap: () {
                  setState(() => _tab = PassengerTab.recurringBookings);
                  unawaited(_loadRecurringBookings());
                },
              ),
              const Divider(height: 20),
              _MenuLine(
                icon: Icons.star_outline_rounded,
                title: 'Избранные адреса',
                subtitle: 'Дом, работа и другие частые точки',
                onTap: () {
                  setState(() => _tab = PassengerTab.favoriteAddresses);
                  unawaited(_loadFavoriteAddresses());
                },
              ),
              const Divider(height: 20),
              _MenuLine(
                icon: Icons.people_alt_outlined,
                title: 'Водители',
                subtitle: 'Избранные и заблокированные водители',
                onTap: () {
                  setState(() => _tab = PassengerTab.driverPreferences);
                  unawaited(_loadDriverPreferences());
                },
              ),
              const Divider(height: 20),
              _MenuLine(
                icon: Icons.tune_rounded,
                title: 'Настройки',
                subtitle: 'Язык, разрешения, аккаунт',
                onTap: () => setState(() => _tab = PassengerTab.settings),
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
            onTap: () => unawaited(_confirmAndLogout()),
          ),
        ),
      ],
    );
  }

  static const _promoPreviewPriceKzt = 1000;

  Future<void> _checkPromoCode() async {
    final code = _promoCheckController.text.trim();
    final region = _selectedRegion;
    if (code.isEmpty) return;
    if (region == null) {
      setState(() {
        _promoCheckError = 'Сначала выберите регион на главном экране';
        _promoCheckResult = null;
      });
      return;
    }
    setState(() {
      _promoCheckLoading = true;
      _promoCheckError = null;
      _promoCheckResult = null;
    });
    try {
      final result = await widget.api.validatePromoCode(
        code: code,
        regionId: region.id,
        orderPriceKzt: _promoPreviewPriceKzt,
      );
      if (!mounted) return;
      setState(() => _promoCheckResult = result);
    } catch (error) {
      if (!mounted) return;
      setState(() => _promoCheckError = _readableError(error));
    } finally {
      if (mounted) setState(() => _promoCheckLoading = false);
    }
  }

  Widget _promoCodesScreen() {
    final result = _promoCheckResult;
    return ListView(
      padding: const EdgeInsets.all(20),
      children: [
        const _TitleBlock(
          title: 'Промокоды',
          text: 'Проверьте промокод и узнайте размер скидки',
        ),
        const SizedBox(height: 16),
        _PremiumCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Container(
                    width: 44,
                    height: 44,
                    alignment: Alignment.center,
                    decoration: BoxDecoration(
                      color: SmartTaxiColors.goldSurface,
                      borderRadius: BorderRadius.circular(14),
                    ),
                    child: const Icon(
                      Icons.confirmation_number_rounded,
                      color: SmartTaxiColors.goldDeep,
                      size: 22,
                    ),
                  ),
                  const SizedBox(width: 12),
                  const Expanded(
                    child: Text(
                      'Есть промокод?',
                      style:
                          TextStyle(fontSize: 16, fontWeight: FontWeight.w900),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 10),
              const Text(
                'Введите его, чтобы проверить, действует ли он в вашем регионе, и увидеть размер скидки.',
                style: TextStyle(
                  color: SmartTaxiColors.textSecondary,
                  fontSize: 12.5,
                  height: 1.4,
                  fontWeight: FontWeight.w600,
                ),
              ),
              const SizedBox(height: 14),
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(
                    child: TextField(
                      controller: _promoCheckController,
                      textCapitalization: TextCapitalization.characters,
                      decoration: const InputDecoration(
                        hintText: 'Например, SMART500',
                        prefixIcon: Icon(Icons.local_offer_outlined),
                      ),
                      onSubmitted: (_) => unawaited(_checkPromoCode()),
                    ),
                  ),
                  const SizedBox(width: 10),
                  SizedBox(
                    height: 56,
                    child: ElevatedButton(
                      onPressed: _promoCheckLoading
                          ? null
                          : () => unawaited(_checkPromoCode()),
                      child: _promoCheckLoading
                          ? const SizedBox.square(
                              dimension: 18,
                              child: CircularProgressIndicator(
                                strokeWidth: 2.2,
                                color: Colors.white,
                              ),
                            )
                          : const Text('Проверить'),
                    ),
                  ),
                ],
              ),
              if (_promoCheckError != null) ...[
                const SizedBox(height: 12),
                Text(
                  _promoCheckError!,
                  style: const TextStyle(
                    color: SmartTaxiColors.danger,
                    fontSize: 12.5,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ],
              if (result != null) ...[
                const SizedBox(height: 14),
                Container(
                  padding: const EdgeInsets.all(14),
                  decoration: BoxDecoration(
                    color: SmartTaxiColors.successSoft,
                    borderRadius: BorderRadius.circular(16),
                    border: Border.all(color: SmartTaxiColors.success),
                  ),
                  child: Row(
                    children: [
                      Container(
                        width: 40,
                        height: 40,
                        alignment: Alignment.center,
                        decoration: BoxDecoration(
                          color: Colors.white,
                          borderRadius: BorderRadius.circular(13),
                        ),
                        child: const Icon(Icons.check_circle_rounded,
                            color: SmartTaxiColors.success, size: 24),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              'Промокод «${result.code}» действует',
                              style: const TextStyle(
                                fontSize: 13.5,
                                fontWeight: FontWeight.w900,
                              ),
                            ),
                            const SizedBox(height: 2),
                            Text(
                              'Скидка ${_formatTenge(result.discountAmountKzt)} · например, на поездке за ${_formatTenge(_promoPreviewPriceKzt)} вы заплатите ${_formatTenge(result.finalPriceKzt)}',
                              style: const TextStyle(
                                color: SmartTaxiColors.textSecondary,
                                fontSize: 12,
                                height: 1.35,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ],
          ),
        ),
        const SizedBox(height: 14),
        const _PremiumCard(
          child: _CompactNotice(
            icon: Icons.info_outline_rounded,
            title: 'Как применить скидку',
            text:
                'Промокод из этой проверки нужно будет ещё раз ввести на шаге выбора тарифа — тогда скидка сразу пересчитает итоговую цену вашей реальной поездки.',
          ),
        ),
      ],
    );
  }

  Widget _notificationsScreen() {
    return _NotificationsScreen(api: widget.api);
  }

  Widget _driverApplicationScreen() {
    final submitted = _driverApplicationMessage != null;
    return ListView(
      padding: const EdgeInsets.all(20),
      children: [
        const _TitleBlock(
          title: 'Стать водителем',
          text: 'Зарабатывайте на своём авто в удобном графике',
        ),
        const SizedBox(height: 16),
        _PremiumCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: const [
              _DriverStepRow(
                number: '1',
                title: 'Заполните заявку',
                text: 'Имя, телефон и данные автомобиля — это займёт минуту',
              ),
              SizedBox(height: 12),
              _DriverStepRow(
                number: '2',
                title: 'Дождитесь проверки',
                text: 'Администратор рассматривает заявки обычно за 1–2 дня',
              ),
              SizedBox(height: 12),
              _DriverStepRow(
                number: '3',
                title: 'Выходите на линию',
                text: 'После одобрения сразу доступны заказы в вашем регионе',
              ),
            ],
          ),
        ),
        const SizedBox(height: 14),
        if (submitted) ...[
          _PremiumCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Container(
                  width: 56,
                  height: 56,
                  alignment: Alignment.center,
                  decoration: const BoxDecoration(
                    color: SmartTaxiColors.successSoft,
                    shape: BoxShape.circle,
                  ),
                  child: const Icon(Icons.check_circle_rounded,
                      color: SmartTaxiColors.success, size: 30),
                ),
                const SizedBox(height: 14),
                const Text(
                  'Заявка отправлена',
                  style: TextStyle(fontSize: 18, fontWeight: FontWeight.w900),
                ),
                const SizedBox(height: 6),
                Text(
                  _driverApplicationMessage!,
                  style: const TextStyle(
                    color: SmartTaxiColors.textSecondary,
                    fontWeight: FontWeight.w600,
                    height: 1.4,
                  ),
                ),
                const SizedBox(height: 14),
                Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 12,
                    vertical: 10,
                  ),
                  decoration: BoxDecoration(
                    color: SmartTaxiColors.goldSurface,
                    borderRadius: BorderRadius.circular(14),
                  ),
                  child: const Row(
                    children: [
                      Icon(Icons.headset_mic_outlined,
                          size: 16, color: SmartTaxiColors.goldDeep),
                      SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          'Есть вопрос по заявке — напишите в поддержку.',
                          style: TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.w700,
                            color: SmartTaxiColors.text,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ] else ...[
          const _ProfileGroupLabel('Личные данные'),
          const SizedBox(height: 8),
          _PremiumCard(
            child: Column(
              children: [
                _ApplicationField(
                  label: 'Имя и фамилия',
                  icon: Icons.badge_outlined,
                  onChanged: (value) => _driverFullName = value,
                ),
                const SizedBox(height: 12),
                _ApplicationField(
                  label: 'Телефон',
                  icon: Icons.phone_outlined,
                  initialValue: _driverPhone.isEmpty
                      ? widget.accountPhone
                      : _driverPhone,
                  onChanged: (value) => _driverPhone = value,
                ),
              ],
            ),
          ),
          const SizedBox(height: 14),
          const _ProfileGroupLabel('Автомобиль'),
          const SizedBox(height: 8),
          _PremiumCard(
            child: Column(
              children: [
                _ApplicationField(
                  label: 'Марка и модель авто',
                  icon: Icons.directions_car_outlined,
                  onChanged: (value) => _driverCarModel = value,
                ),
                const SizedBox(height: 12),
                _ApplicationField(
                  label: 'Цвет авто',
                  icon: Icons.palette_outlined,
                  onChanged: (value) => _driverCarColor = value,
                ),
                const SizedBox(height: 12),
                _ApplicationField(
                  label: 'Госномер',
                  icon: Icons.pin_outlined,
                  onChanged: (value) => _driverPlate = value,
                ),
                const SizedBox(height: 12),
                _ApplicationField(
                  label: 'Год выпуска',
                  icon: Icons.event_outlined,
                  keyboardType: TextInputType.number,
                  onChanged: (value) => _driverYear = value,
                ),
                const SizedBox(height: 12),
                _ApplicationField(
                  label: 'Комментарий (необязательно)',
                  icon: Icons.edit_note_rounded,
                  onChanged: (value) => _driverComment = value,
                ),
              ],
            ),
          ),
          const SizedBox(height: 14),
          _PremiumCard(
            child: InkWell(
              borderRadius: BorderRadius.circular(16),
              onTap: () => setState(
                () => _driverTermsAccepted = !_driverTermsAccepted,
              ),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Checkbox(
                    value: _driverTermsAccepted,
                    onChanged: (value) => setState(
                      () => _driverTermsAccepted = value ?? false,
                    ),
                  ),
                  Expanded(
                    child: Padding(
                      padding: const EdgeInsets.only(top: 14),
                      child: RichText(
                        text: TextSpan(
                          style: const TextStyle(
                            color: SmartTaxiColors.text,
                            fontSize: 13,
                            height: 1.35,
                            fontWeight: FontWeight.w600,
                          ),
                          children: [
                            const TextSpan(text: 'Я согласен с '),
                            TextSpan(
                              text: 'Условиями использования',
                              style: const TextStyle(
                                color: SmartTaxiColors.goldDeep,
                                fontWeight: FontWeight.w800,
                              ),
                              recognizer: TapGestureRecognizer()
                                ..onTap = () => setState(
                                      () => _tab = PassengerTab.legalTerms,
                                    ),
                            ),
                            const TextSpan(text: ' и '),
                            TextSpan(
                              text: 'Правилами безопасности',
                              style: const TextStyle(
                                color: SmartTaxiColors.goldDeep,
                                fontWeight: FontWeight.w800,
                              ),
                              recognizer: TapGestureRecognizer()
                                ..onTap = () => setState(
                                      () => _tab = PassengerTab.legalSafety,
                                    ),
                            ),
                            const TextSpan(text: ' SmartTaxi.'),
                          ],
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
          if (_error != null) ...[
            const SizedBox(height: 14),
            _InlineMessage(text: _error!, danger: true),
          ],
          const SizedBox(height: 14),
          _GoldCtaButton(
            enabled: !_loading,
            loading: _loading,
            text: 'Отправить заявку',
            loadingText: 'Отправляем...',
            onTap: _submitDriverApplication,
          ),
        ],
      ],
    );
  }

  Future<void> _callSupportPhone(String phone) async {
    try {
      final launched = await launchUrl(Uri(scheme: 'tel', path: phone));
      if (launched || !mounted) return;
      AppToast.showError(context, 'Не удалось открыть набор номера');
    } catch (_) {
      if (!mounted) return;
      AppToast.showError(context, 'Не удалось открыть набор номера');
    }
  }

  Widget _supportScreen() {
    const topics = [
      'Проблема с поездкой',
      'Водитель не приехал',
      'Забыл вещь',
      'Оплата',
      'Другое',
    ];
    // Regions don't carry their own support number today, so the
    // service-wide one from /api/regions/service-settings is the primary
    // source — a per-region override still wins if one is ever added.
    final supportPhone =
        (_selectedRegion?.supportPhone ?? _supportPhone ?? '').trim();
    return RefreshIndicator(
      color: SmartTaxiColors.goldDeep,
      onRefresh: _loadMySupportMessages,
      child: ListView(
      padding: const EdgeInsets.all(20),
      physics: const AlwaysScrollableScrollPhysics(
        parent: BouncingScrollPhysics(),
      ),
      children: [
        const _TitleBlock(
          title: 'Поддержка',
          text: 'Опишите проблему, мы поможем',
        ),
        const SizedBox(height: 16),
        if (supportPhone.isNotEmpty) ...[
          _PremiumCard(
            child: Row(
              children: [
                Container(
                  width: 44,
                  height: 44,
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    color: SmartTaxiColors.goldSurface,
                    border: Border.all(color: SmartTaxiColors.border),
                    borderRadius: BorderRadius.circular(16),
                  ),
                  child: const Icon(
                    Icons.call_rounded,
                    color: SmartTaxiColors.goldDeep,
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text(
                        'Срочный вопрос?',
                        style: TextStyle(fontWeight: FontWeight.w900),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        'Позвоните напрямую: $supportPhone',
                        style: const TextStyle(
                          color: SmartTaxiColors.textSecondary,
                          fontSize: 12.5,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 10),
                ElevatedButton(
                  onPressed: () => unawaited(_callSupportPhone(supportPhone)),
                  style: ElevatedButton.styleFrom(
                    minimumSize: const Size(0, 44),
                    padding: const EdgeInsets.symmetric(horizontal: 16),
                  ),
                  child: const Text('Позвонить'),
                ),
              ],
            ),
          ),
          const SizedBox(height: 14),
        ],
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
              if (_supportTopic == 'Забыл вещь') ...[
                const SizedBox(height: 14),
                _LostItemOrderPicker(
                  activeOrder: _order,
                  tripHistory: _tripHistory,
                  selectedOrderId: _lostItemOrderId,
                  onChanged: (id) => setState(() => _lostItemOrderId = id),
                ),
              ],
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
                _InlineMessage(
                  text: _supportMessage!,
                  danger: _supportMessageDanger,
                ),
              ],
              const SizedBox(height: 16),
              _GoldCtaButton(
                enabled: !_supportSending,
                loading: _supportSending,
                text: 'Отправить',
                loadingText: 'Отправляем...',
                onTap: () async {
                  final text = _supportController.text.trim();
                  if (text.length < 8) {
                    setState(() {
                      _supportMessageDanger = true;
                      _supportMessage =
                          'Опишите проблему подробнее: минимум 8 символов.';
                    });
                    return;
                  }
                  final isLostItem = _supportTopic == 'Забыл вещь';
                  if (isLostItem && _lostItemOrderId == null) {
                    setState(() {
                      _supportMessageDanger = true;
                      _supportMessage =
                          'Укажите поездку, в которой оставили вещь — иначе водителя не получится уведомить.';
                    });
                    return;
                  }
                  setState(() => _supportSending = true);
                  try {
                    await widget.api.submitSupportMessage(
                      // The backend matches this literal string (not the
                      // Russian label) to trigger a push straight to the
                      // trip's driver — see support.routes.js.
                      topic: isLostItem ? 'LOST_ITEM' : _supportTopic,
                      message: text,
                      orderId: isLostItem ? _lostItemOrderId : _order?.id,
                    );
                    if (!mounted) return;
                    _supportController.clear();
                    setState(() {
                      _supportMessageDanger = false;
                      _lostItemOrderId = null;
                      _supportMessage = isLostItem
                          ? 'Обращение отправлено, водитель уведомлён.'
                          : 'Обращение отправлено. Мы ответим здесь и, если нужно, позвоним.';
                    });
                    unawaited(_loadMySupportMessages());
                  } catch (error) {
                    if (!mounted) return;
                    setState(() {
                      _supportMessageDanger = true;
                      _supportMessage = _readableError(error);
                    });
                  } finally {
                    if (mounted) setState(() => _supportSending = false);
                  }
                },
              ),
            ],
          ),
        ),
        if (_mySupportMessages.isNotEmpty) ...[
          const SizedBox(height: 14),
          const _ProfileGroupLabel('Ваши обращения'),
          const SizedBox(height: 8),
          for (final item in _mySupportMessages) ...[
            _SupportHistoryCard(item: item),
            const SizedBox(height: 10),
          ],
        ] else if (_supportHistoryLoading) ...[
          const SizedBox(height: 14),
          const Center(
            child: Padding(
              padding: EdgeInsets.all(12),
              child: CircularProgressIndicator(strokeWidth: 2.4),
            ),
          ),
        ] else if (_supportHistoryError) ...[
          const SizedBox(height: 14),
          _PremiumCard(
            child: _CompactNotice(
              icon: Icons.wifi_off_rounded,
              title: 'Не удалось загрузить обращения',
              text: 'Потяните экран вниз, чтобы попробовать снова.',
            ),
          ),
        ],
      ],
      ),
    );
  }

  List<(String id, String name)> get _knownDriversFromHistory {
    final seen = <String>{};
    final result = <(String, String)>[];
    for (final trip in _tripHistory) {
      final id = trip.driverId;
      final name = trip.driverName;
      if (id == null || id.isEmpty || name == null || name.isEmpty) continue;
      if (seen.add(id)) result.add((id, name));
    }
    return result;
  }

  Future<void> _openCreateRecurringBookingSheet() async {
    if (_tripHistory.isEmpty && !_tripHistoryLoading) {
      unawaited(_loadTripHistory());
    }
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => _CreateRecurringBookingSheet(
        api: widget.api,
        knownDrivers: _knownDriversFromHistory,
        submitting: _creatingRecurringBooking,
        onSubmit: _createRecurringBooking,
      ),
    );
  }

  Widget _recurringBookingsScreen() {
    return RefreshIndicator(
      color: SmartTaxiColors.goldDeep,
      onRefresh: _loadRecurringBookings,
      child: ListView(
        padding: const EdgeInsets.all(20),
        physics: const AlwaysScrollableScrollPhysics(
          parent: BouncingScrollPhysics(),
        ),
        children: [
          const _TitleBlock(
            title: 'Регулярные поездки',
            text: 'Школьный маршрут и другие поездки по расписанию',
          ),
          const SizedBox(height: 16),
          _GoldCtaButton(
            enabled: !_creatingRecurringBooking,
            loading: false,
            text: 'Новый маршрут',
            onTap: _openCreateRecurringBookingSheet,
          ),
          const SizedBox(height: 16),
          if (_recurringBookingsLoading && _recurringBookings.isEmpty)
            const Center(
              child: Padding(
                padding: EdgeInsets.all(24),
                child: CircularProgressIndicator(strokeWidth: 2.4),
              ),
            )
          else if (_recurringBookingsError && _recurringBookings.isEmpty)
            EmptyState(
              icon: Icons.wifi_off_rounded,
              title: 'Не удалось загрузить',
              text: 'Потяните экран вниз, чтобы попробовать снова.',
              action: 'Повторить',
              onAction: () => unawaited(_loadRecurringBookings()),
            )
          else if (_recurringBookings.isEmpty)
            const EmptyState(
              icon: Icons.event_repeat_rounded,
              title: 'Пока нет регулярных поездок',
              text:
                  'Создайте маршрут — например, отвозить ребёнка в школу — и водитель будет приезжать по расписанию в выбранные дни.',
            )
          else
            ..._recurringBookings.map(
              (booking) => Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: _RecurringBookingCard(
                  booking: booking,
                  updating:
                      _recurringBookingStatusUpdating.contains(booking.id),
                  onPause: () =>
                      _updateRecurringBookingStatus(booking, 'PAUSED'),
                  onResume: () =>
                      _updateRecurringBookingStatus(booking, 'ACTIVE'),
                  onCancel: () => _confirmCancelRecurringBooking(booking),
                ),
              ),
            ),
        ],
      ),
    );
  }

  Future<void> _confirmCancelRecurringBooking(RecurringBooking booking) async {
    final confirmed = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => _ConfirmSheet(
        title: 'Отменить регулярную поездку?',
        text:
            '${booking.pickupText} → ${booking.dropoffText}, ${booking.daysLabel} в ${booking.timeOfDay}. Это действие нельзя отменить.',
        confirmLabel: 'Отменить поездку',
        danger: true,
      ),
    );
    if (confirmed == true) {
      await _updateRecurringBookingStatus(booking, 'CANCELLED');
    }
  }

  Future<void> _openAddFavoriteAddressSheet() async {
    final picked = await showModalBottomSheet<AddressSuggestion>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => _SimpleAddressSearchSheet(
        api: widget.api,
        title: 'Какой адрес добавить?',
      ),
    );
    if (picked == null || !mounted) return;
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => _CreateFavoriteAddressSheet(
        suggestion: picked,
        submitting: _creatingFavoriteAddress,
        onSubmit: (label, title) => _createFavoriteAddress(
          label: label,
          title: title,
          addressText: picked.label,
          coordinate: picked.coordinate,
        ),
      ),
    );
  }

  Future<void> _confirmDeleteFavoriteAddress(FavoriteAddress address) async {
    final confirmed = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => _ConfirmSheet(
        title: 'Удалить адрес из избранного?',
        text: '${address.title} — ${address.addressText}.',
        confirmLabel: 'Удалить',
        danger: true,
      ),
    );
    if (confirmed == true) {
      await _deleteFavoriteAddress(address);
    }
  }

  Widget _favoriteAddressesScreen() {
    return RefreshIndicator(
      color: SmartTaxiColors.goldDeep,
      onRefresh: _loadFavoriteAddresses,
      child: ListView(
        padding: const EdgeInsets.all(20),
        physics: const AlwaysScrollableScrollPhysics(
          parent: BouncingScrollPhysics(),
        ),
        children: [
          const _TitleBlock(
            title: 'Избранные адреса',
            text: 'Дом, работа и другие частые точки — быстрее вводить заказ',
          ),
          const SizedBox(height: 16),
          _GoldCtaButton(
            enabled: !_creatingFavoriteAddress,
            loading: false,
            text: 'Добавить адрес',
            onTap: _openAddFavoriteAddressSheet,
          ),
          const SizedBox(height: 16),
          if (_favoriteAddressesLoading && _favoriteAddresses.isEmpty)
            const Center(
              child: Padding(
                padding: EdgeInsets.all(24),
                child: CircularProgressIndicator(strokeWidth: 2.4),
              ),
            )
          else if (_favoriteAddressesError && _favoriteAddresses.isEmpty)
            EmptyState(
              icon: Icons.wifi_off_rounded,
              title: 'Не удалось загрузить',
              text: 'Потяните экран вниз, чтобы попробовать снова.',
              action: 'Повторить',
              onAction: () => unawaited(_loadFavoriteAddresses()),
            )
          else if (_favoriteAddresses.isEmpty)
            const EmptyState(
              icon: Icons.star_outline_rounded,
              title: 'Пока нет избранных адресов',
              text:
                  'Добавьте дом, работу или любое место, куда часто ездите — они появятся здесь для быстрого доступа.',
            )
          else
            ..._favoriteAddresses.map(
              (address) => Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: _FavoriteAddressCard(
                  address: address,
                  deleting: _favoriteAddressDeleting.contains(address.id),
                  onDelete: () => _confirmDeleteFavoriteAddress(address),
                ),
              ),
            ),
        ],
      ),
    );
  }

  Future<void> _openAddDriverPreferenceSheet() async {
    if (_tripHistory.isEmpty && !_tripHistoryLoading) {
      unawaited(_loadTripHistory());
    }
    final knownIds = _driverPreferences.map((p) => p.driverId).toSet();
    final candidates = _knownDriversFromHistory
        .where((driver) => !knownIds.contains(driver.$1))
        .toList(growable: false);
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => _AddDriverPreferenceSheet(
        candidates: candidates,
        submitting: _settingDriverPreference,
        onSubmit: (driverId, type) =>
            _setDriverPreference(driverId: driverId, type: type),
      ),
    );
  }

  Widget _driverPreferencesScreen() {
    final favorites =
        _driverPreferences.where((p) => p.isFavorite).toList(growable: false);
    final blocked =
        _driverPreferences.where((p) => p.isBlocked).toList(growable: false);
    return RefreshIndicator(
      color: SmartTaxiColors.goldDeep,
      onRefresh: _loadDriverPreferences,
      child: ListView(
        padding: const EdgeInsets.all(20),
        physics: const AlwaysScrollableScrollPhysics(
          parent: BouncingScrollPhysics(),
        ),
        children: [
          const _TitleBlock(
            title: 'Водители',
            text: 'Отмечайте любимых водителей и блокируйте нежелательных',
          ),
          const SizedBox(height: 16),
          _GoldCtaButton(
            enabled: !_settingDriverPreference,
            loading: false,
            text: 'Добавить из истории поездок',
            onTap: _openAddDriverPreferenceSheet,
          ),
          const SizedBox(height: 16),
          if (_driverPreferencesLoading && _driverPreferences.isEmpty)
            const Center(
              child: Padding(
                padding: EdgeInsets.all(24),
                child: CircularProgressIndicator(strokeWidth: 2.4),
              ),
            )
          else if (_driverPreferencesError && _driverPreferences.isEmpty)
            EmptyState(
              icon: Icons.wifi_off_rounded,
              title: 'Не удалось загрузить',
              text: 'Потяните экран вниз, чтобы попробовать снова.',
              action: 'Повторить',
              onAction: () => unawaited(_loadDriverPreferences()),
            )
          else if (_driverPreferences.isEmpty)
            const EmptyState(
              icon: Icons.people_alt_outlined,
              title: 'Пока нет отметок',
              text:
                  'Отметьте водителя из истории поездок как избранного или заблокируйте нежелательного.',
            )
          else ...[
            if (favorites.isNotEmpty) ...[
              const _SectionLabel(
                title: 'Избранные',
                text: 'Регулярные поездки предложат их в первую очередь',
              ),
              const SizedBox(height: 10),
              ...favorites.map(
                (preference) => Padding(
                  padding: const EdgeInsets.only(bottom: 10),
                  child: _DriverPreferenceCard(
                    preference: preference,
                    removing: _driverPreferenceRemoving
                        .contains(preference.driverId),
                    onRemove: () => _removeDriverPreference(preference),
                  ),
                ),
              ),
              const SizedBox(height: 8),
            ],
            if (blocked.isNotEmpty) ...[
              const _SectionLabel(
                title: 'Заблокированные',
                text: 'Не будут предложены на регулярные поездки',
              ),
              const SizedBox(height: 10),
              ...blocked.map(
                (preference) => Padding(
                  padding: const EdgeInsets.only(bottom: 10),
                  child: _DriverPreferenceCard(
                    preference: preference,
                    removing: _driverPreferenceRemoving
                        .contains(preference.driverId),
                    onRemove: () => _removeDriverPreference(preference),
                  ),
                ),
              ),
            ],
          ],
        ],
      ),
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
              onTap: widget.accountPhone.isEmpty
                  ? null
                  : () async {
                      await Clipboard.setData(
                        ClipboardData(text: widget.accountPhone),
                      );
                      if (!mounted) return;
                      AppToast.showSuccess(context, 'Номер скопирован');
                    },
            ),
            _SettingsRow(
              title: 'Выход из аккаунта',
              text: 'Завершить текущую сессию',
              danger: true,
              onTap: () => unawaited(_confirmAndLogout()),
            ),
          ],
        ),
        const SizedBox(height: 14),
        _SettingsGroup(
          title: 'Интерфейс',
          children: [
            _SettingsRow(
              title: 'Язык',
              text: widget.currentLocale?.languageCode == 'kk'
                  ? AppLocalizations.of(context).languageKazakh
                  : AppLocalizations.of(context).languageRussian,
              onTap: _chooseLanguage,
            ),
          ],
        ),
        const SizedBox(height: 14),
        _SettingsGroup(
          title: 'Разрешения',
          children: [
            FutureBuilder<String>(
              future: _notificationPermissionLabel(),
              builder: (context, snapshot) {
                return _SettingsRow(
                  title: 'Push-уведомления',
                  text: snapshot.data ?? 'Проверяем статус...',
                  onTap: () => Geolocator.openAppSettings(),
                );
              },
            ),
            _SettingsRow(
              title: 'Геолокация',
              text: 'Открыть настройки геолокации телефона',
              onTap: () => Geolocator.openLocationSettings(),
            ),
          ],
        ),
        const SizedBox(height: 14),
        _SettingsGroup(
          title: 'О приложении',
          children: [
            const _SettingsRow(title: 'Версия приложения', text: _appVersion),
            _SettingsRow(
              title: 'Правовая информация',
              text: 'Условия использования, оплата, отмена, безопасность',
              onTap: () => setState(() => _tab = PassengerTab.legalHub),
            ),
          ],
        ),
      ],
    );
  }

  Future<String> _notificationPermissionLabel() async {
    try {
      final settings =
          await FirebaseMessaging.instance.getNotificationSettings();
      switch (settings.authorizationStatus) {
        case AuthorizationStatus.authorized:
        case AuthorizationStatus.provisional:
          return 'Включены — нажмите, чтобы открыть настройки';
        case AuthorizationStatus.denied:
          return 'Отключены в настройках телефона';
        case AuthorizationStatus.notDetermined:
          return 'Не запрошены';
      }
    } catch (_) {
      return 'Появляются в приложении при изменении заказа';
    }
  }

  Widget _faqScreen() => const _FaqScreen();

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
                    'Поездки доступны только внутри регионов, включённых администратором. Межгород не поддерживается.',
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
        const SizedBox(height: 14),
        _PremiumCard(
          child: Column(
            children: [
              _MenuLine(
                icon: Icons.headset_mic_outlined,
                title: 'Поддержка',
                subtitle: 'Есть вопрос? Мы ответим',
                onTap: () => setState(() => _tab = PassengerTab.support),
              ),
              const Divider(height: 20),
              _MenuLine(
                icon: Icons.shield_outlined,
                title: 'Правовая информация',
                subtitle: 'Условия, оплата, отмена, безопасность',
                onTap: () => setState(() => _tab = PassengerTab.legalHub),
              ),
            ],
          ),
        ),
        const SizedBox(height: 16),
        const Center(
          child: Text(
            'SmartTaxi · версия $_appVersion',
            style: TextStyle(
              color: SmartTaxiColors.textMuted,
              fontSize: 12,
              fontWeight: FontWeight.w700,
            ),
          ),
        ),
      ],
    );
  }

  Widget _legalHubScreen() {
    return ListView(
      padding: const EdgeInsets.all(20),
      children: [
        const _TitleBlock(
          title: 'Правовая информация',
          text: 'Официальные документы SmartTaxi, редакция от 6 июля 2026 года',
        ),
        const SizedBox(height: 16),
        for (final doc in legalDocuments) ...[
          _LegalDocumentTile(
            document: doc,
            onTap: () => setState(() => _tab = _legalTabFor(doc.id)),
          ),
          const SizedBox(height: 10),
        ],
      ],
    );
  }

  PassengerTab _legalTabFor(String id) {
    switch (id) {
      case 'termsOfUse':
        return PassengerTab.legalTerms;
      case 'privacyPolicy':
        return PassengerTab.legalPrivacy;
      case 'paymentTerms':
        return PassengerTab.legalPayment;
      case 'cancellationPolicy':
        return PassengerTab.legalCancellation;
      case 'safetyRules':
        return PassengerTab.legalSafety;
    }
    return PassengerTab.legalHub;
  }

  Widget _legalDocumentScreen(LegalDocument document) {
    return ListView(
      padding: const EdgeInsets.all(20),
      children: [
        Material(
          color: Colors.transparent,
          child: InkWell(
            borderRadius: BorderRadius.circular(14),
            onTap: () => setState(() => _tab = PassengerTab.legalHub),
            child: const Padding(
              padding: EdgeInsets.symmetric(vertical: 6),
              child: Row(
                children: [
                  Icon(
                    Icons.arrow_back_rounded,
                    size: 18,
                    color: SmartTaxiColors.goldDeep,
                  ),
                  SizedBox(width: 6),
                  Text(
                    'Все документы',
                    style: TextStyle(
                      color: SmartTaxiColors.goldDeep,
                      fontSize: 13,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
        const SizedBox(height: 6),
        _TitleBlock(title: document.title, text: document.lead),
        const SizedBox(height: 16),
        for (final section in document.sections) ...[
          LegalSectionCard(section: section),
          const SizedBox(height: 10),
        ],
      ],
    );
  }
}

class _SupportHistoryCard extends StatelessWidget {
  const _SupportHistoryCard({required this.item});

  final SupportMessage item;

  @override
  Widget build(BuildContext context) {
    return _PremiumCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  item.topic,
                  style: const TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ),
              StatusPill(
                label: item.isResolved ? 'Отвечено' : 'В обработке',
                tone: item.isResolved
                    ? StatusTone.success
                    : StatusTone.neutral,
              ),
            ],
          ),
          const SizedBox(height: 6),
          Text(
            item.message,
            maxLines: 3,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(
              color: SmartTaxiColors.textSecondary,
              fontSize: 12.5,
              height: 1.35,
              fontWeight: FontWeight.w600,
            ),
          ),
          if (item.adminResponse != null && item.adminResponse!.isNotEmpty) ...[
            const SizedBox(height: 10),
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                color: SmartTaxiColors.goldSurface,
                borderRadius: BorderRadius.circular(12),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'Ответ поддержки',
                    style: TextStyle(
                      color: SmartTaxiColors.goldDeep,
                      fontSize: 11,
                      fontWeight: FontWeight.w900,
                    ),
                  ),
                  const SizedBox(height: 3),
                  Text(
                    item.adminResponse!,
                    style: const TextStyle(
                      fontSize: 12.5,
                      height: 1.35,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _LostItemOrderPicker extends StatelessWidget {
  const _LostItemOrderPicker({
    required this.activeOrder,
    required this.tripHistory,
    required this.selectedOrderId,
    required this.onChanged,
  });

  final OrderSummary? activeOrder;
  final List<OrderSummary> tripHistory;
  final String? selectedOrderId;
  final ValueChanged<String?> onChanged;

  static const _relevantStatuses = {
    'RATED',
    'PAID',
    'COMPLETED',
    'IN_PROGRESS',
    'DRIVER_ARRIVED',
    'DRIVER_ASSIGNED',
  };

  @override
  Widget build(BuildContext context) {
    final options = <OrderSummary>[
      if (activeOrder != null) activeOrder!,
      ...tripHistory.where((trip) =>
          trip.id != activeOrder?.id &&
          _relevantStatuses.contains(trip.status)),
    ].take(15).toList(growable: false);

    if (options.isEmpty) {
      return const _InlineMessage(
        text:
            'Нет доступных поездок, к которым можно привязать эту заявку. '
            'Опишите поездку в сообщении ниже, мы найдём водителя вручную.',
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const _SectionLabel(
          title: 'Какая поездка?',
          text: 'Нужна для того, чтобы уведомить водителя',
        ),
        const SizedBox(height: 8),
        Container(
          decoration: BoxDecoration(
            border: Border.all(color: SmartTaxiColors.border),
            borderRadius: BorderRadius.circular(16),
          ),
          padding: const EdgeInsets.symmetric(horizontal: 12),
          child: DropdownButtonHideUnderline(
            child: DropdownButton<String>(
              isExpanded: true,
              value: selectedOrderId,
              hint: const Text('Выберите поездку'),
              items: options
                  .map(
                    (trip) => DropdownMenuItem(
                      value: trip.id,
                      child: Text(
                        '${_formatTripDate(trip.createdAt)} · ${trip.pickup} → ${trip.dropoff}',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                  )
                  .toList(),
              onChanged: onChanged,
            ),
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

class _MapCanvas extends StatefulWidget {
  const _MapCanvas({
    required this.center,
    required this.pickup,
    required this.dropoff,
    required this.driver,
    required this.nearbyDrivers,
    required this.route,
    required this.permissionNotice,
    required this.routeLoading,
    required this.routeError,
    required this.mapUnavailable,
    required this.onTap,
    required this.onCenterChanged,
    required this.onTileError,
    required this.onUseLocation,
    required this.onRetryMap,
    required this.onMenu,
    required this.onNotifications,
    required this.routeSummaryLabel,
    required this.onRouteBack,
    required this.controlsBottom,
    required this.showLocationButton,
    required this.showCenterMarker,
    required this.activeTarget,
  });

  final LatLng center;
  final Coordinate? pickup;
  final Coordinate? dropoff;
  final DriverLocation? driver;
  final List<NearbyDriver> nearbyDrivers;
  final List<LatLng> route;
  final String? permissionNotice;
  final bool routeLoading;
  final String? routeError;
  final bool mapUnavailable;
  final ValueChanged<LatLng> onTap;
  final ValueChanged<LatLng> onCenterChanged;
  final VoidCallback onTileError;
  final VoidCallback onUseLocation;
  final VoidCallback onRetryMap;
  final VoidCallback onMenu;
  final VoidCallback onNotifications;
  final String? routeSummaryLabel;
  final VoidCallback onRouteBack;
  final double controlsBottom;
  final bool showLocationButton;
  final bool showCenterMarker;
  final PointTarget activeTarget;

  @override
  State<_MapCanvas> createState() => _MapCanvasState();
}

class _MapCanvasState extends State<_MapCanvas> {
  // Owned once for the lifetime of this screen so FlutterMap never has to
  // fully remount (and lose the rider's pan/zoom) just because the driver's
  // GPS ticked. Camera moves are then issued explicitly, only when the
  // route/pickup/dropoff actually change — not on every driver position.
  final MapController _mapController = MapController();
  late String _lastRefitSignature;

  @override
  void initState() {
    super.initState();
    _lastRefitSignature = _refitSignature(widget);
  }

  @override
  void didUpdateWidget(covariant _MapCanvas oldWidget) {
    super.didUpdateWidget(oldWidget);
    final signature = _refitSignature(widget);
    if (signature != _lastRefitSignature) {
      _lastRefitSignature = signature;
      _refitCamera();
    }
  }

  @override
  void dispose() {
    _mapController.dispose();
    super.dispose();
  }

  List<LatLng> _refitPoints(_MapCanvas w) {
    if (w.route.isNotEmpty) {
      return [
        ...w.route,
        if (w.pickup != null) w.pickup!.toLatLng(),
        if (w.dropoff != null) w.dropoff!.toLatLng(),
      ];
    }
    return [
      if (w.pickup != null) w.pickup!.toLatLng(),
      if (w.dropoff != null) w.dropoff!.toLatLng(),
    ];
  }

  String _refitSignature(_MapCanvas w) =>
      _refitPoints(w).map(_pointKey).join('|');

  static const _refitPadding = EdgeInsets.fromLTRB(50, 108, 50, 306);

  void _refitCamera() {
    final points = _refitPoints(widget);
    final fallbackCenter = widget.center;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      if (points.length > 1) {
        // The driver-to-target route shrinks on almost every refresh as the
        // trip progresses, so its bounding box keeps changing — refitting
        // unconditionally would keep re-zooming the map under the rider's
        // finger every 8-12s. Only move the camera when a point would
        // actually land outside what's currently on screen (accounting for
        // the same padding used to fit, so nothing hides under the sheet).
        if (_pointsWithinPadding(
          _mapController.camera,
          points,
          _refitPadding,
        )) {
          return;
        }
        _mapController.fitCamera(
          CameraFit.coordinates(
            coordinates: points,
            padding: _refitPadding,
            maxZoom: 15.5,
          ),
        );
      } else {
        _mapController.move(
          points.isNotEmpty ? points.first : fallbackCenter,
          15,
        );
      }
    });
  }

  List<LatLng> _initialCameraPoints() {
    if (widget.route.isNotEmpty) {
      return [
        ...widget.route,
        if (widget.pickup != null) widget.pickup!.toLatLng(),
        if (widget.dropoff != null) widget.dropoff!.toLatLng(),
        if (widget.driver != null) widget.driver!.toLatLng(),
      ];
    }
    return [
      if (widget.pickup != null) widget.pickup!.toLatLng(),
      if (widget.dropoff != null) widget.dropoff!.toLatLng(),
      if (widget.driver != null) widget.driver!.toLatLng(),
    ];
  }

  @override
  Widget build(BuildContext context) {
    final center = widget.center;
    final pickup = widget.pickup;
    final dropoff = widget.dropoff;
    final driver = widget.driver;
    final nearbyDrivers = widget.nearbyDrivers;
    final route = widget.route;
    final permissionNotice = widget.permissionNotice;
    final routeLoading = widget.routeLoading;
    final routeError = widget.routeError;
    final mapUnavailable = widget.mapUnavailable;
    final onTap = widget.onTap;
    final onCenterChanged = widget.onCenterChanged;
    final onTileError = widget.onTileError;
    final onUseLocation = widget.onUseLocation;
    final onRetryMap = widget.onRetryMap;
    final onMenu = widget.onMenu;
    final onNotifications = widget.onNotifications;
    final routeSummaryLabel = widget.routeSummaryLabel;
    final onRouteBack = widget.onRouteBack;
    final showCenterMarker = widget.showCenterMarker;
    final activeTarget = widget.activeTarget;
    final initialPoints = _initialCameraPoints();
    final initialFit = initialPoints.length > 1
        ? CameraFit.coordinates(
            coordinates: initialPoints,
            padding: const EdgeInsets.fromLTRB(50, 108, 50, 306),
            maxZoom: 15.5,
          )
        : null;
    final showMapFallback = mapUnavailable;
    return SizedBox.expand(
      child: Stack(
        fit: StackFit.expand,
        children: [
          if (showMapFallback)
            const Positioned.fill(child: _MapFallbackSurface())
          else
            Positioned.fill(
              child: FlutterMap(
                mapController: _mapController,
                options: MapOptions(
                  initialCenter: center,
                  initialZoom: pickup == null && dropoff == null ? 12 : 14,
                  initialCameraFit: initialFit,
                  onTap: (_, point) => onTap(point),
                  onPositionChanged: (camera, hasGesture) {
                    if (hasGesture) onCenterChanged(camera.center);
                  },
                  backgroundColor: SmartTaxiColors.appBackground,
                ),
                children: [
                  TileLayer(
                    urlTemplate: AppConfig.osmTileUrl,
                    subdomains: const ['a', 'b', 'c', 'd'],
                    retinaMode: true,
                    userAgentPackageName: 'com.smarttaxi.app',
                    errorTileCallback: (_, __, ___) => onTileError(),
                  ),
                  if (route.isNotEmpty)
                    PolylineLayer(
                      polylines: [
                        Polyline(
                          points: route,
                          color: Colors.white.withValues(alpha: 0.92),
                          strokeWidth: 9,
                        ),
                        Polyline(
                          points: route,
                          color: SmartTaxiColors.gold,
                          strokeWidth: 5.5,
                        ),
                      ],
                    ),
                  MarkerLayer(
                    markers: [
                      if (pickup != null)
                        _assetMarker(
                          point: pickup.toLatLng(),
                          asset: _userLocationMarkerAsset,
                          semanticLabel: 'Точка подачи',
                          size: 34,
                          fallbackIcon: Icons.radio_button_checked_rounded,
                        ),
                      if (dropoff != null)
                        _assetMarker(
                          point: dropoff.toLatLng(),
                          asset: _destinationMarkerAsset,
                          semanticLabel: 'Точка назначения',
                          size: 38,
                          fallbackIcon: Icons.location_on_rounded,
                        ),
                      if (driver == null)
                        for (final nearby in nearbyDrivers.take(5))
                          _assetMarker(
                            point: nearby.toLatLng(),
                            asset: _driverCarMarkerAsset,
                            semanticLabel:
                                'Свободный водитель рядом, ${nearby.etaMin} мин',
                            size: 38,
                            rotationRadians:
                                (nearby.bearing ?? 0) * math.pi / 180,
                            fallbackIcon: Icons.local_taxi_rounded,
                          ),
                    ],
                  ),
                  if (driver != null)
                    _AnimatedDriverMarkerLayer(
                      point: driver.toLatLng(),
                      rotationRadians: (driver.heading ?? 0) * math.pi / 180,
                    ),
                ],
              ),
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
          if (showCenterMarker)
            Positioned.fill(
              child: IgnorePointer(
                child: Center(
                  child: _CenterMapMarker(target: activeTarget),
                ),
              ),
            ),
          Positioned(
            left: 22,
            top: 24,
            right: 22,
            child: _MapOverlayHeader(
              onMenu: onMenu,
              onNotifications: onNotifications,
              routeSummaryLabel: routeSummaryLabel,
              onRouteBack: onRouteBack,
            ),
          ),
          if (routeSummaryLabel == null &&
              driver == null &&
              nearbyDrivers.isNotEmpty)
            Positioned(
              left: 22,
              top: 84,
              child: _NearbyDriversPill(count: nearbyDrivers.length),
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
                text: permissionNotice,
                onUseLocation: onUseLocation,
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
        ],
      ),
    );
  }
}

Widget _assetMarkerContent({
  required String asset,
  required String semanticLabel,
  required IconData fallbackIcon,
  double size = 50,
  double rotationRadians = 0,
}) {
  return Semantics(
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
            boxShadow: [
              BoxShadow(
                color: SmartTaxiColors.gold.withValues(alpha: 0.18),
                blurRadius: 18,
                offset: const Offset(0, 8),
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
    child: _assetMarkerContent(
      asset: asset,
      semanticLabel: semanticLabel,
      fallbackIcon: fallbackIcon,
      size: size,
      rotationRadians: rotationRadians,
    ),
  );
}

// Glides the assigned driver's marker between successive GPS/socket updates
// instead of snapping to the new point instantly. The driver's phone only
// reports a fix every >=20m of movement (see driver_shell.dart's
// distanceFilter), and updates arrive irregularly over the socket, so a
// direct jump reads as "teleporting" rather than driving.
class _AnimatedDriverMarkerLayer extends StatefulWidget {
  const _AnimatedDriverMarkerLayer({
    required this.point,
    required this.rotationRadians,
  });

  final LatLng point;
  final double rotationRadians;

  @override
  State<_AnimatedDriverMarkerLayer> createState() =>
      _AnimatedDriverMarkerLayerState();
}

class _AnimatedDriverMarkerLayerState
    extends State<_AnimatedDriverMarkerLayer>
    with SingleTickerProviderStateMixin {
  static const _glideDuration = Duration(milliseconds: 900);
  // Jumps bigger than this (cold start, order reassigned to another driver)
  // snap instantly instead of gliding all the way across the map.
  static const _snapThresholdMeters = 1500.0;

  late final AnimationController _controller;
  late LatLng _fromPoint;
  late LatLng _toPoint;
  late double _fromAngle;
  late double _toAngle;

  @override
  void initState() {
    super.initState();
    _fromPoint = widget.point;
    _toPoint = widget.point;
    _fromAngle = widget.rotationRadians;
    _toAngle = widget.rotationRadians;
    _controller = AnimationController(vsync: this, duration: _glideDuration)
      ..value = 1;
  }

  @override
  void didUpdateWidget(covariant _AnimatedDriverMarkerLayer oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.point == oldWidget.point &&
        widget.rotationRadians == oldWidget.rotationRadians) {
      return;
    }
    final currentPoint = _currentPoint;
    final currentAngle = _currentAngle;
    final jumpMeters = _metersBetweenLatLng(currentPoint, widget.point);
    _fromPoint = currentPoint;
    _toPoint = widget.point;
    _fromAngle = currentAngle;
    _toAngle = _shortestAngleTarget(currentAngle, widget.rotationRadians);
    if (jumpMeters > _snapThresholdMeters) {
      _controller.value = 1;
    } else {
      _controller
        ..stop()
        ..value = 0
        ..animateTo(1, curve: Curves.easeOutCubic);
    }
  }

  LatLng get _currentPoint =>
      _lerpLatLng(_fromPoint, _toPoint, _controller.value);

  double get _currentAngle =>
      _fromAngle + (_toAngle - _fromAngle) * _controller.value;

  double _shortestAngleTarget(double from, double to) {
    const twoPi = math.pi * 2;
    var diff = (to - from) % twoPi;
    if (diff < -math.pi) diff += twoPi;
    if (diff > math.pi) diff -= twoPi;
    return from + diff;
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _controller,
      builder: (context, _) {
        return MarkerLayer(
          markers: [
            Marker(
              point: _currentPoint,
              width: 76,
              height: 76,
              child: _assetMarkerContent(
                asset: _driverCarMarkerAsset,
                semanticLabel: 'Автомобиль водителя',
                fallbackIcon: Icons.local_taxi_rounded,
                size: 58,
                rotationRadians: _currentAngle,
              ),
            ),
          ],
        );
      },
    );
  }
}

LatLng _lerpLatLng(LatLng a, LatLng b, double t) {
  return LatLng(
    a.latitude + (b.latitude - a.latitude) * t,
    a.longitude + (b.longitude - a.longitude) * t,
  );
}

double _metersBetweenLatLng(LatLng a, LatLng b) {
  const earthRadius = 6371000.0;
  final dLat = (b.latitude - a.latitude) * math.pi / 180;
  final dLng = (b.longitude - a.longitude) * math.pi / 180;
  final sinLat = math.sin(dLat / 2);
  final sinLng = math.sin(dLng / 2);
  final h = sinLat * sinLat +
      math.cos(a.latitude * math.pi / 180) *
          math.cos(b.latitude * math.pi / 180) *
          sinLng * sinLng;
  return earthRadius * 2 * math.atan2(math.sqrt(h), math.sqrt(1 - h));
}

// True when every point already renders inside the padded-in viewport, so a
// camera refit (which recenters/rezooms) can be skipped entirely.
bool _pointsWithinPadding(
  MapCamera camera,
  List<LatLng> points,
  EdgeInsets padding,
) {
  final size = camera.nonRotatedSize;
  for (final point in points) {
    final screen = camera.latLngToScreenPoint(point);
    if (screen.x < padding.left ||
        screen.x > size.x - padding.right ||
        screen.y < padding.top ||
        screen.y > size.y - padding.bottom) {
      return false;
    }
  }
  return true;
}

String _pointKey(LatLng point) =>
    '${point.latitude.toStringAsFixed(5)},${point.longitude.toStringAsFixed(5)}';

String _pluralCars(int n) {
  final mod10 = n % 10;
  final mod100 = n % 100;
  if (mod10 == 1 && mod100 != 11) return 'машина';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) {
    return 'машины';
  }
  return 'машин';
}

class _NearbyDriversPill extends StatelessWidget {
  const _NearbyDriversPill({required this.count});

  final int count;

  @override
  Widget build(BuildContext context) {
    final label = '$count ${_pluralCars(count)} рядом';
    return Semantics(
      label: label,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 13, vertical: 9),
        decoration: BoxDecoration(
          color: Colors.white.withValues(alpha: 0.98),
          border: Border.all(color: SmartTaxiColors.border),
          borderRadius: BorderRadius.circular(14),
          boxShadow: const [
            BoxShadow(
              color: Color(0x1a141414),
              blurRadius: 14,
              offset: Offset(0, 6),
            ),
          ],
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            const _PulseDot(),
            const SizedBox(width: 7),
            Text(
              label,
              style: const TextStyle(
                fontSize: 11.5,
                fontWeight: FontWeight.w700,
                color: SmartTaxiColors.text,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _PulseDot extends StatefulWidget {
  const _PulseDot();

  @override
  State<_PulseDot> createState() => _PulseDotState();
}

class _PulseDotState extends State<_PulseDot>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1800),
  )..repeat();

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: 18,
      height: 18,
      child: AnimatedBuilder(
        animation: _controller,
        builder: (context, child) {
          final t = _controller.value;
          return Stack(
            alignment: Alignment.center,
            children: [
              Opacity(
                opacity: (1 - t).clamp(0.0, 1.0),
                child: Container(
                  width: 7 + t * 14,
                  height: 7 + t * 14,
                  decoration: BoxDecoration(
                    color: SmartTaxiColors.success.withValues(alpha: 0.55),
                    shape: BoxShape.circle,
                  ),
                ),
              ),
              child!,
            ],
          );
        },
        child: const DecoratedBox(
          decoration: BoxDecoration(
            color: SmartTaxiColors.success,
            shape: BoxShape.circle,
          ),
          child: SizedBox(width: 7, height: 7),
        ),
      ),
    );
  }
}

class _SvgIcon extends StatelessWidget {
  const _SvgIcon(
    this.asset, {
    this.size = 22,
    this.color = SmartTaxiColors.text,
  });

  final String asset;
  final double size;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return SvgPicture.asset(
      asset,
      width: size,
      height: size,
      colorFilter: ColorFilter.mode(color, BlendMode.srcIn),
      fit: BoxFit.contain,
    );
  }
}


class _MarkerRadarPulse extends StatefulWidget {
  const _MarkerRadarPulse({required this.color});

  final Color color;

  @override
  State<_MarkerRadarPulse> createState() => _MarkerRadarPulseState();
}

class _MarkerRadarPulseState extends State<_MarkerRadarPulse>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 2600),
  )..repeat();

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _controller,
      builder: (context, child) {
        final t = Curves.easeOut.transform(_controller.value);
        return Opacity(
          opacity: (1 - t) * 0.9,
          child: Transform.scale(
            scale: 0.4 + t * 1.9,
            child: Container(
              width: 54,
              height: 54,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: widget.color.withValues(alpha: 0.28),
              ),
            ),
          ),
        );
      },
    );
  }
}

// _pickupMarkerColor/_dropoffMarkerColor were the two-tone pin-selection
// colors from before pickup/dropoff selection used one shared marker
// design — no longer needed now that the pin itself doesn't vary by
// target. The *Deep variants below are still used elsewhere (trip status
// copy), just not for the marker pin itself anymore.
const _pickupMarkerColorDeep = SmartTaxiColors.goldDeep;
const _dropoffMarkerColorDeep = Color(0xffb45309);

class _CenterMapMarker extends StatelessWidget {
  const _CenterMapMarker({required this.target});

  // Kept so callers don't need to change, but deliberately unused for
  // choosing an asset/color below: pickup and dropoff selection must look
  // identical (see the marker-unification note above _addressPickMarkerAsset)
  // — which point is being chosen comes from the field label, not the pin.
  final PointTarget target;

  // Canvas is 1000x1120; the pin's visual tip (where it touches the map's
  // exact center point) sits at 79.7% down the canvas — measured via an
  // alpha-channel column scan, not the canvas edge (there's a separate
  // soft ground-shadow dot further below that isn't part of the pin
  // itself and must not be included in the tip calibration).
  static const _assetAspect = 1120 / 1000;
  static const _tipFraction = 0.797;

  @override
  Widget build(BuildContext context) {
    const pinWidth = 76.0;
    const pinHeight = pinWidth * _assetAspect;
    const tipShift = pinHeight * (_tipFraction - 0.5);
    return SizedBox(
      width: 132,
      height: 132,
      child: Stack(
        alignment: Alignment.center,
        clipBehavior: Clip.none,
        children: [
          Transform.translate(
            offset: const Offset(0, 6),
            child: const _MarkerRadarPulse(color: _addressPickMarkerColor),
          ),
          // Ground-contact shadow directly under the pin's tip.
          Transform.translate(
            offset: const Offset(0, 10),
            child: Container(
              width: 20,
              height: 7,
              decoration: BoxDecoration(
                color: Colors.black.withValues(alpha: 0.22),
                borderRadius: BorderRadius.circular(8),
              ),
            ),
          ),
          Transform.translate(
            offset: const Offset(0, -tipShift),
            child: const Image(
              image: AssetImage(_addressPickMarkerAsset),
              width: pinWidth,
              height: pinHeight,
              fit: BoxFit.contain,
            ),
          ),
        ],
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
            SmartTaxiColors.goldPale,
            Color(0xfffbfdff),
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
                  'Маршрут и заказ можно выбрать вручную. Карта восстановится после подключения.',
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
    // A floating card with side margins and fully-rounded corners, not a
    // flush edge-to-edge bottom sheet — keeps a sliver of map visible on
    // either side so this still reads as "a panel over the map" rather than
    // "a screen that replaced the map". Intentionally opaque, no
    // BackdropFilter: the sheet sits above a live, continuously-animating
    // map + pulse/timer widgets, and a blur here would force an expensive
    // re-sample of everything beneath it on every frame for an effect a
    // fully opaque surface already hides completely.
    return Padding(
      padding: EdgeInsets.fromLTRB(
        10,
        0,
        10,
        8 + MediaQuery.paddingOf(context).bottom,
      ),
      child: ClipRRect(
        borderRadius: const BorderRadius.all(Radius.circular(30)),
        child: Container(
          width: double.infinity,
          padding: const EdgeInsets.fromLTRB(18, 9, 18, 16),
          decoration: const BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.all(Radius.circular(30)),
            boxShadow: [
              BoxShadow(
                color: Color(0x24785a14),
                blurRadius: 30,
                offset: Offset(0, 14),
              ),
            ],
          ),
          child: child,
        ),
      ),
    );
  }
}

class _OrderSheetHeading extends StatelessWidget {
  const _OrderSheetHeading({required this.title, required this.text});

  final String title;
  final String text;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          title,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: const TextStyle(
            color: SmartTaxiColors.text,
            fontSize: 22.5,
            height: 1.02,
            letterSpacing: 0,
            fontWeight: FontWeight.w900,
          ),
        ),
        const SizedBox(height: 5),
        Text(
          text,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: const TextStyle(
            color: SmartTaxiColors.textSecondary,
            fontSize: 13,
            height: 1.1,
            fontWeight: FontWeight.w700,
          ),
        ),
      ],
    );
  }
}

class _TrustRow extends StatelessWidget {
  const _TrustRow();

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        Container(
          width: 20,
          height: 20,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            gradient: LinearGradient(
              colors: [
                SmartTaxiColors.gold.withValues(alpha: 0.16),
                SmartTaxiColors.gold.withValues(alpha: 0.05),
              ],
            ),
            shape: BoxShape.circle,
          ),
          child: const Icon(
            Icons.verified_rounded,
            size: 13,
            color: SmartTaxiColors.goldDeep,
          ),
        ),
        const SizedBox(width: 7),
        const Text(
          'Проверенные водители · Безопасные поездки',
          style: TextStyle(
            color: SmartTaxiColors.textSecondary,
            fontSize: 11.5,
            fontWeight: FontWeight.w600,
          ),
        ),
      ],
    );
  }
}

class _SheetAddressEntryCard extends StatelessWidget {
  const _SheetAddressEntryCard({
    required this.pickupLabel,
    required this.dropoffLabel,
    required this.pickupActive,
    required this.dropoffActive,
    required this.locationLoading,
    required this.canSwap,
    required this.onPickupTap,
    required this.onDropoffTap,
    required this.onUseLocation,
    required this.onSwap,
  });

  final String pickupLabel;
  final String dropoffLabel;
  final bool pickupActive;
  final bool dropoffActive;
  final bool locationLoading;
  final bool canSwap;
  final VoidCallback onPickupTap;
  final VoidCallback onDropoffTap;
  final VoidCallback onUseLocation;
  final VoidCallback onSwap;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(15, 14, 12, 14),
      decoration: BoxDecoration(
        color: Colors.white,
        border: Border.all(color: SmartTaxiColors.border),
        borderRadius: BorderRadius.circular(26),
        boxShadow: [
          BoxShadow(
            color: SmartTaxiColors.authInk.withValues(alpha: 0.07),
            blurRadius: 28,
            offset: const Offset(0, 12),
          ),
        ],
      ),
      child: Stack(
        clipBehavior: Clip.none,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const _RouteDotsColumn(height: 90),
              const SizedBox(width: 13),
              Expanded(
                child: Column(
                  children: [
                    _SheetAddressRow(
                      title: 'Откуда',
                      label: pickupLabel,
                      active: pickupActive,
                      onTap: onPickupTap,
                      trailing: _CurrentLocationButton(
                        loading: locationLoading,
                        onTap: onUseLocation,
                      ),
                    ),
                    const Divider(height: 16, color: SmartTaxiColors.border),
                    _SheetAddressRow(
                      title: 'Куда',
                      label: dropoffLabel,
                      active: dropoffActive,
                      onTap: onDropoffTap,
                      trailing: const _SvgIcon(
                        _iconChevronRight,
                        size: 18,
                        color: SmartTaxiColors.textSecondary,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          if (canSwap)
            Positioned(
              right: -8,
              top: 0,
              bottom: 0,
              child: Center(child: _SwapPointsButton(onTap: onSwap)),
            ),
        ],
      ),
    );
  }
}

class _SwapPointsButton extends StatelessWidget {
  const _SwapPointsButton({required this.onTap});

  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.white,
      shape: const CircleBorder(
        side: BorderSide(color: SmartTaxiColors.borderStrong),
      ),
      elevation: 0,
      child: InkWell(
        customBorder: const CircleBorder(),
        onTap: onTap,
        child: Container(
          width: 34,
          height: 34,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            gradient: const LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: [SmartTaxiColors.goldSurface, Color(0xffdeebff)],
            ),
            shape: BoxShape.circle,
            boxShadow: [
              BoxShadow(
                color: SmartTaxiColors.authInk.withValues(alpha: 0.10),
                blurRadius: 10,
                offset: const Offset(0, 3),
              ),
            ],
          ),
          child: const Icon(
            Icons.swap_vert_rounded,
            size: 18,
            color: SmartTaxiColors.goldDeep,
          ),
        ),
      ),
    );
  }
}

class _SheetAddressRow extends StatelessWidget {
  const _SheetAddressRow({
    required this.title,
    required this.label,
    required this.active,
    required this.onTap,
    required this.trailing,
  });

  final String title;
  final String label;
  final bool active;
  final VoidCallback onTap;
  final Widget trailing;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.transparent,
      child: InkWell(
        borderRadius: BorderRadius.circular(18),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 5),
          child: Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        color: SmartTaxiColors.textSecondary,
                        fontSize: 11.5,
                        height: 1.05,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    const SizedBox(height: 3),
                    Text(
                      label,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        color: active
                            ? SmartTaxiColors.goldDeep
                            : SmartTaxiColors.text,
                        fontSize: 14.4,
                        height: 1.12,
                        fontWeight: active ? FontWeight.w900 : FontWeight.w700,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              trailing,
            ],
          ),
        ),
      ),
    );
  }
}

class _CurrentLocationButton extends StatelessWidget {
  const _CurrentLocationButton({required this.loading, required this.onTap});

  final bool loading;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Tooltip(
      message: 'Моё местоположение',
      child: InkWell(
        customBorder: const CircleBorder(),
        onTap: loading ? null : onTap,
        child: Container(
          width: 38,
          height: 38,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            gradient: const LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: [SmartTaxiColors.goldSurface, Color(0xffdeebff)],
            ),
            shape: BoxShape.circle,
            border: Border.all(color: Colors.white, width: 1.5),
            boxShadow: [
              BoxShadow(
                color: SmartTaxiColors.gold.withValues(alpha: 0.16),
                blurRadius: 12,
                offset: const Offset(0, 4),
              ),
            ],
          ),
          child: Center(
            child: loading
                ? const SizedBox.square(
                    dimension: 16,
                    child: CircularProgressIndicator(
                      strokeWidth: 2,
                      color: SmartTaxiColors.goldDeep,
                    ),
                  )
                : const Icon(
                    Icons.my_location_rounded,
                    color: SmartTaxiColors.goldDeep,
                    size: 18,
                  ),
          ),
        ),
      ),
    );
  }
}

class _RouteDotsColumn extends StatelessWidget {
  const _RouteDotsColumn({required this.height});

  final double height;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: 20,
      height: height,
      child: Column(
        children: [
          Container(
            width: 16,
            height: 16,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              gradient: const LinearGradient(
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
                colors: [Color(0xff6fa8ff), SmartTaxiColors.gold],
              ),
              shape: BoxShape.circle,
              border: Border.all(color: Colors.white, width: 2.5),
              boxShadow: [
                BoxShadow(
                  color: SmartTaxiColors.gold.withValues(alpha: 0.38),
                  blurRadius: 10,
                  offset: const Offset(0, 3),
                ),
              ],
            ),
            child: Container(
              width: 5,
              height: 5,
              decoration: const BoxDecoration(
                color: Colors.white,
                shape: BoxShape.circle,
              ),
            ),
          ),
          Expanded(
            child: LayoutBuilder(
              builder: (context, constraints) {
                const dash = 4.0;
                const gap = 4.0;
                final count =
                    (constraints.maxHeight / (dash + gap)).floor().clamp(1, 99);
                return Column(
                  mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                  children: List.generate(
                    count,
                    (_) => Container(
                      width: 2,
                      height: dash,
                      decoration: BoxDecoration(
                        color: SmartTaxiColors.borderStrong.withValues(alpha: 0.45),
                        borderRadius: BorderRadius.circular(99),
                      ),
                    ),
                  ),
                );
              },
            ),
          ),
          Transform.rotate(
            angle: math.pi / 4,
            child: Container(
              width: 15,
              height: 15,
              decoration: BoxDecoration(
                gradient: const LinearGradient(
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                  colors: [Color(0xff26314f), SmartTaxiColors.authInk],
                ),
                borderRadius: BorderRadius.circular(4),
                border: Border.all(color: Colors.white, width: 2.5),
                boxShadow: [
                  BoxShadow(
                    color: SmartTaxiColors.authInk.withValues(alpha: 0.28),
                    blurRadius: 10,
                    offset: const Offset(0, 3),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _RouteSummaryCard extends StatelessWidget {
  const _RouteSummaryCard({
    required this.pickupLabel,
    required this.dropoffLabel,
    required this.onEdit,
  });

  final String pickupLabel;
  final String dropoffLabel;
  final VoidCallback onEdit;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(13, 10, 9, 10),
      decoration: BoxDecoration(
        color: Colors.white,
        border: Border.all(color: SmartTaxiColors.borderStrong),
        borderRadius: BorderRadius.circular(22),
        boxShadow: const [
          BoxShadow(
            color: Color(0x10785a14),
            blurRadius: 20,
            offset: Offset(0, 9),
          ),
        ],
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const _RouteDotsColumn(height: 54),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              children: [
                _RouteSummaryLine(title: 'Откуда', value: pickupLabel),
                const Divider(height: 9, color: SmartTaxiColors.border),
                _RouteSummaryLine(title: 'Куда', value: dropoffLabel),
              ],
            ),
          ),
          const SizedBox(width: 7),
          TextButton(
            onPressed: onEdit,
            style: TextButton.styleFrom(
              foregroundColor: SmartTaxiColors.goldDeep,
              backgroundColor: SmartTaxiColors.goldSurface,
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
              minimumSize: const Size(0, 0),
              tapTargetSize: MaterialTapTargetSize.shrinkWrap,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(14),
                side: const BorderSide(color: SmartTaxiColors.border),
              ),
            ),
            child: const Text(
              'Изменить',
              style: TextStyle(fontSize: 11, fontWeight: FontWeight.w900),
            ),
          ),
        ],
      ),
    );
  }
}

class _RouteSummaryLine extends StatelessWidget {
  const _RouteSummaryLine({required this.title, required this.value});

  final String title;
  final String value;

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
                  color: SmartTaxiColors.text,
                  fontSize: 12.3,
                  height: 1.05,
                  fontWeight: FontWeight.w900,
                ),
              ),
              const SizedBox(height: 3),
              Text(
                value,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                  color: SmartTaxiColors.textSecondary,
                  fontSize: 11.8,
                  height: 1.05,
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

class _OrderSheet extends StatelessWidget {
  const _OrderSheet({
    required this.pickupSource,
    required this.dropoffSource,
    required this.pickupLabel,
    required this.dropoffLabel,
    required this.pickupActive,
    required this.dropoffActive,
    required this.locationLoading,
    required this.onSwap,
    required this.paymentMethod,
    required this.paymentLabel,
    required this.onPickupTap,
    required this.onDropoffTap,
    required this.onUseLocation,
    required this.onPaymentTap,
    required this.tariffs,
    required this.selectedTariffId,
    required this.preview,
    required this.tariffEstimates,
    required this.offeredPriceKzt,
    required this.onOfferedPriceChanged,
    required this.promoController,
    required this.promoApplying,
    required this.promoError,
    required this.appliedPromoCode,
    required this.promoDiscountKzt,
    required this.onApplyPromo,
    required this.onClearPromo,
    required this.loading,
    required this.previewLoading,
    required this.error,
    required this.onTariff,
    required this.onCreate,
    required this.cta,
  });

  final PointSource pickupSource;
  final PointSource dropoffSource;
  final String pickupLabel;
  final String dropoffLabel;
  final bool pickupActive;
  final bool dropoffActive;
  final bool locationLoading;
  final VoidCallback onSwap;
  final String paymentMethod;
  final String paymentLabel;
  final VoidCallback onPickupTap;
  final VoidCallback onDropoffTap;
  final VoidCallback onUseLocation;
  final VoidCallback onPaymentTap;
  final List<TariffOption> tariffs;
  final String? selectedTariffId;
  final RoutePreview? preview;
  final Map<String, RoutePreview> tariffEstimates;
  final int? offeredPriceKzt;
  final ValueChanged<int?> onOfferedPriceChanged;
  final TextEditingController promoController;
  final bool promoApplying;
  final String? promoError;
  final String? appliedPromoCode;
  final int promoDiscountKzt;
  final VoidCallback onApplyPromo;
  final VoidCallback onClearPromo;
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
    final canSubmit = !loading && !previewLoading;
    final estimatedPrice = preview?.estimatedPrice;
    final canUsePromo = offeredPriceKzt == null;
    final basePrice = offeredPriceKzt?.toDouble() ?? estimatedPrice;
    final routePrice = basePrice == null
        ? null
        : basePrice - (canUsePromo ? promoDiscountKzt : 0);
    if (routeSelected && !routeError) {
      final screen = MediaQuery.sizeOf(context);
      final compact = screen.height < 740 || screen.width < 390;
      final maxRouteSheetHeight = screen.height * (compact ? 0.66 : 0.60);
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
            child: ConstrainedBox(
              constraints: BoxConstraints(maxHeight: maxRouteSheetHeight),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const _SheetHandle(dark: false),
                  Flexible(
                    child: SingleChildScrollView(
                      physics: const BouncingScrollPhysics(),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          _RouteSummaryCard(
                            pickupLabel: pickupLabel,
                            dropoffLabel: dropoffLabel,
                            onEdit: onDropoffTap,
                          ),
                          const SizedBox(height: 10),
                          _TariffSection(
                            tariffs: tariffs,
                            selectedId: selectedTariffId,
                            estimate: preview,
                            estimates: tariffEstimates,
                            loading: previewLoading,
                            onSelect: onTariff,
                            dark: false,
                            showHeader: false,
                          ),
                          if (!previewLoading &&
                              selectedTariffId != null &&
                              estimatedPrice != null) ...[
                            const SizedBox(height: 10),
                            _PriceAdjuster(
                              basePrice: estimatedPrice.round(),
                              currentPrice:
                                  offeredPriceKzt ?? estimatedPrice.round(),
                              onChanged: onOfferedPriceChanged,
                            ),
                          ],
                          if (!previewLoading && canUsePromo) ...[
                            const SizedBox(height: 10),
                            _PromoCodeField(
                              controller: promoController,
                              applying: promoApplying,
                              error: promoError,
                              appliedCode: appliedPromoCode,
                              discountKzt: promoDiscountKzt,
                              onApply: onApplyPromo,
                              onClear: onClearPromo,
                            ),
                          ],
                          if (error != null) ...[
                            const SizedBox(height: 10),
                            _InlineMessage(
                              text: error!,
                              danger: true,
                              dark: false,
                            ),
                          ],
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(height: 10),
                  _PaymentMethodRow(
                    enabled: true,
                    method: paymentMethod,
                    label: paymentLabel,
                    onTap: onPaymentTap,
                  ),
                  const SizedBox(height: 10),
                  _GoldCtaButton(
                    enabled: canSubmit,
                    loading: loading,
                    text: cta,
                    trailingText:
                        routePrice == null ? null : _formatTenge(routePrice),
                    onTap: onCreate,
                  ),
                ],
              ),
            ),
          ),
        ),
      );
    }
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
                if (!routeSelected) ...[
                  const _OrderSheetHeading(
                    title: 'Куда едем?',
                    text: 'Выберите точку подачи и адрес назначения',
                  ),
                  const SizedBox(height: 12),
                  _SheetAddressEntryCard(
                    pickupLabel: pickupLabel,
                    dropoffLabel: dropoffLabel,
                    pickupActive: pickupActive,
                    dropoffActive: dropoffActive,
                    locationLoading: locationLoading,
                    canSwap: dropoffSource != PointSource.none,
                    onPickupTap: onPickupTap,
                    onDropoffTap: onDropoffTap,
                    onUseLocation: onUseLocation,
                    onSwap: onSwap,
                  ),
                  const SizedBox(height: 14),
                  _GoldCtaButton(
                    enabled: true,
                    loading: false,
                    text: 'Указать куда',
                    onTap: onDropoffTap,
                  ),
                  const SizedBox(height: 10),
                  const _TrustRow(),
                ] else if (routeSelected && routeError)
                  const _CompactNotice(
                    icon: Icons.route_outlined,
                    title: 'Уточните маршрут',
                    text:
                        'Не удалось построить маршрут. Измените адрес или выберите точку на карте.',
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _MapPointPickerSheet extends StatelessWidget {
  const _MapPointPickerSheet({
    required this.target,
    required this.addressLabel,
    required this.addressLoading,
    required this.onCancel,
    required this.onConfirm,
  });

  final PointTarget target;
  final String addressLabel;
  final bool addressLoading;
  final VoidCallback onCancel;
  final VoidCallback onConfirm;

  @override
  Widget build(BuildContext context) {
    final isPickup = target == PointTarget.pickup;
    return _HomeOrderPanel(
      child: TweenAnimationBuilder<double>(
        tween: Tween(begin: 0.98, end: 1),
        duration: const Duration(milliseconds: 220),
        curve: Curves.easeOutCubic,
        builder: (context, value, child) => Transform.translate(
          offset: Offset(0, (1 - value) * 18),
          child: Opacity(opacity: value, child: child),
        ),
        child: SingleChildScrollView(
          physics: const BouncingScrollPhysics(),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const _SheetHandle(dark: false),
              Row(
                crossAxisAlignment: CrossAxisAlignment.center,
                children: [
                  Expanded(
                    child: Text(
                      isPickup ? 'Откуда?' : 'Куда едем?',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        color: SmartTaxiColors.text,
                        fontSize: 22.5,
                        height: 1.02,
                        letterSpacing: 0,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                  ),
                  TextButton(
                    onPressed: onCancel,
                    style: TextButton.styleFrom(
                      foregroundColor: SmartTaxiColors.textSecondary,
                      padding: const EdgeInsets.symmetric(
                        horizontal: 10,
                        vertical: 8,
                      ),
                      minimumSize: const Size(0, 0),
                      tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                    ),
                    child: const Text(
                      'Отмена',
                      style: TextStyle(fontWeight: FontWeight.w900),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 5),
              const Text(
                'Подвиньте карту так, чтобы маркер стоял над нужным входом.',
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  color: SmartTaxiColors.textSecondary,
                  fontSize: 13.1,
                  height: 1.16,
                  fontWeight: FontWeight.w700,
                ),
              ),
              const SizedBox(height: 12),
              AnimatedContainer(
                duration: const Duration(milliseconds: 190),
                curve: Curves.easeOutCubic,
                padding: const EdgeInsets.fromLTRB(13, 13, 12, 13),
                decoration: BoxDecoration(
                  color: SmartTaxiColors.goldSurface,
                  border: Border.all(color: SmartTaxiColors.goldSoft),
                  borderRadius: BorderRadius.circular(22),
                  boxShadow: [
                    BoxShadow(
                      color: SmartTaxiColors.gold.withValues(alpha: 0.09),
                      blurRadius: 18,
                      offset: const Offset(0, 8),
                    ),
                  ],
                ),
                child: Row(
                  children: [
                    Container(
                      width: 46,
                      height: 46,
                      alignment: Alignment.center,
                      decoration: BoxDecoration(
                        color: Colors.white,
                        shape: BoxShape.circle,
                        border: Border.all(color: SmartTaxiColors.border),
                      ),
                      child: Icon(
                        isPickup
                            ? Icons.my_location_rounded
                            : Icons.location_on_rounded,
                        color: isPickup
                            ? _pickupMarkerColorDeep
                            : _dropoffMarkerColorDeep,
                        size: 23,
                      ),
                    ),
                    const SizedBox(width: 13),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text(
                            'Точка на карте',
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(
                              color: SmartTaxiColors.text,
                              fontSize: 15.4,
                              height: 1.05,
                              fontWeight: FontWeight.w900,
                            ),
                          ),
                          const SizedBox(height: 4),
                          Text(
                            addressLoading
                                ? 'Определяем адрес...'
                                : addressLabel,
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                              color: SmartTaxiColors.textSecondary,
                              fontSize: 12.5,
                              height: 1.15,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(width: 8),
                    const _SvgIcon(
                      _iconChevronRight,
                      size: 18,
                      color: SmartTaxiColors.textSecondary,
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 12),
              _GoldCtaButton(
                enabled: true,
                loading: false,
                text: 'Подтвердить адрес',
                onTap: onConfirm,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _PanelEntrance extends StatelessWidget {
  const _PanelEntrance({super.key, required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    return TweenAnimationBuilder<double>(
      tween: Tween(begin: 0.96, end: 1),
      duration: const Duration(milliseconds: 260),
      curve: Curves.easeOutCubic,
      builder: (context, value, child) => Transform.scale(
        alignment: Alignment.topCenter,
        scale: value,
        child: child,
      ),
      child: child,
    );
  }
}

class _TripHistoryCard extends StatelessWidget {
  const _TripHistoryCard({required this.trip, this.onTap});

  final OrderSummary trip;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final card = _PremiumCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  _formatTripDate(trip.createdAt),
                  style: const TextStyle(
                    fontSize: 12.5,
                    fontWeight: FontWeight.w800,
                    color: SmartTaxiColors.textSecondary,
                  ),
                ),
              ),
              StatusPill(
                label: _statusLabel(trip.status),
                tone: _statusTone(trip.status),
              ),
            ],
          ),
          const SizedBox(height: 10),
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Padding(
                padding: EdgeInsets.only(top: 3),
                child: Icon(Icons.radio_button_checked_rounded,
                    size: 14, color: SmartTaxiColors.gold),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  trip.pickup,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                      fontSize: 13.5, fontWeight: FontWeight.w700),
                ),
              ),
            ],
          ),
          const Padding(
            padding: EdgeInsets.only(left: 6),
            child: SizedBox(
              height: 12,
              child: VerticalDivider(width: 2, thickness: 2),
            ),
          ),
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Padding(
                padding: EdgeInsets.only(top: 3),
                child: Icon(Icons.location_on_rounded,
                    size: 14, color: SmartTaxiColors.text),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  trip.dropoff,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                      fontSize: 13.5, fontWeight: FontWeight.w700),
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              if (trip.tariff != null && trip.tariff!.isNotEmpty)
                Text(
                  trip.tariff!,
                  style: const TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w700,
                    color: SmartTaxiColors.textSecondary,
                  ),
                ),
              if (trip.price != null)
                Text(
                  _formatTenge(trip.price!),
                  style: const TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.w900,
                  ),
                ),
            ],
          ),
        ],
      ),
    );
    if (onTap == null) return card;
    return InkWell(
      borderRadius: BorderRadius.circular(30),
      onTap: onTap,
      child: card,
    );
  }
}

String _formatTripDate(DateTime? date) {
  if (date == null) return 'Дата неизвестна';
  const months = [
    'янв',
    'фев',
    'мар',
    'апр',
    'мая',
    'июн',
    'июл',
    'авг',
    'сен',
    'окт',
    'ноя',
    'дек',
  ];
  final local = date.toLocal();
  final day = local.day.toString().padLeft(2, '0');
  final month = months[local.month - 1];
  final hour = local.hour.toString().padLeft(2, '0');
  final minute = local.minute.toString().padLeft(2, '0');
  return '$day $month, $hour:$minute';
}

class _TripDayGroup {
  const _TripDayGroup(this.label, this.trips);

  final String label;
  final List<OrderSummary> trips;
}

List<_TripDayGroup> _groupTripsByDay(List<OrderSummary> trips) {
  const months = [
    'янв',
    'фев',
    'мар',
    'апр',
    'мая',
    'июн',
    'июл',
    'авг',
    'сен',
    'окт',
    'ноя',
    'дек',
  ];
  final now = DateTime.now();
  final today = DateTime(now.year, now.month, now.day);
  final yesterday = today.subtract(const Duration(days: 1));
  final ordered = <String, List<OrderSummary>>{};
  for (final trip in trips) {
    final date = trip.createdAt?.toLocal();
    final String label;
    if (date == null) {
      label = 'Дата неизвестна';
    } else {
      final day = DateTime(date.year, date.month, date.day);
      if (day == today) {
        label = 'Сегодня';
      } else if (day == yesterday) {
        label = 'Вчера';
      } else {
        label = '${day.day} ${months[day.month - 1]} ${day.year}';
      }
    }
    ordered.putIfAbsent(label, () => []).add(trip);
  }
  return [
    for (final entry in ordered.entries) _TripDayGroup(entry.key, entry.value),
  ];
}

String _tripShareText(OrderSummary trip) {
  final priceText = trip.price == null ? '' : ' · ${_formatTenge(trip.price!)}';
  return 'Поездка SmartTaxi ${_formatTripDate(trip.createdAt)}\n'
      '${trip.pickup} → ${trip.dropoff}$priceText';
}

class _TripDetailScreen extends StatelessWidget {
  const _TripDetailScreen({required this.trip, required this.onContactSupport});

  final OrderSummary trip;
  final VoidCallback onContactSupport;

  static String _distanceLabel(double? km) {
    if (km == null || km <= 0) return '—';
    return '${km.toStringAsFixed(km < 10 ? 1 : 0)} км';
  }

  static String _durationLabel(double? minutes) {
    if (minutes == null || minutes <= 0) return '—';
    return '${minutes.round()} мин';
  }

  @override
  Widget build(BuildContext context) {
    final driverName = (trip.driverName ?? '').trim();
    final hasDriver = driverName.isNotEmpty;
    final driverMeta = [
      trip.driverCarModel,
      trip.driverCarColor,
      trip.driverPlate,
    ].where((value) => (value ?? '').trim().isNotEmpty).join(' · ');
    return Scaffold(
      backgroundColor: SmartTaxiColors.appBackground,
      appBar: AppBar(
        title: const Text('Поездка'),
        actions: [
          IconButton(
            icon: const Icon(Icons.ios_share_rounded),
            tooltip: 'Поделиться чеком',
            onPressed: () => unawaited(Share.share(_tripShareText(trip))),
          ),
        ],
      ),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(20),
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    _formatTripDate(trip.createdAt),
                    style: const TextStyle(
                      color: SmartTaxiColors.textSecondary,
                      fontSize: 13,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                ),
                StatusPill(
                  label: _statusLabel(trip.status),
                  tone: _statusTone(trip.status),
                ),
              ],
            ),
            const SizedBox(height: 14),
            _TripRouteMiniCard(pickup: trip.pickup, dropoff: trip.dropoff),
            const SizedBox(height: 10),
            Row(
              children: [
                Expanded(
                  child: _TripInfoPill(
                    label: 'Расстояние',
                    value: _distanceLabel(trip.distanceKm),
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: _TripInfoPill(
                    label: 'В пути',
                    value: _durationLabel(trip.durationMin),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            Row(
              children: [
                Expanded(
                  child: _TripInfoPill(
                    label: 'Тариф',
                    value: (trip.tariff ?? '').trim().isEmpty
                        ? 'Эконом'
                        : trip.tariff!,
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: _TripInfoPill(
                    label: 'Оплата',
                    value: _paymentLabel(trip.paymentMethod ?? 'CASH'),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            _TripInfoPill(
              label: 'Итого',
              value: trip.price == null ? '—' : _formatTenge(trip.price!),
              emphasis: true,
            ),
            if (hasDriver) ...[
              const SizedBox(height: 20),
              const _ProfileGroupLabel('Водитель'),
              const SizedBox(height: 8),
              _PremiumCard(
                child: Row(
                  children: [
                    Container(
                      width: 46,
                      height: 46,
                      alignment: Alignment.center,
                      decoration: BoxDecoration(
                        color: SmartTaxiColors.goldSurface,
                        borderRadius: BorderRadius.circular(14),
                      ),
                      child: Text(
                        driverName.substring(0, 1).toUpperCase(),
                        style: const TextStyle(
                          color: SmartTaxiColors.goldDeep,
                          fontSize: 18,
                          fontWeight: FontWeight.w900,
                        ),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            driverName,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                              fontSize: 15,
                              fontWeight: FontWeight.w900,
                            ),
                          ),
                          if (driverMeta.isNotEmpty) ...[
                            const SizedBox(height: 2),
                            Text(
                              driverMeta,
                              maxLines: 1,
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
                    if (trip.driverRating != null) ...[
                      const Icon(
                        Icons.star_rounded,
                        color: SmartTaxiColors.warning,
                        size: 18,
                      ),
                      const SizedBox(width: 2),
                      Text(
                        trip.driverRating!.toStringAsFixed(1),
                        style: const TextStyle(
                          fontSize: 13.5,
                          fontWeight: FontWeight.w900,
                        ),
                      ),
                    ],
                  ],
                ),
              ),
            ],
            const SizedBox(height: 22),
            OutlinedButton.icon(
              onPressed: onContactSupport,
              icon: const Icon(Icons.headset_mic_outlined, size: 18),
              label: const Text('Написать в поддержку по этой поездке'),
            ),
            const SizedBox(height: 12),
          ],
        ),
      ),
    );
  }
}

class _TripStatusPanel extends StatelessWidget {
  const _TripStatusPanel({
    required this.api,
    required this.order,
    required this.statusText,
    required this.statusTone,
    required this.driverText,
    required this.driverRouteText,
    required this.nearbyDriverCount,
    required this.loading,
    required this.canCancel,
    required this.isTerminal,
    required this.tripElapsedListenable,
    required this.tripElapsedReliable,
    required this.ratingStars,
    required this.ratingTags,
    required this.ratingCommentController,
    required this.ratingSubmitting,
    required this.ratingJustSubmitted,
    required this.receiptAcknowledged,
    required this.noDriversFound,
    required this.payment,
    required this.paymentTimedOut,
    this.sosPhone,
    this.error,
    required this.onRatingStarsChanged,
    required this.onRatingTagToggle,
    required this.onSubmitRating,
    required this.onAcknowledgeReceipt,
    required this.onRetrySearch,
    required this.onRetryPayment,
    required this.onCancel,
    required this.onNewTrip,
    required this.respondingToPriceOffer,
    required this.onRespondToPriceOffer,
  });

  final ApiClient api;
  final OrderSummary order;
  final String statusText;
  final StatusTone statusTone;
  final String driverText;
  final String? driverRouteText;
  final int nearbyDriverCount;
  final bool loading;
  final bool canCancel;
  final bool isTerminal;
  final ValueListenable<Duration> tripElapsedListenable;
  final bool tripElapsedReliable;
  final int ratingStars;
  final Set<String> ratingTags;
  final TextEditingController ratingCommentController;
  final bool ratingSubmitting;
  final bool ratingJustSubmitted;
  final bool receiptAcknowledged;
  final bool noDriversFound;
  final PaymentInfo? payment;
  final bool paymentTimedOut;
  final String? sosPhone;
  final String? error;
  final ValueChanged<int> onRatingStarsChanged;
  final ValueChanged<String> onRatingTagToggle;
  final VoidCallback onSubmitRating;
  final VoidCallback onAcknowledgeReceipt;
  final VoidCallback onRetrySearch;
  final VoidCallback onRetryPayment;
  final VoidCallback onCancel;
  final VoidCallback onNewTrip;
  final bool respondingToPriceOffer;
  final ValueChanged<bool> onRespondToPriceOffer;

  @override
  Widget build(BuildContext context) {
    final cancelled = const {
      'CANCELLED',
      'CANCELLED_BY_CLIENT',
      'CANCELLED_BY_DRIVER',
      'CANCELLED_BY_OPERATOR',
      'NO_SHOW',
    }.contains(order.status);
    if (cancelled) {
      return _PanelEntrance(
        key: const ValueKey('trip-panel-cancelled'),
        child: _TripCancelledPanel(status: order.status, onNewTrip: onNewTrip),
      );
    }
    // Takes priority over the normal status panel: the driver is actively
    // waiting on an answer, and the offered price also needs to be visible
    // before the rider decides whether to cancel/keep searching for
    // anything else on this screen.
    if (order.hasPendingDriverOffer) {
      return _PanelEntrance(
        key: const ValueKey('trip-panel-price-offer'),
        child: _DriverPriceOfferPanel(
          order: order,
          responding: respondingToPriceOffer,
          onRespond: onRespondToPriceOffer,
        ),
      );
    }
    if (order.status == 'RATED' || ratingJustSubmitted) {
      return _PanelEntrance(
        key: const ValueKey('trip-panel-rated'),
        child: _RatedThankYouPanel(onNewTrip: onNewTrip),
      );
    }
    if (order.status == 'PAID' && !receiptAcknowledged) {
      return _PanelEntrance(
        key: const ValueKey('trip-panel-receipt-paid'),
        child: _TripReceiptPanel(
          order: order,
          paid: true,
          payment: payment,
          paymentTimedOut: paymentTimedOut,
          onContinue: onAcknowledgeReceipt,
          onRetryPayment: onRetryPayment,
        ),
      );
    }
    if (order.status == 'PAID') {
      return _PanelEntrance(
        key: const ValueKey('trip-panel-rate'),
        child: _RateDriverPanel(
          driverName: order.driverName ?? '',
          stars: ratingStars,
          tags: ratingTags,
          commentController: ratingCommentController,
          submitting: ratingSubmitting,
          error: error,
          onStarsChanged: onRatingStarsChanged,
          onTagToggle: onRatingTagToggle,
          onSubmit: onSubmitRating,
          onSkip: onNewTrip,
        ),
      );
    }
    if (const {'TRIP_COMPLETED', 'PAYMENT_PENDING', 'COMPLETED'}
        .contains(order.status)) {
      return _PanelEntrance(
        key: const ValueKey('trip-panel-receipt-pending'),
        child: _TripReceiptPanel(
          order: order,
          paid: false,
          payment: payment,
          paymentTimedOut: paymentTimedOut,
          onContinue: onAcknowledgeReceipt,
          onRetryPayment: onRetryPayment,
        ),
      );
    }
    final orderShortId =
        order.id.length > 8 ? order.id.substring(0, 8) : order.id;
    final searching = const {'SEARCHING_DRIVER', 'NEW'}.contains(order.status);
    if (searching && noDriversFound) {
      return _PanelEntrance(
        key: const ValueKey('trip-panel-no-drivers'),
        child: _NoDriversFoundPanel(
          loading: loading,
          onRetry: onRetrySearch,
          onCancel: onCancel,
          error: error,
        ),
      );
    }
    final searchingSubtitle = nearbyDriverCount > 0
        ? 'Показываем $nearbyDriverCount ближайших свободных водителей'
        : 'Проверяем свободных водителей рядом';
    final driverDescription = order.driverId == null
        ? 'Предлагаем заказ ближайшим водителям.'
        : driverRouteText ??
            'Показываем статус поездки и маршрут в реальном времени.';
    final tripInProgress =
        const {'TRIP_STARTED', 'IN_PROGRESS'}.contains(order.status);
    const arrivedStatuses = {'DRIVER_ARRIVED', 'WAITING_CLIENT'};
    final arrived = arrivedStatuses.contains(order.status);
    if (tripInProgress) {
      return _PanelEntrance(
        key: const ValueKey('trip-panel-in-progress'),
        child: _HomeOrderPanel(
          child: SingleChildScrollView(
            physics: const BouncingScrollPhysics(),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const _SheetHandle(dark: false),
                Row(
                  crossAxisAlignment: CrossAxisAlignment.center,
                  children: [
                    const Expanded(
                      child: Text(
                        'Поездка в пути',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          color: SmartTaxiColors.text,
                          fontSize: 22,
                          height: 1.02,
                          fontWeight: FontWeight.w900,
                        ),
                      ),
                    ),
                    const SizedBox(width: 8),
                    _ShareTripButton(
                      shareToken: order.shareToken,
                      pickup: order.pickup,
                      dropoff: order.dropoff,
                    ),
                    const SizedBox(width: 8),
                    _SafetyButton(
                        sosPhone: sosPhone, api: api, orderId: order.id),
                  ],
                ),
                const SizedBox(height: 12),
                _StatusStepper(status: order.status),
                const SizedBox(height: 12),
                _TripProgressCard(
                  pickup: order.pickup,
                  dropoff: order.dropoff,
                  elapsedListenable: tripElapsedListenable,
                  elapsedReliable: tripElapsedReliable,
                  estimatedDurationMin: order.durationMin,
                ),
                const SizedBox(height: 10),
                _DriverContactCard(
                  compact: true,
                  name: order.driverName ?? '',
                  rating: order.driverRating,
                  carModel: order.driverCarModel,
                  carColor: order.driverCarColor,
                  plate: order.driverPlate,
                  phone: order.driverPhone,
                ),
                const SizedBox(height: 10),
                Row(
                  children: [
                    Expanded(
                      child: _TripInfoPill(
                        label: 'Тариф',
                        value: (order.tariff ?? 'Эконом').trim().isEmpty
                            ? 'Эконом'
                            : order.tariff!,
                      ),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: _TripInfoPill(
                        label: 'Оплата',
                        value: _paymentLabel(order.paymentMethod ?? 'CASH'),
                      ),
                    ),
                    if (order.price != null) ...[
                      const SizedBox(width: 8),
                      Expanded(
                        child: _TripInfoPill(
                          label: 'Итого',
                          value: _formatTenge(order.price!),
                          emphasis: true,
                        ),
                      ),
                    ],
                  ],
                ),
              ],
            ),
          ),
        ),
      );
    }
    if (searching) {
      return _PanelEntrance(
        key: const ValueKey('trip-panel-searching'),
        child: _HomeOrderPanel(
          child: SingleChildScrollView(
            physics: const BouncingScrollPhysics(),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const _SheetHandle(dark: false),
                Row(
                  crossAxisAlignment: CrossAxisAlignment.center,
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text(
                            'Ищем водителя',
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(
                              color: SmartTaxiColors.text,
                              fontSize: 22,
                              height: 1.02,
                              fontWeight: FontWeight.w900,
                            ),
                          ),
                          SizedBox(height: 5),
                          Text(
                            searchingSubtitle,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(
                              color: SmartTaxiColors.textSecondary,
                              fontSize: 13,
                              height: 1.1,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(width: 10),
                    const _SearchingPulse(),
                  ],
                ),
                const SizedBox(height: 12),
                _StatusStepper(status: order.status),
                const SizedBox(height: 12),
                const _SearchProgressRows(),
                const SizedBox(height: 12),
                _TripRouteMiniCard(
                  pickup: order.pickup,
                  dropoff: order.dropoff,
                ),
                const SizedBox(height: 10),
                Row(
                  children: [
                    Expanded(
                      child: _TripInfoPill(
                        label: 'Тариф',
                        value: (order.tariff ?? 'Эконом').trim().isEmpty
                            ? 'Эконом'
                            : order.tariff!,
                      ),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: _TripInfoPill(
                        label: 'Оплата',
                        value: _paymentLabel(order.paymentMethod ?? 'CASH'),
                      ),
                    ),
                    if (order.price != null) ...[
                      const SizedBox(width: 8),
                      Expanded(
                        child: _TripInfoPill(
                          label: 'Итого',
                          value: _formatTenge(order.price!),
                          emphasis: true,
                        ),
                      ),
                    ],
                  ],
                ),
                if (error != null) ...[
                  const SizedBox(height: 12),
                  _InlineMessage(text: error!, danger: true),
                ],
                if (canCancel) ...[
                  const SizedBox(height: 12),
                  OutlinedButton(
                    onPressed: loading ? null : onCancel,
                    style: OutlinedButton.styleFrom(
                      minimumSize: const Size.fromHeight(48),
                      foregroundColor: SmartTaxiColors.danger,
                      side: const BorderSide(color: Color(0xffffd4d4)),
                      backgroundColor: const Color(0xfffff6f6),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(17),
                      ),
                    ),
                    child: Text(loading ? 'Отменяем...' : 'Отменить поиск'),
                  ),
                ],
              ],
            ),
          ),
        ),
      );
    }
    return _PanelEntrance(
      key: const ValueKey('trip-panel-active'),
      child: _HomeOrderPanel(
        child: SingleChildScrollView(
          physics: const BouncingScrollPhysics(),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const _SheetHandle(dark: false),
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          order.driverId == null
                              ? 'Поездка $orderShortId'
                              : 'Водитель найден',
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            color: SmartTaxiColors.text,
                            fontSize: 22,
                            height: 1.02,
                            fontWeight: FontWeight.w900,
                          ),
                        ),
                        const SizedBox(height: 5),
                        Text(
                          statusText,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            color: SmartTaxiColors.textSecondary,
                            fontSize: 13,
                            height: 1.1,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(width: 10),
                  StatusPill(label: statusText, tone: statusTone),
                  if (order.driverId != null) ...[
                    const SizedBox(width: 8),
                    _ShareTripButton(
                      shareToken: order.shareToken,
                      pickup: order.pickup,
                      dropoff: order.dropoff,
                    ),
                    const SizedBox(width: 8),
                    _SafetyButton(
                        sosPhone: sosPhone, api: api, orderId: order.id),
                  ],
                ],
              ),
              const SizedBox(height: 12),
              _StatusStepper(status: order.status),
              const SizedBox(height: 12),
              RouteFields(
                pickupLabel: order.pickup,
                dropoffLabel: order.dropoff,
                onPickupTap: null,
                onDropoffTap: null,
              ),
              const SizedBox(height: 10),
              if (order.driverId != null) ...[
                if (arrived) ...[
                  const _ArrivedBanner(),
                  const SizedBox(height: 10),
                ] else if ((driverRouteText ?? '').isNotEmpty) ...[
                  _EtaStrip(text: driverRouteText!),
                  const SizedBox(height: 10),
                ],
                _DriverContactCard(
                  name: order.driverName ?? '',
                  rating: order.driverRating,
                  carModel: order.driverCarModel,
                  carColor: order.driverCarColor,
                  plate: order.driverPlate,
                  phone: order.driverPhone,
                ),
              ] else
                _CompactNotice(
                  icon: Icons.person_search_rounded,
                  title: driverText,
                  text: driverDescription,
                ),
              const SizedBox(height: 10),
              Row(
                children: [
                  Expanded(
                    child: _TripInfoPill(
                      label: 'Тариф',
                      value: (order.tariff ?? 'Эконом').trim().isEmpty
                          ? 'Эконом'
                          : order.tariff!,
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: _TripInfoPill(
                      label: 'Оплата',
                      value: _paymentLabel(order.paymentMethod ?? 'CASH'),
                    ),
                  ),
                  if (order.price != null) ...[
                    const SizedBox(width: 8),
                    Expanded(
                      child: _TripInfoPill(
                        label: 'Итого',
                        value: _formatTenge(order.price!),
                        emphasis: true,
                      ),
                    ),
                  ],
                ],
              ),
              if (error != null) ...[
                const SizedBox(height: 12),
                _InlineMessage(text: error!, danger: true),
              ],
              if (canCancel || isTerminal) ...[
                const SizedBox(height: 12),
                if (isTerminal)
                  _GoldCtaButton(
                    enabled: true,
                    loading: false,
                    text: 'Новая поездка',
                    onTap: onNewTrip,
                  )
                else
                  OutlinedButton(
                    onPressed: loading ? null : onCancel,
                    style: OutlinedButton.styleFrom(
                      minimumSize: const Size.fromHeight(50),
                      foregroundColor: SmartTaxiColors.danger,
                      side: const BorderSide(color: Color(0xffffd4d4)),
                      backgroundColor: const Color(0xfffff6f6),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(17),
                      ),
                    ),
                    child: Text(loading ? 'Отменяем...' : 'Отменить поездку'),
                  ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

class _StarRatingSelector extends StatelessWidget {
  const _StarRatingSelector({required this.value, required this.onChanged});

  final int value;
  final ValueChanged<int> onChanged;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: List.generate(5, (index) {
        final starValue = index + 1;
        final filled = starValue <= value;
        return Padding(
          padding: const EdgeInsets.symmetric(horizontal: 4),
          child: GestureDetector(
            onTap: () => onChanged(starValue),
            child: AnimatedScale(
              scale: filled ? 1.08 : 1.0,
              duration: const Duration(milliseconds: 140),
              curve: Curves.easeOutBack,
              child: Icon(
                filled ? Icons.star_rounded : Icons.star_outline_rounded,
                color:
                    filled ? const Color(0xfff5a623) : SmartTaxiColors.border,
                size: 38,
              ),
            ),
          ),
        );
      }),
    );
  }
}

class _RateDriverPanel extends StatelessWidget {
  const _RateDriverPanel({
    required this.driverName,
    required this.stars,
    required this.tags,
    required this.commentController,
    required this.submitting,
    required this.onStarsChanged,
    required this.onTagToggle,
    required this.onSubmit,
    required this.onSkip,
    this.error,
  });

  final String driverName;
  final int stars;
  final Set<String> tags;
  final TextEditingController commentController;
  final bool submitting;
  final String? error;
  final ValueChanged<int> onStarsChanged;
  final ValueChanged<String> onTagToggle;
  final VoidCallback onSubmit;
  final VoidCallback onSkip;

  static const _positiveTags = [
    'Вежливый водитель',
    'Чисто в машине',
    'Ехал безопасно',
    'Приехал вовремя',
  ];

  static const _negativeTags = [
    'Опоздал',
    'Грубое общение',
    'Небезопасная езда',
    'Грязно в машине',
  ];

  @override
  Widget build(BuildContext context) {
    final name = driverName.trim().isEmpty ? 'водителем' : driverName.trim();
    final tagOptions = stars >= 4 ? _positiveTags : _negativeTags;
    return _HomeOrderPanel(
      child: SingleChildScrollView(
        physics: const BouncingScrollPhysics(),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.center,
          children: [
            const _SheetHandle(dark: false),
            const SizedBox(height: 6),
            _InitialsAvatar(name: name, size: 56, showStatusDot: false),
            const SizedBox(height: 12),
            Text(
              'Как прошла поездка с $name?',
              textAlign: TextAlign.center,
              style: const TextStyle(
                color: SmartTaxiColors.text,
                fontSize: 17,
                height: 1.2,
                fontWeight: FontWeight.w900,
              ),
            ),
            const SizedBox(height: 16),
            _StarRatingSelector(value: stars, onChanged: onStarsChanged),
            if (stars > 0) ...[
              const SizedBox(height: 16),
              Wrap(
                alignment: WrapAlignment.center,
                spacing: 8,
                runSpacing: 8,
                children: tagOptions
                    .map(
                      (tag) => _SupportTopicChip(
                        label: tag,
                        selected: tags.contains(tag),
                        onTap: () => onTagToggle(tag),
                      ),
                    )
                    .toList(),
              ),
              const SizedBox(height: 14),
              TextField(
                controller: commentController,
                minLines: 2,
                maxLines: 4,
                textAlign: TextAlign.left,
                decoration: const InputDecoration(
                  hintText: 'Комментарий (необязательно)',
                ),
              ),
            ],
            if (error != null) ...[
              const SizedBox(height: 14),
              _InlineMessage(text: error!, danger: true),
            ],
            const SizedBox(height: 16),
            _GoldCtaButton(
              enabled: stars > 0 && !submitting,
              loading: submitting,
              text: 'Отправить оценку',
              loadingText: 'Отправляем...',
              onTap: onSubmit,
            ),
            const SizedBox(height: 6),
            TextButton(
              onPressed: submitting ? null : onSkip,
              child: const Text(
                'Пропустить',
                style: TextStyle(
                  color: SmartTaxiColors.textSecondary,
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

class _RatedThankYouPanel extends StatelessWidget {
  const _RatedThankYouPanel({required this.onNewTrip});

  final VoidCallback onNewTrip;

  @override
  Widget build(BuildContext context) {
    return _HomeOrderPanel(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          const _SheetHandle(dark: false),
          const SizedBox(height: 12),
          Container(
            width: 60,
            height: 60,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: SmartTaxiColors.successSoft,
              borderRadius: BorderRadius.circular(20),
            ),
            child: const Icon(
              Icons.favorite_rounded,
              color: SmartTaxiColors.success,
              size: 28,
            ),
          ),
          const SizedBox(height: 14),
          const Text(
            'Спасибо за оценку!',
            style: TextStyle(
              color: SmartTaxiColors.text,
              fontSize: 17,
              fontWeight: FontWeight.w900,
            ),
          ),
          const SizedBox(height: 6),
          const Text(
            'Ваш отзыв помогает нам поддерживать качество поездок',
            textAlign: TextAlign.center,
            style: TextStyle(
              color: SmartTaxiColors.textSecondary,
              fontSize: 13,
              height: 1.3,
              fontWeight: FontWeight.w600,
            ),
          ),
          const SizedBox(height: 18),
          _GoldCtaButton(
            enabled: true,
            loading: false,
            text: 'Заказать снова',
            onTap: onNewTrip,
          ),
        ],
      ),
    );
  }
}

class _TripReceiptPanel extends StatelessWidget {
  const _TripReceiptPanel({
    required this.order,
    required this.paid,
    required this.payment,
    required this.paymentTimedOut,
    required this.onContinue,
    required this.onRetryPayment,
  });

  final OrderSummary order;
  final bool paid;
  final PaymentInfo? payment;
  final bool paymentTimedOut;
  final VoidCallback onContinue;
  final VoidCallback onRetryPayment;

  static String _distanceLabel(double? km) {
    if (km == null || km <= 0) return '—';
    return '${km.toStringAsFixed(km < 10 ? 1 : 0)} км';
  }

  static String _durationLabel(double? minutes) {
    if (minutes == null || minutes <= 0) return '—';
    return '${minutes.round()} мин';
  }

  @override
  Widget build(BuildContext context) {
    return _HomeOrderPanel(
      child: SingleChildScrollView(
        physics: const BouncingScrollPhysics(),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const _SheetHandle(dark: false),
            Row(
              crossAxisAlignment: CrossAxisAlignment.center,
              children: [
                Container(
                  width: 48,
                  height: 48,
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    color: SmartTaxiColors.successSoft,
                    borderRadius: BorderRadius.circular(16),
                  ),
                  child: const Icon(
                    Icons.receipt_long_rounded,
                    color: SmartTaxiColors.success,
                    size: 24,
                  ),
                ),
                const SizedBox(width: 12),
                const Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Поездка завершена',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          color: SmartTaxiColors.text,
                          fontSize: 18,
                          height: 1.05,
                          fontWeight: FontWeight.w900,
                        ),
                      ),
                      SizedBox(height: 3),
                      Text(
                        'Чек поездки',
                        style: TextStyle(
                          color: SmartTaxiColors.textSecondary,
                          fontSize: 12.5,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 14),
            _TripRouteMiniCard(pickup: order.pickup, dropoff: order.dropoff),
            const SizedBox(height: 8),
            Row(
              children: [
                Expanded(
                  child: _TripInfoPill(
                    label: 'Расстояние',
                    value: _distanceLabel(order.distanceKm),
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: _TripInfoPill(
                    label: 'В пути',
                    value: _durationLabel(order.durationMin),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            Row(
              children: [
                Expanded(
                  child: _TripInfoPill(
                    label: 'Способ оплаты',
                    value: _paymentLabel(order.paymentMethod ?? 'CASH'),
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: _TripInfoPill(
                    label: 'Итого',
                    value:
                        order.price == null ? '—' : _formatTenge(order.price!),
                    emphasis: true,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 18),
            _buildPaymentState(),
          ],
        ),
      ),
    );
  }

  Widget _buildPaymentState() {
    if (paid) {
      return _GoldCtaButton(
        enabled: true,
        loading: false,
        text: 'Оценить поездку',
        onTap: onContinue,
      );
    }
    if (payment != null && payment!.isFailed) {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 13),
            decoration: BoxDecoration(
              color: SmartTaxiColors.dangerSoft,
              border: Border.all(color: const Color(0xffffd4d4)),
              borderRadius: BorderRadius.circular(18),
            ),
            child: Row(
              children: [
                const Icon(
                  Icons.error_outline_rounded,
                  color: SmartTaxiColors.danger,
                  size: 20,
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(
                    payment!.failureReason?.trim().isNotEmpty == true
                        ? payment!.failureReason!
                        : 'Не удалось провести оплату картой',
                    style: const TextStyle(
                      color: SmartTaxiColors.danger,
                      fontSize: 12.5,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 10),
          _GoldCtaButton(
            enabled: true,
            loading: false,
            text: 'Повторить оплату',
            onTap: onRetryPayment,
          ),
        ],
      );
    }
    final processing = payment != null && payment!.isProcessing;
    if (processing && paymentTimedOut) {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 13),
            decoration: BoxDecoration(
              color: SmartTaxiColors.goldSurface,
              border: Border.all(color: SmartTaxiColors.border),
              borderRadius: BorderRadius.circular(18),
            ),
            child: Row(
              children: [
                const Icon(
                  Icons.schedule_rounded,
                  color: SmartTaxiColors.goldDeep,
                  size: 20,
                ),
                const SizedBox(width: 10),
                const Expanded(
                  child: Text(
                    'Оплата занимает больше времени, чем обычно',
                    style: TextStyle(
                      color: SmartTaxiColors.goldDeep,
                      fontSize: 12.5,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 10),
          _GoldCtaButton(
            enabled: true,
            loading: false,
            text: 'Повторить оплату',
            onTap: onRetryPayment,
          ),
        ],
      );
    }
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 13),
      decoration: BoxDecoration(
        color: SmartTaxiColors.goldSurface,
        border: Border.all(color: SmartTaxiColors.border),
        borderRadius: BorderRadius.circular(18),
      ),
      child: Row(
        children: [
          const SizedBox(
            width: 16,
            height: 16,
            child: CircularProgressIndicator(
              strokeWidth: 2.2,
              color: SmartTaxiColors.goldDeep,
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              processing
                  ? 'Обрабатываем оплату картой...'
                  : 'Ожидаем подтверждение оплаты',
              style: const TextStyle(
                color: SmartTaxiColors.goldDeep,
                fontSize: 13,
                fontWeight: FontWeight.w800,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _NoDriversFoundPanel extends StatelessWidget {
  const _NoDriversFoundPanel({
    required this.loading,
    required this.onRetry,
    required this.onCancel,
    this.error,
  });

  final bool loading;
  final VoidCallback onRetry;
  final VoidCallback onCancel;
  final String? error;

  @override
  Widget build(BuildContext context) {
    return _HomeOrderPanel(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          const _SheetHandle(dark: false),
          const SizedBox(height: 8),
          Container(
            width: 64,
            height: 64,
            alignment: Alignment.center,
            decoration: const BoxDecoration(
              color: SmartTaxiColors.goldPale,
              shape: BoxShape.circle,
            ),
            child: const Icon(
              Icons.person_search_rounded,
              color: SmartTaxiColors.goldDeep,
              size: 30,
            ),
          ),
          const SizedBox(height: 14),
          const Text(
            'Водителей рядом нет',
            textAlign: TextAlign.center,
            style: TextStyle(
              color: SmartTaxiColors.text,
              fontSize: 18,
              fontWeight: FontWeight.w900,
            ),
          ),
          const SizedBox(height: 6),
          const Text(
            'Сейчас нет свободных водителей поблизости. Попробуйте повторить поиск через минуту или отмените заказ.',
            textAlign: TextAlign.center,
            style: TextStyle(
              color: SmartTaxiColors.textSecondary,
              fontSize: 13,
              height: 1.35,
              fontWeight: FontWeight.w600,
            ),
          ),
          if (error != null) ...[
            const SizedBox(height: 14),
            _InlineMessage(text: error!, danger: true),
          ],
          const SizedBox(height: 18),
          _GoldCtaButton(
            enabled: !loading,
            loading: loading,
            text: 'Повторить поиск',
            loadingText: 'Ищем снова...',
            onTap: onRetry,
          ),
          const SizedBox(height: 6),
          TextButton(
            onPressed: loading ? null : onCancel,
            child: const Text(
              'Отменить заказ',
              style: TextStyle(
                color: SmartTaxiColors.danger,
                fontWeight: FontWeight.w800,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _DriverPriceOfferPanel extends StatelessWidget {
  const _DriverPriceOfferPanel({
    required this.order,
    required this.responding,
    required this.onRespond,
  });

  final OrderSummary order;
  final bool responding;
  final ValueChanged<bool> onRespond;

  @override
  Widget build(BuildContext context) {
    final offered = order.driverOfferPriceKzt;
    final current = order.price;
    return _HomeOrderPanel(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          const _SheetHandle(dark: false),
          const SizedBox(height: 12),
          Container(
            width: 60,
            height: 60,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: SmartTaxiColors.goldSurface,
              borderRadius: BorderRadius.circular(20),
            ),
            child: const Icon(
              Icons.local_offer_rounded,
              color: SmartTaxiColors.goldDeep,
              size: 28,
            ),
          ),
          const SizedBox(height: 14),
          const Text(
            'Водитель предлагает свою цену',
            textAlign: TextAlign.center,
            style: TextStyle(
              color: SmartTaxiColors.text,
              fontSize: 17,
              fontWeight: FontWeight.w900,
            ),
          ),
          const SizedBox(height: 6),
          Text(
            offered == null
                ? 'Новая цена поездки'
                : current == null
                    ? _formatTenge(offered.toDouble())
                    : '${_formatTenge(offered.toDouble())} вместо ${_formatTenge(current)}',
            textAlign: TextAlign.center,
            style: const TextStyle(
              color: SmartTaxiColors.textSecondary,
              fontSize: 13,
              height: 1.3,
              fontWeight: FontWeight.w600,
            ),
          ),
          const SizedBox(height: 18),
          _GoldCtaButton(
            enabled: !responding,
            loading: responding,
            text: 'Согласиться',
            loadingText: 'Отправляем ответ...',
            trailingText:
                offered == null ? null : _formatTenge(offered.toDouble()),
            onTap: () => onRespond(true),
          ),
          const SizedBox(height: 10),
          SizedBox(
            width: double.infinity,
            child: OutlinedButton(
              onPressed: responding ? null : () => onRespond(false),
              style: OutlinedButton.styleFrom(
                foregroundColor: SmartTaxiColors.textSecondary,
                side: const BorderSide(color: SmartTaxiColors.border),
                padding: const EdgeInsets.symmetric(vertical: 15),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(20),
                ),
              ),
              child: const Text(
                'Отказаться',
                style: TextStyle(fontWeight: FontWeight.w800),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _TripCancelledPanel extends StatelessWidget {
  const _TripCancelledPanel({required this.status, required this.onNewTrip});

  final String status;
  final VoidCallback onNewTrip;

  ({IconData icon, String title, String subtitle}) get _copy {
    switch (status) {
      case 'CANCELLED_BY_DRIVER':
        return (
          icon: Icons.person_off_rounded,
          title: 'Водитель отменил поездку',
          subtitle: 'Найдём вам другого водителя за пару секунд',
        );
      case 'CANCELLED_BY_OPERATOR':
        return (
          icon: Icons.support_agent_rounded,
          title: 'Поездка отменена оператором',
          subtitle: 'Если это ошибка — напишите в поддержку',
        );
      case 'NO_SHOW':
        return (
          icon: Icons.hourglass_disabled_rounded,
          title: 'Поездка не состоялась',
          subtitle: 'Водитель не дождался вас на месте посадки',
        );
      default:
        return (
          icon: Icons.close_rounded,
          title: 'Поездка отменена',
          subtitle: 'Вы можете заказать новую поездку в любой момент',
        );
    }
  }

  @override
  Widget build(BuildContext context) {
    final copy = _copy;
    return _HomeOrderPanel(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          const _SheetHandle(dark: false),
          const SizedBox(height: 12),
          Container(
            width: 60,
            height: 60,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: SmartTaxiColors.dangerSoft,
              borderRadius: BorderRadius.circular(20),
            ),
            child: Icon(
              copy.icon,
              color: SmartTaxiColors.danger,
              size: 28,
            ),
          ),
          const SizedBox(height: 14),
          Text(
            copy.title,
            textAlign: TextAlign.center,
            style: const TextStyle(
              color: SmartTaxiColors.text,
              fontSize: 17,
              fontWeight: FontWeight.w900,
            ),
          ),
          const SizedBox(height: 6),
          Text(
            copy.subtitle,
            textAlign: TextAlign.center,
            style: const TextStyle(
              color: SmartTaxiColors.textSecondary,
              fontSize: 13,
              height: 1.3,
              fontWeight: FontWeight.w600,
            ),
          ),
          const SizedBox(height: 18),
          _GoldCtaButton(
            enabled: true,
            loading: false,
            text: 'Заказать снова',
            onTap: onNewTrip,
          ),
        ],
      ),
    );
  }
}

class _CancelConfirmSheet extends StatelessWidget {
  const _CancelConfirmSheet({required this.driverAssigned});

  final bool driverAssigned;

  @override
  Widget build(BuildContext context) {
    final title =
        driverAssigned ? 'Отменить поездку?' : 'Отменить поиск водителя?';
    final subtitle = driverAssigned
        ? 'Водитель уже направляется к вам. При частой отмене после назначения водителя может взиматься небольшая плата.'
        : 'Мы прекратим поиск, и заказ будет снят.';
    return SafeArea(
      top: false,
      child: Container(
        margin: const EdgeInsets.all(12),
        padding: const EdgeInsets.fromLTRB(20, 16, 20, 20),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(28),
          boxShadow: const [
            BoxShadow(
              color: Color(0x30141414),
              blurRadius: 30,
              offset: Offset(0, 14),
            ),
          ],
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Center(child: _SheetHandle(dark: false)),
            const SizedBox(height: 12),
            Container(
              width: 52,
              height: 52,
              alignment: Alignment.center,
              decoration: BoxDecoration(
                color: SmartTaxiColors.dangerSoft,
                borderRadius: BorderRadius.circular(16),
              ),
              child: const Icon(
                Icons.error_outline_rounded,
                color: SmartTaxiColors.danger,
                size: 26,
              ),
            ),
            const SizedBox(height: 14),
            Text(
              title,
              textAlign: TextAlign.center,
              style: const TextStyle(
                color: SmartTaxiColors.text,
                fontSize: 17,
                fontWeight: FontWeight.w900,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              subtitle,
              textAlign: TextAlign.center,
              style: const TextStyle(
                color: SmartTaxiColors.textSecondary,
                fontSize: 13,
                height: 1.4,
                fontWeight: FontWeight.w600,
              ),
            ),
            const SizedBox(height: 18),
            SizedBox(
              width: double.infinity,
              child: ElevatedButton(
                onPressed: () => Navigator.pop(context, true),
                style: ElevatedButton.styleFrom(
                  backgroundColor: SmartTaxiColors.danger,
                  foregroundColor: Colors.white,
                  disabledBackgroundColor: SmartTaxiColors.danger,
                  minimumSize: const Size.fromHeight(52),
                ),
                child: const Text('Да, отменить'),
              ),
            ),
            const SizedBox(height: 10),
            SizedBox(
              width: double.infinity,
              child: OutlinedButton(
                onPressed: () => Navigator.pop(context, false),
                child: const Text('Нет, продолжить'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// Generic confirm/cancel sheet, same visual language as
// _CancelConfirmSheet — that one stayed order-cancel-specific (its copy
// branches on driverAssigned) rather than being generalized retroactively,
// but new call sites (recurring bookings, and future ones) use this
// instead of writing another bespoke sheet each time.
class _ConfirmSheet extends StatelessWidget {
  const _ConfirmSheet({
    required this.title,
    required this.text,
    required this.confirmLabel,
    this.cancelLabel = 'Отмена',
    this.danger = false,
  });

  final String title;
  final String text;
  final String confirmLabel;
  final String cancelLabel;
  final bool danger;

  @override
  Widget build(BuildContext context) {
    final accent = danger ? SmartTaxiColors.danger : SmartTaxiColors.goldDeep;
    final accentSoft =
        danger ? SmartTaxiColors.dangerSoft : SmartTaxiColors.goldSurface;
    return SafeArea(
      top: false,
      child: Container(
        margin: const EdgeInsets.all(12),
        padding: const EdgeInsets.fromLTRB(20, 16, 20, 20),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(28),
          boxShadow: const [
            BoxShadow(
              color: Color(0x30141414),
              blurRadius: 30,
              offset: Offset(0, 14),
            ),
          ],
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Center(child: _SheetHandle(dark: false)),
            const SizedBox(height: 12),
            Container(
              width: 52,
              height: 52,
              alignment: Alignment.center,
              decoration: BoxDecoration(
                color: accentSoft,
                borderRadius: BorderRadius.circular(16),
              ),
              child: Icon(Icons.error_outline_rounded,
                  color: accent, size: 26),
            ),
            const SizedBox(height: 14),
            Text(
              title,
              textAlign: TextAlign.center,
              style: const TextStyle(
                color: SmartTaxiColors.text,
                fontSize: 17,
                fontWeight: FontWeight.w900,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              text,
              textAlign: TextAlign.center,
              style: const TextStyle(
                color: SmartTaxiColors.textSecondary,
                fontSize: 13,
                height: 1.4,
                fontWeight: FontWeight.w600,
              ),
            ),
            const SizedBox(height: 18),
            SizedBox(
              width: double.infinity,
              child: ElevatedButton(
                onPressed: () => Navigator.pop(context, true),
                style: ElevatedButton.styleFrom(
                  backgroundColor: accent,
                  foregroundColor: Colors.white,
                  disabledBackgroundColor: accent,
                  minimumSize: const Size.fromHeight(52),
                ),
                child: Text(confirmLabel),
              ),
            ),
            const SizedBox(height: 10),
            SizedBox(
              width: double.infinity,
              child: OutlinedButton(
                onPressed: () => Navigator.pop(context, false),
                child: Text(cancelLabel),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _RecurringBookingCard extends StatelessWidget {
  const _RecurringBookingCard({
    required this.booking,
    required this.updating,
    required this.onPause,
    required this.onResume,
    required this.onCancel,
  });

  final RecurringBooking booking;
  final bool updating;
  final VoidCallback onPause;
  final VoidCallback onResume;
  final VoidCallback onCancel;

  (StatusTone, String) get _statusMeta {
    switch (booking.status) {
      case 'ACTIVE':
        return (StatusTone.success, 'Активна');
      case 'PAUSED':
        return (StatusTone.neutral, 'На паузе');
      case 'CANCELLED':
        return (StatusTone.neutral, 'Отменена');
      default:
        return (StatusTone.neutral, 'Ждём водителя');
    }
  }

  @override
  Widget build(BuildContext context) {
    final (tone, label) = _statusMeta;
    return Opacity(
      opacity: booking.isCancelled ? 0.6 : 1,
      child: _PremiumCard(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  child: Text(
                    '${booking.pickupText} → ${booking.dropoffText}',
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      fontSize: 14.5,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                StatusPill(label: label, tone: tone),
              ],
            ),
            const SizedBox(height: 10),
            Wrap(
              spacing: 8,
              runSpacing: 6,
              children: [
                _RecurringBookingChip(
                  icon: Icons.event_repeat_rounded,
                  label: booking.daysLabel,
                ),
                _RecurringBookingChip(
                  icon: Icons.schedule_rounded,
                  label: booking.timeOfDay,
                ),
                _RecurringBookingChip(
                  icon: Icons.payments_outlined,
                  label: _formatTenge(booking.priceKzt.toDouble()),
                ),
                if ((booking.driverName ?? '').isNotEmpty)
                  _RecurringBookingChip(
                    icon: Icons.person_outline_rounded,
                    label: booking.driverName!,
                  ),
              ],
            ),
            if (booking.notes.isNotEmpty) ...[
              const SizedBox(height: 8),
              Text(
                booking.notes,
                style: const TextStyle(
                  color: SmartTaxiColors.textSecondary,
                  fontSize: 12.5,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ],
            if (!booking.isCancelled) ...[
              const SizedBox(height: 12),
              Row(
                children: [
                  if (booking.isActive)
                    Expanded(
                      child: OutlinedButton(
                        onPressed: updating ? null : onPause,
                        child: const Text('Пауза'),
                      ),
                    )
                  else if (booking.isPaused)
                    Expanded(
                      child: OutlinedButton(
                        onPressed: updating ? null : onResume,
                        child: const Text('Возобновить'),
                      ),
                    )
                  else
                    const Expanded(
                      child: Text(
                        'Ждём подтверждения от водителя',
                        style: TextStyle(
                          color: SmartTaxiColors.textSecondary,
                          fontSize: 12.5,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ),
                  const SizedBox(width: 10),
                  TextButton(
                    onPressed: updating ? null : onCancel,
                    style: TextButton.styleFrom(
                      foregroundColor: SmartTaxiColors.danger,
                    ),
                    child: const Text('Отменить'),
                  ),
                ],
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _RecurringBookingChip extends StatelessWidget {
  const _RecurringBookingChip({required this.icon, required this.label});

  final IconData icon;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: SmartTaxiColors.goldSurface,
        borderRadius: BorderRadius.circular(999),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 14, color: SmartTaxiColors.goldDeep),
          const SizedBox(width: 5),
          Text(
            label,
            style: const TextStyle(
              fontSize: 11.5,
              fontWeight: FontWeight.w800,
            ),
          ),
        ],
      ),
    );
  }
}

class _FavoriteAddressCard extends StatelessWidget {
  const _FavoriteAddressCard({
    required this.address,
    required this.deleting,
    required this.onDelete,
  });

  final FavoriteAddress address;
  final bool deleting;
  final VoidCallback onDelete;

  (IconData, String) get _labelMeta {
    switch (address.label) {
      case 'HOME':
        return (Icons.home_rounded, 'Дом');
      case 'WORK':
        return (Icons.work_rounded, 'Работа');
      default:
        return (Icons.place_rounded, 'Другое');
    }
  }

  @override
  Widget build(BuildContext context) {
    final (icon, labelText) = _labelMeta;
    return _PremiumCard(
      child: Row(
        children: [
          Container(
            width: 44,
            height: 44,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: SmartTaxiColors.goldSurface,
              border: Border.all(color: SmartTaxiColors.border),
              borderRadius: BorderRadius.circular(16),
            ),
            child: Icon(icon, color: SmartTaxiColors.goldDeep),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Text(
                      address.title,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style:
                          const TextStyle(fontWeight: FontWeight.w900),
                    ),
                    const SizedBox(width: 6),
                    _RecurringBookingChip(icon: icon, label: labelText),
                  ],
                ),
                const SizedBox(height: 3),
                Text(
                  address.addressText,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    color: SmartTaxiColors.textSecondary,
                    fontSize: 12.5,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          deleting
              ? const SizedBox(
                  width: 20,
                  height: 20,
                  child: CircularProgressIndicator(strokeWidth: 2.2),
                )
              : IconButton(
                  onPressed: onDelete,
                  tooltip: 'Удалить',
                  icon: const Icon(
                    Icons.delete_outline_rounded,
                    color: SmartTaxiColors.danger,
                  ),
                ),
        ],
      ),
    );
  }
}

class _DriverPreferenceCard extends StatelessWidget {
  const _DriverPreferenceCard({
    required this.preference,
    required this.removing,
    required this.onRemove,
  });

  final DriverPreference preference;
  final bool removing;
  final VoidCallback onRemove;

  @override
  Widget build(BuildContext context) {
    final blocked = preference.isBlocked;
    final meta = [preference.driverCarModel, preference.driverPlate]
        .where((value) => (value ?? '').trim().isNotEmpty)
        .join(' · ');
    return _PremiumCard(
      child: Row(
        children: [
          Container(
            width: 44,
            height: 44,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: blocked
                  ? SmartTaxiColors.dangerSoft
                  : SmartTaxiColors.goldSurface,
              border: Border.all(color: SmartTaxiColors.border),
              borderRadius: BorderRadius.circular(16),
            ),
            child: Icon(
              blocked ? Icons.block_rounded : Icons.star_rounded,
              color: blocked
                  ? SmartTaxiColors.danger
                  : SmartTaxiColors.goldDeep,
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  (preference.driverName ?? '').isEmpty
                      ? 'Водитель'
                      : preference.driverName!,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(fontWeight: FontWeight.w900),
                ),
                if (meta.isNotEmpty) ...[
                  const SizedBox(height: 3),
                  Text(
                    meta,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      color: SmartTaxiColors.textSecondary,
                      fontSize: 12.5,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ],
              ],
            ),
          ),
          const SizedBox(width: 8),
          removing
              ? const SizedBox(
                  width: 20,
                  height: 20,
                  child: CircularProgressIndicator(strokeWidth: 2.2),
                )
              : IconButton(
                  onPressed: onRemove,
                  tooltip: 'Удалить',
                  icon: const Icon(
                    Icons.close_rounded,
                    color: SmartTaxiColors.textSecondary,
                  ),
                ),
        ],
      ),
    );
  }
}

class _AddDriverPreferenceSheet extends StatefulWidget {
  const _AddDriverPreferenceSheet({
    required this.candidates,
    required this.submitting,
    required this.onSubmit,
  });

  final List<(String id, String name)> candidates;
  final bool submitting;
  final void Function(String driverId, String type) onSubmit;

  @override
  State<_AddDriverPreferenceSheet> createState() =>
      _AddDriverPreferenceSheetState();
}

class _AddDriverPreferenceSheetState
    extends State<_AddDriverPreferenceSheet> {
  String? _driverId;
  String _type = 'FAVORITE';

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      top: false,
      child: Container(
        margin: const EdgeInsets.all(12),
        padding: const EdgeInsets.fromLTRB(20, 16, 20, 20),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(28),
          boxShadow: const [
            BoxShadow(
              color: Color(0x30141414),
              blurRadius: 30,
              offset: Offset(0, 14),
            ),
          ],
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Center(child: _SheetHandle(dark: false)),
            const SizedBox(height: 14),
            const Text(
              'Отметить водителя',
              style: TextStyle(fontSize: 17, fontWeight: FontWeight.w900),
            ),
            const SizedBox(height: 14),
            if (widget.candidates.isEmpty)
              const _InlineMessage(
                text:
                    'Нет водителей из истории поездок, которых ещё можно отметить.',
              )
            else ...[
              Container(
                decoration: BoxDecoration(
                  border: Border.all(color: SmartTaxiColors.border),
                  borderRadius: BorderRadius.circular(16),
                ),
                padding: const EdgeInsets.symmetric(horizontal: 12),
                child: DropdownButtonHideUnderline(
                  child: DropdownButton<String>(
                    isExpanded: true,
                    value: _driverId,
                    hint: const Text('Выберите водителя'),
                    items: widget.candidates
                        .map((driver) => DropdownMenuItem(
                              value: driver.$1,
                              child: Text(driver.$2,
                                  overflow: TextOverflow.ellipsis),
                            ))
                        .toList(),
                    onChanged: (value) => setState(() => _driverId = value),
                  ),
                ),
              ),
              const SizedBox(height: 14),
              Wrap(
                spacing: 8,
                children: [
                  ChoiceChip(
                    label: const Text('В избранное'),
                    selected: _type == 'FAVORITE',
                    onSelected: (_) => setState(() => _type = 'FAVORITE'),
                  ),
                  ChoiceChip(
                    label: const Text('Заблокировать'),
                    selected: _type == 'BLOCKED',
                    onSelected: (_) => setState(() => _type = 'BLOCKED'),
                  ),
                ],
              ),
              const SizedBox(height: 16),
              _GoldCtaButton(
                enabled: !widget.submitting && _driverId != null,
                loading: widget.submitting,
                text: 'Сохранить',
                loadingText: 'Сохраняем...',
                onTap: () => widget.onSubmit(_driverId!, _type),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _CreateFavoriteAddressSheet extends StatefulWidget {
  const _CreateFavoriteAddressSheet({
    required this.suggestion,
    required this.submitting,
    required this.onSubmit,
  });

  final AddressSuggestion suggestion;
  final bool submitting;
  final void Function(String label, String title) onSubmit;

  @override
  State<_CreateFavoriteAddressSheet> createState() =>
      _CreateFavoriteAddressSheetState();
}

class _CreateFavoriteAddressSheetState
    extends State<_CreateFavoriteAddressSheet> {
  String _label = 'HOME';
  late final _titleController =
      TextEditingController(text: _defaultTitleFor('HOME'));

  String _defaultTitleFor(String label) {
    switch (label) {
      case 'HOME':
        return 'Дом';
      case 'WORK':
        return 'Работа';
      default:
        return '';
    }
  }

  @override
  void dispose() {
    _titleController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      top: false,
      child: Container(
        margin: const EdgeInsets.all(12),
        padding: const EdgeInsets.fromLTRB(20, 16, 20, 20),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(28),
          boxShadow: const [
            BoxShadow(
              color: Color(0x30141414),
              blurRadius: 30,
              offset: Offset(0, 14),
            ),
          ],
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Center(child: _SheetHandle(dark: false)),
            const SizedBox(height: 14),
            const Text(
              'Добавить в избранное',
              style: TextStyle(fontSize: 17, fontWeight: FontWeight.w900),
            ),
            const SizedBox(height: 4),
            Text(
              widget.suggestion.label,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(
                color: SmartTaxiColors.textSecondary,
                fontSize: 12.5,
                fontWeight: FontWeight.w600,
              ),
            ),
            const SizedBox(height: 14),
            Wrap(
              spacing: 8,
              children: [
                ChoiceChip(
                  label: const Text('Дом'),
                  selected: _label == 'HOME',
                  onSelected: (_) => setState(() {
                    _label = 'HOME';
                    _titleController.text = _defaultTitleFor('HOME');
                  }),
                ),
                ChoiceChip(
                  label: const Text('Работа'),
                  selected: _label == 'WORK',
                  onSelected: (_) => setState(() {
                    _label = 'WORK';
                    _titleController.text = _defaultTitleFor('WORK');
                  }),
                ),
                ChoiceChip(
                  label: const Text('Другое'),
                  selected: _label == 'OTHER',
                  onSelected: (_) => setState(() {
                    _label = 'OTHER';
                    _titleController.text = _defaultTitleFor('OTHER');
                  }),
                ),
              ],
            ),
            const SizedBox(height: 14),
            TextField(
              controller: _titleController,
              onChanged: (_) => setState(() {}),
              decoration: const InputDecoration(
                labelText: 'Название',
                hintText: 'Например, «Дача» или «Спортзал»',
              ),
            ),
            const SizedBox(height: 16),
            _GoldCtaButton(
              enabled: !widget.submitting &&
                  _titleController.text.trim().isNotEmpty,
              loading: widget.submitting,
              text: 'Сохранить',
              loadingText: 'Сохраняем...',
              onTap: () =>
                  widget.onSubmit(_label, _titleController.text.trim()),
            ),
          ],
        ),
      ),
    );
  }
}

// Deliberately not _AddressSearchSheet: that one is coupled to the home
// screen's own _target/_mapPointPickerActive state (map-tap picking,
// recent/popular suggestions tied to the active order flow) — none of
// which applies to picking a fixed recurring-route address. This is a
// plain text-search-only sheet built from the same searchAddresses API,
// not a modification of the actual address-selection screen.
class _SimpleAddressSearchSheet extends StatefulWidget {
  const _SimpleAddressSearchSheet({required this.api, required this.title});

  final ApiClient api;
  final String title;

  @override
  State<_SimpleAddressSearchSheet> createState() =>
      _SimpleAddressSearchSheetState();
}

class _SimpleAddressSearchSheetState
    extends State<_SimpleAddressSearchSheet> {
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

  void _onChanged(String value) {
    setState(() {});
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 360), () => _search(value));
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
      final results = await widget.api.searchAddresses(query);
      if (!mounted) return;
      setState(() => _results = results);
    } catch (_) {
      if (!mounted) return;
      setState(() => _error = 'Не удалось найти адрес');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return DraggableScrollableSheet(
      initialChildSize: 0.75,
      minChildSize: 0.5,
      maxChildSize: 0.95,
      expand: false,
      builder: (context, scrollController) {
        return Container(
          decoration: const BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
          ),
          padding: const EdgeInsets.fromLTRB(20, 14, 20, 0),
          child: Column(
            children: [
              const Center(child: _SheetHandle(dark: false)),
              Text(
                widget.title,
                style: const TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.w900,
                ),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _query,
                autofocus: true,
                onChanged: _onChanged,
                decoration: InputDecoration(
                  hintText: 'Улица, дом или место',
                  prefixIcon: const Icon(Icons.search_rounded),
                  suffixIcon: _query.text.isEmpty
                      ? null
                      : IconButton(
                          icon: const Icon(Icons.close_rounded),
                          tooltip: 'Очистить',
                          onPressed: () {
                            _query.clear();
                            _onChanged('');
                          },
                        ),
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(16),
                  ),
                ),
              ),
              const SizedBox(height: 10),
              Expanded(
                child: _loading
                    ? const Center(
                        child: CircularProgressIndicator(strokeWidth: 2.4),
                      )
                    : _error != null
                        ? EmptyState(
                            icon: Icons.wifi_off_rounded,
                            title: 'Ошибка поиска',
                            text: _error!,
                          )
                        : _results.isEmpty
                            ? EmptyState(
                                icon: Icons.location_searching_rounded,
                                title: _query.text.trim().length < 2
                                    ? 'Введите адрес'
                                    : 'Ничего не найдено',
                                text: _query.text.trim().length < 2
                                    ? 'Начните вводить название улицы или места'
                                    : 'Попробуйте изменить запрос',
                              )
                            : ListView.builder(
                                controller: scrollController,
                                itemCount: _results.length,
                                itemBuilder: (context, index) {
                                  final item = _results[index];
                                  return ListTile(
                                    leading: const Icon(
                                      Icons.place_rounded,
                                      color: SmartTaxiColors.goldDeep,
                                    ),
                                    title: Text(
                                      item.label,
                                      maxLines: 1,
                                      overflow: TextOverflow.ellipsis,
                                    ),
                                    subtitle: item.subtitle == null
                                        ? null
                                        : Text(
                                            item.subtitle!,
                                            maxLines: 1,
                                            overflow: TextOverflow.ellipsis,
                                          ),
                                    onTap: () =>
                                        Navigator.of(context).pop(item),
                                  );
                                },
                              ),
              ),
            ],
          ),
        );
      },
    );
  }
}

class _CreateRecurringBookingSheet extends StatefulWidget {
  const _CreateRecurringBookingSheet({
    required this.api,
    required this.knownDrivers,
    required this.submitting,
    required this.onSubmit,
  });

  final ApiClient api;
  final List<(String id, String name)> knownDrivers;
  final bool submitting;
  final Future<void> Function({
    required String driverId,
    required String pickupText,
    required Coordinate pickupCoordinate,
    required String dropoffText,
    required Coordinate dropoffCoordinate,
    required List<int> daysOfWeek,
    required String timeOfDay,
    required int priceKzt,
    String notes,
  }) onSubmit;

  @override
  State<_CreateRecurringBookingSheet> createState() =>
      _CreateRecurringBookingSheetState();
}

class _CreateRecurringBookingSheetState
    extends State<_CreateRecurringBookingSheet> {
  static const _dayLabels = {1: 'Пн', 2: 'Вт', 3: 'Ср', 4: 'Чт', 5: 'Пт'};

  String? _driverId;
  AddressSuggestion? _pickup;
  AddressSuggestion? _dropoff;
  final Set<int> _days = {};
  TimeOfDay? _time;
  final _priceController = TextEditingController();
  final _notesController = TextEditingController();
  String? _error;

  @override
  void dispose() {
    _priceController.dispose();
    _notesController.dispose();
    super.dispose();
  }

  Future<void> _pickAddress({required bool pickup}) async {
    final result = await showModalBottomSheet<AddressSuggestion>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => _SimpleAddressSearchSheet(
        api: widget.api,
        title: pickup ? 'Точка посадки' : 'Точка назначения',
      ),
    );
    if (result == null || !mounted) return;
    setState(() {
      if (pickup) {
        _pickup = result;
      } else {
        _dropoff = result;
      }
    });
  }

  Future<void> _pickTime() async {
    final picked = await showTimePicker(
      context: context,
      initialTime: _time ?? const TimeOfDay(hour: 8, minute: 0),
    );
    if (picked != null && mounted) setState(() => _time = picked);
  }

  void _submit() {
    final driverId = _driverId;
    final pickup = _pickup;
    final dropoff = _dropoff;
    final time = _time;
    final price = int.tryParse(_priceController.text.trim());
    if (driverId == null) {
      setState(() => _error = 'Выберите водителя');
      return;
    }
    if (pickup == null || dropoff == null) {
      setState(() => _error = 'Укажите точки посадки и назначения');
      return;
    }
    if (_days.isEmpty) {
      setState(() => _error = 'Выберите хотя бы один день недели');
      return;
    }
    if (time == null) {
      setState(() => _error = 'Укажите время подачи');
      return;
    }
    if (price == null || price < 200 || price > 1000000) {
      setState(() => _error = 'Укажите цену от 200 до 1 000 000 ₸');
      return;
    }
    setState(() => _error = null);
    final timeOfDay =
        '${time.hour.toString().padLeft(2, '0')}:${time.minute.toString().padLeft(2, '0')}';
    unawaited(widget.onSubmit(
      driverId: driverId,
      pickupText: pickup.label,
      pickupCoordinate: pickup.coordinate,
      dropoffText: dropoff.label,
      dropoffCoordinate: dropoff.coordinate,
      daysOfWeek: (_days.toList()..sort()),
      timeOfDay: timeOfDay,
      priceKzt: price,
      notes: _notesController.text.trim(),
    ));
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(
        bottom: MediaQuery.viewInsetsOf(context).bottom,
      ),
      child: DraggableScrollableSheet(
        initialChildSize: 0.85,
        minChildSize: 0.5,
        maxChildSize: 0.95,
        expand: false,
        builder: (context, scrollController) {
          return Container(
            decoration: const BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
            ),
            padding: const EdgeInsets.fromLTRB(20, 14, 20, 20),
            child: ListView(
              controller: scrollController,
              children: [
                const Center(child: _SheetHandle(dark: false)),
                const Text(
                  'Новый регулярный маршрут',
                  style: TextStyle(fontSize: 18, fontWeight: FontWeight.w900),
                ),
                const SizedBox(height: 4),
                const Text(
                  'Например, отвозить ребёнка в школу по будням',
                  style: TextStyle(
                    color: SmartTaxiColors.textSecondary,
                    fontSize: 12.5,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                const SizedBox(height: 16),
                const Text('Водитель',
                    style: TextStyle(fontWeight: FontWeight.w800, fontSize: 13)),
                const SizedBox(height: 8),
                if (widget.knownDrivers.isEmpty)
                  const _CompactNotice(
                    icon: Icons.info_outline_rounded,
                    title: 'Нет доступных водителей',
                    text:
                        'Водителя можно выбрать только из тех, с кем у вас уже была поездка. Совершите хотя бы одну поездку, чтобы предложить регулярный маршрут.',
                  )
                else
                  DropdownButtonFormField<String>(
                    initialValue: _driverId,
                    decoration: InputDecoration(
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(16),
                      ),
                      hintText: 'Выберите водителя',
                    ),
                    items: widget.knownDrivers
                        .map((driver) => DropdownMenuItem(
                              value: driver.$1,
                              child: Text(driver.$2, overflow: TextOverflow.ellipsis),
                            ))
                        .toList(),
                    onChanged: (value) => setState(() => _driverId = value),
                  ),
                const SizedBox(height: 14),
                _RecurringAddressField(
                  label: 'Откуда',
                  value: _pickup?.label,
                  onTap: () => _pickAddress(pickup: true),
                ),
                const SizedBox(height: 10),
                _RecurringAddressField(
                  label: 'Куда',
                  value: _dropoff?.label,
                  onTap: () => _pickAddress(pickup: false),
                ),
                const SizedBox(height: 14),
                const Text('Дни недели',
                    style: TextStyle(fontWeight: FontWeight.w800, fontSize: 13)),
                const SizedBox(height: 8),
                Wrap(
                  spacing: 8,
                  children: _dayLabels.entries.map((entry) {
                    final selected = _days.contains(entry.key);
                    return ChoiceChip(
                      label: Text(entry.value),
                      selected: selected,
                      onSelected: (value) => setState(() {
                        if (value) {
                          _days.add(entry.key);
                        } else {
                          _days.remove(entry.key);
                        }
                      }),
                    );
                  }).toList(),
                ),
                const SizedBox(height: 14),
                const Text('Время подачи',
                    style: TextStyle(fontWeight: FontWeight.w800, fontSize: 13)),
                const SizedBox(height: 8),
                OutlinedButton.icon(
                  onPressed: _pickTime,
                  icon: const Icon(Icons.schedule_rounded),
                  label: Text(
                    _time == null
                        ? 'Выбрать время'
                        : '${_time!.hour.toString().padLeft(2, '0')}:${_time!.minute.toString().padLeft(2, '0')}',
                  ),
                ),
                const SizedBox(height: 14),
                TextField(
                  controller: _priceController,
                  keyboardType: TextInputType.number,
                  decoration: InputDecoration(
                    labelText: 'Цена, ₸',
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(16),
                    ),
                  ),
                ),
                const SizedBox(height: 14),
                TextField(
                  controller: _notesController,
                  maxLines: 2,
                  decoration: InputDecoration(
                    labelText: 'Комментарий (необязательно)',
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(16),
                    ),
                  ),
                ),
                if (_error != null) ...[
                  const SizedBox(height: 10),
                  _InlineMessage(text: _error!, danger: true, dark: false),
                ],
                const SizedBox(height: 18),
                _GoldCtaButton(
                  enabled: !widget.submitting && widget.knownDrivers.isNotEmpty,
                  loading: widget.submitting,
                  text: 'Отправить водителю',
                  loadingText: 'Отправляем...',
                  onTap: _submit,
                ),
              ],
            ),
          );
        },
      ),
    );
  }
}

class _RecurringAddressField extends StatelessWidget {
  const _RecurringAddressField({
    required this.label,
    required this.value,
    required this.onTap,
  });

  final String label;
  final String? value;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.transparent,
      child: InkWell(
        borderRadius: BorderRadius.circular(16),
        onTap: onTap,
        child: Container(
          width: double.infinity,
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
          decoration: BoxDecoration(
            border: Border.all(color: SmartTaxiColors.border),
            borderRadius: BorderRadius.circular(16),
          ),
          child: Row(
            children: [
              const Icon(Icons.place_outlined,
                  size: 18, color: SmartTaxiColors.goldDeep),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      label,
                      style: const TextStyle(
                        color: SmartTaxiColors.textSecondary,
                        fontSize: 11,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    Text(
                      value ?? 'Выбрать адрес',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        color: value == null
                            ? SmartTaxiColors.textMuted
                            : SmartTaxiColors.text,
                        fontSize: 13.5,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ],
                ),
              ),
              const Icon(Icons.chevron_right_rounded,
                  color: SmartTaxiColors.textSecondary),
            ],
          ),
        ),
      ),
    );
  }
}

class _InitialsAvatar extends StatelessWidget {
  const _InitialsAvatar({
    required this.name,
    this.size = 52,
    this.showStatusDot = true,
  });

  final String name;
  final double size;
  final bool showStatusDot;

  @override
  Widget build(BuildContext context) {
    final trimmed = name.trim();
    final initial = trimmed.isEmpty ? '?' : trimmed[0].toUpperCase();
    return Stack(
      clipBehavior: Clip.none,
      children: [
        Container(
          width: size,
          height: size,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            gradient: const LinearGradient(
              colors: [SmartTaxiColors.goldSoft, SmartTaxiColors.goldDeep],
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
            ),
            borderRadius: BorderRadius.circular(size * 0.34),
            boxShadow: [
              BoxShadow(
                color: SmartTaxiColors.gold.withValues(alpha: 0.30),
                blurRadius: 16,
                offset: const Offset(0, 8),
              ),
            ],
          ),
          child: Text(
            initial,
            style: TextStyle(
              color: Colors.white,
              fontSize: size * 0.365,
              fontWeight: FontWeight.w800,
            ),
          ),
        ),
        if (showStatusDot)
          Positioned(
            bottom: -2,
            right: -2,
            child: Container(
              width: 16,
              height: 16,
              decoration: BoxDecoration(
                color: SmartTaxiColors.success,
                shape: BoxShape.circle,
                border: Border.all(color: Colors.white, width: 3),
              ),
            ),
          ),
      ],
    );
  }
}

class _ArrivedBanner extends StatefulWidget {
  const _ArrivedBanner();

  @override
  State<_ArrivedBanner> createState() => _ArrivedBannerState();
}

class _ArrivedBannerState extends State<_ArrivedBanner>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1400),
    )..repeat(reverse: true);
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    // Isolated in its own RepaintBoundary: this is the one continuously
    // animating widget in an otherwise static panel, so its repaints must
    // not force the whole sheet (or the opaque panel background) to redraw
    // every tick.
    return RepaintBoundary(
      child: AnimatedBuilder(
        animation: _controller,
        builder: (context, child) {
          final t = _controller.value;
          return Container(
            width: double.infinity,
            padding: const EdgeInsets.symmetric(vertical: 11, horizontal: 12),
            decoration: BoxDecoration(
              color: Color.lerp(
                SmartTaxiColors.successSoft,
                const Color(0xffd7f5e3),
                t,
              ),
              border: Border.all(
                color: SmartTaxiColors.success.withValues(
                  alpha: 0.35 + t * 0.25,
                ),
                width: 1.2,
              ),
              borderRadius: BorderRadius.circular(14),
            ),
            child: child,
          );
        },
        child: const Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(
              Icons.check_circle_rounded,
              size: 17,
              color: SmartTaxiColors.success,
            ),
            SizedBox(width: 7),
            Flexible(
              child: Text(
                'Водитель приехал и ждёт вас',
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  color: SmartTaxiColors.success,
                  fontSize: 12.5,
                  fontWeight: FontWeight.w900,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _EtaStrip extends StatelessWidget {
  const _EtaStrip({required this.text});

  final String text;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 12),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: [
            SmartTaxiColors.gold.withValues(alpha: 0.14),
            SmartTaxiColors.gold.withValues(alpha: 0.04),
          ],
        ),
        border: Border.all(color: SmartTaxiColors.gold.withValues(alpha: 0.28)),
        borderRadius: BorderRadius.circular(14),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const Icon(
            Icons.timer_rounded,
            size: 16,
            color: SmartTaxiColors.goldDeep,
          ),
          const SizedBox(width: 7),
          Flexible(
            child: Text(
              text,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(
                color: SmartTaxiColors.goldDeep,
                fontSize: 12.5,
                fontWeight: FontWeight.w900,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _TripProgressCard extends StatelessWidget {
  const _TripProgressCard({
    required this.pickup,
    required this.dropoff,
    required this.elapsedListenable,
    required this.elapsedReliable,
    this.estimatedDurationMin,
  });

  final String pickup;
  final String dropoff;
  final ValueListenable<Duration> elapsedListenable;
  final bool elapsedReliable;
  final double? estimatedDurationMin;

  static String _elapsedLabel(Duration elapsed, bool reliable) {
    // Seeded from an order that was already in progress when we first saw
    // it this session (app resumed mid-trip) — we don't actually know how
    // long it's been running, so don't claim it "just started".
    if (!reliable) return 'В пути';
    final minutes = elapsed.inMinutes;
    if (minutes <= 0) return 'Только начали';
    return '$minutes мин в пути';
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 16),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [
            SmartTaxiColors.gold.withValues(alpha: 0.12),
            SmartTaxiColors.gold.withValues(alpha: 0.02),
          ],
        ),
        border: Border.all(color: SmartTaxiColors.gold.withValues(alpha: 0.30)),
        borderRadius: BorderRadius.circular(24),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(
                Icons.directions_car_filled_rounded,
                color: SmartTaxiColors.goldDeep,
                size: 19,
              ),
              const SizedBox(width: 7),
              const Expanded(
                child: Text(
                  'Едем к месту назначения',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    color: SmartTaxiColors.goldDeep,
                    fontSize: 13,
                    fontWeight: FontWeight.w900,
                  ),
                ),
              ),
              ValueListenableBuilder<Duration>(
                valueListenable: elapsedListenable,
                builder: (context, elapsed, _) => Text(
                  _elapsedLabel(elapsed, elapsedReliable),
                  maxLines: 1,
                  style: const TextStyle(
                    color: SmartTaxiColors.goldDeep,
                    fontSize: 12,
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),
          SizedBox(
            height: 58,
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _LiveRouteProgressColumn(
                  height: 58,
                  elapsedListenable: elapsedListenable,
                  estimatedDurationMin: estimatedDurationMin,
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        pickup,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          color: SmartTaxiColors.textSecondary,
                          fontSize: 13,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      Text(
                        dropoff,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          color: SmartTaxiColors.text,
                          fontSize: 14.5,
                          fontWeight: FontWeight.w900,
                        ),
                      ),
                    ],
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

class _LiveRouteProgressColumn extends StatelessWidget {
  const _LiveRouteProgressColumn({
    required this.height,
    required this.elapsedListenable,
    this.estimatedDurationMin,
  });

  final double height;
  final ValueListenable<Duration> elapsedListenable;
  final double? estimatedDurationMin;

  @override
  Widget build(BuildContext context) {
    const dotSize = 6.0;
    final trackHeight = height - 20;
    final estimatedSeconds = (estimatedDurationMin ?? 0) * 60;
    // Tied to real elapsed time against the trip's estimated duration
    // instead of looping forever regardless of progress — a rider glancing
    // back during a long ride would otherwise see the dot "finish" and
    // restart every ~2s. When there's no estimate to compare against, hold
    // at the midpoint rather than fake motion with no real signal behind it.
    return RepaintBoundary(
      child: SizedBox(
        width: 14,
        height: height,
        child: ValueListenableBuilder<Duration>(
          valueListenable: elapsedListenable,
          builder: (context, elapsed, _) {
            final target = estimatedSeconds <= 0
                ? 0.5
                : (elapsed.inSeconds / estimatedSeconds).clamp(0.08, 0.92);
            return Stack(
              alignment: Alignment.topCenter,
              clipBehavior: Clip.none,
              children: [
                Container(
                  width: 10,
                  height: 10,
                  decoration: BoxDecoration(
                    color: const Color(0xff2f80ed),
                    shape: BoxShape.circle,
                    border: Border.all(color: Colors.white, width: 2),
                  ),
                ),
                Positioned(
                  top: 10,
                  bottom: 10,
                  child: Container(
                    width: 2,
                    color: SmartTaxiColors.gold.withValues(alpha: 0.25),
                  ),
                ),
                TweenAnimationBuilder<double>(
                  tween: Tween(begin: 0, end: target),
                  duration: const Duration(milliseconds: 900),
                  curve: Curves.easeOutCubic,
                  builder: (context, t, child) => Positioned(
                    top: 10 + trackHeight * t - dotSize / 2,
                    child: child!,
                  ),
                  child: Container(
                    width: dotSize,
                    height: dotSize,
                    decoration: BoxDecoration(
                      color: SmartTaxiColors.gold,
                      shape: BoxShape.circle,
                      boxShadow: [
                        BoxShadow(
                          color: SmartTaxiColors.gold.withValues(alpha: 0.45),
                          blurRadius: 6,
                        ),
                      ],
                    ),
                  ),
                ),
                Positioned(
                  bottom: 0,
                  child: Container(
                    width: 13,
                    height: 13,
                    decoration: BoxDecoration(
                      color: SmartTaxiColors.gold,
                      shape: BoxShape.circle,
                      border: Border.all(color: Colors.white, width: 2),
                      boxShadow: [
                        BoxShadow(
                          color: SmartTaxiColors.gold.withValues(alpha: 0.25),
                          blurRadius: 8,
                        ),
                      ],
                    ),
                  ),
                ),
              ],
            );
          },
        ),
      ),
    );
  }
}

class _ShareTripButton extends StatelessWidget {
  const _ShareTripButton({
    required this.shareToken,
    this.pickup,
    this.dropoff,
  });

  final String? shareToken;
  final String? pickup;
  final String? dropoff;

  @override
  Widget build(BuildContext context) {
    final token = shareToken;
    final enabled = token != null;
    return Tooltip(
      message: enabled
          ? 'Поделиться отслеживанием поездки'
          : 'Ссылка появится, как только найдётся водитель',
      child: Material(
        color: SmartTaxiColors.goldSurface,
        shape: const CircleBorder(),
        child: InkWell(
          customBorder: const CircleBorder(),
          onTap: !enabled
              ? null
              : () {
                  final link = '${AppConfig.webBaseUrl}/track/$token';
                  final route = [pickup, dropoff]
                      .where((value) => (value ?? '').trim().isNotEmpty)
                      .join(' → ');
                  final routeSuffix = route.isEmpty ? '' : ': $route';
                  unawaited(Share.share(
                    'Слежу за поездкой SmartTaxi$routeSuffix. Статус: $link',
                  ));
                },
          child: SizedBox(
            width: 34,
            height: 34,
            child: Icon(
              Icons.ios_share_rounded,
              color: enabled
                  ? SmartTaxiColors.goldDeep
                  : SmartTaxiColors.textMuted,
              size: 16,
            ),
          ),
        ),
      ),
    );
  }
}

class _SafetyButton extends StatelessWidget {
  const _SafetyButton({this.sosPhone, required this.api, required this.orderId});

  final String? sosPhone;
  final ApiClient api;
  final String orderId;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: SmartTaxiColors.dangerSoft,
      shape: const CircleBorder(),
      child: InkWell(
        customBorder: const CircleBorder(),
        onTap: () => showModalBottomSheet<void>(
          context: context,
          isScrollControlled: true,
          backgroundColor: Colors.transparent,
          builder: (_) =>
              _SafetySheet(sosPhone: sosPhone, api: api, orderId: orderId),
        ),
        child: const SizedBox(
          width: 34,
          height: 34,
          child: Icon(
            Icons.shield_outlined,
            color: SmartTaxiColors.danger,
            size: 17,
          ),
        ),
      ),
    );
  }
}

class _SafetySheet extends StatelessWidget {
  const _SafetySheet({this.sosPhone, required this.api, required this.orderId});

  final String? sosPhone;
  final ApiClient api;
  final String orderId;

  Future<void> _callEmergency() async {
    await launchUrl(Uri(scheme: 'tel', path: sosPhone ?? '112'));
  }

  // Fires alongside the emergency call, not instead of it — the call is the
  // safety-critical action and must never be delayed or blocked by this.
  // Puts the rider's current coordinates in the message body since the
  // support endpoint has no dedicated location field (topic/message/orderId
  // only); a short GPS timeout keeps a stuck fix from hanging the request.
  Future<void> _sendSosAlert() async {
    var locationText = 'координаты недоступны';
    try {
      final position = await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(
          accuracy: LocationAccuracy.high,
          timeLimit: Duration(seconds: 6),
        ),
      );
      locationText =
          '${position.latitude.toStringAsFixed(5)}, ${position.longitude.toStringAsFixed(5)}';
    } catch (_) {
      // Best-effort — the alert still goes out without coordinates.
    }
    try {
      await api.submitSupportMessage(
        topic: 'SOS',
        message:
            'Экстренный вызов во время поездки. Координаты: $locationText.',
        orderId: orderId,
      );
    } catch (_) {
      // Best-effort — the phone call already went out, which is what
      // actually keeps the rider safe.
    }
  }

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      top: false,
      child: Container(
        margin: const EdgeInsets.all(12),
        padding: const EdgeInsets.fromLTRB(20, 16, 20, 20),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(28),
          boxShadow: const [
            BoxShadow(
              color: Color(0x30141414),
              blurRadius: 30,
              offset: Offset(0, 14),
            ),
          ],
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Center(child: _SheetHandle(dark: false)),
            const SizedBox(height: 14),
            Row(
              children: [
                Container(
                  width: 44,
                  height: 44,
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    color: SmartTaxiColors.dangerSoft,
                    borderRadius: BorderRadius.circular(15),
                  ),
                  child: const Icon(
                    Icons.shield_outlined,
                    color: SmartTaxiColors.danger,
                  ),
                ),
                const SizedBox(width: 12),
                const Expanded(
                  child: Text(
                    'Безопасность поездки',
                    style: TextStyle(fontSize: 17, fontWeight: FontWeight.w900),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 14),
            _SettingsRow(
              title: 'Позвонить ${sosPhone ?? '112'}',
              text: 'Экстренная линия SmartTaxi, если что-то пошло не так',
              danger: true,
              onTap: () {
                Navigator.pop(context);
                unawaited(_callEmergency());
                unawaited(_sendSosAlert());
              },
            ),
            const Divider(height: 18, color: SmartTaxiColors.border),
            const _SettingsRow(
              title: 'Поддержка получит сигнал',
              text:
                  'Заявка с номером поездки и вашими координатами уходит в поддержку одновременно со звонком',
            ),
          ],
        ),
      ),
    );
  }
}

class _DriverContactCard extends StatelessWidget {
  const _DriverContactCard({
    required this.name,
    required this.rating,
    required this.carModel,
    required this.carColor,
    required this.plate,
    required this.phone,
    this.compact = false,
  });

  final String name;
  final double? rating;
  final String? carModel;
  final String? carColor;
  final String? plate;
  final String? phone;
  final bool compact;

  Future<void> _call() async {
    final number = phone?.trim();
    if (number == null || number.isEmpty) return;
    await launchUrl(Uri(scheme: 'tel', path: number));
  }

  Future<void> _message() async {
    final number = phone?.trim();
    if (number == null || number.isEmpty) return;
    await launchUrl(Uri(scheme: 'sms', path: number));
  }

  @override
  Widget build(BuildContext context) {
    final displayName = name.trim().isEmpty ? 'Водитель' : name.trim();
    final hasPhone = (phone ?? '').trim().isNotEmpty;
    if (compact) {
      return Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        decoration: BoxDecoration(
          color: Colors.white,
          border: Border.all(color: SmartTaxiColors.border),
          borderRadius: BorderRadius.circular(18),
        ),
        child: Row(
          children: [
            _InitialsAvatar(name: displayName, size: 38, showStatusDot: false),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Flexible(
                        child: Text(
                          displayName,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            color: SmartTaxiColors.text,
                            fontSize: 14,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                      ),
                      if (rating != null) ...[
                        const SizedBox(width: 5),
                        const Icon(
                          Icons.star_rounded,
                          color: SmartTaxiColors.gold,
                          size: 14,
                        ),
                        Text(
                          rating!.toStringAsFixed(1),
                          style: const TextStyle(
                            color: SmartTaxiColors.textSecondary,
                            fontSize: 11.5,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ],
                    ],
                  ),
                  if ((plate ?? '').trim().isNotEmpty)
                    Text(
                      plate!.trim(),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        color: SmartTaxiColors.textSecondary,
                        fontSize: 11.5,
                        fontWeight: FontWeight.w700,
                        letterSpacing: .3,
                      ),
                    ),
                ],
              ),
            ),
            if (hasPhone) ...[
              const SizedBox(width: 8),
              _RoundIconButton(
                icon: Icons.message_rounded,
                onTap: _message,
              ),
              const SizedBox(width: 8),
              _RoundIconButton(
                icon: Icons.call_rounded,
                filled: true,
                onTap: _call,
              ),
            ],
          ],
        ),
      );
    }
    final carLine = [carModel, carColor]
        .whereType<String>()
        .map((value) => value.trim())
        .where((value) => value.isNotEmpty)
        .join(', ');
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white,
        border: Border.all(color: SmartTaxiColors.border),
        borderRadius: BorderRadius.circular(22),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              TweenAnimationBuilder<double>(
                key: ValueKey('avatar-pop-$displayName'),
                tween: Tween(begin: 0.4, end: 1),
                duration: const Duration(milliseconds: 520),
                curve: Curves.elasticOut,
                builder: (context, scale, child) =>
                    Transform.scale(scale: scale, child: child),
                child: _InitialsAvatar(name: displayName),
              ),
              const SizedBox(width: 13),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            displayName,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                              color: SmartTaxiColors.text,
                              fontSize: 15.5,
                              fontWeight: FontWeight.w800,
                            ),
                          ),
                        ),
                        if (rating != null) ...[
                          const SizedBox(width: 6),
                          const Icon(
                            Icons.star_rounded,
                            color: SmartTaxiColors.gold,
                            size: 16,
                          ),
                          const SizedBox(width: 2),
                          Text(
                            rating!.toStringAsFixed(1),
                            style: const TextStyle(
                              color: SmartTaxiColors.textSecondary,
                              fontSize: 12.5,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                        ],
                      ],
                    ),
                    if (carLine.isNotEmpty) ...[
                      const SizedBox(height: 3),
                      Text(
                        carLine,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          color: SmartTaxiColors.textSecondary,
                          fontSize: 12.5,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ],
                    if ((plate ?? '').trim().isNotEmpty) ...[
                      const SizedBox(height: 6),
                      Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 8,
                          vertical: 3,
                        ),
                        decoration: BoxDecoration(
                          color: SmartTaxiColors.goldSurface,
                          border: Border.all(color: SmartTaxiColors.border),
                          borderRadius: BorderRadius.circular(6),
                        ),
                        child: Text(
                          plate!.trim(),
                          style: const TextStyle(
                            color: SmartTaxiColors.text,
                            fontSize: 12,
                            fontWeight: FontWeight.w800,
                            letterSpacing: .5,
                          ),
                        ),
                      ),
                    ],
                  ],
                ),
              ),
            ],
          ),
          if (hasPhone) ...[
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: _message,
                    icon: const Icon(Icons.message_rounded, size: 18),
                    label: const Text('Написать'),
                    style: OutlinedButton.styleFrom(
                      minimumSize: const Size.fromHeight(48),
                    ),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: ElevatedButton.icon(
                    onPressed: _call,
                    icon: const Icon(Icons.call_rounded, size: 18),
                    label: const Text('Позвонить'),
                    style: ElevatedButton.styleFrom(
                      minimumSize: const Size.fromHeight(48),
                    ),
                  ),
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }
}

class _RoundIconButton extends StatelessWidget {
  const _RoundIconButton({
    required this.icon,
    required this.onTap,
    this.filled = false,
  });

  final IconData icon;
  final VoidCallback onTap;
  final bool filled;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: filled ? SmartTaxiColors.gold : SmartTaxiColors.goldSurface,
      shape: const CircleBorder(),
      child: InkWell(
        customBorder: const CircleBorder(),
        onTap: onTap,
        child: SizedBox(
          width: 36,
          height: 36,
          child: Icon(
            icon,
            size: 17,
            color: filled ? Colors.white : SmartTaxiColors.goldDeep,
          ),
        ),
      ),
    );
  }
}

class _SearchingPulse extends StatefulWidget {
  const _SearchingPulse();

  @override
  State<_SearchingPulse> createState() => _SearchingPulseState();
}

class _SearchingPulseState extends State<_SearchingPulse>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1200),
    )..repeat();
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return RepaintBoundary(
      child: SizedBox(
        width: 30,
        height: 30,
        child: AnimatedBuilder(
          animation: _controller,
          builder: (context, _) {
            final value = _controller.value;
            return Stack(
              alignment: Alignment.center,
              children: [
                Transform.scale(
                  scale: 0.55 + value * 0.75,
                  child: Opacity(
                    opacity: (1 - value).clamp(0.0, 1.0),
                    child: Container(
                      width: 28,
                      height: 28,
                      decoration: BoxDecoration(
                        color: SmartTaxiColors.gold.withValues(alpha: 0.18),
                        shape: BoxShape.circle,
                      ),
                    ),
                  ),
                ),
                Container(
                  width: 12,
                  height: 12,
                  decoration: BoxDecoration(
                    color: SmartTaxiColors.gold,
                    shape: BoxShape.circle,
                    boxShadow: [
                      BoxShadow(
                        color: SmartTaxiColors.gold.withValues(alpha: 0.27),
                        blurRadius: 12,
                        spreadRadius: 2,
                      ),
                    ],
                  ),
                ),
              ],
            );
          },
        ),
      ),
    );
  }
}

class _SearchProgressRows extends StatefulWidget {
  const _SearchProgressRows();

  static const _items = [
    ('Проверяем водителей рядом', Icons.near_me_rounded),
    ('Ждём подтверждение заказа', Icons.timer_outlined),
    ('Закрепим первого принявшего', Icons.verified_rounded),
  ];

  @override
  State<_SearchProgressRows> createState() => _SearchProgressRowsState();
}

class _SearchProgressRowsState extends State<_SearchProgressRows> {
  int _activeIndex = 0;
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    // Purely decorative pacing (no real signal ties the search flow to these
    // three steps) — advances once and stops on the last step, so a long
    // search doesn't look stuck on step one forever.
    _timer = Timer.periodic(const Duration(milliseconds: 3500), (timer) {
      if (!mounted) return;
      if (_activeIndex >= _SearchProgressRows._items.length - 1) {
        timer.cancel();
        return;
      }
      setState(() => _activeIndex += 1);
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final items = _SearchProgressRows._items;
    return Container(
      padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
      decoration: BoxDecoration(
        color: SmartTaxiColors.goldSurface,
        border: Border.all(color: SmartTaxiColors.goldSoft),
        borderRadius: BorderRadius.circular(18),
      ),
      child: Column(
        children: [
          for (var i = 0; i < items.length; i++) ...[
            Row(
              children: [
                AnimatedContainer(
                  duration: const Duration(milliseconds: 220),
                  width: 26,
                  height: 26,
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    color: i == _activeIndex
                        ? SmartTaxiColors.gold
                        : i < _activeIndex
                            ? SmartTaxiColors.goldPale
                            : Colors.white,
                    shape: BoxShape.circle,
                    border: Border.all(
                      color: i <= _activeIndex
                          ? SmartTaxiColors.gold
                          : SmartTaxiColors.borderStrong,
                    ),
                    boxShadow: i == _activeIndex
                        ? [
                            BoxShadow(
                              color:
                                  SmartTaxiColors.gold.withValues(alpha: 0.2),
                              blurRadius: 10,
                              offset: const Offset(0, 4),
                            ),
                          ]
                        : null,
                  ),
                  child: Icon(
                    i < _activeIndex ? Icons.check_rounded : items[i].$2,
                    size: 15,
                    color: i == _activeIndex
                        ? SmartTaxiColors.text
                        : SmartTaxiColors.goldDeep,
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: AnimatedDefaultTextStyle(
                    duration: const Duration(milliseconds: 220),
                    style: TextStyle(
                      color: i <= _activeIndex
                          ? SmartTaxiColors.text
                          : SmartTaxiColors.textSecondary,
                      fontSize: 12.4,
                      height: 1.15,
                      fontWeight: FontWeight.w800,
                    ),
                    child: Text(
                      items[i].$1,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                ),
              ],
            ),
            if (i != items.length - 1) const SizedBox(height: 7),
          ],
        ],
      ),
    );
  }
}

class _TripRouteMiniCard extends StatelessWidget {
  const _TripRouteMiniCard({required this.pickup, required this.dropoff});

  final String pickup;
  final String dropoff;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
      decoration: BoxDecoration(
        color: SmartTaxiColors.goldSurface,
        border: Border.all(color: SmartTaxiColors.border),
        borderRadius: BorderRadius.circular(22),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const _RouteDotsColumn(height: 70),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              children: [
                _TripRouteMiniLine(label: 'Откуда', value: pickup),
                const Divider(height: 15, color: SmartTaxiColors.border),
                _TripRouteMiniLine(label: 'Куда', value: dropoff),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _TripRouteMiniLine extends StatelessWidget {
  const _TripRouteMiniLine({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        SizedBox(
          width: 62,
          child: Text(
            label,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(
              color: SmartTaxiColors.textSecondary,
              fontSize: 12,
              height: 1,
              fontWeight: FontWeight.w800,
            ),
          ),
        ),
        const SizedBox(width: 8),
        Expanded(
          child: Text(
            value,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(
              color: SmartTaxiColors.text,
              fontSize: 14,
              height: 1.05,
              fontWeight: FontWeight.w900,
            ),
          ),
        ),
      ],
    );
  }
}

class _TripInfoPill extends StatelessWidget {
  const _TripInfoPill({
    required this.label,
    required this.value,
    this.emphasis = false,
  });

  final String label;
  final String value;
  final bool emphasis;

  @override
  Widget build(BuildContext context) {
    return Container(
      constraints: const BoxConstraints(minHeight: 56),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 9),
      decoration: BoxDecoration(
        color: emphasis ? SmartTaxiColors.goldSurface : Colors.white,
        border: Border.all(
          color:
              emphasis ? SmartTaxiColors.borderStrong : SmartTaxiColors.border,
        ),
        borderRadius: BorderRadius.circular(18),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Text(
            label,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(
              color: SmartTaxiColors.textSecondary,
              fontSize: 10.5,
              height: 1,
              fontWeight: FontWeight.w800,
            ),
          ),
          const SizedBox(height: 5),
          Text(
            value,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(
              color: emphasis ? SmartTaxiColors.goldDeep : SmartTaxiColors.text,
              fontSize: 13.5,
              height: 1,
              fontWeight: FontWeight.w900,
            ),
          ),
        ],
      ),
    );
  }
}

class _AddressSearchSheet extends StatefulWidget {
  const _AddressSearchSheet({
    required this.api,
    required this.region,
    required this.suggestedAddresses,
    required this.suggestionTitle,
    required this.mapCenter,
    required this.title,
    required this.hint,
  });

  final ApiClient api;
  final String? region;
  final List<AddressSuggestion> suggestedAddresses;
  final String suggestionTitle;
  final LatLng? mapCenter;
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
    setState(() {});
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
          18,
          14,
          18,
          18 + MediaQuery.viewInsetsOf(context).bottom,
        ),
        child: ConstrainedBox(
          constraints: BoxConstraints(
            minHeight: MediaQuery.sizeOf(context).height * 0.56,
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
                        fontSize: 21,
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
              const SizedBox(height: 12),
              if ((widget.region ?? '').trim().isNotEmpty) ...[
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
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
                        size: 16,
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
                autofocus: false,
                style: const TextStyle(
                  color: SmartTaxiColors.text,
                  fontSize: 15,
                  fontWeight: FontWeight.w700,
                ),
                textInputAction: TextInputAction.search,
                onChanged: _onQueryChanged,
                onSubmitted: _search,
                decoration: InputDecoration(
                  hintText: widget.hint,
                  prefixIcon: const Icon(Icons.search_rounded),
                  contentPadding:
                      const EdgeInsets.symmetric(horizontal: 14, vertical: 15),
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
                      : _query.text.isNotEmpty
                          ? IconButton(
                              icon: const Icon(
                                Icons.close_rounded,
                                color: SmartTaxiColors.textMuted,
                                size: 18,
                              ),
                              onPressed: () {
                                _query.clear();
                                _debounce?.cancel();
                                _search('');
                              },
                            )
                          : null,
                ),
              ),
              const SizedBox(height: 10),
              _MapPointChoiceButton(
                onTap: () {
                  Navigator.pop(
                    context,
                    _PointResult.openMapPicker(),
                  );
                },
              ),
              if (_error != null) ...[
                const SizedBox(height: 12),
                _InlineMessage(text: _error!, danger: true),
              ],
              const SizedBox(height: 12),
              if (_query.text.trim().length < 2 &&
                  widget.suggestedAddresses.isNotEmpty)
                _RecentAddressSection(
                  title: widget.suggestionTitle,
                  addresses: widget.suggestedAddresses,
                  onSelect: _select,
                )
              else if (_query.text.trim().length < 2)
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
                    highlight: _query.text.trim(),
                  ),
                ),
              const SizedBox(height: 4),
            ],
          ),
        ),
      ),
    );
  }
}

class _MapPointChoiceButton extends StatelessWidget {
  const _MapPointChoiceButton({required this.onTap});

  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.transparent,
      borderRadius: BorderRadius.circular(18),
      child: InkWell(
        borderRadius: BorderRadius.circular(18),
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
          decoration: BoxDecoration(
            color: SmartTaxiColors.goldSurface,
            border: Border.all(color: SmartTaxiColors.border),
            borderRadius: BorderRadius.circular(18),
          ),
          child: Row(
            children: [
              Container(
                width: 32,
                height: 32,
                alignment: Alignment.center,
                decoration: const BoxDecoration(
                  color: Colors.white,
                  shape: BoxShape.circle,
                ),
                child: const Icon(
                  Icons.add_location_alt_rounded,
                  color: SmartTaxiColors.goldDeep,
                  size: 19,
                ),
              ),
              const SizedBox(width: 11),
              const Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Указать на карте',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        color: SmartTaxiColors.text,
                        fontSize: 13.2,
                        height: 1.05,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                    SizedBox(height: 3),
                    Text(
                      'Выберите точку на карте',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        color: SmartTaxiColors.textSecondary,
                        fontSize: 11.2,
                        height: 1.05,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ],
                ),
              ),
              const _SvgIcon(
                _iconChevronRight,
                size: 16,
                color: SmartTaxiColors.goldDeep,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _RecentAddressSection extends StatelessWidget {
  const _RecentAddressSection({
    required this.title,
    required this.addresses,
    required this.onSelect,
  });

  final String title;
  final List<AddressSuggestion> addresses;
  final ValueChanged<AddressSuggestion> onSelect;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.only(left: 2, bottom: 10),
          child: Text(
            title,
            style: const TextStyle(
              color: SmartTaxiColors.text,
              fontSize: 16,
              fontWeight: FontWeight.w900,
            ),
          ),
        ),
        ...addresses.map(
          (item) => _AddressResultTile(
            item: item,
            onTap: () => onSelect(item),
            recent: true,
          ),
        ),
      ],
    );
  }
}

TextSpan _highlightedLabelSpan(
  String label,
  String? highlight,
  TextStyle baseStyle,
) {
  final query = (highlight ?? '').trim();
  if (query.length < 2) return TextSpan(text: label, style: baseStyle);
  final matchIndex = label.toLowerCase().indexOf(query.toLowerCase());
  if (matchIndex < 0) return TextSpan(text: label, style: baseStyle);
  final matchStyle = baseStyle.copyWith(
    color: SmartTaxiColors.goldDeep,
    backgroundColor: SmartTaxiColors.goldPale,
  );
  return TextSpan(
    style: baseStyle,
    children: [
      if (matchIndex > 0) TextSpan(text: label.substring(0, matchIndex)),
      TextSpan(
        text: label.substring(matchIndex, matchIndex + query.length),
        style: matchStyle,
      ),
      if (matchIndex + query.length < label.length)
        TextSpan(text: label.substring(matchIndex + query.length)),
    ],
  );
}

IconData _addressIconFor(String label, {required bool recent}) {
  final lower = label.trim().toLowerCase();
  if (lower.contains('дом') || lower.contains('home')) {
    return Icons.home_rounded;
  }
  if (lower.contains('работ') ||
      lower.contains('офис') ||
      lower.contains('work')) {
    return Icons.work_rounded;
  }
  if (lower.contains('базар') || lower.contains('рынок')) {
    return Icons.storefront_rounded;
  }
  if (lower.contains('автовокзал') ||
      lower.contains('вокзал') ||
      lower.contains('станци')) {
    return Icons.directions_bus_filled_rounded;
  }
  if (lower.contains('акимат') || lower.contains('администрац')) {
    return Icons.account_balance_rounded;
  }
  if (lower.contains('больниц') || lower.contains('поликлиник')) {
    return Icons.local_hospital_rounded;
  }
  if (lower.contains('мечеть')) {
    return Icons.mosque_rounded;
  }
  if (lower.contains('школ') || lower.contains('колледж')) {
    return Icons.school_rounded;
  }
  return recent ? Icons.history_rounded : Icons.place_rounded;
}

class _AddressResultTile extends StatelessWidget {
  const _AddressResultTile({
    required this.item,
    required this.onTap,
    this.recent = false,
    this.highlight,
  });

  final AddressSuggestion item;
  final VoidCallback onTap;
  final bool recent;
  final String? highlight;

  @override
  Widget build(BuildContext context) {
    final subtitleParts = <String>[];
    final rawSubtitle = (item.subtitle ?? '').trim();
    final city = (item.city ?? '').trim();
    final region = (item.region ?? '').trim();
    if (rawSubtitle.isNotEmpty) subtitleParts.add(rawSubtitle);
    final visibleText =
        '${item.label} ${subtitleParts.join(' ')}'.toLowerCase();
    if (city.isNotEmpty && !visibleText.contains(city.toLowerCase())) {
      subtitleParts.add(city);
    }
    if (subtitleParts.isEmpty && region.isNotEmpty) {
      subtitleParts.add(region);
    }
    final subtitle = subtitleParts.join(' • ');
    final icon = _addressIconFor(item.label, recent: recent);
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Material(
        color: SmartTaxiColors.cardWarm,
        borderRadius: BorderRadius.circular(18),
        child: InkWell(
          borderRadius: BorderRadius.circular(18),
          onTap: onTap,
          child: Container(
            padding: const EdgeInsets.fromLTRB(12, 11, 10, 11),
            decoration: BoxDecoration(
              border: Border.all(color: SmartTaxiColors.border),
              borderRadius: BorderRadius.circular(18),
            ),
            child: Row(
              children: [
                Container(
                  width: 36,
                  height: 36,
                  alignment: Alignment.center,
                  decoration: const BoxDecoration(
                    color: SmartTaxiColors.goldPale,
                    shape: BoxShape.circle,
                  ),
                  child: Icon(
                    icon,
                    color: SmartTaxiColors.goldDeep,
                    size: 20,
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text.rich(
                        _highlightedLabelSpan(
                          item.label,
                          highlight,
                          const TextStyle(
                            fontWeight: FontWeight.w900,
                            fontSize: 14,
                            color: SmartTaxiColors.text,
                          ),
                        ),
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                      ),
                      if (subtitle.trim().isNotEmpty) ...[
                        const SizedBox(height: 3),
                        Text(
                          subtitle,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            color: SmartTaxiColors.textSecondary,
                            fontSize: 12,
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
    return Container(
      padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
      decoration: BoxDecoration(
        color: SmartTaxiColors.cardWarm,
        border: Border.all(color: SmartTaxiColors.border),
        borderRadius: BorderRadius.circular(18),
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
              Icons.manage_search_rounded,
              color: SmartTaxiColors.goldDeep,
              size: 18,
            ),
          ),
          const SizedBox(width: 11),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  title,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    color: SmartTaxiColors.text,
                    fontSize: 14,
                    fontWeight: FontWeight.w900,
                    height: 1.1,
                  ),
                ),
                const SizedBox(height: 3),
                Text(
                  text,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    color: SmartTaxiColors.textSecondary,
                    fontSize: 12,
                    fontWeight: FontWeight.w700,
                    height: 1.15,
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

class _LocationRequiredScreen extends StatelessWidget {
  const _LocationRequiredScreen({
    required this.serviceDisabled,
    required this.onOpenSettings,
    required this.onPickManually,
  });

  final bool serviceDisabled;
  final VoidCallback onOpenSettings;
  final VoidCallback onPickManually;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: SmartTaxiColors.appBackground,
      body: SafeArea(
        child: Center(
          child: Padding(
            padding: const EdgeInsets.all(28),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Container(
                  width: 88,
                  height: 88,
                  alignment: Alignment.center,
                  decoration: const BoxDecoration(
                    color: SmartTaxiColors.goldPale,
                    shape: BoxShape.circle,
                  ),
                  child: Icon(
                    serviceDisabled
                        ? Icons.location_disabled_rounded
                        : Icons.location_off_rounded,
                    color: SmartTaxiColors.goldDeep,
                    size: 42,
                  ),
                ),
                const SizedBox(height: 20),
                Text(
                  serviceDisabled
                      ? 'Включите геолокацию'
                      : 'Нет доступа к геолокации',
                  textAlign: TextAlign.center,
                  style: const TextStyle(
                    color: SmartTaxiColors.text,
                    fontSize: 21,
                    fontWeight: FontWeight.w900,
                  ),
                ),
                const SizedBox(height: 8),
                Text(
                  serviceDisabled
                      ? 'Чтобы находить ближайших водителей и точно определять место подачи, включите GPS на телефоне.'
                      : 'SmartTaxi нужен доступ к геолокации, чтобы находить водителей рядом с вами. Разрешите доступ в настройках телефона.',
                  textAlign: TextAlign.center,
                  style: const TextStyle(
                    color: SmartTaxiColors.textSecondary,
                    fontSize: 14,
                    height: 1.4,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                const SizedBox(height: 24),
                SizedBox(
                  width: double.infinity,
                  child: ElevatedButton.icon(
                    onPressed: onOpenSettings,
                    icon: const Icon(Icons.settings_rounded),
                    label: const Text('Открыть настройки'),
                  ),
                ),
                const SizedBox(height: 6),
                TextButton(
                  onPressed: onPickManually,
                  child: const Text(
                    'Выбрать точку на карте вручную',
                    style: TextStyle(fontWeight: FontWeight.w800),
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

class _LocationPermissionSheet extends StatelessWidget {
  const _LocationPermissionSheet();

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      top: false,
      child: Container(
        margin: const EdgeInsets.fromLTRB(12, 0, 12, 12),
        padding: const EdgeInsets.fromLTRB(18, 12, 18, 18),
        decoration: BoxDecoration(
          color: Colors.white,
          border:
              Border.all(color: SmartTaxiColors.gold.withValues(alpha: 0.30)),
          borderRadius: BorderRadius.circular(28),
          boxShadow: const [
            BoxShadow(
              color: Color(0x14785a14),
              blurRadius: 28,
              offset: Offset(0, 14),
            ),
          ],
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const _SheetHandle(dark: false),
            const SizedBox(height: 6),
            Row(
              crossAxisAlignment: CrossAxisAlignment.center,
              children: [
                Container(
                  width: 46,
                  height: 46,
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    color: SmartTaxiColors.gold.withValues(alpha: 0.14),
                    shape: BoxShape.circle,
                    border: Border.all(
                      color: SmartTaxiColors.gold.withValues(alpha: 0.34),
                    ),
                  ),
                  child: const Icon(
                    Icons.my_location_rounded,
                    color: SmartTaxiColors.gold,
                    size: 23,
                  ),
                ),
                const SizedBox(width: 12),
                const Expanded(
                  child: Text(
                    'Геолокация для подачи',
                    style: TextStyle(
                      color: SmartTaxiColors.text,
                      fontSize: 21,
                      fontWeight: FontWeight.w800,
                      height: 1.05,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 10),
            const Text(
              'Используем ваше местоположение только для точки подачи и расчёта маршрута. Можно выбрать точку на карте вручную.',
              style: TextStyle(
                color: SmartTaxiColors.textSecondary,
                fontSize: 13.2,
                height: 1.35,
                fontWeight: FontWeight.w600,
              ),
            ),
            const SizedBox(height: 16),
            _GoldCtaButton(
              enabled: true,
              loading: false,
              text: 'Разрешить геолокацию',
              onTap: () => Navigator.pop(context, true),
            ),
            const SizedBox(height: 6),
            TextButton(
              onPressed: () => Navigator.pop(context, false),
              style: TextButton.styleFrom(
                foregroundColor: SmartTaxiColors.textSecondary,
                minimumSize: const Size.fromHeight(42),
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
    if (byClass['Доставка'] != null) byClass['Доставка']!,
  ];
}

_PassengerTariffVisual? _passengerTariffVisual(TariffOption tariff) {
  final normalized = tariff.name.trim().toLowerCase();
  if (normalized.contains('econom') || normalized.contains('эконом')) {
    return _PassengerTariffVisual(
      tariff: tariff,
      title: 'Эконом',
      description: 'Автомобиль · 4 места',
      asset: _tariffEconomyAsset,
    );
  }
  if (normalized.contains('comfort') || normalized.contains('комфорт')) {
    return _PassengerTariffVisual(
      tariff: tariff,
      title: 'Комфорт',
      description: 'Просторный салон',
      asset: _tariffComfortAsset,
    );
  }
  if (normalized.contains('business') || normalized.contains('бизнес')) {
    return _PassengerTariffVisual(
      tariff: tariff,
      title: 'Бизнес',
      description: 'Премиальная поездка',
      asset: _tariffBusinessAsset,
    );
  }
  if (normalized.contains('delivery') ||
      normalized.contains('доставка') ||
      normalized.contains('parcel')) {
    return _PassengerTariffVisual(
      tariff: tariff,
      title: 'Доставка',
      description: 'Посылки · до 15 кг',
      asset: _tariffDeliveryAsset,
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

String _paymentLabel(String method) {
  return const {
        'CASH': 'Наличные',
        'KASPI': 'Kaspi',
        'CARD': 'Картой',
      }[method.toUpperCase()] ??
      'Наличные';
}

String _formatMinutes(RoutePreview route) {
  final minutes = math.max(1, (route.durationSeconds / 60).ceil());
  return '$minutes мин';
}

String _formatDistance(RoutePreview route) {
  final meters = route.distanceMeters;
  if (meters < 950) return '${meters.round()} м';
  return '${(meters / 1000).toStringAsFixed(1).replaceAll('.', ',')} км';
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
    final rideTariffs =
        visibleTariffs.where((v) => v.title != 'Доставка').toList();
    int priceOf(_PassengerTariffVisual item) =>
        (estimates[item.tariff.id]?.estimatedPrice ?? (1 << 30).toDouble())
            .round();
    final bestValueTariffId = rideTariffs.length > 1
        ? rideTariffs
            .reduce((a, b) => priceOf(a) <= priceOf(b) ? a : b)
            .tariff
            .id
        : null;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (showHeader) ...[
          _SectionLabel(
            title: 'Выберите тариф',
            text:
                'Фиксированная цена, время и расстояние показаны для ориентира',
            dark: dark,
          ),
          const SizedBox(height: 10),
        ] else ...[
          Padding(
            padding: const EdgeInsets.only(left: 2, right: 2, bottom: 8),
            child: Row(
              children: [
                const Expanded(
                  child: Text(
                    'Выберите тариф',
                    style: TextStyle(
                      color: SmartTaxiColors.text,
                      fontSize: 15.4,
                      height: 1,
                      fontWeight: FontWeight.w900,
                    ),
                  ),
                ),
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 9, vertical: 5),
                  decoration: BoxDecoration(
                    color: SmartTaxiColors.goldSurface,
                    borderRadius: BorderRadius.circular(999),
                    border: Border.all(color: SmartTaxiColors.goldSoft),
                  ),
                  child: const Text(
                    'Фикс. цена',
                    style: TextStyle(
                      color: SmartTaxiColors.goldDeep,
                      fontSize: 10.5,
                      height: 1,
                      fontWeight: FontWeight.w900,
                    ),
                  ),
                ),
              ],
            ),
          ),
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
            text: 'Для этого региона нужен тариф Эконом или Доставка.',
            dark: dark,
          )
        else
          Column(
            children: [
              for (final item in visibleTariffs) ...[
                _TariffListRow(
                  item: item,
                  selected: item.tariff.id == selectedId,
                  estimate: estimates[item.tariff.id],
                  onTap: () => onSelect(item.tariff.id),
                  dark: dark,
                  bestValue: item.tariff.id == bestValueTariffId,
                ),
                if (item != visibleTariffs.last) const SizedBox(height: 7),
              ],
            ],
          ),
      ],
    );
  }
}

class _TariffListRow extends StatelessWidget {
  const _TariffListRow({
    required this.item,
    required this.selected,
    required this.estimate,
    required this.onTap,
    required this.dark,
    this.bestValue = false,
  });

  final _PassengerTariffVisual item;
  final bool selected;
  final RoutePreview? estimate;
  final VoidCallback onTap;
  final bool dark;
  final bool bestValue;

  @override
  Widget build(BuildContext context) {
    final price = estimate?.estimatedPrice;
    final subtitle = item.description;
    final routeMeta = estimate == null
        ? 'Расчёт маршрута'
        : '${_formatMinutes(estimate!)} · ${_formatDistance(estimate!)}';
    return Material(
      color: Colors.transparent,
      borderRadius: BorderRadius.circular(17),
      child: InkWell(
        borderRadius: BorderRadius.circular(17),
        onTap: onTap,
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 180),
          curve: Curves.easeOutCubic,
          constraints: const BoxConstraints(minHeight: 92),
          padding: const EdgeInsets.fromLTRB(10, 9, 12, 9),
          decoration: BoxDecoration(
            color: dark
                ? Colors.white.withValues(alpha: selected ? 0.10 : 0.06)
                : selected
                    ? null
                    : Colors.white,
            gradient: !dark && selected
                ? LinearGradient(
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                    colors: [
                      SmartTaxiColors.gold.withValues(alpha: 0.10),
                      SmartTaxiColors.gold.withValues(alpha: 0.03),
                    ],
                  )
                : null,
            border: Border.all(
              color: selected
                  ? SmartTaxiColors.gold
                  : (dark
                      ? Colors.white.withValues(alpha: 0.10)
                      : SmartTaxiColors.border),
              width: selected ? 1.6 : 1,
            ),
            borderRadius: BorderRadius.circular(24),
            boxShadow: [
              if (selected)
                BoxShadow(
                  color: SmartTaxiColors.gold.withValues(alpha: 0.20),
                  blurRadius: 22,
                  offset: const Offset(0, 10),
                ),
              if (!selected && !dark)
                const BoxShadow(
                  color: Color(0x08141414),
                  blurRadius: 10,
                  offset: Offset(0, 4),
                ),
            ],
          ),
          child: Stack(
            clipBehavior: Clip.none,
            children: [
              Row(
                children: [
                  Container(
                    width: 82,
                    height: 64,
                    alignment: Alignment.center,
                    decoration: BoxDecoration(
                      gradient: LinearGradient(
                        begin: Alignment.topCenter,
                        end: Alignment.bottomCenter,
                        colors: selected
                            ? [SmartTaxiColors.goldSurface, Colors.white]
                            : [const Color(0xfffbfbfb), const Color(0xfff5f6f8)],
                      ),
                      borderRadius: BorderRadius.circular(16),
                      border: Border.all(
                        color: selected
                            ? SmartTaxiColors.borderStrong
                            : SmartTaxiColors.border,
                      ),
                    ),
                    child: Stack(
                      alignment: Alignment.center,
                      children: [
                        if (item.asset.isNotEmpty)
                          Positioned(
                            left: 16,
                            right: 16,
                            bottom: 7,
                            child: Container(
                              height: 6,
                              decoration: BoxDecoration(
                                color: Colors.black.withValues(alpha: 0.10),
                                borderRadius: BorderRadius.circular(999),
                              ),
                            ),
                          ),
                        Padding(
                          padding: const EdgeInsets.all(3),
                          child: item.asset.isEmpty
                              ? Container(
                                  width: 38,
                                  height: 36,
                                  alignment: Alignment.center,
                                  decoration: BoxDecoration(
                                    color: SmartTaxiColors.goldSurface,
                                    border: Border.all(
                                        color: SmartTaxiColors.border),
                                    borderRadius: BorderRadius.circular(12),
                                  ),
                                  child: _SvgIcon(
                                    item.title == 'Доставка'
                                        ? _iconDelivery
                                        : _iconCar,
                                    size: 24,
                                    color: SmartTaxiColors.goldDeep,
                                  ),
                                )
                              : Image.asset(
                                  item.asset,
                                  width: 76,
                                  height: 56,
                                  fit: BoxFit.contain,
                                  filterQuality: FilterQuality.high,
                                  errorBuilder: (_, __, ___) => _SvgIcon(
                                    item.title == 'Доставка'
                                        ? _iconDelivery
                                        : _iconCar,
                                    size: 26,
                                    color: SmartTaxiColors.goldDeep,
                                  ),
                                ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(width: 9),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Text(
                          item.title,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                            color: dark ? Colors.white : SmartTaxiColors.text,
                            fontSize: 15.2,
                            height: 1.05,
                            fontWeight: FontWeight.w900,
                          ),
                        ),
                        if (bestValue) ...[
                          const SizedBox(height: 3),
                          Container(
                            padding: const EdgeInsets.symmetric(
                              horizontal: 6,
                              vertical: 2,
                            ),
                            decoration: BoxDecoration(
                              color: SmartTaxiColors.success.withValues(
                                alpha: dark ? 0.22 : 0.12,
                              ),
                              borderRadius: BorderRadius.circular(999),
                            ),
                            child: const Text(
                              'Выгодно',
                              style: TextStyle(
                                color: SmartTaxiColors.success,
                                fontSize: 9.5,
                                height: 1,
                                fontWeight: FontWeight.w900,
                              ),
                            ),
                          ),
                        ],
                        const SizedBox(height: 3),
                        Text(
                          subtitle,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                            color: dark
                                ? Colors.white70
                                : SmartTaxiColors.textSecondary,
                            fontSize: 11.7,
                            height: 1.05,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                        const SizedBox(height: 5),
                        Row(
                          children: [
                            Icon(
                              Icons.schedule_rounded,
                              size: 11,
                              color: dark
                                  ? Colors.white54
                                  : SmartTaxiColors.textMuted,
                            ),
                            const SizedBox(width: 3),
                            Flexible(
                              child: Text(
                                routeMeta,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: TextStyle(
                                  color: dark
                                      ? Colors.white54
                                      : SmartTaxiColors.textMuted,
                                  fontSize: 10.8,
                                  height: 1.05,
                                  fontWeight: FontWeight.w700,
                                ),
                              ),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(width: 8),
                  Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        price == null ? '...' : _formatTenge(price),
                        maxLines: 1,
                        style: TextStyle(
                          color: dark ? Colors.white : SmartTaxiColors.text,
                          fontSize: 15,
                          height: 1.05,
                          fontWeight: FontWeight.w900,
                        ),
                      ),
                      const SizedBox(width: 8),
                      _TariffSelectIndicator(selected: selected),
                    ],
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _TariffSelectIndicator extends StatelessWidget {
  const _TariffSelectIndicator({required this.selected});

  final bool selected;

  @override
  Widget build(BuildContext context) {
    return AnimatedContainer(
      duration: const Duration(milliseconds: 180),
      curve: Curves.easeOutCubic,
      width: 25,
      height: 25,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: selected ? SmartTaxiColors.gold : Colors.white,
        shape: BoxShape.circle,
        border: Border.all(
          color: selected
              ? SmartTaxiColors.goldDeep
              : SmartTaxiColors.border.withValues(alpha: 0.95),
          width: selected ? 1.2 : 1.1,
        ),
        boxShadow: selected
            ? [
                BoxShadow(
                  color: SmartTaxiColors.gold.withValues(alpha: 0.35),
                  blurRadius: 10,
                  offset: const Offset(0, 3),
                ),
              ]
            : null,
      ),
      child: selected
          ? const Icon(Icons.check_rounded, color: Colors.white, size: 16)
          : null,
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
        const Padding(
          padding: EdgeInsets.only(left: 4, bottom: 8),
          child: Text(
            'Выберите тариф',
            style: TextStyle(
              color: SmartTaxiColors.text,
              fontSize: 14.2,
              fontWeight: FontWeight.w800,
            ),
          ),
        ),
        ...List.generate(
          2,
          (index) => Padding(
            padding: EdgeInsets.only(bottom: index == 1 ? 0 : 7),
            child: Container(
              height: 64,
              padding: const EdgeInsets.fromLTRB(8, 6, 9, 6),
              decoration: BoxDecoration(
                color:
                    dark ? Colors.white.withValues(alpha: 0.06) : Colors.white,
                border: Border.all(
                  color: dark
                      ? Colors.white.withValues(alpha: 0.08)
                      : SmartTaxiColors.border,
                ),
                borderRadius: BorderRadius.circular(17),
              ),
              child: const Row(
                children: [
                  _SkeletonLine(width: 76, height: 48, radius: 14),
                  SizedBox(width: 11),
                  Expanded(
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        _SkeletonLine(width: 92, height: 12),
                        SizedBox(height: 8),
                        _SkeletonLine(width: 70, height: 10),
                      ],
                    ),
                  ),
                  SizedBox(width: 10),
                  _SkeletonLine(width: 48, height: 12),
                  SizedBox(width: 9),
                  _SkeletonLine(width: 20, height: 20, radius: 999),
                ],
              ),
            ),
          ),
        ),
      ],
    );
  }
}

class _PriceAdjuster extends StatelessWidget {
  const _PriceAdjuster({
    required this.basePrice,
    required this.currentPrice,
    required this.onChanged,
  });

  static const _step = 50;
  // Flat bounds regardless of the estimated price — matches
  // offeredPriceBounds() on the backend, which is what actually enforces
  // this; keep the two in sync if either changes.
  static const _minPrice = 200;
  static const _maxPrice = 1000000;

  final int basePrice;
  final int currentPrice;
  final ValueChanged<int?> onChanged;

  void _adjust(int delta) {
    final next = (currentPrice + delta).clamp(_minPrice, _maxPrice);
    onChanged(next == basePrice ? null : next);
  }

  @override
  Widget build(BuildContext context) {
    final hint = currentPrice > basePrice
        ? 'Быстрее найдём водителя'
        : currentPrice < basePrice
            ? 'Может занять больше времени'
            : 'Обычная скорость подачи';
    return Container(
      padding: const EdgeInsets.fromLTRB(14, 11, 10, 11),
      decoration: BoxDecoration(
        color: Colors.white,
        border: Border.all(color: SmartTaxiColors.border),
        borderRadius: BorderRadius.circular(18),
        boxShadow: const [
          BoxShadow(
            color: Color(0x08141414),
            blurRadius: 10,
            offset: Offset(0, 4),
          ),
        ],
      ),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'Ваша цена',
                  style: TextStyle(
                    color: SmartTaxiColors.text,
                    fontSize: 12.5,
                    height: 1.1,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  hint,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    color: SmartTaxiColors.textSecondary,
                    fontSize: 10.5,
                    height: 1.1,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          _PriceStepButton(
            icon: Icons.remove_rounded,
            onTap: currentPrice > _minPrice ? () => _adjust(-_step) : null,
          ),
          SizedBox(
            width: 66,
            child: Text(
              _formatTenge(currentPrice),
              textAlign: TextAlign.center,
              maxLines: 1,
              style: const TextStyle(
                color: SmartTaxiColors.text,
                fontSize: 14.5,
                fontWeight: FontWeight.w900,
              ),
            ),
          ),
          _PriceStepButton(
            icon: Icons.add_rounded,
            onTap: currentPrice < _maxPrice ? () => _adjust(_step) : null,
          ),
        ],
      ),
    );
  }
}

class _PriceStepButton extends StatelessWidget {
  const _PriceStepButton({required this.icon, required this.onTap});

  final IconData icon;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final enabled = onTap != null;
    return Material(
      color: SmartTaxiColors.goldSurface.withValues(alpha: enabled ? 1 : 0.5),
      borderRadius: BorderRadius.circular(10),
      child: InkWell(
        borderRadius: BorderRadius.circular(10),
        onTap: onTap,
        child: SizedBox(
          width: 30,
          height: 30,
          child: Icon(
            icon,
            size: 16,
            color:
                enabled ? SmartTaxiColors.goldDeep : SmartTaxiColors.textMuted,
          ),
        ),
      ),
    );
  }
}

class _PromoCodeField extends StatelessWidget {
  const _PromoCodeField({
    required this.controller,
    required this.applying,
    required this.error,
    required this.appliedCode,
    required this.discountKzt,
    required this.onApply,
    required this.onClear,
  });

  final TextEditingController controller;
  final bool applying;
  final String? error;
  final String? appliedCode;
  final int discountKzt;
  final VoidCallback onApply;
  final VoidCallback onClear;

  @override
  Widget build(BuildContext context) {
    if (appliedCode != null) {
      return Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        decoration: BoxDecoration(
          color: SmartTaxiColors.successSoft,
          border: Border.all(
              color: SmartTaxiColors.success.withValues(alpha: 0.35)),
          borderRadius: BorderRadius.circular(18),
        ),
        child: Row(
          children: [
            const Icon(Icons.local_offer_rounded,
                color: SmartTaxiColors.success, size: 18),
            const SizedBox(width: 10),
            Expanded(
              child: Text(
                'Промокод $appliedCode: −${_formatTenge(discountKzt)}',
                style: const TextStyle(
                  color: SmartTaxiColors.success,
                  fontSize: 12.5,
                  fontWeight: FontWeight.w800,
                ),
              ),
            ),
            GestureDetector(
              onTap: onClear,
              child: const Icon(Icons.close_rounded,
                  color: SmartTaxiColors.success, size: 18),
            ),
          ],
        ),
      );
    }
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
      decoration: BoxDecoration(
        color: Colors.white,
        border: Border.all(color: SmartTaxiColors.border),
        borderRadius: BorderRadius.circular(18),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: TextField(
                  controller: controller,
                  textCapitalization: TextCapitalization.characters,
                  decoration: const InputDecoration(
                    isDense: true,
                    border: InputBorder.none,
                    hintText: 'Промокод',
                  ),
                  style: const TextStyle(
                      fontSize: 13, fontWeight: FontWeight.w700),
                ),
              ),
              TextButton(
                onPressed: applying ? null : onApply,
                child: Text(applying ? 'Проверяем...' : 'Применить'),
              ),
            ],
          ),
          if (error != null)
            Padding(
              padding: const EdgeInsets.only(bottom: 6),
              child: Text(
                error!,
                style: const TextStyle(
                  color: SmartTaxiColors.danger,
                  fontSize: 11.5,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ),
        ],
      ),
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
        height: 52,
        padding: const EdgeInsets.symmetric(horizontal: 13),
        decoration: BoxDecoration(
          color: Colors.white,
          border: Border.all(color: SmartTaxiColors.borderStrong),
          borderRadius: BorderRadius.circular(18),
          boxShadow: const [
            BoxShadow(
              color: Color(0x0f785a14),
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
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      'Способ оплаты',
                      style: TextStyle(
                        color: SmartTaxiColors.textSecondary,
                        fontSize: 10.8,
                        height: 1,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      label,
                      style: const TextStyle(
                        color: SmartTaxiColors.text,
                        fontSize: 14,
                        height: 1,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                  ],
                ),
              ),
              _SvgIcon(
                _iconChevronRight,
                color:
                    enabled ? SmartTaxiColors.text : SmartTaxiColors.textMuted,
                size: 18,
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
      'KASPI' || 'CARD' => _iconCreditCard,
      _ => _iconBanknote,
    };
    return Container(
      width: 32,
      height: 32,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: SmartTaxiColors.goldSurface,
        border: Border.all(color: SmartTaxiColors.borderStrong),
        borderRadius: BorderRadius.circular(13),
      ),
      child: _SvgIcon(icon, color: SmartTaxiColors.goldDeep, size: 18),
    );
  }
}

class _RegionConfirmSheet extends StatelessWidget {
  const _RegionConfirmSheet({required this.region});

  final RegionOption region;

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      top: false,
      child: Container(
        margin: const EdgeInsets.all(12),
        padding: const EdgeInsets.fromLTRB(20, 14, 20, 20),
        decoration: BoxDecoration(
          color: Colors.white,
          border:
              Border.all(color: SmartTaxiColors.gold.withValues(alpha: 0.32)),
          borderRadius: BorderRadius.circular(30),
          boxShadow: const [
            BoxShadow(
              color: Color(0x20785a14),
              blurRadius: 34,
              offset: Offset(0, 16),
            ),
          ],
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Center(child: _SheetHandle(dark: false)),
            const SizedBox(height: 14),
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Container(
                  width: 48,
                  height: 48,
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    color: SmartTaxiColors.goldPale,
                    border: Border.all(color: SmartTaxiColors.borderStrong),
                    borderRadius: BorderRadius.circular(18),
                  ),
                  child: const Icon(
                    Icons.near_me_rounded,
                    color: SmartTaxiColors.goldDeep,
                    size: 24,
                  ),
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Ваш регион: ${region.name}?',
                        style: const TextStyle(
                          color: SmartTaxiColors.text,
                          fontSize: 22,
                          height: 1.08,
                          fontWeight: FontWeight.w900,
                        ),
                      ),
                      const SizedBox(height: 8),
                      const Text(
                        'Мы определили регион по геолокации. Проверьте, чтобы заказы работали правильно.',
                        style: TextStyle(
                          color: SmartTaxiColors.textSecondary,
                          fontSize: 14,
                          height: 1.35,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 18),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton(
                    onPressed: () =>
                        Navigator.pop(context, _RegionConfirmAction.change),
                    child: const Text('Изменить'),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: FilledButton(
                    onPressed: () =>
                        Navigator.pop(context, _RegionConfirmAction.accept),
                    child: const Text('Да, верно'),
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

class _RegionSelectSheet extends StatefulWidget {
  const _RegionSelectSheet({
    required this.regions,
    required this.selectedId,
    required this.title,
    required this.subtitle,
  });

  final List<RegionOption> regions;
  final String? selectedId;
  final String title;
  final String subtitle;

  @override
  State<_RegionSelectSheet> createState() => _RegionSelectSheetState();
}

class _RegionSelectSheetState extends State<_RegionSelectSheet> {
  final _search = TextEditingController();

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final query = _search.text.trim().toLowerCase();
    final regions = query.isEmpty
        ? widget.regions
        : widget.regions
            .where((region) =>
                region.name.toLowerCase().contains(query) ||
                region.id.toLowerCase().contains(query))
            .toList();
    return SafeArea(
      top: false,
      child: Container(
        padding: const EdgeInsets.fromLTRB(20, 14, 20, 20),
        constraints: BoxConstraints(
          maxHeight: MediaQuery.sizeOf(context).height * 0.72,
        ),
        decoration: BoxDecoration(
          color: Colors.white,
          border: Border.all(color: SmartTaxiColors.border),
          borderRadius: const BorderRadius.vertical(top: Radius.circular(30)),
          boxShadow: const [
            BoxShadow(
              color: Color(0x20785a14),
              blurRadius: 30,
              offset: Offset(0, -10),
            ),
          ],
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Center(child: _SheetHandle(dark: false)),
            const SizedBox(height: 14),
            Text(
              widget.title,
              style: const TextStyle(
                fontSize: 24,
                height: 1.08,
                fontWeight: FontWeight.w900,
                color: SmartTaxiColors.text,
              ),
            ),
            const SizedBox(height: 6),
            Text(
              widget.subtitle,
              style: const TextStyle(
                color: SmartTaxiColors.textSecondary,
                fontSize: 14,
                fontWeight: FontWeight.w700,
                height: 1.35,
              ),
            ),
            const SizedBox(height: 14),
            TextField(
              controller: _search,
              onChanged: (_) => setState(() {}),
              decoration: const InputDecoration(
                hintText: 'Найти город или район',
                prefixIcon: Icon(Icons.search_rounded),
              ),
            ),
            const SizedBox(height: 14),
            Flexible(
              child: ListView.separated(
                shrinkWrap: true,
                itemCount: regions.length,
                separatorBuilder: (_, __) => const SizedBox(height: 8),
                itemBuilder: (context, index) {
                  final region = regions[index];
                  final selected = region.id == widget.selectedId;
                  return Material(
                    color: selected
                        ? SmartTaxiColors.goldPale
                        : SmartTaxiColors.cardWarm,
                    borderRadius: BorderRadius.circular(18),
                    child: InkWell(
                      borderRadius: BorderRadius.circular(18),
                      onTap: () => Navigator.pop(context, region),
                      child: Container(
                        constraints: const BoxConstraints(minHeight: 58),
                        padding: const EdgeInsets.symmetric(
                          horizontal: 14,
                          vertical: 10,
                        ),
                        decoration: BoxDecoration(
                          borderRadius: BorderRadius.circular(18),
                          border: Border.all(
                            color: selected
                                ? SmartTaxiColors.gold
                                : SmartTaxiColors.border,
                          ),
                        ),
                        child: Row(
                          children: [
                            Container(
                              width: 38,
                              height: 38,
                              alignment: Alignment.center,
                              decoration: BoxDecoration(
                                color: selected
                                    ? SmartTaxiColors.gold
                                    : Colors.white,
                                borderRadius: BorderRadius.circular(15),
                                border: Border.all(
                                  color: SmartTaxiColors.borderStrong,
                                ),
                              ),
                              child: Icon(
                                Icons.location_city_rounded,
                                color: selected
                                    ? SmartTaxiColors.text
                                    : SmartTaxiColors.goldDeep,
                                size: 20,
                              ),
                            ),
                            const SizedBox(width: 12),
                            Expanded(
                              child: Text(
                                region.name,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
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
                              )
                            else
                              const Icon(
                                Icons.chevron_right_rounded,
                                color: SmartTaxiColors.textSecondary,
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
      ('CARD', 'Картой', 'Оплата картой через Kaspi Pay'),
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
    final drawerWidth = (width * 0.82).clamp(296.0, 368.0).toDouble();
    return Drawer(
      width: drawerWidth,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.horizontal(right: Radius.circular(30)),
      ),
      child: SafeArea(
        child: Column(
          children: [
            Container(
              margin: const EdgeInsets.fromLTRB(14, 14, 14, 10),
              width: double.infinity,
              padding: const EdgeInsets.fromLTRB(14, 13, 14, 13),
              decoration: BoxDecoration(
                color: Colors.white,
                border: Border.all(color: SmartTaxiColors.border),
                borderRadius: BorderRadius.circular(24),
                boxShadow: const [
                  BoxShadow(
                    color: Color(0x10785a14),
                    blurRadius: 24,
                    offset: Offset(0, 10),
                  ),
                ],
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // The full horizontal wordmark (same asset as the auth
                  // screens) instead of the old dark "ST" monogram square +
                  // a hand-typed "SmartTaxi" RichText next to it — those two
                  // were drifting into visibly different brand marks.
                  const BrandLogo.horizontal(),
                  const SizedBox(height: 12),
                  Material(
                    color: Colors.transparent,
                    borderRadius: BorderRadius.circular(16),
                    child: InkWell(
                      borderRadius: BorderRadius.circular(16),
                      onTap: () => onSelect(PassengerTab.profile),
                      child: Padding(
                        padding: const EdgeInsets.symmetric(vertical: 2),
                        child: Row(
                          children: [
                            Container(
                              width: 40,
                              height: 40,
                              alignment: Alignment.center,
                              decoration: BoxDecoration(
                                gradient: const LinearGradient(
                                  begin: Alignment.topLeft,
                                  end: Alignment.bottomRight,
                                  colors: [
                                    SmartTaxiColors.gold,
                                    SmartTaxiColors.goldDeep,
                                  ],
                                ),
                                borderRadius: BorderRadius.circular(14),
                                boxShadow: [
                                  BoxShadow(
                                    color: SmartTaxiColors.gold
                                        .withValues(alpha: 0.32),
                                    blurRadius: 14,
                                    offset: const Offset(0, 6),
                                  ),
                                ],
                              ),
                              child: Text(
                                accountLabel.isEmpty
                                    ? '?'
                                    : accountLabel
                                        .substring(0, 1)
                                        .toUpperCase(),
                                style: const TextStyle(
                                  color: Colors.white,
                                  fontSize: 17,
                                  fontWeight: FontWeight.w900,
                                ),
                              ),
                            ),
                            const SizedBox(width: 12),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    accountLabel.isEmpty
                                        ? 'Аккаунт'
                                        : accountLabel,
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                    style: const TextStyle(
                                      color: SmartTaxiColors.text,
                                      fontSize: 14.5,
                                      fontWeight: FontWeight.w900,
                                    ),
                                  ),
                                  if (accountPhone.trim().isNotEmpty)
                                    Padding(
                                      padding: const EdgeInsets.only(top: 2),
                                      child: Text(
                                        accountPhone,
                                        maxLines: 1,
                                        overflow: TextOverflow.ellipsis,
                                        style: const TextStyle(
                                          color: SmartTaxiColors.textSecondary,
                                          fontSize: 12,
                                          fontWeight: FontWeight.w700,
                                        ),
                                      ),
                                    ),
                                ],
                              ),
                            ),
                            const Icon(
                              Icons.chevron_right_rounded,
                              color: SmartTaxiColors.textSecondary,
                              size: 20,
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(height: 10),
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
            const SizedBox(height: 6),
            Expanded(
              child: ListView(
                padding: const EdgeInsets.only(top: 4),
                children: [
                  _DrawerItem(
                    icon: Icons.history_rounded,
                    label: 'Мои поездки',
                    active: active == PassengerTab.trips,
                    onTap: () => onSelect(PassengerTab.trips),
                  ),
                  _DrawerItem(
                    icon: Icons.local_offer_outlined,
                    label: 'Промокоды',
                    active: active == PassengerTab.promoCodes,
                    onTap: () => onSelect(PassengerTab.promoCodes),
                  ),
                  _DrawerItem(
                    icon: Icons.person_outline_rounded,
                    label: 'Профиль',
                    active: active == PassengerTab.profile,
                    onTap: () => onSelect(PassengerTab.profile),
                  ),
                  _DrawerItem(
                    icon: Icons.directions_car_outlined,
                    label: driverLabel,
                    active: active == PassengerTab.driverApplication,
                    onTap: onDriver,
                  ),
                  const _DrawerSectionLabel('Помощь'),
                  _DrawerItem(
                    icon: Icons.headset_mic_outlined,
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
                  const _DrawerSectionLabel('О сервисе'),
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
                  _DrawerItem(
                    icon: Icons.shield_outlined,
                    label: 'Правовая информация',
                    active: active == PassengerTab.legalHub ||
                        active == PassengerTab.legalTerms ||
                        active == PassengerTab.legalPrivacy ||
                        active == PassengerTab.legalPayment ||
                        active == PassengerTab.legalCancellation ||
                        active == PassengerTab.legalSafety,
                    onTap: () => onSelect(PassengerTab.legalHub),
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
            const SizedBox(height: 10),
            const Text(
              'SmartTaxi · v$_appVersion',
              style: TextStyle(
                color: SmartTaxiColors.textMuted,
                fontSize: 11,
                fontWeight: FontWeight.w700,
              ),
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
            : SmartTaxiColors.text;
    final iconTone = danger
        ? SmartTaxiColors.danger
        : active
            ? SmartTaxiColors.goldDeep
            : SmartTaxiColors.text;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 1.5),
      child: Material(
        color: active ? SmartTaxiColors.goldSurface : Colors.transparent,
        borderRadius: BorderRadius.circular(16),
        child: InkWell(
          borderRadius: BorderRadius.circular(16),
          onTap: onTap,
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 180),
            curve: Curves.easeOutCubic,
            constraints: const BoxConstraints(minHeight: 50),
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
            decoration: BoxDecoration(
              color: active ? SmartTaxiColors.goldSurface : Colors.transparent,
              border: Border.all(
                color:
                    active ? SmartTaxiColors.borderStrong : Colors.transparent,
              ),
              borderRadius: BorderRadius.circular(16),
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
                  width: 34,
                  height: 34,
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    color: danger
                        ? const Color(0xfffff1f1)
                        : active
                            ? SmartTaxiColors.goldSurface
                            : Colors.white,
                    border: Border.all(
                      color: danger
                          ? const Color(0xffffd4d4)
                          : active
                              ? SmartTaxiColors.borderStrong
                              : SmartTaxiColors.border,
                    ),
                    borderRadius: BorderRadius.circular(13),
                  ),
                  child: Icon(
                    icon,
                    size: 18.5,
                    color: iconTone,
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Text(
                    label,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      color: tone,
                      fontSize: 15,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                ),
                Icon(
                  Icons.chevron_right_rounded,
                  color: danger
                      ? SmartTaxiColors.danger
                      : active
                          ? SmartTaxiColors.goldDeep
                          : SmartTaxiColors.textSecondary,
                  size: 22,
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _DrawerSectionLabel extends StatelessWidget {
  const _DrawerSectionLabel(this.text);

  final String text;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(24, 18, 14, 8),
      child: Text(
        text.toUpperCase(),
        style: const TextStyle(
          color: SmartTaxiColors.textMuted,
          fontSize: 11,
          fontWeight: FontWeight.w900,
          letterSpacing: 0.4,
        ),
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
          Material(
            color: SmartTaxiColors.goldSurface,
            borderRadius: BorderRadius.circular(14),
            child: InkWell(
              borderRadius: BorderRadius.circular(14),
              onTap: onMenu,
              child: const Padding(
                padding: EdgeInsets.all(9),
                child: Icon(
                  Icons.menu_rounded,
                  size: 20,
                  color: SmartTaxiColors.goldDeep,
                ),
              ),
            ),
          ),
          const SizedBox(width: 10),
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
    required this.routeSummaryLabel,
    required this.onRouteBack,
  });

  final VoidCallback onMenu;
  final VoidCallback onNotifications;
  final String? routeSummaryLabel;
  final VoidCallback onRouteBack;

  @override
  Widget build(BuildContext context) {
    final summary = routeSummaryLabel;
    if (summary != null) {
      return SizedBox(
        height: 60,
        child: Stack(
          alignment: Alignment.center,
          children: [
            Align(
              alignment: Alignment.centerLeft,
              child: _MapBackButton(onTap: onRouteBack),
            ),
            _RouteSummaryPill(text: summary),
          ],
        ),
      );
    }
    return SizedBox(
      height: 60,
      child: Stack(
        alignment: Alignment.center,
        children: [
          Align(
            alignment: Alignment.centerLeft,
            child: _MapChromeButton(
              iconAsset: _iconMenu,
              label: 'Меню',
              onTap: onMenu,
            ),
          ),
          const _MapBrandPill(),
          Align(
            alignment: Alignment.centerRight,
            child: _NotificationButton(onTap: onNotifications),
          ),
        ],
      ),
    );
  }
}

class _MapBackButton extends StatelessWidget {
  const _MapBackButton({required this.onTap});

  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.transparent,
      borderRadius: BorderRadius.circular(18),
      child: InkWell(
        borderRadius: BorderRadius.circular(18),
        onTap: onTap,
        child: Container(
          width: 44,
          height: 44,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color: Colors.white.withValues(alpha: 0.98),
            border: Border.all(color: SmartTaxiColors.borderStrong),
            borderRadius: BorderRadius.circular(16),
            boxShadow: const [
              BoxShadow(
                color: Color(0x1a141414),
                blurRadius: 14,
                offset: Offset(0, 6),
              ),
            ],
          ),
          child: const Icon(
            Icons.arrow_back_ios_new_rounded,
            color: SmartTaxiColors.text,
            size: 19,
          ),
        ),
      ),
    );
  }
}

class _RouteSummaryPill extends StatelessWidget {
  const _RouteSummaryPill({required this.text});

  final String text;

  @override
  Widget build(BuildContext context) {
    return ConstrainedBox(
      constraints: const BoxConstraints(maxWidth: 230),
      child: Container(
        height: 44,
        padding: const EdgeInsets.symmetric(horizontal: 16),
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: Colors.white.withValues(alpha: 0.98),
          border: Border.all(color: SmartTaxiColors.borderStrong),
          borderRadius: BorderRadius.circular(22),
          boxShadow: const [
            BoxShadow(
              color: Color(0x1f141414),
              blurRadius: 14,
              offset: Offset(0, 6),
            ),
          ],
        ),
        child: FittedBox(
          fit: BoxFit.scaleDown,
          child: Text(
            text,
            maxLines: 1,
            style: const TextStyle(
              color: SmartTaxiColors.text,
              fontSize: 14.5,
              height: 1,
              fontWeight: FontWeight.w800,
            ),
          ),
        ),
      ),
    );
  }
}

// Frosted-glass chrome for controls floating over the live map — a real
// BackdropFilter blur (cheap here: each instance only covers a ~44px pill,
// not the full screen) instead of a near-opaque white pill, matching the
// reference mockups' glassmorphism header instead of looking like flat
// white buttons sitting on top of the map.
class _MapGlassChrome extends StatelessWidget {
  const _MapGlassChrome({
    required this.child,
    this.borderRadius = 18,
  });

  final Widget child;
  final double borderRadius;

  @override
  Widget build(BuildContext context) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(borderRadius),
      child: BackdropFilter(
        filter: ImageFilter.blur(sigmaX: 14, sigmaY: 14),
        child: Container(
          decoration: BoxDecoration(
            color: Colors.white.withValues(alpha: 0.72),
            borderRadius: BorderRadius.circular(borderRadius),
            border: Border.all(color: Colors.white.withValues(alpha: 0.55)),
          ),
          child: child,
        ),
      ),
    );
  }
}

class _MapBrandPill extends StatelessWidget {
  const _MapBrandPill();

  @override
  Widget build(BuildContext context) {
    return _MapGlassChrome(
      borderRadius: 24,
      child: Container(
        height: 44,
        constraints: const BoxConstraints(minWidth: 118, maxWidth: 168),
        padding: const EdgeInsets.symmetric(horizontal: 16),
        alignment: Alignment.center,
        child: const Text(
          'SmartTaxi',
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: TextStyle(
            color: SmartTaxiColors.text,
            fontSize: 14.5,
            height: 1,
            fontWeight: FontWeight.w900,
          ),
        ),
      ),
    );
  }
}

class _MapChromeButton extends StatelessWidget {
  const _MapChromeButton({
    required this.iconAsset,
    required this.label,
    required this.onTap,
  });

  final String iconAsset;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Tooltip(
      message: label,
      child: _MapGlassChrome(
        child: Material(
          color: Colors.transparent,
          child: InkWell(
            borderRadius: BorderRadius.circular(18),
            onTap: onTap,
            child: SizedBox(
              width: 44,
              height: 44,
              child: Center(
                child:
                    _SvgIcon(iconAsset, color: SmartTaxiColors.text, size: 20),
              ),
            ),
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
      child: _MapGlassChrome(
        child: Material(
          color: Colors.transparent,
          child: InkWell(
            borderRadius: BorderRadius.circular(18),
            onTap: onTap,
            child: SizedBox(
              width: 44,
              height: 44,
              child: Stack(
                alignment: Alignment.center,
                children: [
                  const _SvgIcon(
                    _iconBell,
                    color: SmartTaxiColors.text,
                    size: 20,
                  ),
                  Positioned(
                    right: 8,
                    top: 8,
                    child: Container(
                      width: 7,
                      height: 7,
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

class _NotificationsScreen extends StatefulWidget {
  const _NotificationsScreen({required this.api});

  final ApiClient api;

  @override
  State<_NotificationsScreen> createState() => _NotificationsScreenState();
}

class _NotificationsScreenState extends State<_NotificationsScreen> {
  bool _loading = true;
  String? _error;
  List<AppNotification> _items = const [];

  @override
  void initState() {
    super.initState();
    unawaited(_load());
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final result = await widget.api.getNotifications();
      if (!mounted) return;
      setState(() {
        _items = result.notifications;
        _loading = false;
      });
      if (result.unreadCount > 0) {
        unawaited(widget.api.markAllNotificationsRead());
      }
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _error = 'Не удалось загрузить уведомления';
        _loading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        padding: const EdgeInsets.all(20),
        physics: const AlwaysScrollableScrollPhysics(
          parent: BouncingScrollPhysics(),
        ),
        children: [
          const _TitleBlock(
            title: 'Уведомления',
            text: 'Статусы поездок и важные сообщения SmartTaxi',
          ),
          const SizedBox(height: 16),
          if (_loading)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 40),
              child: Center(child: CircularProgressIndicator()),
            )
          else if (_error != null)
            _PremiumCard(
              child: _CompactNotice(
                icon: Icons.error_outline_rounded,
                title: 'Не удалось загрузить',
                text: _error!,
              ),
            )
          else if (_items.isEmpty)
            const _PremiumCard(
              child: _CompactNotice(
                icon: Icons.notifications_none_rounded,
                title: 'Новых уведомлений нет',
                text:
                    'Когда водитель примет заказ или поездка изменит статус, мы покажем это здесь и в статусе поездки.',
              ),
            )
          else
            for (final group in _groupNotificationsByDay(_items)) ...[
              _ProfileGroupLabel(group.label),
              const SizedBox(height: 8),
              for (final item in group.items) ...[
                _NotificationTile(notification: item),
                const SizedBox(height: 10),
              ],
              const SizedBox(height: 6),
            ],
        ],
      ),
    );
  }
}

class _NotificationDayGroup {
  const _NotificationDayGroup(this.label, this.items);

  final String label;
  final List<AppNotification> items;
}

List<_NotificationDayGroup> _groupNotificationsByDay(
  List<AppNotification> items,
) {
  final now = DateTime.now();
  final today = DateTime(now.year, now.month, now.day);
  final yesterday = today.subtract(const Duration(days: 1));
  final ordered = <String, List<AppNotification>>{};
  for (final item in items) {
    final date = item.createdAt.toLocal();
    final day = DateTime(date.year, date.month, date.day);
    final label = day == today
        ? 'Сегодня'
        : day == yesterday
            ? 'Вчера'
            : '${day.day.toString().padLeft(2, '0')}.${day.month.toString().padLeft(2, '0')}.${day.year}';
    ordered.putIfAbsent(label, () => []).add(item);
  }
  return [
    for (final entry in ordered.entries)
      _NotificationDayGroup(entry.key, entry.value),
  ];
}

class _NotificationTile extends StatelessWidget {
  const _NotificationTile({required this.notification});

  final AppNotification notification;

  static IconData _iconFor(String type) {
    switch (type) {
      case 'DRIVER_FOUND':
        return Icons.person_search_rounded;
      case 'DRIVER_ARRIVED':
        return Icons.directions_car_filled_rounded;
      case 'TRIP_COMPLETED':
        return Icons.receipt_long_rounded;
      case 'ORDER_STATUS':
        return Icons.local_taxi_rounded;
      default:
        return Icons.notifications_none_rounded;
    }
  }

  static String _timeAgo(DateTime dateTime) {
    final diff = DateTime.now().difference(dateTime);
    if (diff.inMinutes < 1) return 'только что';
    if (diff.inMinutes < 60) return '${diff.inMinutes} мин назад';
    if (diff.inHours < 24) return '${diff.inHours} ч назад';
    return '${diff.inDays} дн назад';
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white,
        border: Border.all(
          color: notification.isUnread
              ? SmartTaxiColors.borderStrong
              : SmartTaxiColors.border,
        ),
        borderRadius: BorderRadius.circular(20),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 38,
            height: 38,
            alignment: Alignment.center,
            decoration: const BoxDecoration(
              color: SmartTaxiColors.goldSurface,
              shape: BoxShape.circle,
            ),
            child: Icon(
              _iconFor(notification.type),
              color: SmartTaxiColors.goldDeep,
              size: 18,
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        notification.title,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          color: SmartTaxiColors.text,
                          fontSize: 14.5,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                    ),
                    if (notification.isUnread) ...[
                      const SizedBox(width: 6),
                      Container(
                        width: 8,
                        height: 8,
                        decoration: const BoxDecoration(
                          color: SmartTaxiColors.gold,
                          shape: BoxShape.circle,
                        ),
                      ),
                    ],
                  ],
                ),
                const SizedBox(height: 4),
                Text(
                  notification.body,
                  style: const TextStyle(
                    color: SmartTaxiColors.textSecondary,
                    fontSize: 12.5,
                    height: 1.3,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                const SizedBox(height: 6),
                Text(
                  _timeAgo(notification.createdAt),
                  style: const TextStyle(
                    color: SmartTaxiColors.textMuted,
                    fontSize: 11,
                    fontWeight: FontWeight.w700,
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
                  fontWeight: FontWeight.w800,
                ),
              ),
              const SizedBox(height: 3),
              Text(
                text,
                style: TextStyle(
                  color: dark ? Colors.white60 : SmartTaxiColors.textSecondary,
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _SkeletonLine extends StatefulWidget {
  const _SkeletonLine({
    required this.width,
    required this.height,
    this.radius = 8,
  });

  final double width;
  final double height;
  final double radius;

  @override
  State<_SkeletonLine> createState() => _SkeletonLineState();
}

class _SkeletonLineState extends State<_SkeletonLine>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 900),
    )..repeat(reverse: true);
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    // Real looping shimmer instead of a one-shot fade-in, so a slow tariff
    // load still feels alive rather than stuck. Isolated in its own
    // RepaintBoundary since several of these animate at once side by side.
    return RepaintBoundary(
      child: AnimatedBuilder(
        animation: _controller,
        builder: (context, child) {
          final t = Curves.easeInOut.transform(_controller.value);
          return Container(
            width: widget.width,
            height: widget.height,
            decoration: BoxDecoration(
              color: Color.lerp(
                SmartTaxiColors.goldSurface,
                SmartTaxiColors.goldSoft.withValues(alpha: 0.75),
                t,
              ),
              borderRadius: BorderRadius.circular(widget.radius),
            ),
          );
        },
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
            color: Colors.white,
          ),
        ),
        const SizedBox(width: 10),
        Text(
          text,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: const TextStyle(
            color: Colors.white,
            fontSize: 16,
            fontWeight: FontWeight.w900,
          ),
        ),
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
    this.trailingText,
    this.loadingText = 'Создаём заказ...',
  });

  final bool enabled;
  final bool loading;
  final String text;
  final VoidCallback onTap;
  final String? trailingText;
  final String loadingText;

  @override
  Widget build(BuildContext context) {
    return Opacity(
      opacity: enabled ? 1 : 0.52,
      child: DecoratedBox(
        decoration: BoxDecoration(
          gradient: const LinearGradient(
            colors: [
              Color(0xff5b9dff),
              SmartTaxiColors.gold,
              SmartTaxiColors.goldDeep,
            ],
          ),
          borderRadius: BorderRadius.circular(20),
          boxShadow: enabled
              ? [
                  BoxShadow(
                    color: SmartTaxiColors.gold.withValues(alpha: 0.34),
                    blurRadius: 18,
                    offset: const Offset(0, 8),
                  ),
                ]
              : null,
        ),
        child: Material(
          color: Colors.transparent,
          borderRadius: BorderRadius.circular(20),
          child: InkWell(
            borderRadius: BorderRadius.circular(20),
            onTap: enabled ? onTap : null,
            child: SizedBox(
              height: 54,
              width: double.infinity,
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 18),
                child: loading
                    ? Center(child: _ButtonSpinner(text: loadingText))
                    : Stack(
                        alignment: Alignment.center,
                        children: [
                          Center(
                            child: Padding(
                              padding: EdgeInsets.only(
                                left: (trailingText ?? '').isNotEmpty ? 0 : 18,
                                right:
                                    (trailingText ?? '').isNotEmpty ? 70 : 28,
                              ),
                              child: FittedBox(
                                fit: BoxFit.scaleDown,
                                child: Text(
                                  text,
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  textAlign: TextAlign.center,
                                  style: const TextStyle(
                                    color: Colors.white,
                                    fontSize: 16,
                                    fontWeight: FontWeight.w900,
                                  ),
                                ),
                              ),
                            ),
                          ),
                          if ((trailingText ?? '').isNotEmpty) ...[
                            Positioned(
                              right: 0,
                              child: FittedBox(
                                fit: BoxFit.scaleDown,
                                child: Text(
                                  trailingText!,
                                  maxLines: 1,
                                  style: const TextStyle(
                                    color: Colors.white,
                                    fontSize: 15.2,
                                    fontWeight: FontWeight.w900,
                                  ),
                                ),
                              ),
                            )
                          ] else ...[
                            Positioned(
                              right: 0,
                              child: Container(
                                width: 34,
                                height: 34,
                                alignment: Alignment.center,
                                decoration: BoxDecoration(
                                  color: Colors.white.withValues(alpha: 0.22),
                                  shape: BoxShape.circle,
                                ),
                                child: const Icon(
                                  Icons.arrow_forward_rounded,
                                  color: Colors.white,
                                  size: 19,
                                ),
                              ),
                            ),
                          ],
                        ],
                      ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

const _faqItems = <(String, String)>[
  (
    'Как заказать поездку?',
    'Выберите точку подачи и адрес назначения на карте, выберите тариф, дождитесь расчёта и нажмите «Заказать».'
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

class _FaqScreen extends StatefulWidget {
  const _FaqScreen();

  @override
  State<_FaqScreen> createState() => _FaqScreenState();
}

class _FaqScreenState extends State<_FaqScreen> {
  final _searchController = TextEditingController();
  String _query = '';

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final query = _query.trim().toLowerCase();
    final filtered = query.isEmpty
        ? _faqItems
        : _faqItems
            .where(
              (item) =>
                  item.$1.toLowerCase().contains(query) ||
                  item.$2.toLowerCase().contains(query),
            )
            .toList(growable: false);
    return ListView(
      padding: const EdgeInsets.all(20),
      children: [
        const _TitleBlock(
          title: 'FAQ',
          text: 'Ответы на частые вопросы',
        ),
        const SizedBox(height: 16),
        TextField(
          controller: _searchController,
          onChanged: (value) => setState(() => _query = value),
          decoration: InputDecoration(
            hintText: 'Поиск по вопросам',
            prefixIcon: const Icon(Icons.search_rounded),
            suffixIcon: _query.isEmpty
                ? null
                : IconButton(
                    icon: const Icon(Icons.close_rounded),
                    tooltip: 'Очистить поиск',
                    onPressed: () {
                      _searchController.clear();
                      setState(() => _query = '');
                    },
                  ),
          ),
        ),
        const SizedBox(height: 16),
        if (filtered.isEmpty)
          const EmptyState(
            icon: Icons.search_off_rounded,
            title: 'Ничего не найдено',
            text: 'Попробуйте изменить запрос или напишите нам в поддержку.',
          )
        else
          ...filtered.map(
            (item) => Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: _FaqTile(question: item.$1, answer: item.$2),
            ),
          ),
      ],
    );
  }
}

class _FaqTile extends StatefulWidget {
  const _FaqTile({required this.question, required this.answer});

  final String question;
  final String answer;

  @override
  State<_FaqTile> createState() => _FaqTileState();
}

class _FaqTileState extends State<_FaqTile> {
  bool _open = false;

  @override
  Widget build(BuildContext context) {
    return _PremiumCard(
      child: Material(
        color: Colors.transparent,
        borderRadius: BorderRadius.circular(16),
        child: InkWell(
          borderRadius: BorderRadius.circular(16),
          onTap: () => setState(() => _open = !_open),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Expanded(
                    child: Text(
                      widget.question,
                      style: const TextStyle(
                        fontWeight: FontWeight.w900,
                        fontSize: 14.5,
                        height: 1.25,
                      ),
                    ),
                  ),
                  const SizedBox(width: 10),
                  AnimatedRotation(
                    turns: _open ? 0.5 : 0,
                    duration: const Duration(milliseconds: 220),
                    curve: Curves.easeOutCubic,
                    child: Container(
                      width: 26,
                      height: 26,
                      alignment: Alignment.center,
                      decoration: const BoxDecoration(
                        color: SmartTaxiColors.goldSurface,
                        shape: BoxShape.circle,
                      ),
                      child: const Icon(
                        Icons.keyboard_arrow_down_rounded,
                        size: 18,
                        color: SmartTaxiColors.goldDeep,
                      ),
                    ),
                  ),
                ],
              ),
              AnimatedSize(
                duration: const Duration(milliseconds: 220),
                curve: Curves.easeOutCubic,
                alignment: Alignment.topLeft,
                child: !_open
                    ? const SizedBox(width: double.infinity)
                    : Padding(
                        padding: const EdgeInsets.only(top: 10),
                        child: Text(
                          widget.answer,
                          style: const TextStyle(
                            color: SmartTaxiColors.textSecondary,
                            height: 1.4,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ),
              ),
            ],
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

class _LegalDocumentTile extends StatelessWidget {
  const _LegalDocumentTile({required this.document, required this.onTap});

  final LegalDocument document;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.transparent,
      child: InkWell(
        borderRadius: BorderRadius.circular(20),
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: Colors.white,
            border: Border.all(color: SmartTaxiColors.border),
            borderRadius: BorderRadius.circular(20),
          ),
          child: Row(
            children: [
              Container(
                width: 44,
                height: 44,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: SmartTaxiColors.goldSurface,
                  borderRadius: BorderRadius.circular(14),
                ),
                child: Icon(
                  document.icon,
                  color: SmartTaxiColors.goldDeep,
                  size: 21,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Text(
                  document.title,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    fontSize: 14.5,
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ),
              const Icon(
                Icons.chevron_right_rounded,
                color: SmartTaxiColors.textSecondary,
              ),
            ],
          ),
        ),
      ),
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
      padding: const EdgeInsets.all(12),
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
            width: 32,
            height: 32,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: dark
                  ? SmartTaxiColors.gold.withValues(alpha: 0.16)
                  : Colors.white.withValues(alpha: 0.72),
              shape: BoxShape.circle,
            ),
            child: Icon(icon, color: SmartTaxiColors.goldDeep, size: 17),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: TextStyle(
                    color: dark ? Colors.white : SmartTaxiColors.text,
                    fontSize: 15,
                    height: 1.05,
                    fontWeight: FontWeight.w900,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  text,
                  style: TextStyle(
                    color:
                        dark ? Colors.white70 : SmartTaxiColors.textSecondary,
                    fontSize: 13.5,
                    height: 1.25,
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
    final background = dark
        ? (danger
            ? SmartTaxiColors.danger.withValues(alpha: 0.14)
            : Colors.white.withValues(alpha: 0.06))
        : (danger ? const Color(0xfffff7f7) : SmartTaxiColors.goldSurface);
    final border = dark
        ? (danger
            ? SmartTaxiColors.danger.withValues(alpha: 0.28)
            : Colors.white.withValues(alpha: 0.08))
        : (danger ? const Color(0xffffd7d7) : SmartTaxiColors.borderStrong);
    final tone = danger
        ? (dark ? const Color(0xffffb4b4) : SmartTaxiColors.danger)
        : (dark ? Colors.white70 : SmartTaxiColors.goldDeep);
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.fromLTRB(11, 9, 12, 9),
      decoration: BoxDecoration(
        color: background,
        border: Border.all(color: border),
        borderRadius: BorderRadius.circular(15),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 26,
            height: 26,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: tone.withValues(alpha: danger ? 0.10 : 0.13),
              shape: BoxShape.circle,
            ),
            child: Icon(
              danger ? Icons.error_outline_rounded : Icons.info_outline_rounded,
              size: 16,
              color: tone,
            ),
          ),
          const SizedBox(width: 9),
          Expanded(
            child: Text(
              text,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                color: danger
                    ? (dark ? const Color(0xffffb4b4) : const Color(0xffd32632))
                    : (dark ? Colors.white70 : SmartTaxiColors.textSecondary),
                fontSize: 12.5,
                height: 1.2,
                fontWeight: FontWeight.w800,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _ProfileStatTile extends StatelessWidget {
  const _ProfileStatTile({
    required this.icon,
    required this.value,
    required this.label,
  });

  final IconData icon;
  final String value;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 8),
      decoration: BoxDecoration(
        color: SmartTaxiColors.goldSurface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: SmartTaxiColors.border),
      ),
      child: Column(
        children: [
          Icon(icon, size: 18, color: SmartTaxiColors.goldDeep),
          const SizedBox(height: 6),
          Text(
            value,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(
              fontSize: 14,
              fontWeight: FontWeight.w900,
              color: SmartTaxiColors.text,
            ),
          ),
          const SizedBox(height: 2),
          Text(
            label,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(
              fontSize: 10.5,
              fontWeight: FontWeight.w700,
              color: SmartTaxiColors.textSecondary,
            ),
          ),
        ],
      ),
    );
  }
}

class _ProfileRow extends StatelessWidget {
  const _ProfileRow({
    required this.label,
    required this.value,
    this.copyable = false,
  });

  final String label;
  final String value;
  final bool copyable;

  Future<void> _copy(BuildContext context) async {
    await Clipboard.setData(ClipboardData(text: value));
    if (!context.mounted) return;
    AppToast.showSuccess(context, 'Скопировано: $value');
  }

  @override
  Widget build(BuildContext context) {
    final valueRow = Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Flexible(
          child: Text(
            value,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(fontWeight: FontWeight.w800),
          ),
        ),
        if (copyable) ...[
          const SizedBox(width: 5),
          const Icon(
            Icons.copy_rounded,
            size: 14,
            color: SmartTaxiColors.textMuted,
          ),
        ],
      ],
    );
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(
          label,
          style: const TextStyle(color: SmartTaxiColors.textSecondary),
        ),
        const SizedBox(width: 12),
        Flexible(
          child: copyable
              ? Semantics(
                  button: true,
                  label: 'Скопировать $label',
                  child: InkWell(
                    borderRadius: BorderRadius.circular(10),
                    onTap: () => _copy(context),
                    child: Padding(
                      padding: const EdgeInsets.symmetric(
                        vertical: 10,
                        horizontal: 4,
                      ),
                      child: valueRow,
                    ),
                  ),
                )
              : valueRow,
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
    this.danger = false,
    this.onTap,
  });

  final String title;
  final String text;
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
            if (onTap != null)
              const Icon(
                Icons.chevron_right_rounded,
                color: SmartTaxiColors.goldDeep,
              ),
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
    this.subtitle,
    this.danger = false,
    this.badge,
  });

  final IconData icon;
  final String title;
  final String? subtitle;
  final bool danger;
  final String? badge;
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
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Flexible(
                        child: Text(
                          title,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                            color: tone,
                            fontWeight: FontWeight.w900,
                          ),
                        ),
                      ),
                      if ((badge ?? '').trim().isNotEmpty) ...[
                        const SizedBox(width: 7),
                        Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 7,
                            vertical: 2,
                          ),
                          decoration: BoxDecoration(
                            color: SmartTaxiColors.goldSurface,
                            borderRadius: BorderRadius.circular(999),
                          ),
                          child: Text(
                            badge!,
                            style: const TextStyle(
                              color: SmartTaxiColors.goldDeep,
                              fontSize: 9.5,
                              fontWeight: FontWeight.w900,
                            ),
                          ),
                        ),
                      ],
                    ],
                  ),
                  if ((subtitle ?? '').trim().isNotEmpty) ...[
                    const SizedBox(height: 3),
                    Text(
                      subtitle!,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        color: danger
                            ? SmartTaxiColors.danger.withValues(alpha: 0.74)
                            : SmartTaxiColors.textSecondary,
                        fontSize: 12,
                        height: 1.2,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ],
                ],
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

class _DriverStepRow extends StatelessWidget {
  const _DriverStepRow({
    required this.number,
    required this.title,
    required this.text,
  });

  final String number;
  final String title;
  final String text;

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          width: 28,
          height: 28,
          alignment: Alignment.center,
          decoration: const BoxDecoration(
            color: SmartTaxiColors.goldSurface,
            shape: BoxShape.circle,
          ),
          child: Text(
            number,
            style: const TextStyle(
              color: SmartTaxiColors.goldDeep,
              fontSize: 13,
              fontWeight: FontWeight.w900,
            ),
          ),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                title,
                style: const TextStyle(
                  fontSize: 14.5,
                  fontWeight: FontWeight.w800,
                ),
              ),
              const SizedBox(height: 2),
              Text(
                text,
                style: const TextStyle(
                  color: SmartTaxiColors.textSecondary,
                  fontSize: 12.5,
                  height: 1.3,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _ApplicationField extends StatelessWidget {
  const _ApplicationField({
    required this.label,
    required this.onChanged,
    this.initialValue = '',
    this.keyboardType,
    this.icon,
  });

  final String label;
  final String initialValue;
  final TextInputType? keyboardType;
  final ValueChanged<String> onChanged;
  final IconData? icon;

  @override
  Widget build(BuildContext context) => TextFormField(
        initialValue: initialValue,
        decoration: InputDecoration(
          labelText: label,
          prefixIcon: icon == null
              ? null
              : Icon(icon, color: SmartTaxiColors.textSecondary, size: 20),
        ),
        keyboardType: keyboardType,
        onChanged: onChanged,
      );
}

enum _PointResultAction { select, openMapPicker }

class _PointResult {
  _PointResult(this.coordinate, this.label)
      : action = _PointResultAction.select;

  _PointResult.openMapPicker()
      : coordinate = null,
        label = '',
        action = _PointResultAction.openMapPicker;

  final Coordinate? coordinate;
  final String label;
  final _PointResultAction action;
}

class _CollapsibleOrderSheet extends StatelessWidget {
  const _CollapsibleOrderSheet({
    required this.minimized,
    required this.onMinimizedChanged,
    required this.maxHeight,
    required this.child,
  });

  final bool minimized;
  final ValueChanged<bool> onMinimizedChanged;
  final double maxHeight;
  final Widget child;

  static const _collapsedHeight = 46.0;

  // Grab the handle and pull down to collapse to just the map, pull the
  // collapsed bar back up (or tap it) to restore — a drag past a small
  // threshold is enough, it doesn't need to track the finger 1:1.
  void _handleDragUpdate(DragUpdateDetails details) {
    final dy = details.primaryDelta;
    if (dy == null) return;
    if (dy > 4 && !minimized) {
      onMinimizedChanged(true);
    } else if (dy < -4 && minimized) {
      onMinimizedChanged(false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      behavior: HitTestBehavior.translucent,
      onTap: minimized ? () => onMinimizedChanged(false) : null,
      onVerticalDragUpdate: _handleDragUpdate,
      child: AnimatedCrossFade(
        duration: const Duration(milliseconds: 260),
        sizeCurve: Curves.easeOutCubic,
        firstCurve: Curves.easeOut,
        secondCurve: Curves.easeIn,
        alignment: Alignment.bottomCenter,
        crossFadeState:
            minimized ? CrossFadeState.showSecond : CrossFadeState.showFirst,
        firstChild: ConstrainedBox(
          constraints: BoxConstraints(maxHeight: maxHeight),
          child: child,
        ),
        secondChild: const _MinimizedSheetBar(),
      ),
    );
  }
}

class _MinimizedSheetBar extends StatelessWidget {
  const _MinimizedSheetBar();

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.fromLTRB(
        10,
        0,
        10,
        8 + MediaQuery.paddingOf(context).bottom,
      ),
      child: Container(
        height: _CollapsibleOrderSheet._collapsedHeight,
        alignment: Alignment.center,
        decoration: const BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.all(Radius.circular(999)),
          boxShadow: [
            BoxShadow(
              color: Color(0x24785a14),
              blurRadius: 24,
              offset: Offset(0, 10),
            ),
          ],
        ),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 44,
              height: 5,
              decoration: BoxDecoration(
                color: SmartTaxiColors.borderStrong,
                borderRadius: BorderRadius.circular(999),
              ),
            ),
            const SizedBox(height: 5),
            const Icon(
              Icons.keyboard_arrow_up_rounded,
              size: 16,
              color: SmartTaxiColors.textMuted,
            ),
          ],
        ),
      ),
    );
  }
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
    // Terminal statuses (completed in any form, cancelled in any form) never
    // actually reach this widget — _TripStatusPanel returns a different
    // panel for all of them before a _StatusStepper is ever built, so a
    // "Финиш" group here would be dead code. Only the 4 live-trip stages
    // are reachable.
    const steps = [
      {'SEARCHING_DRIVER', 'NEW'},
      {'DRIVER_FOUND', 'DRIVER_GOING_TO_CLIENT', 'DRIVER_ASSIGNED'},
      {'DRIVER_ARRIVED', 'WAITING_CLIENT'},
      {'TRIP_STARTED', 'IN_PROGRESS'},
    ];
    const labels = ['Поиск', 'Едет', 'Ждёт', 'В пути'];
    final normalizedStatus = status.toUpperCase();
    final rawIndex =
        steps.indexWhere((group) => group.contains(normalizedStatus));
    // An unrecognized status here is far more likely to be a newer
    // in-progress stage this widget hasn't been taught yet than a reversion
    // to searching, so fall forward to the last stage instead of resetting
    // to step 0 (which would visually read as "search restarted").
    final index = rawIndex < 0 ? steps.length - 1 : rawIndex;
    return Row(
      children: List.generate(steps.length, (stepIndex) {
        final done = stepIndex <= index;
        return Expanded(
          child: Row(
            children: [
              Expanded(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    AnimatedContainer(
                      duration: const Duration(milliseconds: 180),
                      curve: Curves.easeOutCubic,
                      width: done ? 12 : 9,
                      height: done ? 12 : 9,
                      decoration: BoxDecoration(
                        color: done ? SmartTaxiColors.gold : Colors.white,
                        shape: BoxShape.circle,
                        border: Border.all(
                          color: done
                              ? SmartTaxiColors.gold
                              : SmartTaxiColors.borderStrong,
                          width: 1.5,
                        ),
                        boxShadow: done
                            ? [
                                BoxShadow(
                                  color: SmartTaxiColors.gold
                                      .withValues(alpha: 0.25),
                                  blurRadius: 8,
                                  offset: const Offset(0, 3),
                                ),
                              ]
                            : null,
                      ),
                    ),
                    const SizedBox(height: 6),
                    Text(
                      labels[stepIndex],
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        color: done
                            ? SmartTaxiColors.text
                            : SmartTaxiColors.textSecondary,
                        fontSize: 10,
                        height: 1,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                  ],
                ),
              ),
              if (stepIndex != steps.length - 1)
                Expanded(
                  child: Container(
                    height: 2,
                    margin: const EdgeInsets.only(bottom: 16),
                    decoration: BoxDecoration(
                      color: stepIndex < index
                          ? SmartTaxiColors.gold
                          : SmartTaxiColors.border,
                      borderRadius: BorderRadius.circular(99),
                    ),
                  ),
                ),
            ],
          ),
        );
      }),
    );
  }
}

String _statusLabel(String status) {
  return const {
        'NEW': 'Ищем водителя',
        'SEARCHING_DRIVER': 'Ищем водителя',
        'DRIVER_ASSIGNED': 'Водитель найден',
        'DRIVER_FOUND': 'Водитель найден',
        'DRIVER_GOING_TO_CLIENT': 'Водитель едет к вам',
        'DRIVER_ARRIVED': 'Водитель прибыл',
        'WAITING_CLIENT': 'Ожидание клиента',
        'IN_PROGRESS': 'В пути',
        'TRIP_STARTED': 'В пути',
        'COMPLETED': 'Поездка завершена',
        'TRIP_COMPLETED': 'Поездка завершена',
        'PAYMENT_PENDING': 'Ожидает оплату',
        'PAID': 'Оплачено',
        'RATED': 'Спасибо за оценку',
        'CANCELLED': 'Отменён',
        'CANCELLED_BY_CLIENT': 'Отменён',
        'CANCELLED_BY_DRIVER': 'Отменён водителем',
        'CANCELLED_BY_OPERATOR': 'Отменён оператором',
        'NO_SHOW': 'Клиент не вышел',
      }[status] ??
      'Статус обновляется';
}

StatusTone _statusTone(String status) {
  if (status == 'COMPLETED' ||
      status == 'TRIP_COMPLETED' ||
      status == 'PAID' ||
      status == 'RATED') {
    return StatusTone.success;
  }
  if (status == 'CANCELLED' ||
      status == 'CANCELLED_BY_CLIENT' ||
      status == 'CANCELLED_BY_DRIVER' ||
      status == 'CANCELLED_BY_OPERATOR' ||
      status == 'NO_SHOW') {
    return StatusTone.danger;
  }
  if (status == 'DRIVER_ASSIGNED' ||
      status == 'DRIVER_FOUND' ||
      status == 'DRIVER_GOING_TO_CLIENT' ||
      status == 'DRIVER_ARRIVED' ||
      status == 'WAITING_CLIENT' ||
      status == 'IN_PROGRESS' ||
      status == 'TRIP_STARTED' ||
      status == 'PAYMENT_PENDING') {
    return StatusTone.warning;
  }
  return StatusTone.neutral;
}

enum PassengerTab {
  home,
  trips,
  profile,
  promoCodes,
  notifications,
  driverApplication,
  support,
  faq,
  about,
  legalHub,
  legalTerms,
  legalPrivacy,
  legalPayment,
  legalCancellation,
  legalSafety,
  settings,
  recurringBookings,
  favoriteAddresses,
  driverPreferences,
}

enum PointTarget { pickup, dropoff }

enum PointSource { none, gps, map, manual }

enum _RegionConfirmAction { accept, change }

List<AddressSuggestion> _mergeRecentAddress(
  List<AddressSuggestion> current,
  AddressSuggestion next,
) {
  final nextLabel = next.label.trim().toLowerCase();
  final updated = <AddressSuggestion>[next];

  for (final item in current) {
    final sameLabel = item.label.trim().toLowerCase() == nextLabel;
    final samePoint =
        (item.coordinate.lat - next.coordinate.lat).abs() < 0.00001 &&
            (item.coordinate.lng - next.coordinate.lng).abs() < 0.00001;
    if (!sameLabel && !samePoint) {
      updated.add(item);
    }
    if (updated.length >= 6) break;
  }

  return updated;
}

List<AddressSuggestion> _popularAddressesForRegion(String regionName) {
  final normalized = regionName.toLowerCase();
  const southKazakhstanRegion = 'Туркестанская область';
  if (normalized.contains('мырзакент') ||
      normalized.contains('myrzakent') ||
      normalized.contains('славян')) {
    return const [
      AddressSuggestion(
        label: 'Мырзакент (Славянка)',
        subtitle: 'Центр посёлка',
        city: 'Мырзакент',
        region: southKazakhstanRegion,
        coordinate: Coordinate(lat: 40.665495, lng: 68.549994),
      ),
      AddressSuggestion(
        label: 'Акимат Мактааральского района',
        subtitle: 'Районный акимат',
        city: 'Мырзакент',
        region: southKazakhstanRegion,
        coordinate: Coordinate(lat: 40.66690, lng: 68.55210),
      ),
      AddressSuggestion(
        label: 'Мырзакент базар',
        subtitle: 'Центральный рынок',
        city: 'Мырзакент',
        region: southKazakhstanRegion,
        coordinate: Coordinate(lat: 40.66492, lng: 68.54464),
      ),
      AddressSuggestion(
        label: 'Автовокзал Мырзакент',
        subtitle: 'Ориентир, центр',
        city: 'Мырзакент',
        region: southKazakhstanRegion,
        coordinate: Coordinate(lat: 40.66848, lng: 68.53928),
      ),
      AddressSuggestion(
        label: 'Центральная районная больница',
        subtitle: 'ЦРБ Мактааральского района',
        city: 'Мырзакент',
        region: southKazakhstanRegion,
        coordinate: Coordinate(lat: 40.66978, lng: 68.54742),
      ),
    ];
  }
  if (normalized.contains('атакент') || normalized.contains('atakent')) {
    return const [
      AddressSuggestion(
        label: 'Атакент (Ильич)',
        subtitle: 'Центр посёлка',
        city: 'Атакент',
        region: southKazakhstanRegion,
        coordinate: Coordinate(lat: 40.844435, lng: 68.509021),
      ),
      AddressSuggestion(
        label: 'Базар Атакент',
        subtitle: 'Центральный рынок',
        city: 'Атакент',
        region: southKazakhstanRegion,
        coordinate: Coordinate(lat: 40.84473, lng: 68.51162),
      ),
      AddressSuggestion(
        label: 'Атакент автовокзал',
        subtitle: 'Ориентир, центр',
        city: 'Атакент',
        region: southKazakhstanRegion,
        coordinate: Coordinate(lat: 40.84621, lng: 68.50486),
      ),
      AddressSuggestion(
        label: 'Районная больница «Атакент»',
        subtitle: 'ул. Ж. Ибраева',
        city: 'Атакент',
        region: southKazakhstanRegion,
        coordinate: Coordinate(lat: 40.84210, lng: 68.51190),
      ),
      AddressSuggestion(
        label: 'Акимат посёлка Атакент',
        subtitle: 'Здание акимата',
        city: 'Атакент',
        region: southKazakhstanRegion,
        coordinate: Coordinate(lat: 40.84550, lng: 68.50750),
      ),
    ];
  }
  if (normalized.contains('жетысай') ||
      normalized.contains('жетисай') ||
      normalized.contains('джетысай') ||
      normalized.contains('zhetysay')) {
    return const [
      AddressSuggestion(
        label: 'Жетысай (Джетысай)',
        subtitle: 'Центр города',
        city: 'Жетысай',
        region: southKazakhstanRegion,
        coordinate: Coordinate(lat: 40.777134, lng: 68.324677),
      ),
      AddressSuggestion(
        label: 'Центральный базар Жетысай',
        subtitle: 'Центральный рынок',
        city: 'Жетысай',
        region: southKazakhstanRegion,
        coordinate: Coordinate(lat: 40.77980, lng: 68.32190),
      ),
      AddressSuggestion(
        label: 'Акимат Жетысайского района',
        subtitle: 'Городской сквер',
        city: 'Жетысай',
        region: southKazakhstanRegion,
        coordinate: Coordinate(lat: 40.77650, lng: 68.32710),
      ),
      AddressSuggestion(
        label: 'Мечеть «Нур»',
        subtitle: 'Жетысай',
        city: 'Жетысай',
        region: southKazakhstanRegion,
        coordinate: Coordinate(lat: 40.77420, lng: 68.32990),
      ),
      AddressSuggestion(
        label: 'Автовокзал Жетысай',
        subtitle: 'Ориентир, центр',
        city: 'Жетысай',
        region: southKazakhstanRegion,
        coordinate: Coordinate(lat: 40.78191, lng: 68.31951),
      ),
    ];
  }
  if (normalized.contains('асыката') ||
      normalized.contains('асықата') ||
      normalized.contains('asykata')) {
    return const [
      AddressSuggestion(
        label: 'Асыката (Асықата)',
        subtitle: 'Центр посёлка',
        city: 'Асыката',
        region: southKazakhstanRegion,
        coordinate: Coordinate(lat: 40.89470, lng: 68.36350),
      ),
      AddressSuggestion(
        label: 'Базар Асыката',
        subtitle: 'Местный рынок',
        city: 'Асыката',
        region: southKazakhstanRegion,
        coordinate: Coordinate(lat: 40.89524, lng: 68.36518),
      ),
      AddressSuggestion(
        label: 'Автовокзал Асыката',
        subtitle: 'Остановка у центра',
        city: 'Асыката',
        region: southKazakhstanRegion,
        coordinate: Coordinate(lat: 40.89361, lng: 68.36184),
      ),
      AddressSuggestion(
        label: 'Акимат Асыката',
        subtitle: 'Центральный ориентир',
        city: 'Асыката',
        region: southKazakhstanRegion,
        coordinate: Coordinate(lat: 40.89418, lng: 68.36304),
      ),
    ];
  }
  if (normalized.contains('киров') || normalized.contains('kirov')) {
    return const [
      AddressSuggestion(
        label: 'Киров (Кирово)',
        subtitle: 'Центр посёлка',
        city: 'Киров',
        region: southKazakhstanRegion,
        coordinate: Coordinate(lat: 40.78690, lng: 68.53440),
      ),
      AddressSuggestion(
        label: 'Базар Киров',
        subtitle: 'Местный рынок',
        city: 'Киров',
        region: southKazakhstanRegion,
        coordinate: Coordinate(lat: 40.78752, lng: 68.53548),
      ),
      AddressSuggestion(
        label: 'Школа Киров',
        subtitle: 'Ориентир в посёлке',
        city: 'Киров',
        region: southKazakhstanRegion,
        coordinate: Coordinate(lat: 40.78588, lng: 68.53372),
      ),
    ];
  }
  if (normalized.contains('шымкент') || normalized.contains('shymkent')) {
    return const [
      AddressSuggestion(
        label: 'Шымкент центр',
        subtitle: 'Площадь Ордабасы',
        city: 'Шымкент',
        region: 'Шымкент',
        coordinate: Coordinate(lat: 42.31538, lng: 69.58691),
      ),
      AddressSuggestion(
        label: 'ЖД вокзал Шымкент',
        subtitle: 'Вокзальная зона',
        city: 'Шымкент',
        region: 'Шымкент',
        coordinate: Coordinate(lat: 42.31732, lng: 69.59952),
      ),
      AddressSuggestion(
        label: 'Mega Planet',
        subtitle: 'Шымкент, торговый центр',
        city: 'Шымкент',
        region: 'Шымкент',
        coordinate: Coordinate(lat: 42.31828, lng: 69.59558),
      ),
    ];
  }
  final cleanRegionName = regionName.trim().isEmpty ? 'Регион' : regionName;
  return [
    AddressSuggestion(
      label: '$cleanRegionName центр',
      subtitle: 'Выберите точку или уточните адрес',
      city: cleanRegionName == 'Регион' ? null : cleanRegionName,
      region: southKazakhstanRegion,
      coordinate: const Coordinate(lat: 40.844435, lng: 68.509021),
    ),
  ];
}

String _driverPickupMeta(RoutePreview route) {
  final distance = (route.distanceMeters / 1000).toStringAsFixed(1);
  final minutes = (route.durationSeconds / 60).round();
  final label = route.isToDropoff ? 'До места назначения' : 'До точки посадки';
  return '$label: $distance км · $minutes мин';
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
  final apiCode = _apiErrorCode(error);
  if (apiCode != null) {
    const apiMap = {
      'CLIENT_HAS_ACTIVE_ORDER':
          'У вас уже есть активный заказ. Откройте поездку или отмените её.',
      'VALIDATION_ERROR': 'Проверьте адреса и попробуйте ещё раз.',
      'UNAUTHORIZED': 'Сессия устарела. Войдите в аккаунт ещё раз.',
      'FORBIDDEN': 'Недостаточно прав для этого действия.',
      'RATE_LIMITED': 'Слишком много запросов. Попробуйте чуть позже.',
      'PICKUP_REGION_INACTIVE': 'В этом месте сервис пока недоступен',
      'DROPOFF_REGION_INACTIVE': 'Точка назначения вне активного региона',
      'INTERCITY_NOT_SUPPORTED': 'Межгород пока не поддерживается',
      'TARIFF_INACTIVE': 'Этот тариф временно недоступен',
      'TARIFF_REGION_MISMATCH': 'Тариф недоступен для выбранного региона',
      'ROUTE_UNAVAILABLE': 'Маршрут временно недоступен.',
      'DRIVER_LOCATION_UNAVAILABLE': 'Ожидаем геолокацию водителя',
    };
    final mapped = apiMap[apiCode];
    if (mapped != null) return mapped;
  }
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
  if (message.contains('DRIVER_TERMS_REQUIRED')) {
    return 'Подтвердите согласие с условиями, чтобы отправить заявку';
  }
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

String? _apiErrorCode(Object error) {
  if (error is DioException) {
    final data = error.response?.data;
    if (data is Map) {
      final code = data['error']?.toString();
      if (code != null && code.isNotEmpty) return code;
    }
    final status = error.response?.statusCode;
    if (status == 401) return 'UNAUTHORIZED';
    if (status == 403) return 'FORBIDDEN';
    if (status == 429) return 'RATE_LIMITED';
  }
  return null;
}
