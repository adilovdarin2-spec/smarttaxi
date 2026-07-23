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
// Blue/white design system tokens (docs/design/
// BLUE_WHITE_DESIGN_SYSTEM_2026-07-15.md) — used only in the trip-search/
// driver-found flow below, migrated opportunistically while redesigning
// that specific screen per the doc's own "migrate as you touch a screen,
// not a blanket repaint" guidance. Not a replacement for SmartTaxiColors.gold
// used everywhere else in this file.
const _blueAccent = Color(0xff2c5fe0);
const _blueSurface = Color(0xffeef2fc);
const _blueBorder = Color(0xffe1e7f5);
// One consistent neutral card shadow, applied opportunistically as screens
// get touched (design doc: "one consistent card shadow", same
// migrate-don't-blanket-repaint policy as the color tokens above). Does not
// replace the deliberately different colored glows on selected/accent
// states (_TariffCard selected, _GoldCtaButton) — those are a different,
// intentional visual language, not an inconsistency to fix.
const _cardShadow = <BoxShadow>[
  BoxShadow(color: Color(0x14785a14), blurRadius: 24, offset: Offset(0, 10)),
];
// Darkens the OSM raster tile layer for dark theme without a separate dark
// tile provider/API key. Same math as the well-known CSS
// `filter: invert(1) hue-rotate(180deg)` dark-map trick (invert flips
// luminosity so light backgrounds go dark; the hue-rotate afterwards undoes
// the hue shift invert alone would cause, so green stays green-ish and blue
// water stays blue-ish instead of turning magenta/orange). Left as a flat
// list (not computed from two chained ColorFilter.matrix calls) since
// ColorFiltered only composes one matrix per widget.
const _darkMapTileMatrix = <double>[
  0.574, -1.430, -0.144, 0, 255,
  -0.426, -0.430, -0.144, 0, 255,
  -0.426, -1.430, 0.856, 0, 255,
  0, 0, 0, 1, 0,
];
const _identityColorMatrix = <double>[
  1, 0, 0, 0, 0,
  0, 1, 0, 0, 0,
  0, 0, 1, 0, 0,
  0, 0, 0, 1, 0,
];
const _iconMenu = 'assets/icons/menu.svg';
const _iconBell = 'assets/icons/bell.svg';
const _iconChevronRight = 'assets/icons/chevron_right.svg';
const _iconBanknote = 'assets/icons/banknote.svg';
const _iconCreditCard = 'assets/icons/credit_card.svg';
const _iconCar = 'assets/icons/car.svg';
const _iconDelivery = 'assets/icons/delivery.svg';
const _iconDeliveryVan = 'assets/icons/delivery_van_illustration.svg';
const _atakentFallbackCenter = LatLng(40.84719, 68.503834);
const _appVersion = AppConfig.appVersion;

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
  // Free-text note attached to the order at creation — which entrance,
  // floor, door, landmark. Round-trips through the backend's single
  // orders.notes column (whole-order, not per pickup/dropoff).
  String? _orderNote;
  // Standalone "check a code" tool on the Промокоды screen.
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
  ReferralSummary? _referralSummary;
  bool _referralSummaryLoading = false;
  bool _referralSummaryError = false;
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
  // Live "km driven so far" for the trip in progress — accumulated
  // server-side from real GPS pings (see updateDriverLocation in
  // routing.service.js), arrives piggybacked on the same
  // driver_location_updated socket event as _driverLocation. Null until the
  // first such update for this trip; distinct from 0, which means "at least
  // one update arrived and the driver genuinely hasn't moved yet".
  int? _tripDistanceTraveledM;
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
  bool _retryingPayment = false;
  LatLng? _mapCenter;
  // Persisted at the shell level (not inside _MapCanvasState) so a pinch
  // zoom survives leaving Home and coming back — that widget is fully torn
  // down and rebuilt on every tab switch, which otherwise silently reset
  // the camera back to the default zoom each time.
  double? _mapZoom;
  // Backs the bell icon's badge dot — real state from the backend, not a
  // permanently-on decoration. Refreshed at bootstrap and bumped locally
  // when an order-status toast fires (the same event that made the backend
  // insert a notification row), then zeroed once the rider actually opens
  // the Уведомления screen and it marks everything read.
  int _unreadNotificationCount = 0;
  String _driverFullName = '';
  String _driverPhone = '';
  String _driverCarModel = '';
  String _driverCarColor = '';
  String _driverPlate = '';
  String _driverYear = '';
  String _driverComment = '';
  bool _driverTermsAccepted = false;
  String? _driverApplicationMessage;
  // Null until the rider picks one — the rest of the support form (trip
  // picker for "Забыл вещь", message, submit) only reveals once a topic is
  // chosen, so the flow reads as topic -> (trip if lost item) -> message
  // instead of one flat form with every field visible at once.
  String? _supportTopic;
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
    // Fired first, before the socket connect and region load below --
    // "do I already have an active order" is a plain REST call that needs
    // neither of those, but used to run after both, so a slow socket
    // handshake or region fetch (either one network-latency-dependent)
    // delayed the moment a rider relaunching/resuming mid-trip actually saw
    // their trip screen again, reading as "confirming the order didn't do
    // anything" for however many seconds that chain took.
    unawaited(_restoreActiveOrder());
    // Best-effort cached fix, purely local (no network, no permission
    // prompt) -- lands before _loadRegions()'s network round trip so the
    // map's first real paint is already close to the rider's actual
    // position instead of the Atakent placeholder, cutting out one of the
    // two visible jumps a cold start otherwise did (placeholder -> region
    // center -> real GPS).
    unawaited(_seedMapCenterFromLastKnownLocation());
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
    unawaited(_loadTripHistory());
    unawaited(_loadUnreadNotificationCount());
  }

  Future<void> _loadUnreadNotificationCount() async {
    try {
      final result = await widget.api.getNotifications(limit: 1);
      if (!mounted) return;
      setState(() => _unreadNotificationCount = result.unreadCount);
    } catch (_) {
      // Best-effort: the bell badge just stays at its last known value.
    }
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
      AppToast.showError(context, _readableError(AppLocalizations.of(context), error));
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
      AppToast.showError(context, _readableError(AppLocalizations.of(context), error));
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
      AppToast.showError(context, _readableError(AppLocalizations.of(context), error));
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
      AppToast.showError(context, _readableError(AppLocalizations.of(context), error));
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
      AppToast.showError(context, _readableError(AppLocalizations.of(context), error));
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
      AppToast.showError(context, _readableError(AppLocalizations.of(context), error));
    } finally {
      if (mounted) {
        setState(
            () => _driverPreferenceRemoving.remove(preference.driverId));
      }
    }
  }

  Future<void> _loadReferralSummary() async {
    if (!mounted) return;
    setState(() {
      _referralSummaryLoading = true;
      _referralSummaryError = false;
    });
    try {
      final summary = await widget.api.getReferralSummary();
      if (!mounted) return;
      setState(() => _referralSummary = summary);
    } catch (_) {
      if (mounted) setState(() => _referralSummaryError = true);
    } finally {
      if (mounted) setState(() => _referralSummaryLoading = false);
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

  Future<void> _seedMapCenterFromLastKnownLocation() async {
    try {
      final last = await Geolocator.getLastKnownPosition();
      if (last == null || !mounted || _mapCenter != null) return;
      setState(() => _mapCenter = LatLng(last.latitude, last.longitude));
    } catch (_) {
      // No cached fix, or permission not yet granted -- the region/GPS
      // chain below still lands on the real center a moment later.
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
        // ??= not = -- a cached-location seed or an in-flight pan/GPS
        // result may have already landed a better center than the
        // region's administrative point; don't jump away from it.
        _mapCenter ??= activeRegion == null
            ? _atakentFallbackCenter
            : (activeRegion.center?.toLatLng() ?? _atakentFallbackCenter);
      });
      _maybeAskLocationOnStart();
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _regions = const [];
        _selectedRegion = null;
        _mapCenter ??= _atakentFallbackCenter;
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
    RegionOption? selected;
    if (_regions.length == 1) {
      // Only one active region — nothing to actually pick, skip the sheet.
      selected = _regions.first;
    } else if (mounted) {
      selected = await showModalBottomSheet<RegionOption>(
        context: context,
        isScrollControlled: true,
        backgroundColor: Colors.transparent,
        builder: (_) => _RegionSelectSheet(
          regions: _regions,
          selectedId: _selectedRegion?.id,
          title: title,
          subtitle: subtitle,
        ),
      );
    }
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

  Future<_RegionConfirmAction?> _confirmDetectedRegion(
    RegionOption region,
  ) async {
    if (!mounted) return _RegionConfirmAction.accept;
    // Dismissing without an explicit choice (tap outside) falls through to
    // null at the call site, which is treated the same as "accept" there —
    // safe default, matches the previous always-auto-accept behaviour while
    // still giving the passenger a real way to say "no, that's wrong".
    return showModalBottomSheet<_RegionConfirmAction>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => _RegionConfirmSheet(region: region),
    );
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
    // POST /orders/:id/cancel (driver role) reopens the order for dispatch
    // instead of a terminal cancel — status goes back to SEARCHING_DRIVER
    // with driver_id cleared, distinct from a real terminal cancellation
    // (which lands on a CANCELLED_BY_* status, not SEARCHING_DRIVER).
    final driverJustCancelled = (_order?.driverId ?? '').isNotEmpty &&
        order.driverId == null &&
        order.status == 'SEARCHING_DRIVER';
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
      // Seeds the live distance counter from a fresh REST snapshot (app
      // resume/restart mid-trip, reconnect) so it isn't stuck at null until
      // the next driver_location_updated ping — but never lets a
      // possibly-stale REST value move it backwards from what a more recent
      // live ping already established, since distance only ever accumulates.
      if (order.distanceTraveledM != null &&
          (_tripDistanceTraveledM == null ||
              order.distanceTraveledM! > _tripDistanceTraveledM!)) {
        _tripDistanceTraveledM = order.distanceTraveledM;
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
      // The backend also sends a real push for this (DRIVER_FOUND, see
      // orders.routes.js) so it still lands as a system notification when
      // the app is backgrounded — this toast covers the common case where
      // the app is open but the rider has wandered to another tab, where a
      // background-only push wouldn't be visible at all.
      if (mounted) {
        AppToast.showSuccess(
          context,
          (order.driverName ?? '').isEmpty
              ? 'Водитель найден!'
              : 'Водитель найден: ${order.driverName} едет к вам',
        );
        // The backend just wrote the matching notification row for this same
        // event — bump the bell badge locally instead of waiting for the
        // rider to happen to reopen Уведомления to notice it exists.
        setState(() => _unreadNotificationCount++);
      }
    }
    if (driverJustArrived) {
      unawaited(HapticFeedback.heavyImpact());
    }
    if (driverJustCancelled) {
      unawaited(HapticFeedback.mediumImpact());
      // Backend already pushes "Водитель сменился" (DRIVER_CANCELLED,
      // orders.routes.js) for the backgrounded case; this toast covers the
      // open-app/other-tab case the same way the driver-found one does.
      if (mounted) {
        AppToast.showInfo(
          context,
          'Водитель отменил поездку — ищем для вас другого',
        );
        setState(() => _unreadNotificationCount++);
      }
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

  Future<void> _retryPayment() async {
    // Both _GoldCtaButton call sites for this hardcoded enabled:true,
    // loading:false regardless of state, so a fast double-tap could fire
    // two concurrent initiatePayment calls — guard here instead.
    if (_retryingPayment) return;
    final order = _order;
    if (order == null) return;
    setState(() => _retryingPayment = true);
    try {
      await _initiatePayment(order.id);
    } finally {
      if (mounted) setState(() => _retryingPayment = false);
    }
  }

  void _handleDriverLocation(dynamic data) {
    if (_order?.driverId == null || data is! Map) return;
    final payload = Map<String, dynamic>.from(data);
    final orderId = payload['orderId']?.toString();
    if (orderId != null && orderId.isNotEmpty && orderId != _order!.id) {
      return;
    }
    final next = DriverLocation.fromJson(payload);
    // Only present (non-null) once the order is actually TRIP_STARTED
    // server-side — see updateDriverLocation in routing.service.js. Once a
    // trip is under way this arrives on every ping, so "only apply when
    // present" never actually withholds an update, it just avoids
    // overwriting a real running total with null on some other order phase.
    final tripDistanceRaw = payload['tripDistanceM'];
    final tripDistance =
        tripDistanceRaw == null ? null : (tripDistanceRaw as num).round();
    setState(() {
      _driverLocation = next.heading == null && _driverLocation != null
          ? DriverLocation(
              lat: next.lat,
              lng: next.lng,
              heading: _driverLocation!.heading,
            )
          : next;
      if (tripDistance != null) _tripDistanceTraveledM = tripDistance;
    });
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
    final l10n = AppLocalizations.of(context);
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
          _error = l10n.passengerLocationServiceDisabledError;
          _locationServiceDisabled = true;
          _locationBlockDismissed = false;
        });
        if (_selectedRegion == null) {
          await _chooseRegion(
            title: l10n.passengerChooseRegionTitle,
            subtitle: l10n.passengerChooseRegionSubtitle,
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
            () => _error = l10n.passengerLocationSkippedManualPickText,
          );
          if (_selectedRegion == null) {
            await _chooseRegion(
              title: l10n.passengerChooseRegionTitle,
              subtitle: l10n.passengerChooseRegionSubtitle,
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
          _error = l10n.passengerLocationDeniedManualPickError;
          _locationPermissionDeniedForever =
              permission == LocationPermission.deniedForever;
          if (permission == LocationPermission.deniedForever) {
            _locationBlockDismissed = false;
          }
        });
        if (_selectedRegion == null) {
          await _chooseRegion(
            title: l10n.passengerChooseRegionTitle,
            subtitle: l10n.passengerChooseRegionSubtitle,
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
            title: l10n.passengerChooseRegionTitle,
            subtitle: l10n.passengerChooseRegionSubtitle,
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
            _error = l10n.passengerLocationOutsideRegionError;
            if (selectedRegion.center != null) {
              _mapCenter = selectedRegion.center!.toLatLng();
            }
          });
          return;
        }
      }
      var label = l10n.passengerCurrentLocationLabel;
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
          () => _error = l10n.passengerLocationFailedPickManuallyError,
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
    final l10n = AppLocalizations.of(context);
    setState(() => _target = target);
    final sheetAddresses = _recentAddresses;
    final sheetAddressTitle = l10n.passengerRecentAddressesTitle;
    // Near-opaque barrier so the map fades almost entirely to the app
    // background behind this sheet (a much softer look than the default
    // dark scrim) — needs its own dark-mode color or the light cream tint
    // washes a whitish haze over the dark map/dark sheet.
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final selected = await showModalBottomSheet<_PointResult>(
      context: context,
      isScrollControlled: true,
      barrierColor:
          isDark ? const Color(0xf6071426) : const Color(0xf6fffcf6),
      backgroundColor: Colors.transparent,
      builder: (context) => _AddressSearchSheet(
        api: widget.api,
        region: _selectedRegion?.name,
        suggestedAddresses: sheetAddresses,
        suggestionTitle: sheetAddressTitle,
        mapCenter: _mapCenter ?? _selectedRegion?.center?.toLatLng(),
        title: target == PointTarget.pickup
            ? l10n.passengerFromLabel
            : l10n.passengerToLabel,
        hint: l10n.passengerAddressSearchHint,
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

  void _handleMapCenterChanged(LatLng point, double zoom) {
    _mapCenter = point;
    _mapZoom = zoom;
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
    // Blocked here, before the point is ever applied to _pickup/_dropoff,
    // rather than letting a bad point through to _refreshPreview() and
    // surfacing the rejection as an _error on the tariff screen: that path
    // left the map zoomed out to fit two far-apart points and stacked a
    // confusing "tariffs not configured" + "outside region" pair of
    // messages, and going back from it reset the whole destination pick
    // instead of just letting the rider try a different address.
    if (selectedRegion != null && !selectedRegion.contains(coordinate)) {
      if (!mounted) return;
      AppToast.showError(
        context,
        'Этот адрес вне зоны обслуживания. Выберите другой.',
      );
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
      setState(() => _error = _readableError(AppLocalizations.of(context), error));
    } finally {
      if (mounted) setState(() => _previewLoading = false);
    }
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
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      if (_preview == null || _preview!.estimatedPrice == null) {
        // A single tap on the CTA must either place the order or visibly
        // show progress — silently doing only a price refresh here (with a
        // separate _previewLoading flag the CTA text never checks) looked
        // to riders like the tap did nothing, requiring an unsignaled
        // second tap. Refresh once, then fall through to actually create
        // the order the moment a price is available.
        await _refreshPreview();
        if (!mounted) return;
        if (_preview == null || _preview!.estimatedPrice == null) {
          return;
        }
      }
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
        notes: _orderNote,
      );
      if (!mounted) return;
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
        _orderNote = null;
      });
      _startNoDriversTimer();
    } catch (error) {
      if (!mounted) return;
      // The inline error banner below lives inside the tariff sheet's
      // scrollable content, which is often already scrolled/sized to fill
      // the sheet once a tariff+price are showing — appending it there can
      // land off-screen with nothing visibly changing on tap. A toast
      // always surfaces regardless of scroll position.
      final message = _readableError(AppLocalizations.of(context), error);
      setState(() => _error = message);
      AppToast.showError(context, message);
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
      setState(() => _error = _readableError(AppLocalizations.of(context), error));
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
      AppToast.showError(context, _readableError(AppLocalizations.of(context), error));
    } finally {
      if (mounted) setState(() => _respondingToPriceOffer = false);
    }
  }

  Future<void> _submitClientCounterOffer(int priceKzt) async {
    final order = _order;
    if (order == null || _respondingToPriceOffer) return;
    setState(() => _respondingToPriceOffer = true);
    try {
      final updated = await widget.api.submitClientCounterOffer(
        orderId: order.id,
        priceKzt: priceKzt,
      );
      if (!mounted) return;
      setState(() => _order = updated);
      AppToast.showSuccess(
        context,
        'Ваше предложение отправлено водителю: ${_formatTenge(priceKzt.toDouble())}',
      );
    } catch (error) {
      if (!mounted) return;
      AppToast.showError(context, _readableError(AppLocalizations.of(context), error));
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
        _driverRouteError =
            _readableDriverRouteError(AppLocalizations.of(context), error);
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
      final driverPhoneDigits =
          (_driverPhone.isEmpty ? widget.accountPhone : _driverPhone)
              .replaceAll(RegExp(r'[^0-9]'), '');
      // A pure .length check on the raw string let non-numeric text like
      // "aaaaaa" through (6+ chars, zero digits) straight to the API — the
      // phone field also had no keyboardType, so nothing nudged users away
      // from typing letters there in the first place.
      if (driverPhoneDigits.length < 6) {
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
      if (!mounted) return;
      setState(
        () => _driverApplicationMessage =
            'Заявка отправлена. Администратор проверит данные.',
      );
      unawaited(widget.authStore.saveDriverApplicationSubmitted());
      if (applicationId.isNotEmpty) {
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
      if (mounted) setState(() => _error = _readableError(AppLocalizations.of(context), error));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  void _openDrawer() => _scaffoldKey.currentState?.openDrawer();

  // Every tab besides Home, and every step of the booking flow inside Home
  // (map-point picker, address/tariff sheet), is reached via local state
  // instead of a pushed route, so there is nothing on the Navigator stack
  // for the OS/gesture back action to pop — this walks back one step at a
  // time instead. Shared by the Android/gesture PopScope handler below and
  // by _AppHeader's explicit back arrow (iOS has no equivalent system
  // back gesture for state that isn't a pushed route, so screens reached
  // this way need a visible on-screen way back too).
  void _handleBackNavigation() {
    if (_scaffoldKey.currentState?.isDrawerOpen ?? false) {
      _scaffoldKey.currentState?.closeDrawer();
      return;
    }
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
  }

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
        _handleBackNavigation();
      },
      child: Scaffold(
        key: _scaffoldKey,
        backgroundColor: context.palette.appBackground,
        drawerScrimColor: Colors.black.withValues(alpha: 0.26),
        drawer: _SmartDrawer(
          accountLabel: widget.accountLabel,
          accountPhone: widget.accountPhone,
          active: _tab,
          driverLabel: AppLocalizations.of(context).passengerDrawerBecomeDriver,
          onSelect: (tab) {
            Navigator.pop(context);
            setState(() => _tab = tab);
            // The drawer is the primary way to reach these tabs, but their
            // data only loads on demand (not fetched during bootstrap like
            // trip history) — without this they render their "nothing
            // loaded yet" blank/empty state forever, since nothing else
            // ever calls the loader. The Profile screen's own quick-links
            // menu already triggers the same loads for the same tabs; the
            // drawer needs the same wiring, not a duplicate of the screen.
            switch (tab) {
              case PassengerTab.recurringBookings:
                unawaited(_loadRecurringBookings());
              case PassengerTab.favoriteAddresses:
                unawaited(_loadFavoriteAddresses());
              case PassengerTab.driverPreferences:
                unawaited(_loadDriverPreferences());
              case PassengerTab.referrals:
                unawaited(_loadReferralSummary());
              default:
                break;
            }
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
                  onBack: _handleBackNavigation,
                  trailing: _HeaderProfileButton(
                    onTap: () => setState(() => _tab = PassengerTab.profile),
                  ),
                ),
              // Kept live by the socket order-update listener registered
              // once in init (_handleOrderUpdate), so it stays accurate
              // however long the rider spends on some other tab without
              // cancelling — not a one-shot snapshot from whenever they
              // last looked at Home. Excluded on Trips too (matching
              // showTopHeader above): _tripsScreen() already renders its
              // own full map + status panel for the active order there, so
              // this banner would just stack a second, redundant header
              // directly above that screen's own map header instead of
              // pointing anywhere new.
              if (_order != null &&
                  !_isPassengerOrderTerminal(_order!.status) &&
                  _tab != PassengerTab.home &&
                  _tab != PassengerTab.trips)
                _ActiveOrderBanner(
                  order: _order!,
                  // Trips, not Home — the tracking panel (searching/driver
                  // found/en route/etc, keyed off order.status) lives on
                  // _tripsScreen(), which Home never renders regardless of
                  // whether an order is active.
                  onTap: () => setState(() => _tab = PassengerTab.trips),
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
      PassengerTab.referrals: _referralsScreen,
    };
    return (builders[_tab] ?? _unknownPassengerSection).call();
  }

  Widget _unknownPassengerSection() {
    final l10n = AppLocalizations.of(context);
    return Padding(
      padding: const EdgeInsets.all(20),
      child: EmptyState(
        icon: Icons.apps_rounded,
        title: l10n.passengerSectionUnavailableTitle,
        text: l10n.passengerSectionUnavailableText,
        action: l10n.passengerGoHomeAction,
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
            zoom: _mapZoom,
            pickup: _pickup,
            dropoff: _dropoff,
            driver: _order?.driverId == null ? null : _driverLocation,
            nearbyDrivers: _order?.driverId == null ? _nearbyDrivers : const [],
            route: mapRoute,
            permissionNotice: geolocationNotice,
            routeLoading: _previewLoading,
            routeError: mapRouteError,
            mapUnavailable: _mapTilesUnavailable,
            // A raw map tap must never move the pickup/dropoff point — the
            // only way to change it is dragging the map under the center
            // address-pick marker, then confirming via _confirmMapPointSelection.
            onTap: (_) {},
            onCenterChanged: _handleMapCenterChanged,
            onTileError: _handleMapTileError,
            onUseLocation: _usePhoneLocation,
            onRetryMap: _retryMap,
            onMenu: _openDrawer,
            onNotifications: _openNotifications,
            unreadNotificationCount: _unreadNotificationCount,
            routeSummaryLabel: routeSummaryLabel,
            onRouteBack: _backToAddressSelection,
            controlsBottom: mapControlsBottom,
            showLocationButton: !routeComplete,
            showCenterMarker: pickingMapPoint,
            activeTarget: _target,
          ),
        ),
        // Home always renders the address/tariff picker regardless of
        // whether the rider already has a searching/active order elsewhere
        // — without this, picking a new destination or tariff while one is
        // already in flight gives zero indication until the create-order
        // call itself rejects with CLIENT_HAS_ACTIVE_ORDER at the very end.
        if (_order != null && !_isPassengerOrderTerminal(_order!.status))
          Positioned(
            left: 0,
            right: 0,
            top: 84,
            child: _ActiveOrderBanner(
              order: _order!,
              onTap: () => setState(() => _tab = PassengerTab.trips),
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
                    orderNote: _orderNote,
                    onNoteTap: _editOrderNote,
                    tariffs: _tariffs,
                    selectedTariffId: _tariffId,
                    preview: _preview,
                    tariffEstimates: _tariffEstimates,
                    offeredPriceKzt: _offeredPriceKzt,
                    onOfferedPriceChanged: (value) =>
                        setState(() => _offeredPriceKzt = value),
                    loading: _loading,
                    previewLoading: _previewLoading,
                    error: _error,
                    onTariff: (id) async {
                      unawaited(HapticFeedback.selectionClick());
                      final cached = _tariffEstimates[id];
                      setState(() {
                        _tariffId = id;
                        _offeredPriceKzt = null;
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

  void _backToAddressSelection() {
    setState(() {
      _dropoff = null;
      _dropoffSource = PointSource.none;
      _preview = null;
      _tariffEstimates = const {};
      _tariffId = null;
      _target = PointTarget.dropoff;
      _error = null;
      _orderNote = null;
    });
  }

  String get _paymentMethodLabel {
    return _paymentLabel(AppLocalizations.of(context), _paymentMethod);
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

  Future<void> _editOrderNote() async {
    final result = await showModalBottomSheet<String>(
      context: context,
      backgroundColor: Colors.transparent,
      isScrollControlled: true,
      builder: (context) => _OrderNoteSheet(initialNote: _orderNote),
    );
    if (!mounted || result == null) return;
    setState(() => _orderNote = result.isEmpty ? null : result);
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
    if (!mounted) return;
    if (code == 'kk') {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(AppLocalizations.of(context).languageChangedNote)),
      );
    }
  }

  Future<void> _chooseTheme() async {
    final current = widget.themeMode;
    final mode = await showModalBottomSheet<ThemeMode>(
      context: context,
      showDragHandle: true,
      builder: (sheetContext) => SafeArea(
        child: RadioGroup<ThemeMode>(
          groupValue: current,
          onChanged: (value) => Navigator.pop(sheetContext, value),
          child: const Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              RadioListTile<ThemeMode>(
                value: ThemeMode.light,
                title: Text('Светлая'),
              ),
              RadioListTile<ThemeMode>(
                value: ThemeMode.dark,
                title: Text('Тёмная'),
              ),
              RadioListTile<ThemeMode>(
                value: ThemeMode.system,
                title: Text('Как в системе'),
              ),
              SizedBox(height: 8),
            ],
          ),
        ),
      ),
    );
    if (mode == null || mode == current) return;
    widget.onChangeThemeMode?.call(mode);
  }

  Future<void> _confirmAndLogout() async {
    final palette = context.palette;
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        backgroundColor: palette.card,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(22)),
        title: const Text(
          'Выйти из аккаунта?',
          style: TextStyle(fontWeight: FontWeight.w900),
        ),
        content: Text(
          'Придётся снова войти по номеру телефона, чтобы продолжить пользоваться SmartTaxi.',
          style: TextStyle(
            color: palette.textSecondary,
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
            style: TextButton.styleFrom(foregroundColor: palette.danger),
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
    final l10n = AppLocalizations.of(context);
    if (_loading) return l10n.passengerCtaCreatingOrder;
    if (_pickup == null) return l10n.passengerCtaPickPickup;
    if (_dropoff == null) return l10n.passengerCtaPickDropoff;
    if (_tariffId == null) return l10n.passengerTariffSectionTitle;
    if (_preview == null || _preview!.estimatedPrice == null) {
      return l10n.passengerCtaCalculate;
    }
    TariffOption? selectedTariff;
    for (final tariff in _tariffs) {
      if (tariff.id == _tariffId) {
        selectedTariff = tariff;
        break;
      }
    }
    final name = (selectedTariff?.name ?? '').toLowerCase();
    final isDelivery = name.contains('delivery') || name.contains('достав');
    final label = name.contains('comfort') || name.contains('комфорт')
        ? l10n.tariffComfortTitle
        : isDelivery
            ? l10n.tariffDeliveryTitle
            : name.contains('econom') || name.contains('экон')
                ? l10n.tariffEconomyTitle
                : selectedTariff?.name;
    if (isDelivery) return l10n.passengerCtaOrderDelivery;
    return label == null
        ? l10n.passengerCtaOrder
        : l10n.passengerCtaOrderWithLabel(label);
  }

  Widget _tripsScreen() {
    final l10n = AppLocalizations.of(context);
    if (_order == null) {
      final groups = _groupTripsByDay(l10n, _tripHistory);
      return RefreshIndicator(
        color: context.palette.goldDeep,
        onRefresh: _loadTripHistory,
        child: ListView(
          padding: const EdgeInsets.all(20),
          physics: const AlwaysScrollableScrollPhysics(
            parent: BouncingScrollPhysics(),
          ),
          children: [
            _TitleBlock(
              title: l10n.passengerDrawerTrips,
              text: l10n.passengerTripsSubtitle,
            ),
            const SizedBox(height: 16),
            if (_tripHistory.isEmpty && _tripHistoryLoading) ...[
              const _SkeletonList(),
            ] else if (_tripHistory.isEmpty) ...[
              EmptyState(
                icon: _tripHistoryError
                    ? Icons.wifi_off_rounded
                    : Icons.route_rounded,
                title: _tripHistoryError
                    ? l10n.passengerTripsLoadErrorTitle
                    : l10n.passengerTripsEmptyTitle,
                text: _tripHistoryError
                    ? l10n.passengerTripsLoadErrorText
                    : l10n.passengerTripsEmptyText,
                action: _tripHistoryError ? null : l10n.passengerGoHomeAction,
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
        ? l10n.passengerDriverSearchingLabel
        : _driverLocation == null
            ? l10n.passengerDriverWaitingLocationLabel
            : l10n.passengerDriverConnectedLabel;
    final driverRouteText = _driverPickupRoute == null
        ? null
        : _driverPickupMeta(l10n, _driverPickupRoute!);
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
            zoom: _mapZoom,
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
            unreadNotificationCount: _unreadNotificationCount,
            routeSummaryLabel: routeMeta,
            onRouteBack: () => setState(() => _tab = PassengerTab.home),
            controlsBottom: screen.height * sheetFraction + 12,
            showLocationButton: false,
            showCenterMarker: false,
            activeTarget: PointTarget.dropoff,
            searching: const {'SEARCHING_DRIVER', 'NEW'}
                .contains(order.status),
          ),
        ),
        Align(
          alignment: Alignment.bottomCenter,
          child: ConstrainedBox(
            constraints:
                BoxConstraints(maxHeight: screen.height * sheetFraction),
            // _TripStatusPanel already picks its own sub-widget internally
            // per order.status, each wrapped in a keyed _PanelEntrance — but
            // without this switcher at the call site, the old sub-widget was
            // just dropped instantly while the new one popped in; this
            // crossfades the transition between major status changes
            // (searching → driver found → in progress → ...) instead.
            child: AnimatedSwitcher(
              duration: const Duration(milliseconds: 260),
              switchInCurve: Curves.easeOutCubic,
              switchOutCurve: Curves.easeInCubic,
              transitionBuilder: (child, animation) => FadeTransition(
                opacity: animation,
                child: SizeTransition(
                  sizeFactor: animation,
                  axisAlignment: -1,
                  child: child,
                ),
              ),
              child: _TripStatusPanel(
              key: ValueKey('trip-status-${order.status}'),
              api: widget.api,
              order: order,
              statusText: _statusLabel(l10n, order.status),
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
              tripDistanceTraveledM: _tripDistanceTraveledM,
              ratingStars: _ratingStars,
              ratingTags: _ratingTags,
              ratingCommentController: _ratingCommentController,
              ratingSubmitting: _ratingSubmitting,
              ratingJustSubmitted: _ratingJustSubmitted,
              receiptAcknowledged: _receiptAcknowledged,
              noDriversFound: _noDriversFound,
              payment: _payment,
              paymentTimedOut: _paymentTimedOut,
              retryingPayment: _retryingPayment,
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
              onSubmitCounterOffer: _submitClientCounterOffer,
              ),
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
      _tripDistanceTraveledM = null;
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
        _error = _readableError(AppLocalizations.of(context), error);
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
    final palette = context.palette;
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
                      gradient: LinearGradient(
                        begin: Alignment.topLeft,
                        end: Alignment.bottomRight,
                        colors: [
                          palette.gold,
                          palette.goldDeep,
                        ],
                      ),
                      shape: BoxShape.circle,
                      boxShadow: [
                        BoxShadow(
                          color: palette.gold.withValues(alpha: 0.32),
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
                        Text(
                          'Клиент SmartTaxi',
                          style: TextStyle(
                            color: palette.textSecondary,
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
                icon: Icons.card_giftcard_rounded,
                title: 'Пригласить друзей',
                subtitle: 'Ваш код и бонусы за приглашения',
                onTap: () {
                  setState(() => _tab = PassengerTab.referrals);
                  unawaited(_loadReferralSummary());
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
        _promoCheckError =
            AppLocalizations.of(context).passengerPromoNoRegionError;
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
      setState(() => _promoCheckError = _readableError(AppLocalizations.of(context), error));
    } finally {
      if (mounted) setState(() => _promoCheckLoading = false);
    }
  }

  Widget _promoCodesScreen() {
    final palette = context.palette;
    final l10n = AppLocalizations.of(context);
    final result = _promoCheckResult;
    return ListView(
      padding: const EdgeInsets.all(20),
      children: [
        _TitleBlock(
          title: l10n.passengerDrawerPromoCodes,
          text: l10n.passengerPromoSubtitle,
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
                      color: palette.goldSurface,
                      borderRadius: BorderRadius.circular(14),
                    ),
                    child: Icon(
                      Icons.confirmation_number_rounded,
                      color: palette.goldDeep,
                      size: 22,
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Text(
                      l10n.passengerPromoHaveCode,
                      style: const TextStyle(
                          fontSize: 16, fontWeight: FontWeight.w900),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 10),
              Text(
                l10n.passengerPromoHint,
                style: TextStyle(
                  color: palette.textSecondary,
                  fontSize: 12.5,
                  height: 1.4,
                  fontWeight: FontWeight.w600,
                ),
              ),
              const SizedBox(height: 14),
              // Was a Row with the field sharing width against a fixed
              // 140px button — left only ~120dp for text next to the
              // prefix icon, so typing past 5-6 characters scrolled the
              // start of the code out of view. Full-width field on its
              // own line, standard full-width CTA below — same pattern
              // as every other primary action in the app now.
              TextField(
                controller: _promoCheckController,
                textCapitalization: TextCapitalization.characters,
                decoration: InputDecoration(
                  hintText: l10n.passengerPromoFieldHint,
                  prefixIcon: const Icon(Icons.local_offer_outlined),
                ),
                onSubmitted: (_) => unawaited(_checkPromoCode()),
              ),
              const SizedBox(height: 12),
              _GoldCtaButton(
                enabled: !_promoCheckLoading,
                loading: _promoCheckLoading,
                text: l10n.checkButton,
                loadingText: l10n.checkingButton,
                onTap: () => unawaited(_checkPromoCode()),
              ),
              if (_promoCheckError != null) ...[
                const SizedBox(height: 12),
                Text(
                  _promoCheckError!,
                  style: TextStyle(
                    color: palette.danger,
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
                    color: palette.successSoft,
                    borderRadius: BorderRadius.circular(16),
                    border: Border.all(color: palette.success),
                  ),
                  child: Row(
                    children: [
                      Container(
                        width: 40,
                        height: 40,
                        alignment: Alignment.center,
                        decoration: BoxDecoration(
                          color: palette.card,
                          borderRadius: BorderRadius.circular(13),
                        ),
                        child: Icon(Icons.check_circle_rounded,
                            color: palette.success, size: 24),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              l10n.passengerPromoActiveTitle(result.code),
                              style: const TextStyle(
                                fontSize: 13.5,
                                fontWeight: FontWeight.w900,
                              ),
                            ),
                            const SizedBox(height: 2),
                            Text(
                              l10n.passengerPromoDiscountSummary(
                                _formatTenge(result.discountAmountKzt),
                                _formatTenge(_promoPreviewPriceKzt),
                                _formatTenge(result.finalPriceKzt),
                              ),
                              style: TextStyle(
                                color: palette.textSecondary,
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
        _PremiumCard(
          child: _CompactNotice(
            icon: Icons.info_outline_rounded,
            title: l10n.passengerPromoHowToApplyTitle,
            text: l10n.passengerPromoHowToApplyText,
            dark: Theme.of(context).brightness == Brightness.dark,
          ),
        ),
      ],
    );
  }

  Widget _notificationsScreen() {
    return _NotificationsScreen(
      api: widget.api,
      regionId: _selectedRegion?.id,
      onUnreadCountChanged: (count) {
        if (!mounted) return;
        setState(() => _unreadNotificationCount = count);
      },
    );
  }

  Widget _driverApplicationScreen() {
    final palette = context.palette;
    final l10n = AppLocalizations.of(context);
    final submitted = _driverApplicationMessage != null;
    return ListView(
      padding: const EdgeInsets.all(20),
      children: [
        _TitleBlock(
          title: l10n.passengerDrawerBecomeDriver,
          text: l10n.passengerDriverAppSubtitle,
        ),
        const SizedBox(height: 16),
        _PremiumCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _DriverStepRow(
                number: '1',
                title: l10n.passengerDriverStep1Title,
                text: l10n.passengerDriverStep1Text,
              ),
              const SizedBox(height: 12),
              _DriverStepRow(
                number: '2',
                title: l10n.passengerDriverStep2Title,
                text: l10n.passengerDriverStep2Text,
              ),
              const SizedBox(height: 12),
              _DriverStepRow(
                number: '3',
                title: l10n.passengerDriverStep3Title,
                text: l10n.passengerDriverStep3Text,
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
                  decoration: BoxDecoration(
                    color: palette.successSoft,
                    shape: BoxShape.circle,
                  ),
                  child: Icon(Icons.check_circle_rounded,
                      color: palette.success, size: 30),
                ),
                const SizedBox(height: 14),
                Text(
                  l10n.passengerDriverAppSubmittedTitle,
                  style: const TextStyle(
                      fontSize: 18, fontWeight: FontWeight.w900),
                ),
                const SizedBox(height: 6),
                Text(
                  _driverApplicationMessage!,
                  style: TextStyle(
                    color: palette.textSecondary,
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
                    color: palette.goldSurface,
                    borderRadius: BorderRadius.circular(14),
                  ),
                  child: Row(
                    children: [
                      Icon(Icons.headset_mic_outlined,
                          size: 16, color: palette.goldDeep),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          l10n.passengerDriverAppQuestionBanner,
                          style: TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.w700,
                            color: palette.text,
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
          _ProfileGroupLabel(l10n.passengerDriverPersonalDataGroup),
          const SizedBox(height: 8),
          _PremiumCard(
            child: Column(
              children: [
                _ApplicationField(
                  label: l10n.passengerDriverFullNameLabel,
                  icon: Icons.badge_outlined,
                  onChanged: (value) => _driverFullName = value,
                ),
                const SizedBox(height: 12),
                _ApplicationField(
                  label: l10n.phoneLabel,
                  icon: Icons.phone_outlined,
                  keyboardType: TextInputType.phone,
                  initialValue: _driverPhone.isEmpty
                      ? widget.accountPhone
                      : _driverPhone,
                  onChanged: (value) => _driverPhone = value,
                ),
              ],
            ),
          ),
          const SizedBox(height: 14),
          _ProfileGroupLabel(l10n.passengerDriverCarGroup),
          const SizedBox(height: 8),
          _PremiumCard(
            child: Column(
              children: [
                _ApplicationField(
                  label: l10n.passengerDriverCarModelLabel,
                  icon: Icons.directions_car_outlined,
                  onChanged: (value) => _driverCarModel = value,
                ),
                const SizedBox(height: 12),
                _ApplicationField(
                  label: l10n.passengerDriverCarColorLabel,
                  icon: Icons.palette_outlined,
                  onChanged: (value) => _driverCarColor = value,
                ),
                const SizedBox(height: 12),
                _ApplicationField(
                  label: l10n.passengerDriverPlateLabel,
                  icon: Icons.pin_outlined,
                  onChanged: (value) => _driverPlate = value,
                ),
                const SizedBox(height: 12),
                _ApplicationField(
                  label: l10n.passengerDriverYearLabel,
                  icon: Icons.event_outlined,
                  keyboardType: TextInputType.number,
                  onChanged: (value) => _driverYear = value,
                ),
                const SizedBox(height: 12),
                _ApplicationField(
                  label: l10n.passengerDriverCommentLabel,
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
                          style: TextStyle(
                            color: palette.text,
                            fontSize: 13,
                            height: 1.35,
                            fontWeight: FontWeight.w600,
                          ),
                          children: [
                            TextSpan(text: l10n.passengerDriverAgreePrefix),
                            TextSpan(
                              text: l10n.passengerDriverTermsLink,
                              style: TextStyle(
                                color: palette.goldDeep,
                                fontWeight: FontWeight.w800,
                              ),
                              recognizer: TapGestureRecognizer()
                                ..onTap = () => setState(
                                      () => _tab = PassengerTab.legalTerms,
                                    ),
                            ),
                            TextSpan(text: ' ${l10n.authLegalConsentJoiner} '),
                            TextSpan(
                              text: l10n.passengerDriverSafetyRulesLink,
                              style: TextStyle(
                                color: palette.goldDeep,
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
            _InlineMessage(
              text: _error!,
              danger: true,
              dark: Theme.of(context).brightness == Brightness.dark,
            ),
          ],
          const SizedBox(height: 14),
          _GoldCtaButton(
            enabled: !_loading,
            loading: _loading,
            text: l10n.passengerDriverSubmitButton,
            loadingText: l10n.sendingButton,
            onTap: _submitDriverApplication,
          ),
        ],
      ],
    );
  }

  Future<void> _callSupportPhone(String phone) async {
    final dialFailedText =
        AppLocalizations.of(context).passengerSupportDialFailed;
    try {
      final launched = await launchUrl(Uri(scheme: 'tel', path: phone));
      if (launched || !mounted) return;
      AppToast.showError(context, dialFailedText);
    } catch (_) {
      if (!mounted) return;
      AppToast.showError(context, dialFailedText);
    }
  }

  Widget _supportScreen() {
    final l10n = AppLocalizations.of(context);
    const topics = ['trip_issue', 'no_show', 'lost_item', 'payment', 'other'];
    String topicLabel(String key) => switch (key) {
          'trip_issue' => l10n.passengerSupportTopicTripIssue,
          'no_show' => l10n.passengerSupportTopicNoShow,
          'lost_item' => l10n.passengerSupportTopicLostItem,
          'payment' => l10n.passengerSupportTopicPayment,
          _ => l10n.passengerSupportTopicOther,
        };
    // Support staff read the admin panel in Russian regardless of the
    // client's interface language, so the free-text topic sent to the
    // backend stays Russian; only the lost-item case has its own stable
    // code ('LOST_ITEM', below) that backend logic actually matches on.
    String topicRuLabel(String key) => switch (key) {
          'trip_issue' => 'Проблема с поездкой',
          'no_show' => 'Водитель не приехал',
          'lost_item' => 'Забыл вещь',
          'payment' => 'Оплата',
          _ => 'Другое',
        };
    // Regions don't carry their own support number today, so the
    // service-wide one from /api/regions/service-settings is the primary
    // source — a per-region override still wins if one is ever added.
    final palette = context.palette;
    final supportPhone =
        (_selectedRegion?.supportPhone ?? _supportPhone ?? '').trim();
    return RefreshIndicator(
      color: palette.goldDeep,
      onRefresh: _loadMySupportMessages,
      child: ListView(
      padding: const EdgeInsets.all(20),
      physics: const AlwaysScrollableScrollPhysics(
        parent: BouncingScrollPhysics(),
      ),
      children: [
        _TitleBlock(
          title: l10n.support,
          text: l10n.passengerSupportSubtitle,
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
                    color: palette.goldSurface,
                    border: Border.all(color: palette.border),
                    borderRadius: BorderRadius.circular(16),
                  ),
                  child: Icon(
                    Icons.call_rounded,
                    color: palette.goldDeep,
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        l10n.passengerSupportUrgentTitle,
                        style: const TextStyle(fontWeight: FontWeight.w900),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        l10n.passengerSupportCallDirectly(supportPhone),
                        style: TextStyle(
                          color: palette.textSecondary,
                          fontSize: 12.5,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 10),
                // Outlined, not filled — "Отправить" further down is the
                // one filled accent action on this screen; a direct-call
                // shortcut is a secondary escape hatch, not the primary flow.
                OutlinedButton(
                  onPressed: () => unawaited(_callSupportPhone(supportPhone)),
                  style: OutlinedButton.styleFrom(
                    minimumSize: const Size(0, 44),
                    padding: const EdgeInsets.symmetric(horizontal: 16),
                  ),
                  child: Text(l10n.callButton),
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
              _SectionLabel(
                title: l10n.passengerSupportTopicSectionTitle,
                text: l10n.passengerSupportTopicSectionText,
              ),
              const SizedBox(height: 12),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: topics
                    .map(
                      (topic) => _SupportTopicChip(
                        label: topicLabel(topic),
                        selected: _supportTopic == topic,
                        onTap: () => setState(() {
                          _supportTopic = topic;
                          // A previously-picked trip only makes sense for
                          // "Забыл вещь" — switching to a different topic
                          // (or re-picking the same one) shouldn't carry a
                          // stale selection into a fresh report.
                          _lostItemOrderId = null;
                        }),
                      ),
                    )
                    .toList(),
              ),
              // Step 2 only appears once a topic is chosen — reads as a
              // flow (topic -> trip if lost item -> message) instead of
              // one flat form with every field visible from the start.
              AnimatedSize(
                duration: const Duration(milliseconds: 220),
                curve: Curves.easeOutCubic,
                alignment: Alignment.topLeft,
                child: _supportTopic == null
                    ? Padding(
                        padding: const EdgeInsets.only(top: 12),
                        child: Text(
                          l10n.passengerSupportChooseTopicFirst,
                          style: TextStyle(
                            color: palette.textSecondary,
                            fontSize: 12.5,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      )
                    : Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          if (_supportTopic == 'lost_item') ...[
                            const SizedBox(height: 14),
                            _LostItemOrderPicker(
                              activeOrder: _order,
                              tripHistory: _tripHistory,
                              selectedOrderId: _lostItemOrderId,
                              onChanged: (id) =>
                                  setState(() => _lostItemOrderId = id),
                            ),
                          ],
                          const SizedBox(height: 16),
                          TextField(
                            controller: _supportController,
                            minLines: 5,
                            maxLines: 7,
                            decoration: InputDecoration(
                              labelText: l10n.messageLabel,
                              hintText: l10n.passengerSupportMessageHint,
                              alignLabelWithHint: true,
                            ),
                          ),
                          if (_supportMessage != null) ...[
                            const SizedBox(height: 12),
                            _InlineMessage(
                              text: _supportMessage!,
                              danger: _supportMessageDanger,
                              dark: Theme.of(context).brightness ==
                                  Brightness.dark,
                            ),
                          ],
                          const SizedBox(height: 16),
                          _GoldCtaButton(
                            enabled: !_supportSending,
                            loading: _supportSending,
                            text: l10n.sendButton,
                            loadingText: l10n.sendingButton,
                            onTap: () async {
                              final topic = _supportTopic;
                              if (topic == null) return;
                              final text = _supportController.text.trim();
                              if (text.length < 8) {
                                setState(() {
                                  _supportMessageDanger = true;
                                  _supportMessage =
                                      l10n.passengerSupportMessageTooShort;
                                });
                                return;
                              }
                              final isLostItem = topic == 'lost_item';
                              if (isLostItem && _lostItemOrderId == null) {
                                setState(() {
                                  _supportMessageDanger = true;
                                  _supportMessage =
                                      l10n.passengerSupportLostItemNeedsTrip;
                                });
                                return;
                              }
                              setState(() => _supportSending = true);
                              try {
                                await widget.api.submitSupportMessage(
                                  // The backend matches this literal string
                                  // (not the Russian label) to trigger a
                                  // push straight to the trip's driver —
                                  // see support.routes.js.
                                  topic: isLostItem
                                      ? 'LOST_ITEM'
                                      : topicRuLabel(topic),
                                  message: text,
                                  orderId:
                                      isLostItem ? _lostItemOrderId : _order?.id,
                                );
                                if (!mounted) return;
                                _supportController.clear();
                                setState(() {
                                  _supportMessageDanger = false;
                                  _lostItemOrderId = null;
                                  _supportMessage = isLostItem
                                      ? l10n.passengerSupportLostItemSent
                                      : l10n.passengerSupportMessageSent;
                                });
                                unawaited(_loadMySupportMessages());
                              } catch (error) {
                                if (!mounted) return;
                                setState(() {
                                  _supportMessageDanger = true;
                                  _supportMessage = _readableError(AppLocalizations.of(context), error);
                                });
                              } finally {
                                if (mounted) {
                                  setState(() => _supportSending = false);
                                }
                              }
                            },
                          ),
                        ],
                      ),
              ),
            ],
          ),
        ),
        if (_mySupportMessages.isNotEmpty) ...[
          const SizedBox(height: 14),
          _ProfileGroupLabel(l10n.passengerSupportYourRequests),
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
              title: l10n.passengerSupportLoadError,
              text: l10n.pullToRetry,
              dark: Theme.of(context).brightness == Brightness.dark,
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
    final l10n = AppLocalizations.of(context);
    return RefreshIndicator(
      color: context.palette.goldDeep,
      onRefresh: _loadRecurringBookings,
      child: ListView(
        padding: const EdgeInsets.all(20),
        physics: const AlwaysScrollableScrollPhysics(
          parent: BouncingScrollPhysics(),
        ),
        children: [
          _TitleBlock(
            title: l10n.passengerDrawerRecurringBookings,
            text: l10n.passengerRecurringSubtitle,
          ),
          const SizedBox(height: 16),
          _GoldCtaButton(
            enabled: !_creatingRecurringBooking,
            loading: false,
            text: l10n.passengerRecurringNewRoute,
            onTap: _openCreateRecurringBookingSheet,
          ),
          const SizedBox(height: 16),
          if (_recurringBookingsLoading && _recurringBookings.isEmpty)
            const _SkeletonList()
          else if (_recurringBookingsError && _recurringBookings.isEmpty)
            EmptyState(
              icon: Icons.wifi_off_rounded,
              title: l10n.loadFailedTitle,
              text: l10n.pullToRetry,
              action: l10n.retry,
              onAction: () => unawaited(_loadRecurringBookings()),
            )
          else if (_recurringBookings.isEmpty)
            EmptyState(
              icon: Icons.event_repeat_rounded,
              title: l10n.passengerRecurringEmptyTitle,
              text: l10n.passengerRecurringEmptyText,
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
    final l10n = AppLocalizations.of(context);
    final confirmed = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => _ConfirmSheet(
        title: l10n.passengerRecurringCancelTitle,
        text: l10n.passengerRecurringCancelText(
          '${booking.pickupText} → ${booking.dropoffText}',
          booking.daysLabel,
          booking.timeOfDay,
        ),
        confirmLabel: l10n.passengerRecurringCancelConfirm,
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
        title: AppLocalizations.of(context).passengerFavoritesAddAddressTitle,
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
    final l10n = AppLocalizations.of(context);
    final confirmed = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => _ConfirmSheet(
        title: l10n.passengerFavoritesDeleteTitle,
        text: l10n.passengerFavoritesDeleteText(
          address.title,
          address.addressText,
        ),
        confirmLabel: l10n.deleteButton,
        danger: true,
      ),
    );
    if (confirmed == true) {
      await _deleteFavoriteAddress(address);
    }
  }

  Widget _favoriteAddressesScreen() {
    final l10n = AppLocalizations.of(context);
    return RefreshIndicator(
      color: context.palette.goldDeep,
      onRefresh: _loadFavoriteAddresses,
      child: ListView(
        padding: const EdgeInsets.all(20),
        physics: const AlwaysScrollableScrollPhysics(
          parent: BouncingScrollPhysics(),
        ),
        children: [
          _TitleBlock(
            title: l10n.passengerDrawerFavoriteAddresses,
            text: l10n.passengerFavoritesSubtitle,
          ),
          const SizedBox(height: 16),
          _GoldCtaButton(
            enabled: !_creatingFavoriteAddress,
            loading: false,
            text: l10n.passengerFavoritesAddButton,
            onTap: _openAddFavoriteAddressSheet,
          ),
          const SizedBox(height: 16),
          if (_favoriteAddressesLoading && _favoriteAddresses.isEmpty)
            const _SkeletonList()
          else if (_favoriteAddressesError && _favoriteAddresses.isEmpty)
            EmptyState(
              icon: Icons.wifi_off_rounded,
              title: l10n.loadFailedTitle,
              text: l10n.pullToRetry,
              action: l10n.retry,
              onAction: () => unawaited(_loadFavoriteAddresses()),
            )
          else if (_favoriteAddresses.isEmpty)
            EmptyState(
              icon: Icons.star_outline_rounded,
              title: l10n.passengerFavoritesEmptyTitle,
              text: l10n.passengerFavoritesEmptyText,
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
    final l10n = AppLocalizations.of(context);
    final favorites =
        _driverPreferences.where((p) => p.isFavorite).toList(growable: false);
    final blocked =
        _driverPreferences.where((p) => p.isBlocked).toList(growable: false);
    return RefreshIndicator(
      color: context.palette.goldDeep,
      onRefresh: _loadDriverPreferences,
      child: ListView(
        padding: const EdgeInsets.all(20),
        physics: const AlwaysScrollableScrollPhysics(
          parent: BouncingScrollPhysics(),
        ),
        children: [
          _TitleBlock(
            title: l10n.passengerDrawerDrivers,
            text: l10n.passengerDriverPrefsSubtitle,
          ),
          const SizedBox(height: 16),
          _GoldCtaButton(
            enabled: !_settingDriverPreference,
            loading: false,
            text: l10n.passengerDriverPrefsAddButton,
            onTap: _openAddDriverPreferenceSheet,
          ),
          const SizedBox(height: 16),
          if (_driverPreferencesLoading && _driverPreferences.isEmpty)
            const _SkeletonList()
          else if (_driverPreferencesError && _driverPreferences.isEmpty)
            EmptyState(
              icon: Icons.wifi_off_rounded,
              title: l10n.loadFailedTitle,
              text: l10n.pullToRetry,
              action: l10n.retry,
              onAction: () => unawaited(_loadDriverPreferences()),
            )
          else if (_driverPreferences.isEmpty)
            EmptyState(
              icon: Icons.people_alt_outlined,
              title: l10n.passengerDriverPrefsEmptyTitle,
              text: l10n.passengerDriverPrefsEmptyText,
            )
          else ...[
            if (favorites.isNotEmpty) ...[
              _SectionLabel(
                title: l10n.passengerDriverPrefsFavoritesTitle,
                text: l10n.passengerDriverPrefsFavoritesText,
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
              _SectionLabel(
                title: l10n.passengerDriverPrefsBlockedTitle,
                text: l10n.passengerDriverPrefsBlockedText,
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

  Widget _referralsScreen() {
    final palette = context.palette;
    final l10n = AppLocalizations.of(context);
    final summary = _referralSummary;
    return RefreshIndicator(
      color: context.palette.goldDeep,
      onRefresh: _loadReferralSummary,
      child: ListView(
        padding: const EdgeInsets.all(20),
        physics: const AlwaysScrollableScrollPhysics(
          parent: BouncingScrollPhysics(),
        ),
        children: [
          _TitleBlock(
            title: l10n.passengerDrawerReferrals,
            text: l10n.passengerReferralsSubtitle,
          ),
          const SizedBox(height: 16),
          if (_referralSummaryLoading && summary == null)
            const Center(
              child: Padding(
                padding: EdgeInsets.all(24),
                child: CircularProgressIndicator(strokeWidth: 2.4),
              ),
            )
          else if (_referralSummaryError && summary == null)
            EmptyState(
              icon: Icons.wifi_off_rounded,
              title: l10n.loadFailedTitle,
              text: l10n.pullToRetry,
              action: l10n.retry,
              onAction: () => unawaited(_loadReferralSummary()),
            )
          else if (summary != null) ...[
            _PremiumCard(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    l10n.passengerReferralsYourCode,
                    style: TextStyle(
                      color: palette.textSecondary,
                      fontSize: 12,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                  const SizedBox(height: 8),
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          summary.code,
                          style: const TextStyle(
                            fontSize: 30,
                            fontWeight: FontWeight.w900,
                            letterSpacing: 2,
                          ),
                        ),
                      ),
                      IconButton(
                        tooltip: l10n.copyButton,
                        onPressed: () async {
                          await Clipboard.setData(
                              ClipboardData(text: summary.code));
                          if (!mounted) return;
                          AppToast.showSuccess(
                              context, l10n.passengerReferralsCodeCopied);
                        },
                        icon: const Icon(Icons.copy_rounded),
                      ),
                    ],
                  ),
                  const SizedBox(height: 12),
                  SizedBox(
                    width: double.infinity,
                    child: _GoldCtaButton(
                      enabled: true,
                      loading: false,
                      text: l10n.passengerReferralsShareCode,
                      onTap: () => unawaited(Share.share(
                        l10n.passengerReferralsShareMessage(summary.code),
                      )),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 14),
            Row(
              children: [
                Expanded(
                  child: _PremiumCard(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          l10n.passengerReferralsInvited,
                          style: TextStyle(
                            color: palette.textSecondary,
                            fontSize: 12,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                        const SizedBox(height: 6),
                        Text(
                          '${summary.invitedCount}',
                          style: const TextStyle(
                            fontSize: 22,
                            fontWeight: FontWeight.w900,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: _PremiumCard(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          l10n.passengerReferralsEarned,
                          style: TextStyle(
                            color: palette.textSecondary,
                            fontSize: 12,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                        const SizedBox(height: 6),
                        Text(
                          _formatTenge(summary.totalBonusEarned),
                          style: const TextStyle(
                            fontSize: 22,
                            fontWeight: FontWeight.w900,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 14),
            _CompactNotice(
              icon: Icons.info_outline_rounded,
              title: l10n.passengerReferralsHowItWorksTitle,
              text: l10n.passengerReferralsHowItWorksText,
              dark: Theme.of(context).brightness == Brightness.dark,
            ),
          ],
        ],
      ),
    );
  }

  Widget _settingsScreen() {
    final l10n = AppLocalizations.of(context);
    return ListView(
      padding: const EdgeInsets.all(20),
      children: [
        _TitleBlock(
          title: l10n.passengerSettingsTitle,
          text: l10n.passengerSettingsSubtitle,
        ),
        const SizedBox(height: 16),
        _SettingsGroup(
          title: l10n.passengerSettingsAccountGroup,
          children: [
            _SettingsRow(
              title: l10n.passengerSettingsPhoneLabel,
              text: widget.accountPhone.isEmpty
                  ? l10n.passengerSettingsPhoneMissing
                  : widget.accountPhone,
              onTap: widget.accountPhone.isEmpty
                  ? null
                  : () async {
                      await Clipboard.setData(
                        ClipboardData(text: widget.accountPhone),
                      );
                      if (!mounted) return;
                      AppToast.showSuccess(
                          context, l10n.passengerSettingsPhoneCopied);
                    },
            ),
            _SettingsRow(
              title: l10n.passengerSettingsRegionLabel,
              text: _selectedRegion?.name ??
                  l10n.passengerSettingsRegionNotSelected,
              onTap: () => unawaited(_chooseRegion()),
            ),
            _SettingsRow(
              title: l10n.passengerSettingsLogoutTitle,
              text: l10n.passengerSettingsLogoutText,
              danger: true,
              onTap: () => unawaited(_confirmAndLogout()),
            ),
          ],
        ),
        const SizedBox(height: 14),
        _SettingsGroup(
          title: l10n.passengerSettingsInterfaceGroup,
          children: [
            _SettingsRow(
              title: l10n.passengerSettingsLanguageLabel,
              text: widget.currentLocale?.languageCode == 'kk'
                  ? l10n.languageKazakh
                  : l10n.languageRussian,
              onTap: _chooseLanguage,
            ),
            _SettingsRow(
              title: l10n.passengerSettingsThemeLabel,
              text: switch (widget.themeMode) {
                ThemeMode.dark => l10n.passengerSettingsThemeDark,
                ThemeMode.system => l10n.passengerSettingsThemeSystem,
                ThemeMode.light => l10n.passengerSettingsThemeLight,
              },
              onTap: _chooseTheme,
            ),
          ],
        ),
        const SizedBox(height: 14),
        _SettingsGroup(
          title: l10n.passengerSettingsPermissionsGroup,
          children: [
            FutureBuilder<String>(
              future: _notificationPermissionLabel(),
              builder: (context, snapshot) {
                return _SettingsRow(
                  title: l10n.passengerSettingsPushLabel,
                  text: snapshot.data ?? l10n.passengerSettingsPushChecking,
                  onTap: () => Geolocator.openAppSettings(),
                );
              },
            ),
            _SettingsRow(
              title: l10n.passengerSettingsLocationLabel,
              text: l10n.passengerSettingsLocationText,
              onTap: () => Geolocator.openLocationSettings(),
            ),
          ],
        ),
        const SizedBox(height: 14),
        _SettingsGroup(
          title: l10n.passengerSettingsAboutGroup,
          children: [
            _SettingsRow(
              title: l10n.passengerSettingsVersionLabel,
              text: _appVersion,
            ),
            _SettingsRow(
              title: l10n.passengerSettingsLegalTitle,
              text: l10n.passengerSettingsLegalText,
              onTap: () => setState(() => _tab = PassengerTab.legalHub),
            ),
          ],
        ),
      ],
    );
  }

  Future<String> _notificationPermissionLabel() async {
    final l10n = AppLocalizations.of(context);
    try {
      final settings =
          await FirebaseMessaging.instance.getNotificationSettings();
      switch (settings.authorizationStatus) {
        case AuthorizationStatus.authorized:
        case AuthorizationStatus.provisional:
          return l10n.passengerSettingsPushEnabled;
        case AuthorizationStatus.denied:
          return l10n.passengerSettingsPushDisabled;
        case AuthorizationStatus.notDetermined:
          return l10n.passengerSettingsPushNotRequested;
      }
    } catch (_) {
      return l10n.passengerSettingsPushCheckError;
    }
  }

  Widget _faqScreen() => const _FaqScreen();

  Widget _aboutScreen() {
    final palette = context.palette;
    final l10n = AppLocalizations.of(context);
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
              Text(
                l10n.passengerAboutDescription,
                style: TextStyle(
                  color: palette.textSecondary,
                  height: 1.45,
                  fontWeight: FontWeight.w600,
                ),
              ),
              const SizedBox(height: 16),
              _CompactNotice(
                icon: Icons.map_outlined,
                title: l10n.passengerAboutRegionalModelTitle,
                text: l10n.passengerAboutRegionalModelText,
                dark: Theme.of(context).brightness == Brightness.dark,
              ),
              const SizedBox(height: 12),
              _CompactNotice(
                icon: Icons.support_agent_rounded,
                title: l10n.passengerAboutContactTitle,
                text: l10n.passengerAboutContactText,
                dark: Theme.of(context).brightness == Brightness.dark,
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
                title: l10n.support,
                subtitle: l10n.passengerAboutSupportSubtitle,
                onTap: () => setState(() => _tab = PassengerTab.support),
              ),
              const Divider(height: 20),
              _MenuLine(
                icon: Icons.shield_outlined,
                title: l10n.passengerSettingsLegalTitle,
                subtitle: l10n.passengerAboutLegalSubtitle,
                onTap: () => setState(() => _tab = PassengerTab.legalHub),
              ),
            ],
          ),
        ),
        const SizedBox(height: 16),
        Center(
          child: Text(
            l10n.passengerAboutVersionLabel(_appVersion),
            style: TextStyle(
              color: palette.textMuted,
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
            child: Padding(
              padding: const EdgeInsets.symmetric(vertical: 6),
              child: Row(
                children: [
                  Icon(
                    Icons.arrow_back_rounded,
                    size: 18,
                    color: context.palette.goldDeep,
                  ),
                  const SizedBox(width: 6),
                  Text(
                    'Все документы',
                    style: TextStyle(
                      color: context.palette.goldDeep,
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
          LegalSectionCard(
            section: section,
            dark: Theme.of(context).brightness == Brightness.dark,
          ),
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
    final palette = context.palette;
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
            style: TextStyle(
              color: palette.textSecondary,
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
                color: palette.goldSurface,
                borderRadius: BorderRadius.circular(12),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Ответ поддержки',
                    style: TextStyle(
                      color: palette.goldDeep,
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
    final l10n = AppLocalizations.of(context);
    final options = <OrderSummary>[
      if (activeOrder != null) activeOrder!,
      ...tripHistory.where((trip) =>
          trip.id != activeOrder?.id &&
          _relevantStatuses.contains(trip.status)),
    ].take(15).toList(growable: false);

    if (options.isEmpty) {
      return _InlineMessage(
        text: l10n.passengerNoTripsForLostItem,
        dark: Theme.of(context).brightness == Brightness.dark,
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _SectionLabel(
          title: l10n.passengerWhichTripLabel,
          text: l10n.passengerWhichTripText,
        ),
        const SizedBox(height: 8),
        Container(
          decoration: BoxDecoration(
            border: Border.all(color: context.palette.border),
            borderRadius: BorderRadius.circular(16),
          ),
          padding: const EdgeInsets.symmetric(horizontal: 12),
          child: DropdownButtonHideUnderline(
            child: DropdownButton<String>(
              isExpanded: true,
              value: selectedOrderId,
              hint: Text(l10n.passengerChooseTripHint),
              items: options
                  .map(
                    (trip) => DropdownMenuItem(
                      value: trip.id,
                      child: Text(
                        '${_formatTripDate(l10n, trip.createdAt)} · ${trip.pickup} → ${trip.dropoff}',
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
    final palette = context.palette;
    return AnimatedContainer(
      duration: const Duration(milliseconds: 180),
      curve: Curves.easeOutCubic,
      decoration: BoxDecoration(
        color: selected ? palette.goldPale : palette.card,
        border: Border.all(
          color: selected ? palette.gold : palette.border,
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
              color: selected ? palette.text : palette.textSecondary,
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
    this.zoom,
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
    required this.unreadNotificationCount,
    required this.routeSummaryLabel,
    required this.onRouteBack,
    required this.controlsBottom,
    required this.showLocationButton,
    required this.showCenterMarker,
    required this.activeTarget,
    this.searching = false,
  });

  final LatLng center;
  // Last zoom the rider actually chose, persisted by the parent shell
  // state (not this widget's own State, which gets recreated on every
  // Home tab re-entry). Null only on the very first mount of the app.
  final double? zoom;
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
  final void Function(LatLng center, double zoom) onCenterChanged;
  final VoidCallback onTileError;
  final VoidCallback onUseLocation;
  final VoidCallback onRetryMap;
  final VoidCallback onMenu;
  final VoidCallback onNotifications;
  final int unreadNotificationCount;
  final String? routeSummaryLabel;
  final VoidCallback onRouteBack;
  final double controlsBottom;
  final bool showLocationButton;
  final bool showCenterMarker;
  final PointTarget activeTarget;
  // No driver assigned yet and an order is actively searching — shows an
  // expanding radar pulse behind the pickup pin so this doesn't read as a
  // static, stuck screen while the rider waits.
  final bool searching;

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
    final isDark = Theme.of(context).brightness == Brightness.dark;
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
    final unreadNotificationCount = widget.unreadNotificationCount;
    final routeSummaryLabel = widget.routeSummaryLabel;
    final onRouteBack = widget.onRouteBack;
    final showCenterMarker = widget.showCenterMarker;
    final activeTarget = widget.activeTarget;
    final searching = widget.searching;
    final zoom = widget.zoom;
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
                  initialZoom:
                      zoom ?? (pickup == null && dropoff == null ? 12 : 14),
                  initialCameraFit: initialFit,
                  onTap: (_, point) => onTap(point),
                  onPositionChanged: (camera, hasGesture) {
                    if (hasGesture) {
                      onCenterChanged(camera.center, camera.zoom);
                    }
                  },
                  backgroundColor: context.palette.appBackground,
                ),
                children: [
                  ColorFiltered(
                    colorFilter: ColorFilter.matrix(
                      isDark ? _darkMapTileMatrix : _identityColorMatrix,
                    ),
                    child: TileLayer(
                      urlTemplate: AppConfig.osmTileUrl,
                      subdomains: const ['a', 'b', 'c', 'd'],
                      retinaMode: true,
                      userAgentPackageName: 'com.smarttaxi.app',
                      errorTileCallback: (_, __, ___) => onTileError(),
                    ),
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
                        searching
                            ? Marker(
                                point: pickup.toLatLng(),
                                width: 72,
                                height: 72,
                                child: Stack(
                                  alignment: Alignment.center,
                                  clipBehavior: Clip.none,
                                  children: [
                                    const _MarkerRadarPulse(
                                      color: _blueAccent,
                                      baseSize: 60,
                                    ),
                                    _assetMarkerContent(
                                      asset: _userLocationMarkerAsset,
                                      semanticLabel: 'Точка подачи',
                                      size: 14,
                                      fallbackIcon: Icons
                                          .radio_button_checked_rounded,
                                    ),
                                  ],
                                ),
                              )
                            : _assetMarker(
                                point: pickup.toLatLng(),
                                asset: _userLocationMarkerAsset,
                                semanticLabel: 'Точка подачи',
                                size: 14,
                                fallbackIcon:
                                    Icons.radio_button_checked_rounded,
                              ),
                      if (dropoff != null)
                        _assetMarker(
                          point: dropoff.toLatLng(),
                          asset: _destinationMarkerAsset,
                          semanticLabel: 'Точка назначения',
                          size: 16,
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
          // Fades the map to the app background at the top/bottom edges so
          // the floating header and sheet read clearly over busy map tiles.
          // Was a hardcoded cream tint (fine on the light map) — now that
          // the map itself inverts to dark (see the ColorFiltered TileLayer
          // above), the same cream fade left a whitish haze glowing across
          // the top and bottom of an otherwise-dark map, most visible right
          // behind the bottom sheet.
          Positioned.fill(
            child: IgnorePointer(
              child: DecoratedBox(
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.topCenter,
                    end: Alignment.bottomCenter,
                    colors: isDark
                        ? const [
                            Color(0x55071426),
                            Color(0x08071426),
                            Color(0xaa071426),
                          ]
                        : const [
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
              unreadNotificationCount: unreadNotificationCount,
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
          // Below the header and the nearby-drivers pill's slot (top: 84)
          // rather than mid-map (was top: 286, which sat on top of map
          // labels and close to the pickup marker beneath it) — this is a
          // status notice, not a map annotation, so it belongs in the
          // chrome band at the top, not floating over the map content.
          if (routeError != null || routeLoading)
            Positioned(
              left: 22,
              top: 140,
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
  // These marker PNGs are raw exports (some 500KB-2MB+, up to ~2000px on a
  // side) never downscaled for actual use -- decoding at full source
  // resolution for a marker rendered at ~15-50 logical px, then re-rotating
  // that full bitmap on every position update, is real, avoidable decode/
  // paint cost on a screen that's already redrawing the map underneath it.
  // cacheWidth/cacheHeight decode at a size that still looks sharp on
  // high-DPI screens (~3x logical size) instead of the full source.
  final cachePixels = (size * 3).round();
  return Semantics(
    label: semanticLabel,
    image: true,
    child: Transform.rotate(
      angle: rotationRadians,
      child: Image.asset(
        asset,
        width: size,
        height: size,
        cacheWidth: cachePixels,
        cacheHeight: cachePixels,
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
    final palette = context.palette;
    final label = '$count ${_pluralCars(count)} рядом';
    return Semantics(
      label: label,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 13, vertical: 9),
        decoration: BoxDecoration(
          color: palette.card.withValues(alpha: 0.98),
          border: Border.all(color: palette.border),
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
              style: TextStyle(
                fontSize: 11.5,
                fontWeight: FontWeight.w700,
                color: palette.text,
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
  const _MarkerRadarPulse({required this.color, this.baseSize = 54});

  final Color color;
  final double baseSize;

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
              width: widget.baseSize,
              height: widget.baseSize,
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
    // Address-picker crosshair, not the confirmed pickup/dropoff pins (see
    // _assetMarker calls in _MapCanvas). Enlarged three times now on direct
    // request (27->36->50->75, 2026-07-15 then 2026-07-19, the last a
    // straight 1.5x of every dimension below, not just pinWidth) — the rider
    // needs to clearly see which exact spot the pin's tip is over while
    // dragging the map under it, so this one stays bigger even as the
    // confirmed-route pins below get smaller.
    // Note: the source PNG has real transparent padding (content bbox is
    // ~77% of canvas width, ~91% of height — measured directly off the
    // asset), so the visually solid part of the pin is noticeably smaller
    // than pinWidth itself; sized up further to compensate.
    const pinWidth = 75.0;
    const pinHeight = pinWidth * _assetAspect;
    const tipShift = pinHeight * (_tipFraction - 0.5);
    return SizedBox(
      width: 189,
      height: 189,
      child: Stack(
        alignment: Alignment.center,
        clipBehavior: Clip.none,
        children: [
          Transform.translate(
            offset: const Offset(0, 7.5),
            child: const _MarkerRadarPulse(
              color: _addressPickMarkerColor,
              baseSize: 52.5,
            ),
          ),
          // Ground-contact shadow directly under the pin's tip.
          Transform.translate(
            offset: const Offset(0, 13.5),
            child: Container(
              width: 33,
              height: 10.5,
              decoration: BoxDecoration(
                color: Colors.black.withValues(alpha: 0.22),
                borderRadius: BorderRadius.circular(6),
              ),
            ),
          ),
          Transform.translate(
            offset: const Offset(0, -tipShift),
            // Same oversized-source-asset issue as the other map markers
            // (see _assetMarkerContent) -- the plain Image(image:) constructor
            // has no cacheWidth/cacheHeight of its own (only Image.asset/
            // network/file/memory do), so ResizeImage wraps the provider to
            // get the same decode-at-a-reasonable-size effect.
            child: Image(
              image: ResizeImage(
                const AssetImage(_addressPickMarkerAsset),
                width: (pinWidth * 3).round(),
                height: (pinHeight * 3).round(),
              ),
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
    final palette = context.palette;
    return DecoratedBox(
      decoration: BoxDecoration(
        gradient: RadialGradient(
          center: const Alignment(0.25, -0.35),
          radius: 1.1,
          colors: [
            palette.goldPale,
            palette.appBackground,
            palette.card,
          ],
        ),
      ),
      child: Center(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 32),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(Icons.map_outlined, color: palette.gold, size: 38),
              const SizedBox(height: 12),
              Text(
                'Карта загружается',
                textAlign: TextAlign.center,
                style: TextStyle(
                  color: palette.text,
                  fontSize: 18,
                  fontWeight: FontWeight.w900,
                ),
              ),
              const SizedBox(height: 6),
              Text(
                'Подключаем карту города',
                textAlign: TextAlign.center,
                style: TextStyle(
                    color: palette.textSecondary,
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
    final palette = context.palette;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        color: palette.card.withValues(alpha: 0.95),
        border: Border.all(color: palette.borderStrong),
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
          Icon(
            Icons.map_outlined,
            color: palette.goldDeep,
            size: 24,
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  'Карта временно недоступна',
                  style: TextStyle(
                    color: palette.text,
                    fontWeight: FontWeight.w900,
                    fontSize: 14,
                    height: 1.15,
                  ),
                ),
                const SizedBox(height: 3),
                Text(
                  'Маршрут и заказ можно выбрать вручную. Карта восстановится после подключения.',
                  style: TextStyle(
                    color: palette.textSecondary,
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
                TextButton.styleFrom(foregroundColor: palette.goldDeep),
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
    final palette = context.palette;
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: palette.card.withValues(alpha: 0.95),
        border: Border.all(color: palette.borderStrong),
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
            decoration: BoxDecoration(
              color: palette.gold,
              shape: BoxShape.circle,
            ),
            child: Icon(
              Icons.near_me_disabled_outlined,
              size: 18,
              color: palette.text,
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              text,
              style: TextStyle(
                color: palette.text,
                fontSize: 12.5,
                height: 1.25,
                fontWeight: FontWeight.w800,
              ),
            ),
          ),
          IconButton(
            onPressed: onUseLocation,
            tooltip: 'Разрешить геолокацию',
            icon: Icon(Icons.my_location_rounded,
                color: palette.gold),
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
    final palette = context.palette;
    final text = loading ? 'Считаем маршрут...' : error ?? 'Маршрут готов';
    final icon = loading
        ? null
        : error == null
            ? Icons.route_rounded
            : Icons.error_outline_rounded;
    final danger = error != null;
    // A compact capsule that hugs its content — was stretched almost
    // full-width (left:22/right:92 on the caller's Positioned, with an
    // Expanded text forcing it to fill that span), which read as a wide
    // rectangular blob sitting on top of the map label/marker beneath it
    // rather than a pill. ConstrainedBox keeps it capsule-shaped and short
    // enough to stay out of the way.
    return AnimatedSwitcher(
      duration: const Duration(milliseconds: 180),
      child: ConstrainedBox(
        key: ValueKey(text),
        constraints: const BoxConstraints(maxWidth: 240),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
          decoration: BoxDecoration(
            color: danger
                ? palette.danger.withValues(alpha: 0.18)
                : palette.card.withValues(alpha: 0.96),
            border: Border.all(
              color: danger
                  ? palette.danger.withValues(alpha: 0.34)
                  : palette.borderStrong,
            ),
            borderRadius: BorderRadius.circular(999),
            boxShadow: const [
              BoxShadow(
                color: Color(0x1f141414),
                blurRadius: 14,
                offset: Offset(0, 6),
              ),
            ],
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (loading)
                SizedBox(
                  width: 16,
                  height: 16,
                  child: CircularProgressIndicator(
                    strokeWidth: 2,
                    color: palette.gold,
                  ),
                )
              else
                Icon(
                  icon,
                  size: 17,
                  color: danger
                      ? palette.danger
                      : palette.gold,
                ),
              const SizedBox(width: 8),
              Flexible(
                child: Text(
                  text,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    color: danger
                        ? palette.danger
                        : palette.text,
                    fontSize: 12.5,
                    fontWeight: FontWeight.w800,
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
          decoration: BoxDecoration(
            color: context.palette.card,
            borderRadius: const BorderRadius.all(Radius.circular(30)),
            boxShadow: const [
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
    final palette = context.palette;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          title,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: TextStyle(
            color: palette.text,
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
          style: TextStyle(
            color: palette.textSecondary,
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
    final palette = context.palette;
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
                palette.gold.withValues(alpha: 0.16),
                palette.gold.withValues(alpha: 0.05),
              ],
            ),
            shape: BoxShape.circle,
          ),
          child: Icon(
            Icons.verified_rounded,
            size: 13,
            color: palette.goldDeep,
          ),
        ),
        const SizedBox(width: 7),
        Text(
          'Проверенные водители · Безопасные поездки',
          style: TextStyle(
            color: palette.textSecondary,
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
    final palette = context.palette;
    return Container(
      padding: const EdgeInsets.fromLTRB(15, 14, 12, 14),
      decoration: BoxDecoration(
        color: palette.card,
        border: Border.all(color: palette.border),
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
                    Divider(height: 16, color: palette.border),
                    _SheetAddressRow(
                      title: 'Куда',
                      label: dropoffLabel,
                      active: dropoffActive,
                      onTap: onDropoffTap,
                      trailing: _SvgIcon(
                        _iconChevronRight,
                        size: 18,
                        color: palette.textSecondary,
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
    final palette = context.palette;
    return Material(
      color: palette.card,
      shape: CircleBorder(side: BorderSide(color: palette.borderStrong)),
      elevation: 0,
      child: InkWell(
        customBorder: const CircleBorder(),
        onTap: onTap,
        child: Container(
          width: 34,
          height: 34,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: [palette.goldSurface, palette.goldPale],
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
          child: Icon(
            Icons.swap_vert_rounded,
            size: 18,
            color: palette.goldDeep,
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
    final palette = context.palette;
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
                      style: TextStyle(
                        color: palette.textSecondary,
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
                        color: active ? palette.goldDeep : palette.text,
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
    final palette = context.palette;
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
            gradient: LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: [palette.goldSurface, palette.goldPale],
            ),
            shape: BoxShape.circle,
            border: Border.all(color: palette.card, width: 1.5),
            boxShadow: [
              BoxShadow(
                color: palette.gold.withValues(alpha: 0.16),
                blurRadius: 12,
                offset: const Offset(0, 4),
              ),
            ],
          ),
          child: Center(
            child: loading
                ? SizedBox.square(
                    dimension: 16,
                    child: CircularProgressIndicator(
                      strokeWidth: 2,
                      color: palette.goldDeep,
                    ),
                  )
                : Icon(
                    Icons.my_location_rounded,
                    color: palette.goldDeep,
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
    final palette = context.palette;
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
              gradient: LinearGradient(
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
                colors: [const Color(0xff6fa8ff), palette.gold],
              ),
              shape: BoxShape.circle,
              border: Border.all(color: palette.card, width: 2.5),
              boxShadow: [
                BoxShadow(
                  color: palette.gold.withValues(alpha: 0.38),
                  blurRadius: 10,
                  offset: const Offset(0, 3),
                ),
              ],
            ),
            child: DecoratedBox(
              decoration: BoxDecoration(
                color: palette.card,
                shape: BoxShape.circle,
              ),
              child: const SizedBox(width: 5, height: 5),
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
                        color: palette.borderStrong.withValues(alpha: 0.45),
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
                border: Border.all(color: palette.card, width: 2.5),
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
    final palette = context.palette;
    return Container(
      padding: const EdgeInsets.fromLTRB(13, 10, 9, 10),
      decoration: BoxDecoration(
        color: palette.card,
        border: Border.fromBorderSide(
          BorderSide(color: palette.borderStrong),
        ),
        borderRadius: const BorderRadius.all(Radius.circular(22)),
        boxShadow: _cardShadow,
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
                Divider(height: 9, color: palette.border),
                _RouteSummaryLine(title: 'Куда', value: dropoffLabel),
              ],
            ),
          ),
          const SizedBox(width: 7),
          TextButton(
            onPressed: onEdit,
            style: TextButton.styleFrom(
              foregroundColor: palette.goldDeep,
              backgroundColor: palette.goldSurface,
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
              minimumSize: const Size(0, 0),
              tapTargetSize: MaterialTapTargetSize.shrinkWrap,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(14),
                side: BorderSide(color: palette.border),
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
    final palette = context.palette;
    return Row(
      children: [
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                title,
                style: TextStyle(
                  color: palette.text,
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
                style: TextStyle(
                  color: palette.textSecondary,
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

// Prompts the rider to leave a free-text note for the driver (which door,
// entrance, floor, landmark) — outline/ghost while empty since it's
// optional, switches to showing the saved text once set so it's clear the
// note is actually attached to the order.
class _OrderNoteRow extends StatelessWidget {
  const _OrderNoteRow({
    required this.note,
    this.onTap,
  });

  final String? note;
  // Null once the order exists — the backend has no endpoint to edit an
  // order's note after creation, so this becomes a plain read-only display
  // (no chevron, no InkWell) rather than a tappable row that does nothing.
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final hasNote = (note ?? '').isNotEmpty;
    final editable = onTap != null;
    return Material(
      color: Colors.transparent,
      borderRadius: BorderRadius.circular(16),
      child: InkWell(
        borderRadius: BorderRadius.circular(16),
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
          decoration: BoxDecoration(
            color: hasNote ? palette.goldSurface : palette.card,
            border: Border.all(
              color: hasNote ? palette.borderStrong : palette.border,
            ),
            borderRadius: BorderRadius.circular(16),
          ),
          child: Row(
            children: [
              Icon(
                hasNote
                    ? Icons.edit_note_rounded
                    : Icons.add_comment_outlined,
                size: 18,
                color: hasNote ? palette.goldDeep : palette.textSecondary,
              ),
              const SizedBox(width: 9),
              Expanded(
                child: Text(
                  hasNote ? note! : 'Описать место (дверь, подъезд, этаж)',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    color: hasNote ? palette.text : palette.textSecondary,
                    fontSize: 12.5,
                    fontWeight: hasNote ? FontWeight.w700 : FontWeight.w600,
                  ),
                ),
              ),
              if (editable) ...[
                const SizedBox(width: 6),
                Icon(
                  Icons.chevron_right_rounded,
                  size: 18,
                  color: palette.textMuted,
                ),
              ],
            ],
          ),
        ),
      ),
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
    required this.orderNote,
    required this.onNoteTap,
    required this.tariffs,
    required this.selectedTariffId,
    required this.preview,
    required this.tariffEstimates,
    required this.offeredPriceKzt,
    required this.onOfferedPriceChanged,
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
  final String? orderNote;
  final VoidCallback onNoteTap;
  final List<TariffOption> tariffs;
  final String? selectedTariffId;
  final RoutePreview? preview;
  final Map<String, RoutePreview> tariffEstimates;
  final int? offeredPriceKzt;
  final ValueChanged<int?> onOfferedPriceChanged;
  final bool loading;
  final bool previewLoading;
  final String? error;
  final ValueChanged<String> onTariff;
  final VoidCallback onCreate;
  final String cta;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final routeError =
        error != null && error!.toLowerCase().contains('маршрут');
    final routeSelected =
        pickupSource != PointSource.none && dropoffSource != PointSource.none;
    final canSubmit = !loading && !previewLoading;
    final estimatedPrice = preview?.estimatedPrice;
    final routePrice = offeredPriceKzt?.toDouble() ?? estimatedPrice;
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
                  _SheetHandle(dark: isDark),
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
                          const SizedBox(height: 8),
                          _OrderNoteRow(note: orderNote, onTap: onNoteTap),
                          const SizedBox(height: 10),
                          _TariffSection(
                            tariffs: tariffs,
                            selectedId: selectedTariffId,
                            estimate: preview,
                            estimates: tariffEstimates,
                            loading: previewLoading,
                            onSelect: onTariff,
                            dark: isDark,
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
                          if (error != null) ...[
                            const SizedBox(height: 10),
                            _InlineMessage(
                              text: error!,
                              danger: true,
                              dark: isDark,
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
                _SheetHandle(dark: isDark),
                if (!routeSelected) ...[
                  _OrderSheetHeading(
                    title: l10n.passengerHomeWhereToTitle,
                    text: l10n.passengerHomeWhereToSubtitle,
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
                    text: l10n.passengerHomeSetDestination,
                    onTap: onDropoffTap,
                  ),
                  const SizedBox(height: 10),
                  const _TrustRow(),
                ] else if (routeSelected && routeError)
                  _CompactNotice(
                    icon: Icons.route_outlined,
                    title: l10n.passengerHomeRouteIssueTitle,
                    text: l10n.passengerHomeRouteIssueText,
                    dark: isDark,
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
    final palette = context.palette;
    final l10n = AppLocalizations.of(context);
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
              _SheetHandle(dark: Theme.of(context).brightness == Brightness.dark),
              Row(
                crossAxisAlignment: CrossAxisAlignment.center,
                children: [
                  Expanded(
                    child: Text(
                      isPickup
                          ? l10n.passengerHomePickupQuestion
                          : l10n.passengerHomeWhereToTitle,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        color: palette.text,
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
                      foregroundColor: palette.textSecondary,
                      padding: const EdgeInsets.symmetric(
                        horizontal: 10,
                        vertical: 8,
                      ),
                      minimumSize: const Size(0, 0),
                      tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                    ),
                    child: Text(
                      l10n.cancel,
                      style: const TextStyle(fontWeight: FontWeight.w900),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 5),
              Text(
                'Подвиньте карту так, чтобы маркер стоял над нужным входом.',
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  color: palette.textSecondary,
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
                  color: palette.goldSurface,
                  border: Border.all(color: palette.goldPale),
                  borderRadius: BorderRadius.circular(22),
                  boxShadow: [
                    BoxShadow(
                      color: palette.gold.withValues(alpha: 0.09),
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
                        color: palette.card,
                        shape: BoxShape.circle,
                        border: Border.all(color: palette.border),
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
                          Text(
                            'Точка на карте',
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(
                              color: palette.text,
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
                            style: TextStyle(
                              color: palette.textSecondary,
                              fontSize: 12.5,
                              height: 1.15,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(width: 8),
                    _SvgIcon(
                      _iconChevronRight,
                      size: 18,
                      color: palette.textSecondary,
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
    final palette = context.palette;
    final l10n = AppLocalizations.of(context);
    final card = _PremiumCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  _formatTripDate(l10n, trip.createdAt),
                  style: TextStyle(
                    fontSize: 12.5,
                    fontWeight: FontWeight.w800,
                    color: palette.textSecondary,
                  ),
                ),
              ),
              StatusPill(
                label: _statusLabel(l10n, trip.status),
                tone: _statusTone(trip.status),
              ),
            ],
          ),
          const SizedBox(height: 10),
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Padding(
                padding: const EdgeInsets.only(top: 3),
                child: Icon(Icons.radio_button_checked_rounded,
                    size: 14, color: palette.gold),
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
              Padding(
                padding: const EdgeInsets.only(top: 3),
                child: Icon(Icons.location_on_rounded,
                    size: 14, color: palette.text),
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
                  style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w700,
                    color: palette.textSecondary,
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

List<String> _monthShortList(AppLocalizations l10n) => [
      l10n.passengerMonthJan,
      l10n.passengerMonthFeb,
      l10n.passengerMonthMar,
      l10n.passengerMonthApr,
      l10n.passengerMonthMay,
      l10n.passengerMonthJun,
      l10n.passengerMonthJul,
      l10n.passengerMonthAug,
      l10n.passengerMonthSep,
      l10n.passengerMonthOct,
      l10n.passengerMonthNov,
      l10n.passengerMonthDec,
    ];

String _formatTripDate(AppLocalizations l10n, DateTime? date) {
  if (date == null) return l10n.passengerTripDateUnknown;
  final months = _monthShortList(l10n);
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

List<_TripDayGroup> _groupTripsByDay(
    AppLocalizations l10n, List<OrderSummary> trips) {
  final months = _monthShortList(l10n);
  final now = DateTime.now();
  final today = DateTime(now.year, now.month, now.day);
  final yesterday = today.subtract(const Duration(days: 1));
  final ordered = <String, List<OrderSummary>>{};
  for (final trip in trips) {
    final date = trip.createdAt?.toLocal();
    final String label;
    if (date == null) {
      label = l10n.passengerTripDateUnknown;
    } else {
      final day = DateTime(date.year, date.month, date.day);
      if (day == today) {
        label = l10n.passengerTripDateToday;
      } else if (day == yesterday) {
        label = l10n.passengerTripDateYesterday;
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

String _tripShareText(AppLocalizations l10n, OrderSummary trip) {
  final priceText = trip.price == null ? '' : ' · ${_formatTenge(trip.price!)}';
  return '${l10n.passengerTripShareTextPrefix} ${_formatTripDate(l10n, trip.createdAt)}\n'
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
    final palette = context.palette;
    final l10n = AppLocalizations.of(context);
    final driverName = (trip.driverName ?? '').trim();
    final hasDriver = driverName.isNotEmpty;
    final driverMeta = [
      trip.driverCarModel,
      trip.driverCarColor,
      trip.driverPlate,
    ].where((value) => (value ?? '').trim().isNotEmpty).join(' · ');
    return Scaffold(
      backgroundColor: palette.appBackground,
      appBar: AppBar(
        title: Text(l10n.passengerTripDetailTitle),
        actions: [
          IconButton(
            icon: const Icon(Icons.ios_share_rounded),
            tooltip: l10n.passengerTripShareTooltip,
            onPressed: () =>
                unawaited(Share.share(_tripShareText(l10n, trip))),
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
                    _formatTripDate(l10n, trip.createdAt),
                    style: TextStyle(
                      color: palette.textSecondary,
                      fontSize: 13,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                ),
                StatusPill(
                  label: _statusLabel(l10n, trip.status),
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
                    label: l10n.passengerTripDistanceLabel,
                    value: _distanceLabel(trip.distanceKm),
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: _TripInfoPill(
                    label: l10n.passengerTripInTransitLabel,
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
                    label: l10n.tariffLabel,
                    value: (trip.tariff ?? '').trim().isEmpty
                        ? l10n.tariffEconomyTitle
                        : trip.tariff!,
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: _TripInfoPill(
                    label: l10n.paymentMethodLabel,
                    value: _paymentLabel(l10n, trip.paymentMethod ?? 'CASH'),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            _TripInfoPill(
              label: l10n.passengerTripTotalLabel,
              value: trip.price == null ? '—' : _formatTenge(trip.price!),
              emphasis: true,
            ),
            if (hasDriver) ...[
              const SizedBox(height: 20),
              _ProfileGroupLabel(l10n.passengerTripDriverGroupLabel),
              const SizedBox(height: 8),
              _PremiumCard(
                child: Row(
                  children: [
                    _InitialsAvatar(
                      name: driverName,
                      size: 46,
                      showStatusDot: false,
                      avatarUrl: trip.driverAvatarUrl,
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
                              style: TextStyle(
                                color: palette.textSecondary,
                                fontSize: 12.5,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                          ],
                        ],
                      ),
                    ),
                    if (trip.driverRating != null) ...[
                      Icon(
                        Icons.star_rounded,
                        color: palette.warning,
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
              label: Text(l10n.passengerTripContactSupportButton),
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
    super.key,
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
    this.tripDistanceTraveledM,
    required this.ratingStars,
    required this.ratingTags,
    required this.ratingCommentController,
    required this.ratingSubmitting,
    required this.ratingJustSubmitted,
    required this.receiptAcknowledged,
    required this.noDriversFound,
    required this.payment,
    required this.paymentTimedOut,
    required this.retryingPayment,
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
    required this.onSubmitCounterOffer,
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
  final int? tripDistanceTraveledM;
  final int ratingStars;
  final Set<String> ratingTags;
  final TextEditingController ratingCommentController;
  final bool ratingSubmitting;
  final bool ratingJustSubmitted;
  final bool receiptAcknowledged;
  final bool noDriversFound;
  final PaymentInfo? payment;
  final bool paymentTimedOut;
  final bool retryingPayment;
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
  final ValueChanged<int> onSubmitCounterOffer;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final l10n = AppLocalizations.of(context);
    final isDark = Theme.of(context).brightness == Brightness.dark;
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
    if (order.isClientCounterAwaitingDriver) {
      return _PanelEntrance(
        key: const ValueKey('trip-panel-counter-pending'),
        child: _ClientCounterPendingPanel(order: order),
      );
    }
    if (order.isDriverOfferAwaitingClient) {
      return _PanelEntrance(
        key: const ValueKey('trip-panel-price-offer'),
        child: _DriverPriceOfferPanel(
          order: order,
          responding: respondingToPriceOffer,
          onRespond: onRespondToPriceOffer,
          onSubmitCounter: onSubmitCounterOffer,
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
          retryingPayment: retryingPayment,
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
          driverAvatarUrl: order.driverAvatarUrl,
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
          retryingPayment: retryingPayment,
          onContinue: onAcknowledgeReceipt,
          onRetryPayment: onRetryPayment,
        ),
      );
    }
    final orderShortId =
        order.id.length > 8 ? order.id.substring(0, 8) : order.id;
    final searching = const {'SEARCHING_DRIVER', 'NEW'}.contains(order.status);
    // noDriversFound is a client-side heuristic (25s elapsed + zero nearby
    // drivers visible) that reacts fast for the common "genuinely nobody
    // around" case; order.searchTimedOut is the server's authoritative
    // signal (open >75s regardless of nearby-driver visibility) and also
    // catches the different case where drivers are nearby but none have
    // accepted — survives app restarts/reconnects, a purely local timer
    // wouldn't.
    if (searching && (noDriversFound || order.searchTimedOut)) {
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
        ? l10n.passengerSearchingSubtitleWithCount(nearbyDriverCount)
        : l10n.passengerSearchingSubtitleGeneric;
    final driverDescription = order.driverId == null
        ? l10n.passengerDriverOfferDescription
        : driverRouteText ?? l10n.passengerDriverRouteDescription;
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
                _SheetHandle(dark: Theme.of(context).brightness == Brightness.dark),
                Row(
                  crossAxisAlignment: CrossAxisAlignment.center,
                  children: [
                    Expanded(
                      child: Text(
                        l10n.passengerTripInProgressTitle,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          color: palette.text,
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
                  distanceTraveledM: tripDistanceTraveledM,
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
                  api: api,
                  orderId: order.id,
                  avatarUrl: order.driverAvatarUrl,
                ),
                if ((order.notes ?? '').isNotEmpty) ...[
                  const SizedBox(height: 8),
                  _OrderNoteRow(note: order.notes),
                ],
                const SizedBox(height: 10),
                Row(
                  children: [
                    Expanded(
                      child: _TripInfoPill(
                        label: l10n.tariffLabel,
                        // (order.tariff ?? 'Эконом') meant the null case
                        // itself never produced an empty string to trigger
                        // the "use Эконом" branch — it fell through to the
                        // null-check operator below and crashed for any
                        // order with no tariff at all.
                        value: (order.tariff?.trim().isEmpty ?? true)
                            ? l10n.tariffEconomyTitle
                            : order.tariff!,
                      ),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: _TripInfoPill(
                        label: l10n.paymentMethodLabel,
                        value: _paymentLabel(l10n, order.paymentMethod ?? 'CASH'),
                      ),
                    ),
                    if (order.price != null) ...[
                      const SizedBox(width: 8),
                      Expanded(
                        child: _TripInfoPill(
                          label: l10n.passengerTripTotalLabel,
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
                _SheetHandle(dark: Theme.of(context).brightness == Brightness.dark),
                Row(
                  crossAxisAlignment: CrossAxisAlignment.center,
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            l10n.passengerDriverSearchingLabel,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(
                              color: palette.text,
                              fontSize: 22,
                              height: 1.02,
                              fontWeight: FontWeight.w900,
                            ),
                          ),
                          const SizedBox(height: 5),
                          Text(
                            searchingSubtitle,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(
                              color: palette.textSecondary,
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
                        label: l10n.tariffLabel,
                        // (order.tariff ?? 'Эконом') meant the null case
                        // itself never produced an empty string to trigger
                        // the "use Эконом" branch — it fell through to the
                        // null-check operator below and crashed for any
                        // order with no tariff at all.
                        value: (order.tariff?.trim().isEmpty ?? true)
                            ? l10n.tariffEconomyTitle
                            : order.tariff!,
                      ),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: _TripInfoPill(
                        label: l10n.paymentMethodLabel,
                        value: _paymentLabel(l10n, order.paymentMethod ?? 'CASH'),
                      ),
                    ),
                    if (order.price != null) ...[
                      const SizedBox(width: 8),
                      Expanded(
                        child: _TripInfoPill(
                          label: l10n.passengerTripTotalLabel,
                          value: _formatTenge(order.price!),
                          emphasis: true,
                        ),
                      ),
                    ],
                  ],
                ),
                if (error != null) ...[
                  const SizedBox(height: 12),
                  _InlineMessage(text: error!, danger: true, dark: isDark),
                ],
                if (canCancel) ...[
                  const SizedBox(height: 12),
                  OutlinedButton(
                    onPressed: loading ? null : onCancel,
                    style: OutlinedButton.styleFrom(
                      minimumSize: const Size.fromHeight(48),
                      foregroundColor: palette.danger,
                      side: BorderSide(color: palette.danger.withValues(alpha: 0.3)),
                      backgroundColor: palette.dangerSoft,
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(17),
                      ),
                    ),
                    child: Text(loading
                        ? l10n.passengerCancellingLabel
                        : l10n.passengerCancelSearchButton),
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
              _SheetHandle(dark: Theme.of(context).brightness == Brightness.dark),
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          order.driverId == null
                              ? l10n.passengerTripWithIdTitle(orderShortId)
                              : l10n.passengerDriverFoundTitle,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                            color: palette.text,
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
                          style: TextStyle(
                            color: palette.textSecondary,
                            fontSize: 13,
                            height: 1.1,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ],
                    ),
                  ),
                  // No StatusPill here (unlike the searching/in-progress
                  // headers' own accent widgets, this one used to duplicate
                  // the subtitle text verbatim) — on real device widths it
                  // squeezed the Expanded title/subtitle column down to
                  // ~85dp, truncating "Водитель найден" to "Водит..." and
                  // the subtitle even harder. The stepper right below
                  // already shows progress; the subtitle already shows the
                  // specific status text, so the pill added crowding
                  // without adding information.
                  if (order.driverId != null) ...[
                    const SizedBox(width: 10),
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
              if ((order.notes ?? '').isNotEmpty) ...[
                const SizedBox(height: 8),
                _OrderNoteRow(note: order.notes),
              ],
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
                  api: api,
                  orderId: order.id,
                  avatarUrl: order.driverAvatarUrl,
                ),
              ] else
                _CompactNotice(
                  icon: Icons.person_search_rounded,
                  title: driverText,
                  text: driverDescription,
                  dark: isDark,
                ),
              const SizedBox(height: 10),
              Row(
                children: [
                  Expanded(
                    child: _TripInfoPill(
                      label: l10n.tariffLabel,
                      value: (order.tariff ?? l10n.tariffEconomyTitle)
                              .trim()
                              .isEmpty
                          ? l10n.tariffEconomyTitle
                          : order.tariff!,
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: _TripInfoPill(
                      label: l10n.paymentMethodLabel,
                      value: _paymentLabel(l10n, order.paymentMethod ?? 'CASH'),
                    ),
                  ),
                  if (order.price != null) ...[
                    const SizedBox(width: 8),
                    Expanded(
                      child: _TripInfoPill(
                        label: l10n.passengerTripTotalLabel,
                        value: _formatTenge(order.price!),
                        emphasis: true,
                      ),
                    ),
                  ],
                ],
              ),
              if (error != null) ...[
                const SizedBox(height: 12),
                _InlineMessage(text: error!, danger: true, dark: isDark),
              ],
              if (canCancel || isTerminal) ...[
                const SizedBox(height: 12),
                if (isTerminal)
                  _GoldCtaButton(
                    enabled: true,
                    loading: false,
                    text: l10n.passengerNewTripButton,
                    onTap: onNewTrip,
                  )
                else
                  OutlinedButton(
                    onPressed: loading ? null : onCancel,
                    style: OutlinedButton.styleFrom(
                      minimumSize: const Size.fromHeight(50),
                      foregroundColor: palette.danger,
                      side: BorderSide(color: palette.danger.withValues(alpha: 0.3)),
                      backgroundColor: palette.dangerSoft,
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(17),
                      ),
                    ),
                    child: Text(loading
                        ? l10n.passengerCancellingLabel
                        : l10n.passengerCancelTripButton),
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
                color: filled
                    ? const Color(0xfff5a623)
                    : context.palette.border,
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
    this.driverAvatarUrl,
  });

  final String driverName;
  final String? driverAvatarUrl;
  final int stars;
  final Set<String> tags;
  final TextEditingController commentController;
  final bool submitting;
  final String? error;
  final ValueChanged<int> onStarsChanged;
  final ValueChanged<String> onTagToggle;
  final VoidCallback onSubmit;
  final VoidCallback onSkip;

  static List<(String key, String label)> _positiveTags(AppLocalizations l10n) => [
        ('polite_driver', l10n.ratingTagPoliteDriver),
        ('clean_car', l10n.ratingTagCleanCar),
        ('safe_driving', l10n.ratingTagSafeDriving),
        ('on_time', l10n.ratingTagOnTime),
      ];

  static List<(String key, String label)> _negativeTags(AppLocalizations l10n) => [
        ('late', l10n.ratingTagLate),
        ('rude', l10n.ratingTagRude),
        ('unsafe_driving', l10n.ratingTagUnsafeDriving),
        ('dirty_car', l10n.ratingTagDirtyCar),
      ];

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final l10n = AppLocalizations.of(context);
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final name = driverName.trim().isEmpty
        ? l10n.passengerRateDriverFallbackName
        : driverName.trim();
    final tagOptions = stars >= 4 ? _positiveTags(l10n) : _negativeTags(l10n);
    return _HomeOrderPanel(
      child: SingleChildScrollView(
        physics: const BouncingScrollPhysics(),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.center,
          children: [
            _SheetHandle(dark: isDark),
            const SizedBox(height: 6),
            _InitialsAvatar(
              name: name,
              size: 56,
              showStatusDot: false,
              avatarUrl: driverAvatarUrl,
            ),
            const SizedBox(height: 12),
            Text(
              l10n.passengerRateDriverQuestion(name),
              textAlign: TextAlign.center,
              style: TextStyle(
                color: palette.text,
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
                        label: tag.$2,
                        selected: tags.contains(tag.$1),
                        onTap: () => onTagToggle(tag.$1),
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
                style: TextStyle(color: palette.text),
                decoration: InputDecoration(
                  hintText: l10n.passengerDriverCommentLabel,
                  hintStyle: TextStyle(color: palette.textMuted),
                  filled: true,
                  fillColor: palette.card,
                  border: OutlineInputBorder(
                    borderRadius: const BorderRadius.all(Radius.circular(16)),
                    borderSide: BorderSide(color: palette.border),
                  ),
                  enabledBorder: OutlineInputBorder(
                    borderRadius: const BorderRadius.all(Radius.circular(16)),
                    borderSide: BorderSide(color: palette.border),
                  ),
                  focusedBorder: OutlineInputBorder(
                    borderRadius: const BorderRadius.all(Radius.circular(16)),
                    borderSide: BorderSide(color: palette.gold, width: 1.8),
                  ),
                ),
              ),
            ],
            if (error != null) ...[
              const SizedBox(height: 14),
              _InlineMessage(text: error!, danger: true, dark: isDark),
            ],
            const SizedBox(height: 16),
            _GoldCtaButton(
              enabled: stars > 0 && !submitting,
              loading: submitting,
              text: l10n.passengerSubmitRatingButton,
              loadingText: l10n.passengerSubmittingRatingButton,
              onTap: onSubmit,
            ),
            const SizedBox(height: 6),
            TextButton(
              onPressed: submitting ? null : onSkip,
              child: Text(
                l10n.passengerSkipButton,
                style: TextStyle(
                  color: palette.textSecondary,
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
    final palette = context.palette;
    final l10n = AppLocalizations.of(context);
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return _HomeOrderPanel(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          _SheetHandle(dark: isDark),
          const SizedBox(height: 12),
          Container(
            width: 60,
            height: 60,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: palette.successSoft,
              borderRadius: BorderRadius.circular(20),
            ),
            child: Icon(
              Icons.favorite_rounded,
              color: palette.success,
              size: 28,
            ),
          ),
          const SizedBox(height: 14),
          Text(
            l10n.passengerRatedThankYouTitle,
            style: TextStyle(
              color: palette.text,
              fontSize: 17,
              fontWeight: FontWeight.w900,
            ),
          ),
          const SizedBox(height: 6),
          Text(
            l10n.passengerRatedThankYouText,
            textAlign: TextAlign.center,
            style: TextStyle(
              color: palette.textSecondary,
              fontSize: 13,
              height: 1.3,
              fontWeight: FontWeight.w600,
            ),
          ),
          const SizedBox(height: 18),
          _GoldCtaButton(
            enabled: true,
            loading: false,
            text: l10n.passengerOrderAgainButton,
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
    required this.retryingPayment,
    required this.onContinue,
    required this.onRetryPayment,
  });

  final OrderSummary order;
  final bool paid;
  final PaymentInfo? payment;
  final bool paymentTimedOut;
  final bool retryingPayment;
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
    final palette = context.palette;
    final l10n = AppLocalizations.of(context);
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return _HomeOrderPanel(
      child: SingleChildScrollView(
        physics: const BouncingScrollPhysics(),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            _SheetHandle(dark: isDark),
            Row(
              crossAxisAlignment: CrossAxisAlignment.center,
              children: [
                // Hero moment: this panel mounts fresh (fresh ValueKey
                // upstream) the instant the order actually lands on PAID —
                // an elastic pop reads as a small celebration instead of
                // the same flat scale-in every other status panel gets.
                // Only for the genuine paid confirmation, not the
                // payment-pending variant of this same widget.
                if (paid)
                  TweenAnimationBuilder<double>(
                    tween: Tween(begin: 0.3, end: 1),
                    duration: const Duration(milliseconds: 620),
                    curve: Curves.elasticOut,
                    builder: (context, scale, child) =>
                        Transform.scale(scale: scale, child: child),
                    child: Container(
                      width: 48,
                      height: 48,
                      alignment: Alignment.center,
                      decoration: BoxDecoration(
                        color: palette.successSoft,
                        borderRadius: BorderRadius.circular(16),
                      ),
                      child: Icon(
                        Icons.receipt_long_rounded,
                        color: palette.success,
                        size: 24,
                      ),
                    ),
                  )
                else
                  Container(
                    width: 48,
                    height: 48,
                    alignment: Alignment.center,
                    decoration: BoxDecoration(
                      color: palette.successSoft,
                      borderRadius: BorderRadius.circular(16),
                    ),
                    child: Icon(
                      Icons.receipt_long_rounded,
                      color: palette.success,
                      size: 24,
                    ),
                  ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        l10n.passengerTripCompletedTitle,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          color: palette.text,
                          fontSize: 18,
                          height: 1.05,
                          fontWeight: FontWeight.w900,
                        ),
                      ),
                      const SizedBox(height: 3),
                      Text(
                        l10n.passengerTripReceiptSubtitle,
                        style: TextStyle(
                          color: palette.textSecondary,
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
                    label: l10n.passengerTripDistanceLabel,
                    value: _distanceLabel(order.distanceKm),
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: _TripInfoPill(
                    label: l10n.passengerTripInTransitLabel,
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
                    label: l10n.paymentMethodFullLabel,
                    value: _paymentLabel(l10n, order.paymentMethod ?? 'CASH'),
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: _TripInfoPill(
                    label: l10n.passengerTripTotalLabel,
                    value:
                        order.price == null ? '—' : _formatTenge(order.price!),
                    emphasis: true,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 18),
            _buildPaymentState(palette, l10n),
          ],
        ),
      ),
    );
  }

  Widget _buildPaymentState(SmartTaxiPalette palette, AppLocalizations l10n) {
    if (paid) {
      return _GoldCtaButton(
        enabled: true,
        loading: false,
        text: l10n.passengerRateTripButton,
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
              color: palette.dangerSoft,
              border: Border.all(color: palette.danger.withValues(alpha: 0.3)),
              borderRadius: BorderRadius.circular(18),
            ),
            child: Row(
              children: [
                Icon(
                  Icons.error_outline_rounded,
                  color: palette.danger,
                  size: 20,
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(
                    payment!.failureReason?.trim().isNotEmpty == true
                        ? payment!.failureReason!
                        : l10n.passengerCardPaymentFailedText,
                    style: TextStyle(
                      color: palette.danger,
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
            enabled: !retryingPayment,
            loading: retryingPayment,
            text: l10n.passengerRetryPaymentButton,
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
              color: palette.goldSurface,
              border: Border.all(color: palette.border),
              borderRadius: BorderRadius.circular(18),
            ),
            child: Row(
              children: [
                Icon(
                  Icons.schedule_rounded,
                  color: palette.goldDeep,
                  size: 20,
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(
                    l10n.passengerPaymentSlowText,
                    style: TextStyle(
                      color: palette.goldDeep,
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
            enabled: !retryingPayment,
            loading: retryingPayment,
            text: l10n.passengerRetryPaymentButton,
            onTap: onRetryPayment,
          ),
        ],
      );
    }
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 13),
      decoration: BoxDecoration(
        color: palette.goldSurface,
        border: Border.all(color: palette.border),
        borderRadius: BorderRadius.circular(18),
      ),
      child: Row(
        children: [
          SizedBox(
            width: 16,
            height: 16,
            child: CircularProgressIndicator(
              strokeWidth: 2.2,
              color: palette.goldDeep,
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              processing
                  ? l10n.passengerPaymentProcessingText
                  : l10n.passengerPaymentAwaitingText,
              style: TextStyle(
                color: palette.goldDeep,
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
    final palette = context.palette;
    final l10n = AppLocalizations.of(context);
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return _HomeOrderPanel(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          _SheetHandle(dark: isDark),
          const SizedBox(height: 8),
          Container(
            width: 64,
            height: 64,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: palette.goldPale,
              shape: BoxShape.circle,
            ),
            child: Icon(
              Icons.person_search_rounded,
              color: palette.goldDeep,
              size: 30,
            ),
          ),
          const SizedBox(height: 14),
          Text(
            l10n.passengerNoDriversTitle,
            textAlign: TextAlign.center,
            style: TextStyle(
              color: palette.text,
              fontSize: 18,
              fontWeight: FontWeight.w900,
            ),
          ),
          const SizedBox(height: 6),
          Text(
            l10n.passengerNoDriversText,
            textAlign: TextAlign.center,
            style: TextStyle(
              color: palette.textSecondary,
              fontSize: 13,
              height: 1.35,
              fontWeight: FontWeight.w600,
            ),
          ),
          if (error != null) ...[
            const SizedBox(height: 14),
            _InlineMessage(text: error!, danger: true, dark: isDark),
          ],
          const SizedBox(height: 18),
          _GoldCtaButton(
            enabled: !loading,
            loading: loading,
            text: l10n.passengerRetrySearchButton,
            loadingText: l10n.passengerRetryingSearchButton,
            onTap: onRetry,
          ),
          const SizedBox(height: 6),
          TextButton(
            onPressed: loading ? null : onCancel,
            child: Text(
              l10n.passengerCancelOrderButton,
              style: TextStyle(
                color: palette.danger,
                fontWeight: FontWeight.w800,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _DriverPriceOfferPanel extends StatefulWidget {
  const _DriverPriceOfferPanel({
    required this.order,
    required this.responding,
    required this.onRespond,
    required this.onSubmitCounter,
  });

  final OrderSummary order;
  final bool responding;
  final ValueChanged<bool> onRespond;
  final ValueChanged<int> onSubmitCounter;

  @override
  State<_DriverPriceOfferPanel> createState() =>
      _DriverPriceOfferPanelState();
}

class _DriverPriceOfferPanelState extends State<_DriverPriceOfferPanel> {
  static const _stepKzt = 100;
  static const _floorKzt = 200;
  late int _counterKzt;

  @override
  void initState() {
    super.initState();
    _counterKzt = _initialCounter();
  }

  @override
  void didUpdateWidget(covariant _DriverPriceOfferPanel oldWidget) {
    super.didUpdateWidget(oldWidget);
    // A fresh offer (new price, or the driver countering again after the
    // rider's own counter got declined) resets the starting point for the
    // stepper — otherwise it would keep showing a number the rider set
    // against a now-stale driver price.
    if (oldWidget.order.driverOfferPriceKzt != widget.order.driverOfferPriceKzt) {
      setState(() => _counterKzt = _initialCounter());
    }
  }

  int _initialCounter() {
    final offered = widget.order.driverOfferPriceKzt;
    final current = widget.order.price;
    // Starting point for the rider's own counter: halfway between what the
    // driver asked for and the rider's original price — a neutral opening
    // move rather than either side's number, rounded to a clean step.
    if (offered == null) return _floorKzt;
    if (current == null) return offered;
    final midpoint = ((offered + current) / 2 / _stepKzt).round() * _stepKzt;
    return midpoint.clamp(_floorKzt, 1000000);
  }

  void _adjust(int delta) {
    setState(() => _counterKzt = (_counterKzt + delta).clamp(_floorKzt, 1000000));
  }

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final l10n = AppLocalizations.of(context);
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final order = widget.order;
    final responding = widget.responding;
    final offered = order.driverOfferPriceKzt;
    final current = order.price;
    final driverName = (order.offerDriverName ?? '').trim().isEmpty
        ? l10n.driverProfileNameFallback
        : order.offerDriverName!.trim();
    return _HomeOrderPanel(
      // This panel's content (avatar, name, rating, both prices, accept
      // CTA, stepper, counter-offer button, decline) is taller than the
      // ConstrainedBox(maxHeight: screen.height * sheetFraction) the caller
      // wraps _TripStatusPanel in on shorter/compact screens -- without a
      // scroll view here, that overflow rendered as a hazard-striped
      // "BOTTOM OVERFLOWED" bar instead of the decline button.
      child: SingleChildScrollView(child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          _SheetHandle(dark: isDark),
          const SizedBox(height: 12),
          // Avatar + name + rating up top — the rider should see WHO is
          // asking for a different price before deciding whether to
          // negotiate, not just a bare number.
          _InitialsAvatar(
            name: driverName,
            size: 56,
            showStatusDot: false,
            avatarUrl: order.offerDriverAvatarUrl,
          ),
          const SizedBox(height: 10),
          Text(
            driverName,
            textAlign: TextAlign.center,
            style: TextStyle(
              color: palette.text,
              fontSize: 16,
              fontWeight: FontWeight.w900,
            ),
          ),
          if (order.offerDriverRating != null) ...[
            const SizedBox(height: 3),
            Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(Icons.star_rounded, color: palette.gold, size: 16),
                const SizedBox(width: 3),
                Text(
                  order.offerDriverRating!.toStringAsFixed(1),
                  style: TextStyle(
                    color: palette.textSecondary,
                    fontSize: 13,
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ],
            ),
          ],
          const SizedBox(height: 16),
          // Both prices side by side — the whole point is letting the rider
          // compare at a glance instead of having to remember what they
          // originally agreed to.
          Row(
            children: [
              Expanded(
                child: _PriceCompareTile(
                  label: l10n.passengerYourPriceLabel,
                  value: current == null ? '—' : _formatTenge(current),
                  palette: palette,
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: _PriceCompareTile(
                  label: l10n.passengerDriverPriceLabel,
                  value: offered == null ? '—' : _formatTenge(offered.toDouble()),
                  palette: palette,
                  emphasize: true,
                ),
              ),
            ],
          ),
          const SizedBox(height: 18),
          _GoldCtaButton(
            enabled: !responding,
            loading: responding,
            text: l10n.passengerAcceptOfferButton,
            loadingText: l10n.passengerSendingResponseButton,
            trailingText:
                offered == null ? null : _formatTenge(offered.toDouble()),
            onTap: () => widget.onRespond(true),
          ),
          const SizedBox(height: 14),
          Text(
            l10n.passengerCounterOfferPrompt,
            style: TextStyle(
              color: palette.textSecondary,
              fontSize: 12.5,
              fontWeight: FontWeight.w700,
            ),
          ),
          const SizedBox(height: 8),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 8),
            decoration: BoxDecoration(
              color: palette.goldSurface,
              borderRadius: BorderRadius.circular(18),
            ),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                _StepperCircleButton(
                  icon: Icons.remove_rounded,
                  enabled: !responding && _counterKzt > _floorKzt,
                  onTap: () => _adjust(-_stepKzt),
                ),
                Text(
                  _formatTenge(_counterKzt.toDouble()),
                  style: TextStyle(
                    color: palette.text,
                    fontSize: 20,
                    fontWeight: FontWeight.w900,
                  ),
                ),
                _StepperCircleButton(
                  icon: Icons.add_rounded,
                  enabled: !responding,
                  onTap: () => _adjust(_stepKzt),
                ),
              ],
            ),
          ),
          const SizedBox(height: 10),
          SizedBox(
            width: double.infinity,
            child: OutlinedButton(
              onPressed:
                  responding ? null : () => widget.onSubmitCounter(_counterKzt),
              style: OutlinedButton.styleFrom(
                foregroundColor: palette.goldDeep,
                side: BorderSide(color: palette.gold),
                padding: const EdgeInsets.symmetric(vertical: 15),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(20),
                ),
              ),
              child: Text(
                l10n.passengerSubmitOfferButton,
                style: const TextStyle(fontWeight: FontWeight.w800),
              ),
            ),
          ),
          const SizedBox(height: 6),
          TextButton(
            onPressed: responding ? null : () => widget.onRespond(false),
            child: Text(
              l10n.passengerDeclineOfferButton,
              style: TextStyle(
                color: palette.textSecondary,
                fontWeight: FontWeight.w800,
              ),
            ),
          ),
        ],
      )),
    );
  }
}

class _PriceCompareTile extends StatelessWidget {
  const _PriceCompareTile({
    required this.label,
    required this.value,
    required this.palette,
    this.emphasize = false,
  });

  final String label;
  final String value;
  final SmartTaxiPalette palette;
  final bool emphasize;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
      decoration: BoxDecoration(
        color: emphasize ? palette.goldSurface : palette.card,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: emphasize ? palette.gold.withValues(alpha: 0.4) : palette.border,
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label,
            style: TextStyle(
              color: palette.textSecondary,
              fontSize: 11.5,
              fontWeight: FontWeight.w700,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            value,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(
              color: emphasize ? palette.goldDeep : palette.text,
              fontSize: 16,
              fontWeight: FontWeight.w900,
            ),
          ),
        ],
      ),
    );
  }
}

class _StepperCircleButton extends StatelessWidget {
  const _StepperCircleButton({
    required this.icon,
    required this.enabled,
    required this.onTap,
  });

  final IconData icon;
  final bool enabled;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    return Opacity(
      opacity: enabled ? 1 : 0.4,
      child: Material(
        color: palette.card,
        shape: const CircleBorder(),
        elevation: 1,
        child: InkWell(
          customBorder: const CircleBorder(),
          onTap: enabled ? onTap : null,
          child: SizedBox(
            width: 40,
            height: 40,
            child: Icon(icon, color: palette.goldDeep, size: 22),
          ),
        ),
      ),
    );
  }
}

// Rider already countered; nothing more for them to do until the driver
// accepts, declines, or counters again — a distinct, non-interactive state
// so it's clear the ball is in the driver's court.
class _ClientCounterPendingPanel extends StatelessWidget {
  const _ClientCounterPendingPanel({required this.order});

  final OrderSummary order;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final l10n = AppLocalizations.of(context);
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final driverName = (order.offerDriverName ?? '').trim().isEmpty
        ? l10n.driverProfileNameFallback
        : order.offerDriverName!.trim();
    final myOffer = order.driverOfferPriceKzt;
    return _HomeOrderPanel(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          _SheetHandle(dark: isDark),
          const SizedBox(height: 12),
          _InitialsAvatar(
            name: driverName,
            size: 56,
            showStatusDot: false,
            avatarUrl: order.offerDriverAvatarUrl,
          ),
          const SizedBox(height: 14),
          Text(
            l10n.passengerWaitingDriverResponseTitle,
            textAlign: TextAlign.center,
            style: TextStyle(
              color: palette.text,
              fontSize: 17,
              fontWeight: FontWeight.w900,
            ),
          ),
          const SizedBox(height: 6),
          Text(
            myOffer == null
                ? l10n.passengerOfferSentText
                : l10n.passengerYouOfferedText(_formatTenge(myOffer.toDouble())),
            textAlign: TextAlign.center,
            style: TextStyle(
              color: palette.textSecondary,
              fontSize: 13,
              height: 1.3,
              fontWeight: FontWeight.w600,
            ),
          ),
          const SizedBox(height: 16),
          const SizedBox(
            width: 22,
            height: 22,
            child: CircularProgressIndicator(strokeWidth: 2.4),
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

  ({IconData icon, String title, String subtitle}) _copy(AppLocalizations l10n) {
    switch (status) {
      case 'CANCELLED_BY_DRIVER':
        return (
          icon: Icons.person_off_rounded,
          title: l10n.passengerCancelledByDriverTitle,
          subtitle: l10n.passengerCancelledByDriverText,
        );
      case 'CANCELLED_BY_OPERATOR':
        return (
          icon: Icons.support_agent_rounded,
          title: l10n.passengerCancelledByOperatorTitle,
          subtitle: l10n.passengerCancelledByOperatorText,
        );
      case 'NO_SHOW':
        return (
          icon: Icons.hourglass_disabled_rounded,
          title: l10n.passengerNoShowTitle,
          subtitle: l10n.passengerNoShowText,
        );
      default:
        return (
          icon: Icons.close_rounded,
          title: l10n.passengerCancelledGenericTitle,
          subtitle: l10n.passengerCancelledGenericText,
        );
    }
  }

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final l10n = AppLocalizations.of(context);
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final copy = _copy(l10n);
    return _HomeOrderPanel(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          _SheetHandle(dark: isDark),
          const SizedBox(height: 12),
          Container(
            width: 60,
            height: 60,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: palette.dangerSoft,
              borderRadius: BorderRadius.circular(20),
            ),
            child: Icon(
              copy.icon,
              color: palette.danger,
              size: 28,
            ),
          ),
          const SizedBox(height: 14),
          Text(
            copy.title,
            textAlign: TextAlign.center,
            style: TextStyle(
              color: palette.text,
              fontSize: 17,
              fontWeight: FontWeight.w900,
            ),
          ),
          const SizedBox(height: 6),
          Text(
            copy.subtitle,
            textAlign: TextAlign.center,
            style: TextStyle(
              color: palette.textSecondary,
              fontSize: 13,
              height: 1.3,
              fontWeight: FontWeight.w600,
            ),
          ),
          const SizedBox(height: 18),
          _GoldCtaButton(
            enabled: true,
            loading: false,
            text: l10n.passengerOrderAgainButton,
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
    final palette = context.palette;
    final l10n = AppLocalizations.of(context);
    final title = driverAssigned
        ? l10n.passengerCancelTripConfirmTitle
        : l10n.passengerCancelSearchConfirmTitle;
    final subtitle = driverAssigned
        ? l10n.passengerCancelTripConfirmText
        : l10n.passengerCancelSearchConfirmText;
    return SafeArea(
      top: false,
      child: Container(
        margin: const EdgeInsets.all(12),
        padding: const EdgeInsets.fromLTRB(20, 16, 20, 20),
        decoration: BoxDecoration(
          color: palette.card,
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
            Center(
              child: _SheetHandle(
                  dark: Theme.of(context).brightness == Brightness.dark)),
            const SizedBox(height: 12),
            Container(
              width: 52,
              height: 52,
              alignment: Alignment.center,
              decoration: BoxDecoration(
                color: palette.dangerSoft,
                borderRadius: BorderRadius.circular(16),
              ),
              child: Icon(
                Icons.error_outline_rounded,
                color: palette.danger,
                size: 26,
              ),
            ),
            const SizedBox(height: 14),
            Text(
              title,
              textAlign: TextAlign.center,
              style: TextStyle(
                color: palette.text,
                fontSize: 17,
                fontWeight: FontWeight.w900,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              subtitle,
              textAlign: TextAlign.center,
              style: TextStyle(
                color: palette.textSecondary,
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
                  backgroundColor: palette.danger,
                  foregroundColor: Colors.white,
                  disabledBackgroundColor: palette.danger,
                  minimumSize: const Size.fromHeight(52),
                ),
                child: Text(l10n.passengerCancelConfirmYesButton),
              ),
            ),
            const SizedBox(height: 10),
            SizedBox(
              width: double.infinity,
              child: OutlinedButton(
                onPressed: () => Navigator.pop(context, false),
                child: Text(l10n.passengerCancelConfirmNoButton),
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
    this.danger = false,
  });

  final String title;
  final String text;
  final String confirmLabel;
  final bool danger;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final accent = danger ? palette.danger : palette.goldDeep;
    final accentSoft = danger ? palette.dangerSoft : palette.goldSurface;
    return SafeArea(
      top: false,
      child: Container(
        margin: const EdgeInsets.all(12),
        padding: const EdgeInsets.fromLTRB(20, 16, 20, 20),
        decoration: BoxDecoration(
          color: palette.card,
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
            Center(
              child: _SheetHandle(
                  dark: Theme.of(context).brightness == Brightness.dark)),
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
              style: TextStyle(
                color: palette.text,
                fontSize: 17,
                fontWeight: FontWeight.w900,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              text,
              textAlign: TextAlign.center,
              style: TextStyle(
                color: palette.textSecondary,
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
                child: const Text('Отмена'),
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
    final palette = context.palette;
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
                style: TextStyle(
                  color: palette.textSecondary,
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
                    Expanded(
                      child: Text(
                        'Ждём подтверждения от водителя',
                        style: TextStyle(
                          color: palette.textSecondary,
                          fontSize: 12.5,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ),
                  const SizedBox(width: 10),
                  TextButton(
                    onPressed: updating ? null : onCancel,
                    style: TextButton.styleFrom(
                      foregroundColor: palette.danger,
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
    final palette = context.palette;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: palette.goldSurface,
        borderRadius: BorderRadius.circular(999),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 14, color: palette.goldDeep),
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
    final palette = context.palette;
    final (icon, labelText) = _labelMeta;
    return _PremiumCard(
      child: Row(
        children: [
          Container(
            width: 44,
            height: 44,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: palette.goldSurface,
              border: Border.all(color: palette.border),
              borderRadius: BorderRadius.circular(16),
            ),
            child: Icon(icon, color: palette.goldDeep),
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
                    // The chip repeats the category name (Дом/Работа/Другое)
                    // for context — but the create sheet pre-fills the title
                    // with that same word, so showing both when the user
                    // never customized the title just duplicates it.
                    if (address.title.trim().toLowerCase() !=
                        labelText.toLowerCase()) ...[
                      const SizedBox(width: 6),
                      _RecurringBookingChip(icon: icon, label: labelText),
                    ],
                  ],
                ),
                const SizedBox(height: 3),
                Text(
                  address.addressText,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    color: palette.textSecondary,
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
                  icon: Icon(
                    Icons.delete_outline_rounded,
                    color: palette.danger,
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
    final palette = context.palette;
    final l10n = AppLocalizations.of(context);
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
              color: blocked ? palette.dangerSoft : palette.goldSurface,
              border: Border.all(color: palette.border),
              borderRadius: BorderRadius.circular(16),
            ),
            child: Icon(
              blocked ? Icons.block_rounded : Icons.star_rounded,
              color: blocked ? palette.danger : palette.goldDeep,
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  (preference.driverName ?? '').isEmpty
                      ? l10n.driverProfileNameFallback
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
                    style: TextStyle(
                      color: palette.textSecondary,
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
                  tooltip: l10n.deleteButton,
                  icon: Icon(
                    Icons.close_rounded,
                    color: palette.textSecondary,
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
    final palette = context.palette;
    final l10n = AppLocalizations.of(context);
    return SafeArea(
      top: false,
      child: Container(
        margin: const EdgeInsets.all(12),
        padding: const EdgeInsets.fromLTRB(20, 16, 20, 20),
        decoration: BoxDecoration(
          color: palette.card,
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
            Center(
              child: _SheetHandle(
                  dark: Theme.of(context).brightness == Brightness.dark)),
            const SizedBox(height: 14),
            Text(
              l10n.passengerMarkDriverTitle,
              style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w900),
            ),
            const SizedBox(height: 14),
            if (widget.candidates.isEmpty)
              _InlineMessage(
                text: l10n.passengerNoTripDriversText,
                dark: Theme.of(context).brightness == Brightness.dark,
              )
            else ...[
              Container(
                decoration: BoxDecoration(
                  border: Border.all(color: palette.border),
                  borderRadius: BorderRadius.circular(16),
                ),
                padding: const EdgeInsets.symmetric(horizontal: 12),
                child: DropdownButtonHideUnderline(
                  child: DropdownButton<String>(
                    isExpanded: true,
                    value: _driverId,
                    hint: Text(l10n.passengerChooseDriverHint),
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
                  _SupportTopicChip(
                    label: l10n.passengerAddToFavoritesChip,
                    selected: _type == 'FAVORITE',
                    onTap: () => setState(() => _type = 'FAVORITE'),
                  ),
                  _SupportTopicChip(
                    label: l10n.passengerBlockDriverChip,
                    selected: _type == 'BLOCKED',
                    onTap: () => setState(() => _type = 'BLOCKED'),
                  ),
                ],
              ),
              const SizedBox(height: 16),
              _GoldCtaButton(
                enabled: !widget.submitting && _driverId != null,
                loading: widget.submitting,
                text: l10n.save,
                loadingText: l10n.savingLabel,
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
  late final _titleController = TextEditingController(
      text: _defaultTitleFor(AppLocalizations.of(context), 'HOME'));

  String _defaultTitleFor(AppLocalizations l10n, String label) {
    switch (label) {
      case 'HOME':
        return l10n.passengerFavoriteLabelHome;
      case 'WORK':
        return l10n.passengerFavoriteLabelWork;
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
    final palette = context.palette;
    final l10n = AppLocalizations.of(context);
    return SafeArea(
      top: false,
      child: Container(
        margin: const EdgeInsets.all(12),
        padding: const EdgeInsets.fromLTRB(20, 16, 20, 20),
        decoration: BoxDecoration(
          color: palette.card,
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
            Center(
              child: _SheetHandle(
                  dark: Theme.of(context).brightness == Brightness.dark)),
            const SizedBox(height: 14),
            Text(
              l10n.passengerAddToFavoritesTitle,
              style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w900),
            ),
            const SizedBox(height: 4),
            Text(
              widget.suggestion.label,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                color: palette.textSecondary,
                fontSize: 12.5,
                fontWeight: FontWeight.w600,
              ),
            ),
            const SizedBox(height: 14),
            Wrap(
              spacing: 8,
              children: [
                _SupportTopicChip(
                  label: l10n.passengerFavoriteLabelHome,
                  selected: _label == 'HOME',
                  onTap: () => setState(() {
                    _label = 'HOME';
                    _titleController.text = _defaultTitleFor(l10n, 'HOME');
                  }),
                ),
                _SupportTopicChip(
                  label: l10n.passengerFavoriteLabelWork,
                  selected: _label == 'WORK',
                  onTap: () => setState(() {
                    _label = 'WORK';
                    _titleController.text = _defaultTitleFor(l10n, 'WORK');
                  }),
                ),
                _SupportTopicChip(
                  label: l10n.passengerFavoriteLabelOther,
                  selected: _label == 'OTHER',
                  onTap: () => setState(() {
                    _label = 'OTHER';
                    _titleController.text = _defaultTitleFor(l10n, 'OTHER');
                  }),
                ),
              ],
            ),
            const SizedBox(height: 14),
            TextField(
              controller: _titleController,
              onChanged: (_) => setState(() {}),
              decoration: InputDecoration(
                labelText: l10n.passengerFavoriteNameLabel,
                hintText: l10n.passengerFavoriteNameHint,
              ),
            ),
            const SizedBox(height: 16),
            _GoldCtaButton(
              enabled: !widget.submitting &&
                  _titleController.text.trim().isNotEmpty,
              loading: widget.submitting,
              text: l10n.save,
              loadingText: l10n.savingLabel,
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
      setState(() => _error =
          AppLocalizations.of(context).passengerAddressSearchNotFoundError);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final l10n = AppLocalizations.of(context);
    return DraggableScrollableSheet(
      initialChildSize: 0.75,
      minChildSize: 0.5,
      maxChildSize: 0.95,
      expand: false,
      builder: (context, scrollController) {
        return Container(
          decoration: BoxDecoration(
            color: palette.card,
            borderRadius: const BorderRadius.vertical(top: Radius.circular(28)),
          ),
          padding: const EdgeInsets.fromLTRB(20, 14, 20, 0),
          child: Column(
            children: [
              Center(
              child: _SheetHandle(
                  dark: Theme.of(context).brightness == Brightness.dark)),
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
                  hintText: l10n.passengerAddressSearchHint,
                  prefixIcon: const Icon(Icons.search_rounded),
                  suffixIcon: _query.text.isEmpty
                      ? null
                      : IconButton(
                          icon: const Icon(Icons.close_rounded),
                          tooltip: l10n.passengerClearAction,
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
                            title: l10n.passengerSearchErrorTitle,
                            text: _error!,
                          )
                        : _results.isEmpty
                            ? EmptyState(
                                icon: Icons.location_searching_rounded,
                                title: _query.text.trim().length < 2
                                    ? l10n.passengerEnterAddressTitle
                                    : l10n.passengerFaqNoResultsTitle,
                                text: _query.text.trim().length < 2
                                    ? l10n.passengerStartTypingStreetText
                                    : l10n.passengerTryDifferentQueryText,
                              )
                            : ListView.builder(
                                controller: scrollController,
                                itemCount: _results.length,
                                itemBuilder: (context, index) {
                                  final item = _results[index];
                                  return ListTile(
                                    leading: Icon(
                                      Icons.place_rounded,
                                      color: palette.goldDeep,
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
  static Map<int, String> _dayLabels(AppLocalizations l10n) => {
        1: l10n.passengerDayMon,
        2: l10n.passengerDayTue,
        3: l10n.passengerDayWed,
        4: l10n.passengerDayThu,
        5: l10n.passengerDayFri,
      };

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
    final l10n = AppLocalizations.of(context);
    final result = await showModalBottomSheet<AddressSuggestion>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => _SimpleAddressSearchSheet(
        api: widget.api,
        title: pickup
            ? l10n.passengerPickupPointTitle
            : l10n.passengerDropoffPointTitle,
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
    final l10n = AppLocalizations.of(context);
    final driverId = _driverId;
    final pickup = _pickup;
    final dropoff = _dropoff;
    final time = _time;
    final price = int.tryParse(_priceController.text.trim());
    if (driverId == null) {
      setState(() => _error = l10n.passengerRecurringErrorChooseDriver);
      return;
    }
    if (pickup == null || dropoff == null) {
      setState(() => _error = l10n.passengerRecurringErrorAddresses);
      return;
    }
    if (_days.isEmpty) {
      setState(() => _error = l10n.passengerRecurringErrorDays);
      return;
    }
    if (time == null) {
      setState(() => _error = l10n.passengerRecurringErrorTime);
      return;
    }
    if (price == null || price < 200 || price > 1000000) {
      setState(() => _error = l10n.passengerRecurringErrorPrice);
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
          final palette = context.palette;
          final l10n = AppLocalizations.of(context);
          return Container(
            decoration: BoxDecoration(
              color: palette.card,
              borderRadius:
                  const BorderRadius.vertical(top: Radius.circular(28)),
            ),
            padding: const EdgeInsets.fromLTRB(20, 14, 20, 20),
            child: ListView(
              controller: scrollController,
              children: [
                Stack(
                  alignment: Alignment.center,
                  children: [
                    Center(
                        child: _SheetHandle(
                            dark: Theme.of(context).brightness ==
                                Brightness.dark)),
                    Positioned(
                      right: 0,
                      child: IconButton(
                        onPressed: () => Navigator.pop(context),
                        icon: Icon(Icons.close_rounded,
                            color: palette.textSecondary),
                      ),
                    ),
                  ],
                ),
                Text(
                  l10n.passengerNewRecurringRouteTitle,
                  style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w900),
                ),
                const SizedBox(height: 4),
                Text(
                  l10n.passengerRecurringRouteExampleText,
                  style: TextStyle(
                    color: palette.textSecondary,
                    fontSize: 12.5,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                const SizedBox(height: 16),
                Text(l10n.driverProfileNameFallback,
                    style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 13)),
                const SizedBox(height: 8),
                if (widget.knownDrivers.isEmpty)
                  _CompactNotice(
                    icon: Icons.info_outline_rounded,
                    title: l10n.passengerNoAvailableDriversTitle,
                    text: l10n.passengerNoAvailableDriversText,
                    dark: Theme.of(context).brightness == Brightness.dark,
                  )
                else
                  DropdownButtonFormField<String>(
                    initialValue: _driverId,
                    decoration: InputDecoration(
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(16),
                      ),
                      hintText: l10n.passengerChooseDriverHint,
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
                  label: l10n.passengerFromLabel,
                  value: _pickup?.label,
                  onTap: () => _pickAddress(pickup: true),
                ),
                const SizedBox(height: 10),
                _RecurringAddressField(
                  label: l10n.passengerToLabel,
                  value: _dropoff?.label,
                  onTap: () => _pickAddress(pickup: false),
                ),
                const SizedBox(height: 14),
                Text(l10n.passengerDaysOfWeekLabel,
                    style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 13)),
                const SizedBox(height: 8),
                Wrap(
                  spacing: 8,
                  children: _dayLabels(l10n).entries.map((entry) {
                    final selected = _days.contains(entry.key);
                    return _SupportTopicChip(
                      label: entry.value,
                      selected: selected,
                      onTap: () => setState(() {
                        if (selected) {
                          _days.remove(entry.key);
                        } else {
                          _days.add(entry.key);
                        }
                      }),
                    );
                  }).toList(),
                ),
                const SizedBox(height: 14),
                Text(l10n.passengerPickupTimeLabel,
                    style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 13)),
                const SizedBox(height: 8),
                OutlinedButton.icon(
                  onPressed: _pickTime,
                  icon: const Icon(Icons.schedule_rounded),
                  label: Text(
                    _time == null
                        ? l10n.passengerChooseTimeButton
                        : '${_time!.hour.toString().padLeft(2, '0')}:${_time!.minute.toString().padLeft(2, '0')}',
                  ),
                ),
                const SizedBox(height: 14),
                TextField(
                  controller: _priceController,
                  keyboardType: TextInputType.number,
                  decoration: InputDecoration(
                    labelText: l10n.passengerPriceLabelTenge,
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
                    labelText: l10n.passengerDriverCommentLabel,
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(16),
                    ),
                  ),
                ),
                if (_error != null) ...[
                  const SizedBox(height: 10),
                  _InlineMessage(
                    text: _error!,
                    danger: true,
                    dark: Theme.of(context).brightness == Brightness.dark,
                  ),
                ],
                const SizedBox(height: 18),
                _GoldCtaButton(
                  enabled: !widget.submitting && widget.knownDrivers.isNotEmpty,
                  loading: widget.submitting,
                  text: l10n.passengerSendToDriverButton,
                  loadingText: l10n.passengerSendingButton,
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
    final palette = context.palette;
    final l10n = AppLocalizations.of(context);
    return Material(
      color: Colors.transparent,
      child: InkWell(
        borderRadius: BorderRadius.circular(16),
        onTap: onTap,
        child: Container(
          width: double.infinity,
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
          decoration: BoxDecoration(
            border: Border.all(color: palette.border),
            borderRadius: BorderRadius.circular(16),
          ),
          child: Row(
            children: [
              Icon(Icons.place_outlined, size: 18, color: palette.goldDeep),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      label,
                      style: TextStyle(
                        color: palette.textSecondary,
                        fontSize: 11,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    Text(
                      value ?? l10n.passengerChooseAddressText,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        color: value == null
                            ? palette.textMuted
                            : palette.text,
                        fontSize: 13.5,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ],
                ),
              ),
              Icon(Icons.chevron_right_rounded,
                  color: palette.textSecondary),
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
    this.avatarUrl,
  });

  final String name;
  final double size;
  final bool showStatusDot;
  // Driver's own camera-only photo (see driver_shell.dart's matching avatar
  // upload) — shown in place of the initials once a driver is assigned to
  // the order. Falls back to the initials on load failure or before any
  // photo was ever uploaded, same as the driver-side profile circle.
  final String? avatarUrl;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final trimmed = name.trim();
    final initial = trimmed.isEmpty ? '?' : trimmed[0].toUpperCase();
    return Stack(
      clipBehavior: Clip.none,
      children: [
        Container(
          width: size,
          height: size,
          alignment: Alignment.center,
          clipBehavior: Clip.antiAlias,
          decoration: BoxDecoration(
            gradient: LinearGradient(
              colors: [palette.gold, palette.goldDeep],
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
            ),
            borderRadius: BorderRadius.circular(size * 0.34),
            boxShadow: [
              BoxShadow(
                color: palette.gold.withValues(alpha: 0.30),
                blurRadius: 16,
                offset: const Offset(0, 8),
              ),
            ],
          ),
          child: avatarUrl == null
              ? Text(
                  initial,
                  style: TextStyle(
                    color: Colors.white,
                    fontSize: size * 0.365,
                    fontWeight: FontWeight.w800,
                  ),
                )
              : Image.network(
                  '${AppConfig.apiBaseUrl}$avatarUrl',
                  fit: BoxFit.cover,
                  width: size,
                  height: size,
                  errorBuilder: (context, error, stackTrace) => Text(
                    initial,
                    style: TextStyle(
                      color: Colors.white,
                      fontSize: size * 0.365,
                      fontWeight: FontWeight.w800,
                    ),
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
                color: context.palette.success,
                shape: BoxShape.circle,
                border: Border.all(color: context.palette.card, width: 3),
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
    final palette = context.palette;
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
                palette.successSoft,
                palette.success.withValues(alpha: 0.22),
                t,
              ),
              border: Border.all(
                color: palette.success.withValues(
                  alpha: 0.35 + t * 0.25,
                ),
                width: 1.2,
              ),
              borderRadius: BorderRadius.circular(14),
            ),
            child: child,
          );
        },
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(
              Icons.check_circle_rounded,
              size: 17,
              color: palette.success,
            ),
            const SizedBox(width: 7),
            Flexible(
              child: Text(
                'Водитель приехал и ждёт вас',
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  color: palette.success,
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
    final palette = context.palette;
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 12),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: [
            palette.gold.withValues(alpha: 0.14),
            palette.gold.withValues(alpha: 0.04),
          ],
        ),
        border: Border.all(color: palette.gold.withValues(alpha: 0.28)),
        borderRadius: BorderRadius.circular(14),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(
            Icons.timer_rounded,
            size: 16,
            color: palette.goldDeep,
          ),
          const SizedBox(width: 7),
          Flexible(
            child: Text(
              text,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                color: palette.goldDeep,
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
    this.distanceTraveledM,
  });

  final String pickup;
  final String dropoff;
  final ValueListenable<Duration> elapsedListenable;
  final bool elapsedReliable;
  final double? estimatedDurationMin;
  // Live, real GPS-accumulated distance for this trip so far (see
  // updateDriverLocation in routing.service.js) — null until the first
  // driver-location ping since the trip started arrives, distinct from 0
  // (a real update saying the driver hasn't moved yet).
  final int? distanceTraveledM;

  static String _progressLabel(
    AppLocalizations l10n,
    Duration elapsed,
    bool reliable,
    int? distanceTraveledM,
  ) {
    final kmText = distanceTraveledM == null
        ? null
        : '${(distanceTraveledM / 1000).toStringAsFixed(1)} км';
    // Seeded from an order that was already in progress when we first saw
    // it this session (app resumed mid-trip) — we don't actually know how
    // long it's been running, so don't claim it "just started".
    if (!reliable) {
      return kmText == null
          ? l10n.passengerTripInTransitLabel
          : '$kmText · ${l10n.passengerEnRouteLowercase}';
    }
    final minutes = elapsed.inMinutes;
    final timeText = minutes <= 0
        ? l10n.passengerJustStartedLowercase
        : l10n.passengerMinutesEnRoute(minutes);
    if (kmText == null) {
      return minutes <= 0 ? l10n.passengerJustStartedCapitalized : timeText;
    }
    return '$kmText · $timeText';
  }

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final l10n = AppLocalizations.of(context);
    return Container(
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 16),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [
            palette.gold.withValues(alpha: 0.12),
            palette.gold.withValues(alpha: 0.02),
          ],
        ),
        border: Border.all(color: palette.gold.withValues(alpha: 0.30)),
        borderRadius: BorderRadius.circular(24),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(
                Icons.directions_car_filled_rounded,
                color: palette.goldDeep,
                size: 19,
              ),
              const SizedBox(width: 7),
              Expanded(
                child: Text(
                  l10n.passengerHeadingToDropoffTitle,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    color: palette.goldDeep,
                    fontSize: 13,
                    fontWeight: FontWeight.w900,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 4),
          // Own row rather than crammed next to the title above: with the
          // live km appended ("2.4 км · 12 мин в пути" vs. just "12 мин в
          // пути" before), the combined text got long enough to risk
          // squeezing the title into a near-empty sliver on real device
          // widths — same class of bug fixed on the driver-found header
          // (see docs/status/mobile-driver-overnight-2026-07-15.md round 53).
          Padding(
            padding: const EdgeInsets.only(left: 26),
            child: ValueListenableBuilder<Duration>(
              valueListenable: elapsedListenable,
              builder: (context, elapsed, _) => Text(
                _progressLabel(l10n, elapsed, elapsedReliable, distanceTraveledM),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  color: palette.goldDeep,
                  fontSize: 12,
                  fontWeight: FontWeight.w800,
                  fontFeatures: const [FontFeature.tabularFigures()],
                ),
              ),
            ),
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
                        style: TextStyle(
                          color: palette.textSecondary,
                          fontSize: 13,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      Text(
                        dropoff,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          color: palette.text,
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
    final palette = context.palette;
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
                    border: Border.all(color: palette.card, width: 2),
                  ),
                ),
                Positioned(
                  top: 10,
                  bottom: 10,
                  child: Container(
                    width: 2,
                    color: palette.gold.withValues(alpha: 0.25),
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
                      color: palette.gold,
                      shape: BoxShape.circle,
                      boxShadow: [
                        BoxShadow(
                          color: palette.gold.withValues(alpha: 0.45),
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
                      color: palette.gold,
                      shape: BoxShape.circle,
                      border: Border.all(color: palette.card, width: 2),
                      boxShadow: [
                        BoxShadow(
                          color: palette.gold.withValues(alpha: 0.25),
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
    final palette = context.palette;
    final l10n = AppLocalizations.of(context);
    final token = shareToken;
    final enabled = token != null;
    return Tooltip(
      message: enabled
          ? l10n.passengerShareTripTooltipEnabled
          : l10n.passengerShareTripTooltipDisabled,
      child: Material(
        color: palette.goldSurface,
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
                    l10n.passengerShareTripMessage(routeSuffix, link),
                  ));
                },
          child: SizedBox(
            width: 34,
            height: 34,
            child: Icon(
              Icons.ios_share_rounded,
              color: enabled ? palette.goldDeep : palette.textMuted,
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
    final palette = context.palette;
    return Material(
      color: palette.dangerSoft,
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
        child: SizedBox(
          width: 34,
          height: 34,
          child: Icon(
            Icons.shield_outlined,
            color: palette.danger,
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
    final palette = context.palette;
    final l10n = AppLocalizations.of(context);
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return SafeArea(
      top: false,
      child: Container(
        margin: const EdgeInsets.all(12),
        padding: const EdgeInsets.fromLTRB(20, 16, 20, 20),
        decoration: BoxDecoration(
          color: palette.card,
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
            Center(child: _SheetHandle(dark: isDark)),
            const SizedBox(height: 14),
            Row(
              children: [
                Container(
                  width: 44,
                  height: 44,
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    color: palette.dangerSoft,
                    borderRadius: BorderRadius.circular(15),
                  ),
                  child: Icon(
                    Icons.shield_outlined,
                    color: palette.danger,
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Text(
                    l10n.passengerSafetyTitle,
                    style: TextStyle(
                      fontSize: 17,
                      fontWeight: FontWeight.w900,
                      color: palette.text,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 14),
            _SettingsRow(
              title: l10n.passengerCallPhoneLabel(sosPhone ?? '112'),
              text: l10n.passengerSosEmergencyLineText,
              danger: true,
              onTap: () {
                Navigator.pop(context);
                unawaited(_callEmergency());
                unawaited(_sendSosAlert());
              },
            ),
            Divider(height: 18, color: palette.border),
            _SettingsRow(
              title: l10n.passengerSupportWillBeNotifiedTitle,
              text: l10n.passengerSupportWillBeNotifiedText,
            ),
          ],
        ),
      ),
    );
  }
}

// Real chat-thread UI (like the Yandex-style driver chat) built entirely on
// the existing two-way quick-message endpoint — the backend has no free-text
// or persisted-conversation storage (see docs/status write-up for item 9's
// era investigation), so this is honestly a canned-phrase thread, not open
// text. Two message sources are merged into one timeline:
//  - sent: tracked locally for this screen's lifetime only (the send
//    endpoint doesn't echo back a stored row, so there's nothing server-side
//    to reload a "my sent messages" history from after a restart);
//  - received: read back from GET /api/notifications, filtered to this
//    order's QUICK_MESSAGE-type rows — notifyOrderClient/notifyOrderDriver
//    (notification.service.js) already persists every one of those with a
//    real created_at, so this half of the thread *does* survive reopening
//    the sheet (just not a fresh app cold-start, since sent-side still
//    isn't stored).
class _ChatEntry {
  const _ChatEntry({required this.text, required this.fromMe, required this.at});
  final String text;
  final bool fromMe;
  final DateTime at;
}

Map<String, String> _quickMessages(AppLocalizations l10n) => {
      'I_ARRIVED': l10n.quickMessageArrived,
      'WAITING_AT_ENTRANCE': l10n.quickMessageWaitingAtEntrance,
      'RUNNING_LATE_2MIN': l10n.quickMessageRunningLate2Min,
      'PLEASE_COME_OUT': l10n.quickMessagePleaseComeOut,
      'ON_MY_WAY': l10n.quickMessageOnMyWay,
    };

class _ChatSheet extends StatefulWidget {
  const _ChatSheet({
    required this.api,
    required this.orderId,
    required this.peerName,
  });

  final ApiClient api;
  final String orderId;
  final String peerName;

  @override
  State<_ChatSheet> createState() => _ChatSheetState();
}

class _ChatSheetState extends State<_ChatSheet> {
  final List<_ChatEntry> _sent = [];
  List<_ChatEntry> _received = const [];
  String? _sendingKey;
  bool _loading = true;
  Timer? _pollTimer;

  @override
  void initState() {
    super.initState();
    unawaited(_load());
    _pollTimer = Timer.periodic(const Duration(seconds: 6), (_) => _load());
  }

  @override
  void dispose() {
    _pollTimer?.cancel();
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final result = await widget.api.getNotifications(limit: 50);
      if (!mounted) return;
      setState(() {
        _received = result.notifications
            .where((n) => n.type == 'QUICK_MESSAGE' && n.orderId == widget.orderId)
            .map((n) => _ChatEntry(text: n.body, fromMe: false, at: n.createdAt))
            .toList();
        _loading = false;
      });
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _send(String key, String text) async {
    setState(() => _sendingKey = key);
    try {
      await widget.api
          .sendQuickMessage(orderId: widget.orderId, messageKey: key);
      if (!mounted) return;
      setState(() {
        _sent.add(_ChatEntry(text: text, fromMe: true, at: DateTime.now()));
        _sendingKey = null;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() => _sendingKey = null);
      AppToast.showError(
          context, AppLocalizations.of(context).passengerChatSendFailedError);
    }
  }

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final l10n = AppLocalizations.of(context);
    final quickMessages = _quickMessages(l10n);
    final thread = [..._sent, ..._received]
      ..sort((a, b) => a.at.compareTo(b.at));
    return SafeArea(
      top: false,
      child: Container(
        margin: const EdgeInsets.all(12),
        height: MediaQuery.sizeOf(context).height * 0.72,
        padding: const EdgeInsets.fromLTRB(18, 14, 18, 14),
        decoration: BoxDecoration(
          color: palette.card,
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
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Center(
              child: _SheetHandle(
                  dark: Theme.of(context).brightness == Brightness.dark)),
            const SizedBox(height: 10),
            Text(
              widget.peerName.trim().isEmpty
                  ? l10n.passengerChatFallbackTitle
                  : widget.peerName.trim(),
              style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w900),
            ),
            const SizedBox(height: 2),
            Text(
              l10n.passengerChatQuickPhrasesNotice,
              style: TextStyle(
                color: palette.textSecondary,
                fontSize: 11.5,
                fontWeight: FontWeight.w600,
              ),
            ),
            const SizedBox(height: 10),
            Expanded(
              child: _loading
                  ? const Center(child: CircularProgressIndicator())
                  : thread.isEmpty
                      ? Center(
                          child: Text(
                            l10n.passengerChatEmptyText,
                            style: TextStyle(
                              color: palette.textSecondary,
                              fontSize: 13,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                        )
                      : ListView.builder(
                          reverse: true,
                          itemCount: thread.length,
                          itemBuilder: (context, index) {
                            final entry = thread[thread.length - 1 - index];
                            return _ChatBubble(entry: entry);
                          },
                        ),
            ),
            const SizedBox(height: 10),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: quickMessages.entries.map((entry) {
                final sending = _sendingKey == entry.key;
                return OutlinedButton(
                  onPressed:
                      _sendingKey != null ? null : () => _send(entry.key, entry.value),
                  style: OutlinedButton.styleFrom(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                    minimumSize: Size.zero,
                    tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                  ),
                  child: sending
                      ? const SizedBox(
                          width: 14,
                          height: 14,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : Text(entry.value, style: const TextStyle(fontSize: 12.5)),
                );
              }).toList(),
            ),
          ],
        ),
      ),
    );
  }
}

class _ChatBubble extends StatelessWidget {
  const _ChatBubble({required this.entry});

  final _ChatEntry entry;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final time =
        '${entry.at.hour.toString().padLeft(2, '0')}:${entry.at.minute.toString().padLeft(2, '0')}';
    return Align(
      alignment: entry.fromMe ? Alignment.centerRight : Alignment.centerLeft,
      child: Container(
        margin: const EdgeInsets.only(bottom: 8),
        constraints: BoxConstraints(
          maxWidth: MediaQuery.sizeOf(context).width * 0.68,
        ),
        padding: const EdgeInsets.symmetric(horizontal: 13, vertical: 9),
        decoration: BoxDecoration(
          color: entry.fromMe ? palette.gold : palette.goldPale,
          borderRadius: BorderRadius.only(
            topLeft: const Radius.circular(16),
            topRight: const Radius.circular(16),
            bottomLeft: Radius.circular(entry.fromMe ? 16 : 4),
            bottomRight: Radius.circular(entry.fromMe ? 4 : 16),
          ),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.end,
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              entry.text,
              style: TextStyle(
                color: entry.fromMe ? Colors.white : palette.text,
                fontSize: 13.5,
                fontWeight: FontWeight.w700,
              ),
            ),
            const SizedBox(height: 3),
            Text(
              time,
              style: TextStyle(
                color: entry.fromMe
                    ? Colors.white.withValues(alpha: 0.75)
                    : palette.textSecondary,
                fontSize: 9.5,
                fontWeight: FontWeight.w700,
                fontFeatures: const [FontFeature.tabularFigures()],
              ),
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
    required this.api,
    required this.orderId,
    this.compact = false,
    this.avatarUrl,
  });

  final String name;
  final double? rating;
  final String? carModel;
  final String? carColor;
  final String? plate;
  final String? phone;
  final ApiClient api;
  final String orderId;
  final bool compact;
  final String? avatarUrl;

  Future<void> _call() async {
    final number = phone?.trim();
    if (number == null || number.isEmpty) return;
    await launchUrl(Uri(scheme: 'tel', path: number));
  }

  void _openChat(BuildContext context) {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => _ChatSheet(api: api, orderId: orderId, peerName: name),
    );
  }

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final l10n = AppLocalizations.of(context);
    final displayName =
        name.trim().isEmpty ? l10n.driverProfileNameFallback : name.trim();
    final hasPhone = (phone ?? '').trim().isNotEmpty;
    if (compact) {
      return Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        decoration: BoxDecoration(
          color: palette.card,
          border: Border.all(color: palette.border),
          borderRadius: BorderRadius.circular(18),
        ),
        child: Row(
          children: [
            _InitialsAvatar(
                name: displayName,
                size: 38,
                showStatusDot: false,
                avatarUrl: avatarUrl),
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
                          style: TextStyle(
                            color: palette.text,
                            fontSize: 14,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                      ),
                      if (rating != null) ...[
                        const SizedBox(width: 5),
                        Icon(
                          Icons.star_rounded,
                          color: palette.gold,
                          size: 14,
                        ),
                        Text(
                          rating!.toStringAsFixed(1),
                          style: TextStyle(
                            color: palette.textSecondary,
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
                      style: TextStyle(
                        color: palette.textSecondary,
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
                icon: Icons.chat_bubble_rounded,
                onTap: () => _openChat(context),
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
        color: palette.card,
        border: Border.all(color: palette.border),
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
                child: _InitialsAvatar(name: displayName, avatarUrl: avatarUrl),
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
                            style: TextStyle(
                              color: palette.text,
                              fontSize: 15.5,
                              fontWeight: FontWeight.w800,
                            ),
                          ),
                        ),
                        if (rating != null) ...[
                          const SizedBox(width: 6),
                          Icon(
                            Icons.star_rounded,
                            color: palette.gold,
                            size: 16,
                          ),
                          const SizedBox(width: 2),
                          Text(
                            rating!.toStringAsFixed(1),
                            style: TextStyle(
                              color: palette.textSecondary,
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
                        style: TextStyle(
                          color: palette.textSecondary,
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
                          color: palette.goldSurface,
                          border: Border.all(color: palette.border),
                          borderRadius: BorderRadius.circular(6),
                        ),
                        child: Text(
                          plate!.trim(),
                          style: TextStyle(
                            color: palette.text,
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
                    onPressed: () => _openChat(context),
                    icon: const Icon(Icons.chat_bubble_rounded, size: 18),
                    label: Text(
                      l10n.messageButton,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      softWrap: false,
                    ),
                    style: OutlinedButton.styleFrom(
                      minimumSize: const Size.fromHeight(48),
                      padding: const EdgeInsets.symmetric(horizontal: 6),
                    ),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: ElevatedButton.icon(
                    onPressed: _call,
                    icon: const Icon(Icons.call_rounded, size: 18),
                    label: Text(
                      l10n.callButton,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      softWrap: false,
                    ),
                    style: ElevatedButton.styleFrom(
                      minimumSize: const Size.fromHeight(48),
                      padding: const EdgeInsets.symmetric(horizontal: 6),
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
    final palette = context.palette;
    return Material(
      color: filled ? palette.gold : palette.goldSurface,
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
            color: filled ? Colors.white : palette.goldDeep,
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
                        // Blue/white design system accent (docs/design/
                        // BLUE_WHITE_DESIGN_SYSTEM_2026-07-15.md) — migrated
                        // opportunistically while redesigning this screen,
                        // not a blanket app-wide repaint.
                        color: _blueAccent.withValues(alpha: 0.18),
                        shape: BoxShape.circle,
                      ),
                    ),
                  ),
                ),
                Container(
                  width: 12,
                  height: 12,
                  decoration: BoxDecoration(
                    color: _blueAccent,
                    shape: BoxShape.circle,
                    boxShadow: [
                      BoxShadow(
                        color: _blueAccent.withValues(alpha: 0.27),
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

  static List<(String, IconData)> _items(AppLocalizations l10n) => [
        (l10n.passengerSearchStepCheckingDrivers, Icons.near_me_rounded),
        (l10n.passengerSearchStepWaitingConfirmation, Icons.timer_outlined),
        (l10n.passengerSearchStepLockingFirst, Icons.verified_rounded),
      ];

  @override
  State<_SearchProgressRows> createState() => _SearchProgressRowsState();
}

class _SearchProgressRowsState extends State<_SearchProgressRows> {
  static const _stepCount = 3;
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
      if (_activeIndex >= _stepCount - 1) {
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
    final palette = context.palette;
    final l10n = AppLocalizations.of(context);
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final items = _SearchProgressRows._items(l10n);
    return Container(
      padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
      decoration: BoxDecoration(
        color: isDark ? _blueAccent.withValues(alpha: 0.14) : _blueSurface,
        border: Border.all(
          color: isDark ? _blueAccent.withValues(alpha: 0.4) : _blueBorder,
        ),
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
                        ? _blueAccent
                        : i < _activeIndex
                            ? _blueAccent.withValues(alpha: 0.16)
                            : (isDark
                                ? Colors.white.withValues(alpha: 0.06)
                                : Colors.white),
                    shape: BoxShape.circle,
                    border: Border.all(
                      color: i <= _activeIndex
                          ? _blueAccent
                          : palette.borderStrong,
                    ),
                    boxShadow: i == _activeIndex
                        ? [
                            BoxShadow(
                              color: _blueAccent.withValues(alpha: 0.2),
                              blurRadius: 10,
                              offset: const Offset(0, 4),
                            ),
                          ]
                        : null,
                  ),
                  child: Icon(
                    i < _activeIndex ? Icons.check_rounded : items[i].$2,
                    size: 15,
                    color: i == _activeIndex ? Colors.white : _blueAccent,
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: AnimatedDefaultTextStyle(
                    duration: const Duration(milliseconds: 220),
                    style: TextStyle(
                      color: i <= _activeIndex
                          ? palette.text
                          : palette.textSecondary,
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
    final palette = context.palette;
    final l10n = AppLocalizations.of(context);
    return Container(
      padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
      decoration: BoxDecoration(
        color: palette.goldSurface,
        border: Border.all(color: palette.border),
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
                _TripRouteMiniLine(label: l10n.passengerFromLabel, value: pickup),
                Divider(height: 15, color: palette.border),
                _TripRouteMiniLine(label: l10n.passengerToLabel, value: dropoff),
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
    final palette = context.palette;
    return Row(
      children: [
        SizedBox(
          width: 62,
          child: Text(
            label,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(
              color: palette.textSecondary,
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
            style: TextStyle(
              color: palette.text,
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
    final palette = context.palette;
    return Container(
      constraints: const BoxConstraints(minHeight: 56),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 9),
      decoration: BoxDecoration(
        color: emphasis ? palette.goldSurface : palette.card,
        border: Border.all(
          color: emphasis ? palette.borderStrong : palette.border,
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
            style: TextStyle(
              color: palette.textSecondary,
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
              color: emphasis ? palette.goldDeep : palette.text,
              fontSize: 13.5,
              height: 1,
              fontWeight: FontWeight.w900,
              // Prices/distances live here — tabular figures keep digit
              // width uniform so the pill doesn't reflow as a value updates.
              fontFeatures: const [FontFeature.tabularFigures()],
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
        _error = AppLocalizations.of(context).passengerAddressSearchError;
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
    final palette = context.palette;
    final l10n = AppLocalizations.of(context);
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return ClipRRect(
      borderRadius: const BorderRadius.vertical(top: Radius.circular(28)),
      child: ColoredBox(
        color: palette.card,
        child: SafeArea(
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
                  _SheetHandle(dark: isDark),
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          widget.title,
                          style: TextStyle(
                            color: palette.text,
                            fontSize: 21,
                            height: 1.05,
                            fontWeight: FontWeight.w900,
                          ),
                        ),
                      ),
                      TextButton(
                        onPressed: () => Navigator.pop(context),
                        style: TextButton.styleFrom(
                          foregroundColor: palette.goldDeep,
                        ),
                        child: Text(
                          l10n.cancel,
                          style: const TextStyle(fontWeight: FontWeight.w900),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 12),
                  if ((widget.region ?? '').trim().isNotEmpty) ...[
                    Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 12, vertical: 8),
                      decoration: BoxDecoration(
                        color: palette.goldPale,
                        borderRadius: BorderRadius.circular(16),
                        border: Border.all(color: palette.border),
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(
                            Icons.location_city_rounded,
                            size: 16,
                            color: palette.goldDeep,
                          ),
                          const SizedBox(width: 7),
                          Text(
                            widget.region!,
                            style: TextStyle(
                              color: palette.text,
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
                    style: TextStyle(
                      color: palette.text,
                      fontSize: 15,
                      fontWeight: FontWeight.w700,
                    ),
                    textInputAction: TextInputAction.search,
                    onChanged: _onQueryChanged,
                    onSubmitted: _search,
                    decoration: InputDecoration(
                      hintText: widget.hint,
                      hintStyle: TextStyle(
                        color: palette.textMuted,
                        fontWeight: FontWeight.w700,
                      ),
                      prefixIcon: Icon(
                        Icons.search_rounded,
                        color: palette.textSecondary,
                      ),
                      filled: true,
                      fillColor: palette.appBackground,
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(20),
                        borderSide: BorderSide(color: palette.border),
                      ),
                      enabledBorder: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(20),
                        borderSide: BorderSide(color: palette.border),
                      ),
                      focusedBorder: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(20),
                        borderSide:
                            BorderSide(color: palette.gold, width: 1.8),
                      ),
                      contentPadding: const EdgeInsets.symmetric(
                          horizontal: 14, vertical: 15),
                      suffixIcon: _loading
                          ? Padding(
                              padding: const EdgeInsets.all(14),
                              child: SizedBox(
                                width: 18,
                                height: 18,
                                child: CircularProgressIndicator(
                                  strokeWidth: 2,
                                  color: palette.goldDeep,
                                ),
                              ),
                            )
                          : _query.text.isNotEmpty
                              ? IconButton(
                                  icon: Icon(
                                    Icons.close_rounded,
                                    color: palette.textMuted,
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
                    _InlineMessage(text: _error!, danger: true, dark: isDark),
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
                    _AddressEmptyHint(
                      title: l10n.passengerFaqNoResultsTitle,
                      text: l10n.passengerAddressNoResultsText,
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
    final palette = context.palette;
    final l10n = AppLocalizations.of(context);
    return Material(
      color: Colors.transparent,
      borderRadius: BorderRadius.circular(18),
      child: InkWell(
        borderRadius: BorderRadius.circular(18),
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
          decoration: BoxDecoration(
            color: palette.goldSurface,
            border: Border.all(color: palette.border),
            borderRadius: BorderRadius.circular(18),
          ),
          child: Row(
            children: [
              Container(
                width: 32,
                height: 32,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: palette.card,
                  shape: BoxShape.circle,
                ),
                child: Icon(
                  Icons.add_location_alt_rounded,
                  color: palette.goldDeep,
                  size: 19,
                ),
              ),
              const SizedBox(width: 11),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      l10n.passengerAddressPickOnMapTitle,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        color: palette.text,
                        fontSize: 13.2,
                        height: 1.05,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                    const SizedBox(height: 3),
                    Text(
                      l10n.passengerAddressPickOnMapSubtitle,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        color: palette.textSecondary,
                        fontSize: 11.2,
                        height: 1.05,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ],
                ),
              ),
              _SvgIcon(
                _iconChevronRight,
                size: 16,
                color: palette.goldDeep,
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
            style: TextStyle(
              color: context.palette.text,
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
  SmartTaxiPalette palette,
) {
  final query = (highlight ?? '').trim();
  if (query.length < 2) return TextSpan(text: label, style: baseStyle);
  final matchIndex = label.toLowerCase().indexOf(query.toLowerCase());
  if (matchIndex < 0) return TextSpan(text: label, style: baseStyle);
  final matchStyle = baseStyle.copyWith(
    color: palette.goldDeep,
    backgroundColor: palette.goldPale,
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
    final palette = context.palette;
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Material(
        color: palette.cardWarm,
        borderRadius: BorderRadius.circular(18),
        child: InkWell(
          borderRadius: BorderRadius.circular(18),
          onTap: onTap,
          child: Container(
            padding: const EdgeInsets.fromLTRB(12, 11, 10, 11),
            decoration: BoxDecoration(
              border: Border.all(color: palette.border),
              borderRadius: BorderRadius.circular(18),
            ),
            child: Row(
              children: [
                Container(
                  width: 36,
                  height: 36,
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    color: palette.goldPale,
                    shape: BoxShape.circle,
                  ),
                  child: Icon(
                    icon,
                    color: palette.goldDeep,
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
                          TextStyle(
                            fontWeight: FontWeight.w900,
                            fontSize: 14,
                            color: palette.text,
                          ),
                          palette,
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
                          style: TextStyle(
                            color: palette.textSecondary,
                            fontSize: 12,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ],
                    ],
                  ),
                ),
                Icon(Icons.chevron_right_rounded, color: palette.goldDeep),
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
    final palette = context.palette;
    return Container(
      padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
      decoration: BoxDecoration(
        color: palette.cardWarm,
        border: Border.all(color: palette.border),
        borderRadius: BorderRadius.circular(18),
      ),
      child: Row(
        children: [
          Container(
            width: 34,
            height: 34,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: palette.goldPale,
              shape: BoxShape.circle,
            ),
            child: Icon(
              Icons.manage_search_rounded,
              color: palette.goldDeep,
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
                  style: TextStyle(
                    color: palette.text,
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
                  style: TextStyle(
                    color: palette.textSecondary,
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
    final palette = context.palette;
    return Scaffold(
      backgroundColor: palette.appBackground,
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
                  decoration: BoxDecoration(
                    color: palette.goldPale,
                    shape: BoxShape.circle,
                  ),
                  child: Icon(
                    serviceDisabled
                        ? Icons.location_disabled_rounded
                        : Icons.location_off_rounded,
                    color: palette.goldDeep,
                    size: 42,
                  ),
                ),
                const SizedBox(height: 20),
                Text(
                  serviceDisabled
                      ? 'Включите геолокацию'
                      : 'Нет доступа к геолокации',
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    color: palette.text,
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
                  style: TextStyle(
                    color: palette.textSecondary,
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
    final palette = context.palette;
    return SafeArea(
      top: false,
      child: Container(
        margin: const EdgeInsets.fromLTRB(12, 0, 12, 12),
        padding: const EdgeInsets.fromLTRB(18, 12, 18, 18),
        decoration: BoxDecoration(
          color: palette.card,
          border: Border.all(color: palette.gold.withValues(alpha: 0.30)),
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
            _SheetHandle(dark: Theme.of(context).brightness == Brightness.dark),
            const SizedBox(height: 6),
            Row(
              crossAxisAlignment: CrossAxisAlignment.center,
              children: [
                Container(
                  width: 46,
                  height: 46,
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    color: palette.gold.withValues(alpha: 0.14),
                    shape: BoxShape.circle,
                    border: Border.all(
                      color: palette.gold.withValues(alpha: 0.34),
                    ),
                  ),
                  child: Icon(
                    Icons.my_location_rounded,
                    color: palette.gold,
                    size: 23,
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Text(
                    'Геолокация для подачи',
                    style: TextStyle(
                      color: palette.text,
                      fontSize: 21,
                      fontWeight: FontWeight.w800,
                      height: 1.05,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 10),
            Text(
              'Используем ваше местоположение только для точки подачи и расчёта маршрута. Можно выбрать точку на карте вручную.',
              style: TextStyle(
                color: palette.textSecondary,
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
                foregroundColor: palette.textSecondary,
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

// The tariff's Russian/English name comes from the backend (admin-configured
// per region) and is only ever used here to classify it into one of four
// known visual presentations -- title/description shown to the rider must
// come from AppLocalizations (via tariffTitleFor/tariffDescriptionFor below),
// never from this enum or the matched `tariff.name` itself.
enum _TariffVisualClass { economy, comfort, business, delivery }

class _PassengerTariffVisual {
  const _PassengerTariffVisual({
    required this.tariff,
    required this.classId,
    required this.asset,
  });

  final TariffOption tariff;
  final _TariffVisualClass classId;
  final String asset;
}

List<_PassengerTariffVisual> _passengerTariffVisuals(
  List<TariffOption> tariffs,
) {
  final byClass = <_TariffVisualClass, _PassengerTariffVisual>{};
  for (final tariff in tariffs) {
    final visual = _passengerTariffVisual(tariff);
    if (visual != null) {
      byClass.putIfAbsent(visual.classId, () => visual);
    }
  }
  return [
    if (byClass[_TariffVisualClass.economy] != null)
      byClass[_TariffVisualClass.economy]!,
    if (byClass[_TariffVisualClass.delivery] != null)
      byClass[_TariffVisualClass.delivery]!,
  ];
}

_PassengerTariffVisual? _passengerTariffVisual(TariffOption tariff) {
  final normalized = tariff.name.trim().toLowerCase();
  if (normalized.contains('econom') || normalized.contains('эконом')) {
    return _PassengerTariffVisual(
      tariff: tariff,
      classId: _TariffVisualClass.economy,
      asset: _tariffEconomyAsset,
    );
  }
  if (normalized.contains('comfort') || normalized.contains('комфорт')) {
    return _PassengerTariffVisual(
      tariff: tariff,
      classId: _TariffVisualClass.comfort,
      asset: _tariffComfortAsset,
    );
  }
  if (normalized.contains('business') || normalized.contains('бизнес')) {
    return _PassengerTariffVisual(
      tariff: tariff,
      classId: _TariffVisualClass.business,
      asset: _tariffBusinessAsset,
    );
  }
  if (normalized.contains('delivery') ||
      normalized.contains('доставка') ||
      normalized.contains('parcel')) {
    return _PassengerTariffVisual(
      tariff: tariff,
      classId: _TariffVisualClass.delivery,
      asset: _tariffDeliveryAsset,
    );
  }
  return null;
}

String _tariffTitleFor(AppLocalizations l10n, _TariffVisualClass classId) {
  switch (classId) {
    case _TariffVisualClass.economy:
      return l10n.tariffEconomyTitle;
    case _TariffVisualClass.comfort:
      return l10n.tariffComfortTitle;
    case _TariffVisualClass.business:
      return l10n.tariffBusinessTitle;
    case _TariffVisualClass.delivery:
      return l10n.tariffDeliveryTitle;
  }
}

String _formatTenge(num value) {
  final amount = value.round().toString();
  final spaced = amount.replaceAllMapped(
    RegExp(r'\B(?=(\d{3})+(?!\d))'),
    (_) => ' ',
  );
  return '$spaced ₸';
}

String _paymentLabel(AppLocalizations l10n, String method) {
  return {
        'CASH': l10n.paymentCash,
        'KASPI': l10n.paymentKaspi,
        'CARD': l10n.paymentCard,
      }[method.toUpperCase()] ??
      l10n.paymentCash;
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
    final l10n = AppLocalizations.of(context);
    final visibleTariffs = _passengerTariffVisuals(tariffs);
    final rideTariffs = visibleTariffs
        .where((v) => v.classId != _TariffVisualClass.delivery)
        .toList();
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
            title: l10n.passengerTariffSectionTitle,
            text: l10n.passengerTariffSectionText,
          ),
          const SizedBox(height: 10),
        ] else ...[
          Padding(
            padding: const EdgeInsets.only(left: 2, right: 2, bottom: 8),
            child: Row(
              children: [
                Expanded(
                  child: Text(
                    l10n.passengerTariffSectionTitle,
                    style: TextStyle(
                      color: context.palette.text,
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
                    color: context.palette.goldSurface,
                    borderRadius: BorderRadius.circular(999),
                    border: Border.all(color: context.palette.gold),
                  ),
                  child: Text(
                    l10n.passengerTariffFixedPriceBadge,
                    style: TextStyle(
                      color: context.palette.goldDeep,
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
            title: l10n.passengerTariffNotConfiguredTitle,
            text: l10n.passengerTariffNotConfiguredText,
            dark: dark,
          )
        else if (visibleTariffs.isEmpty)
          _CompactNotice(
            icon: Icons.local_taxi_outlined,
            title: l10n.passengerTariffUnavailableTitle,
            text: l10n.passengerTariffUnavailableText,
            dark: dark,
          )
        else
          // A horizontal carousel instead of a vertical list: every option
          // fits in one compact-height row (no more scrolling several
          // 92px-tall cards inside an already height-constrained sheet to
          // even see them all), and a partially-visible next card is the
          // standard "there's more here" cue — a rider isn't left assuming
          // one card is the only option. When the cards fit the sheet width
          // without scrolling, stretch them to fill it instead of leaving
          // dead space after the last card.
          LayoutBuilder(
            builder: (context, constraints) {
              const cardWidth = 118.0;
              const gap = 8.0;
              final naturalWidth = visibleTariffs.length * cardWidth +
                  (visibleTariffs.length - 1) * gap;
              final stretch = naturalWidth <= constraints.maxWidth;
              // The stretch (icon-left, text-right) layout is much shorter
              // than the stacked (icon-above-text) layout the scrollable
              // case uses — sharing one fixed height between both left the
              // stretch cards centered in a box roughly 50px taller than
              // their content, i.e. visible dead space above and below.
              return SizedBox(
                height: stretch ? 88 : 132,
                child: stretch
                    ? Row(
                        children: [
                          for (var index = 0;
                              index < visibleTariffs.length;
                              index++) ...[
                            if (index != 0) const SizedBox(width: gap),
                            Expanded(
                              child: _TariffCard(
                                item: visibleTariffs[index],
                                selected:
                                    visibleTariffs[index].tariff.id ==
                                        selectedId,
                                estimate:
                                    estimates[visibleTariffs[index].tariff.id],
                                onTap: () =>
                                    onSelect(visibleTariffs[index].tariff.id),
                                dark: dark,
                                bestValue: visibleTariffs[index].tariff.id ==
                                    bestValueTariffId,
                                stretch: true,
                              ),
                            ),
                          ],
                        ],
                      )
                    : ListView.separated(
                        scrollDirection: Axis.horizontal,
                        physics: const BouncingScrollPhysics(),
                        itemCount: visibleTariffs.length,
                        separatorBuilder: (_, __) => const SizedBox(width: gap),
                        itemBuilder: (context, index) {
                          final item = visibleTariffs[index];
                          return _TariffCard(
                            item: item,
                            selected: item.tariff.id == selectedId,
                            estimate: estimates[item.tariff.id],
                            onTap: () => onSelect(item.tariff.id),
                            dark: dark,
                            bestValue: item.tariff.id == bestValueTariffId,
                          );
                        },
                      ),
              );
            },
          ),
      ],
    );
  }
}

class _TariffCard extends StatelessWidget {
  const _TariffCard({
    required this.item,
    required this.selected,
    required this.estimate,
    required this.onTap,
    required this.dark,
    this.bestValue = false,
    this.stretch = false,
  });

  final _PassengerTariffVisual item;
  final bool selected;
  final RoutePreview? estimate;
  final VoidCallback onTap;
  final bool dark;
  final bool bestValue;
  final bool stretch;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final l10n = AppLocalizations.of(context);
    final isDelivery = item.classId == _TariffVisualClass.delivery;
    final price = estimate?.estimatedPrice;
    final iconBox = Container(
      height: stretch ? 52 : 48,
      width: stretch ? 52 : double.infinity,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        gradient: dark
            ? LinearGradient(
                begin: Alignment.topCenter,
                end: Alignment.bottomCenter,
                colors: selected
                    ? [
                        palette.goldSurface,
                        Color.lerp(palette.goldSurface, Colors.black, 0.28)!,
                      ]
                    : [
                        Colors.white.withValues(alpha: 0.08),
                        Colors.white.withValues(alpha: 0.03),
                      ],
              )
            : LinearGradient(
                begin: Alignment.topCenter,
                end: Alignment.bottomCenter,
                colors: selected
                    ? [SmartTaxiColors.goldSurface, Colors.white]
                    : [const Color(0xfffbfbfb), const Color(0xfff5f6f8)],
              ),
        borderRadius: BorderRadius.circular(13),
        border: Border.all(
          color: selected ? palette.borderStrong : palette.border,
        ),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: dark ? 0.22 : 0.05),
            blurRadius: 8,
            offset: const Offset(0, 3),
          ),
        ],
      ),
      child: item.asset.isEmpty
          ? (isDelivery
              // Full-color illustration, not tinted through _SvgIcon — a
              // flat single-color glyph looked cheap next to the real photo
              // renders on the other cards. This has its own shading, so it
              // needs to render at roughly the same visual weight as those.
              ? SvgPicture.asset(
                  _iconDeliveryVan,
                  width: stretch ? 46 : 58,
                  height: stretch ? 34 : 42,
                  fit: BoxFit.contain,
                )
              : _SvgIcon(_iconCar, size: 24, color: palette.goldDeep))
          : Image.asset(
              item.asset,
              width: stretch ? 46 : 58,
              height: stretch ? 34 : 42,
              // Comfort/Business car photos are raw exports (650KB-1.3MB,
              // full camera resolution) shown at under 60px here -- decoding
              // at that source size for every tariff card is wasted work on
              // a screen that's already busy. ~3x the rendered size keeps it
              // sharp on high-DPI screens without the full decode cost.
              cacheWidth: ((stretch ? 46 : 58) * 3).round(),
              cacheHeight: ((stretch ? 34 : 42) * 3).round(),
              fit: BoxFit.contain,
              filterQuality: FilterQuality.high,
              errorBuilder: (_, __, ___) => _SvgIcon(
                isDelivery ? _iconDelivery : _iconCar,
                size: 24,
                color: palette.goldDeep,
              ),
            ),
    );
    final titleText = Text(
      _tariffTitleFor(l10n, item.classId),
      maxLines: 1,
      overflow: TextOverflow.ellipsis,
      style: TextStyle(
        color: palette.textSecondary,
        fontSize: 11.5,
        height: 1.1,
        fontWeight: FontWeight.w800,
      ),
    );
    final priceText = Text(
      price == null ? '...' : _formatTenge(price),
      maxLines: 1,
      overflow: TextOverflow.ellipsis,
      style: TextStyle(
        color: palette.text,
        fontSize: 16.5,
        height: 1.05,
        fontWeight: FontWeight.w900,
        letterSpacing: -0.2,
        fontFeatures: const [FontFeature.tabularFigures()],
      ),
    );
    final bestValueBadge = bestValue
        ? Container(
            padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
            decoration: BoxDecoration(
              color: palette.success.withValues(alpha: dark ? 0.22 : 0.12),
              borderRadius: BorderRadius.circular(999),
            ),
            child: Text(
              l10n.passengerTariffBestValueBadge,
              style: TextStyle(
                color: palette.success,
                fontSize: 9.5,
                height: 1,
                fontWeight: FontWeight.w900,
              ),
            ),
          )
        : null;
    // Stretch (wide, one-or-two-tariff) cards use a horizontal layout —
    // icon on the left, text to its right — instead of the same centered
    // vertical stack the narrow scrollable cards use. A vertical stack
    // stretched to ~150dp+ left the icon centered but the text left-aligned
    // below it, an unbalanced mismatch that read as sloppy on wide cards.
    final content = stretch
        ? Row(
            children: [
              iconBox,
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    titleText,
                    const SizedBox(height: 3),
                    priceText,
                    if (bestValueBadge != null) ...[
                      const SizedBox(height: 5),
                      bestValueBadge,
                    ],
                  ],
                ),
              ),
            ],
          )
        : Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              iconBox,
              const SizedBox(height: 9),
              titleText,
              const SizedBox(height: 2),
              priceText,
              if (bestValueBadge != null) ...[
                const SizedBox(height: 6),
                bestValueBadge,
              ],
            ],
          );
    return Material(
      color: Colors.transparent,
      borderRadius: BorderRadius.circular(20),
      child: InkWell(
        borderRadius: BorderRadius.circular(20),
        onTap: onTap,
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 180),
          curve: Curves.easeOutCubic,
          width: stretch ? null : 122,
          padding: EdgeInsets.fromLTRB(12, stretch ? 11 : 12, 12, stretch ? 11 : 11),
          decoration: BoxDecoration(
            color: dark
                ? (selected ? null : Colors.white.withValues(alpha: 0.06))
                : (selected ? null : Colors.white),
            gradient: selected
                ? LinearGradient(
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                    colors: dark
                        ? [
                            palette.gold.withValues(alpha: 0.20),
                            Colors.white.withValues(alpha: 0.05),
                          ]
                        : [
                            SmartTaxiColors.gold.withValues(alpha: 0.12),
                            SmartTaxiColors.gold.withValues(alpha: 0.03),
                          ],
                  )
                : null,
            // No checkmark badge anymore — the border + glow below is the
            // only selection cue, so it needs to read clearly on its own:
            // a visibly thicker ring, not just a color swap.
            border: Border.all(
              color: selected
                  ? palette.gold
                  : (dark
                      ? Colors.white.withValues(alpha: 0.10)
                      : SmartTaxiColors.border),
              width: selected ? 2.2 : 1,
            ),
            borderRadius: BorderRadius.circular(20),
            boxShadow: [
              if (selected)
                BoxShadow(
                  color: palette.gold.withValues(alpha: dark ? 0.35 : 0.28),
                  blurRadius: 20,
                  offset: const Offset(0, 8),
                ),
              if (!selected)
                BoxShadow(
                  color: Colors.black.withValues(alpha: dark ? 0.28 : 0.04),
                  blurRadius: 10,
                  offset: const Offset(0, 4),
                ),
            ],
          ),
          child: content,
        ),
      ),
    );
  }
}

class _TariffSkeleton extends StatelessWidget {
  const _TariffSkeleton({this.dark = false});

  final bool dark;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.only(left: 4, bottom: 8),
          child: Text(
            'Выберите тариф',
            style: TextStyle(
              color: palette.text,
              fontSize: 14.2,
              fontWeight: FontWeight.w800,
            ),
          ),
        ),
        SizedBox(
          height: 132,
          child: ListView.separated(
            scrollDirection: Axis.horizontal,
            physics: const NeverScrollableScrollPhysics(),
            itemCount: 3,
            separatorBuilder: (_, __) => const SizedBox(width: 8),
            itemBuilder: (context, i) => Container(
              width: 118,
              padding: const EdgeInsets.fromLTRB(10, 9, 10, 9),
              decoration: BoxDecoration(
                color: dark
                    ? Colors.white.withValues(alpha: 0.06)
                    : Colors.white,
                border: Border.all(
                  color: dark
                      ? Colors.white.withValues(alpha: 0.08)
                      : SmartTaxiColors.border,
                ),
                borderRadius: BorderRadius.circular(20),
              ),
              child: const Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  _SkeletonLine(
                      width: double.infinity, height: 44, radius: 13),
                  SizedBox(height: 9),
                  _SkeletonLine(width: 70, height: 12),
                  SizedBox(height: 6),
                  _SkeletonLine(width: 56, height: 12),
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
    final palette = context.palette;
    final hint = currentPrice > basePrice
        ? 'Быстрее найдём водителя'
        : currentPrice < basePrice
            ? 'Может занять больше времени'
            : 'Обычная скорость подачи';
    return Container(
      padding: const EdgeInsets.fromLTRB(14, 11, 10, 11),
      decoration: BoxDecoration(
        color: palette.card,
        // Matches _PaymentMethodRow right below it — both are supplementary
        // order-config rows and previously disagreed (faint gray border
        // here vs. the bold blue border there), which read as unfinished.
        border: Border.fromBorderSide(
          BorderSide(color: palette.borderStrong),
        ),
        borderRadius: const BorderRadius.all(Radius.circular(18)),
        boxShadow: _cardShadow,
      ),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Ваша цена',
                  style: TextStyle(
                    color: palette.text,
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
                  style: TextStyle(
                    color: palette.textSecondary,
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
            // 66 clipped digits mid-number on realistic values — _maxPrice
            // is 1,000,000, formatted as "1 000 000 ₸" (11 chars), which
            // never fit 66px at this size even before three-digit fares.
            width: 96,
            child: Text(
              _formatTenge(currentPrice),
              textAlign: TextAlign.center,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                color: palette.text,
                fontSize: 14.5,
                fontWeight: FontWeight.w900,
                fontFeatures: const [FontFeature.tabularFigures()],
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
    final palette = context.palette;
    final enabled = onTap != null;
    return Material(
      color: palette.goldSurface.withValues(alpha: enabled ? 1 : 0.5),
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
            color: enabled ? palette.goldDeep : palette.textMuted,
          ),
        ),
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
    final palette = context.palette;
    return AnimatedOpacity(
      duration: const Duration(milliseconds: 180),
      opacity: enabled ? 1 : 0.56,
      child: Container(
        height: 52,
        padding: const EdgeInsets.symmetric(horizontal: 13),
        decoration: BoxDecoration(
          color: palette.card,
          border: Border.fromBorderSide(
            BorderSide(color: palette.borderStrong),
          ),
          borderRadius: const BorderRadius.all(Radius.circular(18)),
          boxShadow: _cardShadow,
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
                    Text(
                      'Способ оплаты',
                      style: TextStyle(
                        color: palette.textSecondary,
                        fontSize: 10.8,
                        height: 1,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      label,
                      style: TextStyle(
                        color: palette.text,
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
                color: enabled ? palette.text : palette.textMuted,
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
    final palette = context.palette;
    return Container(
      width: 32,
      height: 32,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: palette.goldSurface,
        border: Border.all(color: palette.borderStrong),
        borderRadius: BorderRadius.circular(13),
      ),
      child: _SvgIcon(icon, color: palette.goldDeep, size: 18),
    );
  }
}

class _RegionConfirmSheet extends StatelessWidget {
  const _RegionConfirmSheet({required this.region});

  final RegionOption region;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    return SafeArea(
      top: false,
      child: Container(
        margin: const EdgeInsets.all(12),
        padding: const EdgeInsets.fromLTRB(20, 14, 20, 20),
        decoration: BoxDecoration(
          color: palette.card,
          border: Border.all(color: palette.gold.withValues(alpha: 0.32)),
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
            Center(
              child: _SheetHandle(
                  dark: Theme.of(context).brightness == Brightness.dark)),
            const SizedBox(height: 14),
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Container(
                  width: 48,
                  height: 48,
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    color: palette.goldPale,
                    border: Border.all(color: palette.borderStrong),
                    borderRadius: BorderRadius.circular(18),
                  ),
                  child: Icon(
                    Icons.near_me_rounded,
                    color: palette.goldDeep,
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
                        style: TextStyle(
                          color: palette.text,
                          fontSize: 22,
                          height: 1.08,
                          fontWeight: FontWeight.w900,
                        ),
                      ),
                      const SizedBox(height: 8),
                      Text(
                        'Мы определили регион по геолокации. Проверьте, чтобы заказы работали правильно.',
                        style: TextStyle(
                          color: palette.textSecondary,
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
                  // ElevatedButton, not FilledButton — FilledButton has no
                  // entry in the app's ButtonThemeData, so it fell back to
                  // Material 3's default fully-pill shape next to this row's
                  // themed (rounded-rect) OutlinedButton, a jarring mismatch.
                  child: ElevatedButton(
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
    final palette = context.palette;
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
          color: palette.card,
          border: Border.all(color: palette.border),
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
            Center(
              child: _SheetHandle(
                  dark: Theme.of(context).brightness == Brightness.dark)),
            const SizedBox(height: 14),
            Text(
              widget.title,
              style: TextStyle(
                fontSize: 24,
                height: 1.08,
                fontWeight: FontWeight.w900,
                color: palette.text,
              ),
            ),
            const SizedBox(height: 6),
            Text(
              widget.subtitle,
              style: TextStyle(
                color: palette.textSecondary,
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
            if (regions.isEmpty)
              const _AddressEmptyHint(
                title: 'Ничего не найдено',
                text: 'Уточните название региона или посёлка.',
              ),
            if (regions.isNotEmpty)
            Flexible(
              child: ListView.separated(
                shrinkWrap: true,
                itemCount: regions.length,
                separatorBuilder: (_, __) => const SizedBox(height: 8),
                itemBuilder: (context, index) {
                  final region = regions[index];
                  final selected = region.id == widget.selectedId;
                  return Material(
                    color: selected ? palette.goldPale : palette.cardWarm,
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
                            color: selected ? palette.gold : palette.border,
                          ),
                        ),
                        child: Row(
                          children: [
                            Container(
                              width: 38,
                              height: 38,
                              alignment: Alignment.center,
                              decoration: BoxDecoration(
                                color:
                                    selected ? palette.gold : palette.card,
                                borderRadius: BorderRadius.circular(15),
                                border: Border.all(
                                  color: palette.borderStrong,
                                ),
                              ),
                              child: Icon(
                                Icons.location_city_rounded,
                                color: selected
                                    ? palette.text
                                    : palette.goldDeep,
                                size: 20,
                              ),
                            ),
                            const SizedBox(width: 12),
                            Expanded(
                              child: Text(
                                region.name,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: TextStyle(
                                  color: palette.text,
                                  fontWeight: FontWeight.w900,
                                  fontSize: 16,
                                ),
                              ),
                            ),
                            if (selected)
                              Icon(
                                Icons.check_circle_rounded,
                                color: palette.success,
                              )
                            else
                              Icon(
                                Icons.chevron_right_rounded,
                                color: palette.textSecondary,
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
    final palette = context.palette;
    final isDark = Theme.of(context).brightness == Brightness.dark;
    const items = [
      ('CASH', 'Наличные', 'Оплата водителю после поездки'),
      ('CARD', 'Картой', 'Оплата картой через Kaspi Pay'),
    ];
    return SafeArea(
      child: Container(
        margin: const EdgeInsets.all(12),
        padding: const EdgeInsets.fromLTRB(18, 14, 18, 18),
        decoration: BoxDecoration(
          color: palette.card,
          borderRadius: BorderRadius.circular(30),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withValues(alpha: isDark ? 0.42 : 0.20),
              blurRadius: 28,
              offset: const Offset(0, 14),
            ),
          ],
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Center(child: _SheetHandle(dark: isDark)),
            const SizedBox(height: 4),
            Text(
              'Способ оплаты',
              style: TextStyle(
                color: palette.text,
                fontSize: 22,
                fontWeight: FontWeight.w900,
              ),
            ),
            const SizedBox(height: 3),
            Text(
              'Выберите, как расплатиться за поездку',
              style: TextStyle(
                color: palette.textSecondary,
                fontSize: 13,
                fontWeight: FontWeight.w600,
              ),
            ),
            const SizedBox(height: 16),
            ...items.map((item) {
              final active = item.$1 == selected;
              return Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: Material(
                  color: Colors.transparent,
                  child: InkWell(
                    borderRadius: BorderRadius.circular(20),
                    onTap: () => Navigator.pop(context, item.$1),
                    child: AnimatedContainer(
                      duration: const Duration(milliseconds: 180),
                      curve: Curves.easeOutCubic,
                      constraints: const BoxConstraints(minHeight: 76),
                      padding: const EdgeInsets.all(14),
                      decoration: BoxDecoration(
                        gradient: active
                            ? LinearGradient(
                                begin: Alignment.topLeft,
                                end: Alignment.bottomRight,
                                colors: [
                                  palette.gold
                                      .withValues(alpha: isDark ? 0.22 : 0.12),
                                  palette.gold
                                      .withValues(alpha: isDark ? 0.06 : 0.03),
                                ],
                              )
                            : null,
                        color: active ? null : palette.appBackground,
                        border: Border.all(
                          color: active ? palette.gold : palette.border,
                          width: active ? 1.8 : 1,
                        ),
                        borderRadius: BorderRadius.circular(20),
                        boxShadow: active
                            ? [
                                BoxShadow(
                                  color: palette.gold
                                      .withValues(alpha: isDark ? 0.30 : 0.20),
                                  blurRadius: 18,
                                  offset: const Offset(0, 7),
                                ),
                              ]
                            : null,
                      ),
                      child: Row(
                        children: [
                          Container(
                            width: 48,
                            height: 48,
                            alignment: Alignment.center,
                            decoration: BoxDecoration(
                              gradient: LinearGradient(
                                begin: Alignment.topCenter,
                                end: Alignment.bottomCenter,
                                colors: active
                                    ? [palette.gold, palette.goldDeep]
                                    : [
                                        palette.goldSurface,
                                        palette.goldSurface,
                                      ],
                              ),
                              borderRadius: BorderRadius.circular(16),
                              boxShadow: active
                                  ? [
                                      BoxShadow(
                                        color: palette.gold
                                            .withValues(alpha: 0.35),
                                        blurRadius: 10,
                                        offset: const Offset(0, 4),
                                      ),
                                    ]
                                  : null,
                            ),
                            child: _SvgIcon(
                              item.$1 == 'CASH' ? _iconBanknote : _iconCreditCard,
                              color: active ? Colors.white : palette.goldDeep,
                              size: 22,
                            ),
                          ),
                          const SizedBox(width: 14),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  item.$2,
                                  style: TextStyle(
                                    color: palette.text,
                                    fontSize: 16,
                                    fontWeight: FontWeight.w900,
                                  ),
                                ),
                                const SizedBox(height: 3),
                                Text(
                                  item.$3,
                                  style: TextStyle(
                                    color: palette.textSecondary,
                                    fontSize: 12,
                                    fontWeight: FontWeight.w600,
                                  ),
                                ),
                              ],
                            ),
                          ),
                          AnimatedScale(
                            duration: const Duration(milliseconds: 180),
                            curve: Curves.easeOutBack,
                            scale: active ? 1 : 0,
                            child: Icon(
                              Icons.check_circle_rounded,
                              color: palette.gold,
                              size: 26,
                            ),
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

class _OrderNoteSheet extends StatefulWidget {
  const _OrderNoteSheet({this.initialNote});

  final String? initialNote;

  @override
  State<_OrderNoteSheet> createState() => _OrderNoteSheetState();
}

class _OrderNoteSheetState extends State<_OrderNoteSheet> {
  late final _controller = TextEditingController(text: widget.initialNote);

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final hasInitialNote = (widget.initialNote ?? '').isNotEmpty;
    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(context).bottom),
      child: SafeArea(
        child: Container(
          margin: const EdgeInsets.all(12),
          padding: const EdgeInsets.fromLTRB(18, 14, 18, 18),
          decoration: BoxDecoration(
            color: palette.card,
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
                'Описать место',
                style: TextStyle(fontSize: 22, fontWeight: FontWeight.w900),
              ),
              const SizedBox(height: 4),
              Text(
                'Например: домофон 45, второй подъезд, встретить у шлагбаума',
                style: TextStyle(
                  color: palette.textSecondary,
                  fontSize: 12.5,
                  fontWeight: FontWeight.w600,
                ),
              ),
              const SizedBox(height: 14),
              TextField(
                controller: _controller,
                autofocus: true,
                minLines: 3,
                maxLines: 5,
                maxLength: 500,
                decoration: const InputDecoration(
                  labelText: 'Комментарий для водителя',
                  hintText: 'Где вас найти или куда ехать...',
                  alignLabelWithHint: true,
                ),
              ),
              const SizedBox(height: 6),
              _GoldCtaButton(
                enabled: true,
                loading: false,
                text: 'Сохранить',
                onTap: () =>
                    Navigator.pop(context, _controller.text.trim()),
              ),
              if (hasInitialNote) ...[
                const SizedBox(height: 8),
                SizedBox(
                  width: double.infinity,
                  child: TextButton(
                    onPressed: () => Navigator.pop(context, ''),
                    style: TextButton.styleFrom(
                      foregroundColor: palette.danger,
                    ),
                    child: const Text(
                      'Удалить комментарий',
                      style: TextStyle(fontWeight: FontWeight.w800),
                    ),
                  ),
                ),
              ],
            ],
          ),
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
    final palette = context.palette;
    final l10n = AppLocalizations.of(context);
    final width = MediaQuery.sizeOf(context).width;
    final drawerWidth = (width * 0.82).clamp(296.0, 368.0).toDouble();
    return Drawer(
      width: drawerWidth,
      backgroundColor: palette.card,
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
                color: palette.card,
                border: Border.all(color: palette.border),
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
                                gradient: LinearGradient(
                                  begin: Alignment.topLeft,
                                  end: Alignment.bottomRight,
                                  colors: [palette.gold, palette.goldDeep],
                                ),
                                borderRadius: BorderRadius.circular(14),
                                boxShadow: [
                                  BoxShadow(
                                    color:
                                        palette.gold.withValues(alpha: 0.32),
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
                                        ? l10n.passengerSettingsAccountGroup
                                        : accountLabel,
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                    style: TextStyle(
                                      color: palette.text,
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
                                        style: TextStyle(
                                          color: palette.textSecondary,
                                          fontSize: 12,
                                          fontWeight: FontWeight.w700,
                                        ),
                                      ),
                                    ),
                                ],
                              ),
                            ),
                            Icon(
                              Icons.chevron_right_rounded,
                              color: palette.textSecondary,
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
                      color: palette.goldSurface,
                      borderRadius: BorderRadius.circular(999),
                    ),
                    child: Text(
                      l10n.passengerDrawerRegionalBadge,
                      style: TextStyle(
                        color: palette.goldDeep,
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
                    icon: Icons.home_rounded,
                    label: l10n.home,
                    active: active == PassengerTab.home,
                    onTap: () => onSelect(PassengerTab.home),
                  ),
                  _DrawerItem(
                    icon: Icons.history_rounded,
                    label: l10n.passengerDrawerTrips,
                    active: active == PassengerTab.trips,
                    onTap: () => onSelect(PassengerTab.trips),
                  ),
                  _DrawerItem(
                    icon: Icons.notifications_outlined,
                    label: l10n.notifications,
                    active: active == PassengerTab.notifications,
                    onTap: () => onSelect(PassengerTab.notifications),
                  ),
                  _DrawerItem(
                    icon: Icons.person_outline_rounded,
                    label: l10n.profile,
                    active: active == PassengerTab.profile,
                    onTap: () => onSelect(PassengerTab.profile),
                  ),
                  _DrawerSectionLabel(l10n.passengerSettingsAccountGroup),
                  _DrawerItem(
                    icon: Icons.local_offer_outlined,
                    label: l10n.passengerDrawerPromoCodes,
                    active: active == PassengerTab.promoCodes,
                    onTap: () => onSelect(PassengerTab.promoCodes),
                  ),
                  _DrawerItem(
                    icon: Icons.event_repeat_rounded,
                    label: l10n.passengerDrawerRecurringBookings,
                    active: active == PassengerTab.recurringBookings,
                    onTap: () => onSelect(PassengerTab.recurringBookings),
                  ),
                  _DrawerItem(
                    icon: Icons.star_outline_rounded,
                    label: l10n.passengerDrawerFavoriteAddresses,
                    active: active == PassengerTab.favoriteAddresses,
                    onTap: () => onSelect(PassengerTab.favoriteAddresses),
                  ),
                  _DrawerItem(
                    icon: Icons.people_alt_outlined,
                    label: l10n.passengerDrawerDrivers,
                    active: active == PassengerTab.driverPreferences,
                    onTap: () => onSelect(PassengerTab.driverPreferences),
                  ),
                  _DrawerItem(
                    icon: Icons.card_giftcard_rounded,
                    label: l10n.passengerDrawerReferrals,
                    active: active == PassengerTab.referrals,
                    onTap: () => onSelect(PassengerTab.referrals),
                  ),
                  _DrawerItem(
                    icon: Icons.directions_car_outlined,
                    label: driverLabel,
                    active: active == PassengerTab.driverApplication,
                    onTap: onDriver,
                  ),
                  _DrawerSectionLabel(l10n.passengerDrawerHelpSection),
                  _DrawerItem(
                    icon: Icons.headset_mic_outlined,
                    label: l10n.support,
                    active: active == PassengerTab.support,
                    onTap: () => onSelect(PassengerTab.support),
                  ),
                  _DrawerItem(
                    icon: Icons.help_outline_rounded,
                    label: l10n.passengerDrawerFaq,
                    active: active == PassengerTab.faq,
                    onTap: () => onSelect(PassengerTab.faq),
                  ),
                  _DrawerSectionLabel(l10n.passengerDrawerAboutSection),
                  _DrawerItem(
                    icon: Icons.info_outline_rounded,
                    label: l10n.passengerDrawerAboutUs,
                    active: active == PassengerTab.about,
                    onTap: () => onSelect(PassengerTab.about),
                  ),
                  _DrawerItem(
                    icon: Icons.tune_rounded,
                    label: l10n.settings,
                    active: active == PassengerTab.settings,
                    onTap: () => onSelect(PassengerTab.settings),
                  ),
                  _DrawerItem(
                    icon: Icons.shield_outlined,
                    label: l10n.passengerSettingsLegalTitle,
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
              label: l10n.logOut,
              active: false,
              danger: true,
              onTap: onLogout,
            ),
            const SizedBox(height: 10),
            Text(
              'SmartTaxi · v$_appVersion',
              style: TextStyle(
                color: palette.textMuted,
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
    final palette = context.palette;
    final tone = danger ? palette.danger : palette.text;
    final iconTone = danger
        ? palette.danger
        : active
            ? palette.goldDeep
            : palette.text;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 1.5),
      child: Material(
        color: active ? palette.goldSurface : Colors.transparent,
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
              color: active ? palette.goldSurface : Colors.transparent,
              border: Border.all(
                color: active ? palette.borderStrong : Colors.transparent,
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
                        ? palette.dangerSoft
                        : active
                            ? palette.goldSurface
                            : palette.card,
                    border: Border.all(
                      color: danger
                          ? palette.danger.withValues(alpha: 0.35)
                          : active
                              ? palette.borderStrong
                              : palette.border,
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
                      ? palette.danger
                      : active
                          ? palette.goldDeep
                          : palette.textSecondary,
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
        style: TextStyle(
          color: context.palette.textMuted,
          fontSize: 11,
          fontWeight: FontWeight.w900,
          letterSpacing: 0.4,
        ),
      ),
    );
  }
}

class _AppHeader extends StatelessWidget {
  const _AppHeader({required this.onMenu, required this.trailing, this.onBack});

  final VoidCallback onMenu;
  final Widget trailing;
  // Every screen using this header is a step away from Home reached via
  // local state, not a pushed route — Android's gesture/hardware back
  // already walks back one step via PopScope, but iOS has no equivalent
  // system-level trigger for that, so these screens need an explicit
  // on-screen way back too. When set, this replaces the hamburger menu
  // with a back arrow (the drawer is still reachable from Home itself).
  final VoidCallback? onBack;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    return Container(
      height: 62,
      margin: const EdgeInsets.fromLTRB(12, 8, 12, 4),
      padding: const EdgeInsets.symmetric(horizontal: 8),
      decoration: BoxDecoration(
        color: palette.card.withValues(alpha: 0.96),
        border: Border.all(color: palette.border),
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
            color: palette.goldSurface,
            borderRadius: BorderRadius.circular(14),
            child: InkWell(
              borderRadius: BorderRadius.circular(14),
              onTap: onBack ?? onMenu,
              child: Padding(
                padding: const EdgeInsets.all(9),
                child: Icon(
                  onBack != null
                      ? Icons.arrow_back_ios_new_rounded
                      : Icons.menu_rounded,
                  size: 20,
                  color: palette.goldDeep,
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

class _ActiveOrderBanner extends StatelessWidget {
  const _ActiveOrderBanner({required this.order, required this.onTap});

  final OrderSummary order;
  final VoidCallback onTap;

  bool get _searching => order.driverId == null;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final l10n = AppLocalizations.of(context);
    return Padding(
      padding: const EdgeInsets.fromLTRB(12, 8, 12, 0),
      child: Material(
        color: Colors.transparent,
        borderRadius: BorderRadius.circular(20),
        child: InkWell(
          borderRadius: BorderRadius.circular(20),
          onTap: onTap,
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
            decoration: BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
                colors: [
                  palette.gold.withValues(alpha: 0.16),
                  palette.gold.withValues(alpha: 0.06),
                ],
              ),
              border: Border.all(color: palette.goldPale),
              borderRadius: BorderRadius.circular(20),
            ),
            child: Row(
              children: [
                SizedBox(
                  width: 22,
                  height: 22,
                  child: _searching
                      ? CircularProgressIndicator(
                          strokeWidth: 2.4,
                          color: palette.goldDeep,
                        )
                      : Icon(
                          Icons.directions_car_filled_rounded,
                          color: palette.goldDeep,
                          size: 20,
                        ),
                ),
                const SizedBox(width: 11),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        _statusLabel(l10n, order.status),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          color: palette.text,
                          fontSize: 13.5,
                          height: 1.05,
                          fontWeight: FontWeight.w900,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        (order.driverName ?? '').isEmpty
                            ? order.dropoff
                            : '${order.driverName} · ${order.dropoff}',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          color: palette.textSecondary,
                          fontSize: 11.5,
                          height: 1.05,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 8),
                Icon(
                  Icons.chevron_right_rounded,
                  color: palette.goldDeep,
                  size: 20,
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _MapOverlayHeader extends StatelessWidget {
  const _MapOverlayHeader({
    required this.onMenu,
    required this.onNotifications,
    required this.unreadNotificationCount,
    required this.routeSummaryLabel,
    required this.onRouteBack,
  });

  final VoidCallback onMenu;
  final VoidCallback onNotifications;
  final int unreadNotificationCount;
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
            Align(
              alignment: Alignment.centerRight,
              child: _RouteSummaryPill(text: summary),
            ),
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
            child: _NotificationButton(
              onTap: onNotifications,
              unreadCount: unreadNotificationCount,
            ),
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
    final palette = context.palette;
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
            color: palette.card.withValues(alpha: 0.98),
            border: Border.all(color: palette.borderStrong),
            borderRadius: BorderRadius.circular(16),
            boxShadow: const [
              BoxShadow(
                color: Color(0x1a141414),
                blurRadius: 14,
                offset: Offset(0, 6),
              ),
            ],
          ),
          child: Icon(
            Icons.arrow_back_ios_new_rounded,
            color: palette.text,
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
    final palette = context.palette;
    return ConstrainedBox(
      constraints: const BoxConstraints(maxWidth: 168),
      child: Container(
        height: 44,
        padding: const EdgeInsets.symmetric(horizontal: 12),
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: palette.card.withValues(alpha: 0.98),
          border: Border.all(color: palette.borderStrong),
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
            style: TextStyle(
              color: palette.text,
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
    final palette = context.palette;
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return ClipRRect(
      borderRadius: BorderRadius.circular(borderRadius),
      child: BackdropFilter(
        filter: ImageFilter.blur(sigmaX: 14, sigmaY: 14),
        child: Container(
          decoration: BoxDecoration(
            color: palette.card.withValues(alpha: 0.72),
            borderRadius: BorderRadius.circular(borderRadius),
            border: Border.all(
              color: isDark
                  ? Colors.white.withValues(alpha: 0.12)
                  : Colors.white.withValues(alpha: 0.55),
            ),
            // Chrome sat flush against the map with nothing to lift it —
            // a soft shadow reads as floating glass instead of a flat
            // cutout, especially over busy map tiles.
            boxShadow: [
              BoxShadow(
                color: Colors.black.withValues(alpha: isDark ? 0.35 : 0.10),
                blurRadius: 16,
                offset: const Offset(0, 6),
              ),
            ],
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
        constraints: const BoxConstraints(minWidth: 128, maxWidth: 176),
        padding: const EdgeInsets.only(left: 6, right: 16),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            ClipRRect(
              borderRadius: const BorderRadius.all(Radius.circular(10)),
              child: SizedBox.square(
                dimension: 30,
                child: Image.asset(
                  BrandLogo.iconAssetPath,
                  fit: BoxFit.cover,
                  cacheWidth: 90,
                  cacheHeight: 90,
                ),
              ),
            ),
            const SizedBox(width: 8),
            Flexible(
              child: Text(
                'SmartTaxi',
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  color: context.palette.text,
                  fontSize: 14.5,
                  height: 1,
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
                child: _SvgIcon(iconAsset,
                    color: context.palette.goldDeep, size: 20),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _NotificationButton extends StatelessWidget {
  const _NotificationButton({required this.onTap, required this.unreadCount});

  final VoidCallback onTap;
  final int unreadCount;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    return Tooltip(
      message: AppLocalizations.of(context).notifications,
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
                  _SvgIcon(
                    _iconBell,
                    color: palette.goldDeep,
                    size: 20,
                  ),
                  if (unreadCount > 0)
                    Positioned(
                      right: 8,
                      top: 8,
                      child: Container(
                        width: 8,
                        height: 8,
                        decoration: BoxDecoration(
                          color: palette.gold,
                          shape: BoxShape.circle,
                          border: Border.all(color: palette.card, width: 1.5),
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
      tooltip: AppLocalizations.of(context).profile,
    );
  }
}

class _NotificationsScreen extends StatefulWidget {
  const _NotificationsScreen({
    required this.api,
    required this.onUnreadCountChanged,
    this.regionId,
  });

  final ApiClient api;
  final ValueChanged<int> onUnreadCountChanged;
  // Only used to look up a cheapest-tariff reference price for the bonus
  // balance's ride-count estimate -- null just means that one number is
  // skipped, the notifications list itself doesn't depend on a region.
  final String? regionId;

  @override
  State<_NotificationsScreen> createState() => _NotificationsScreenState();
}

List<(NotificationCategory, String)> _notificationCategories(
        AppLocalizations l10n) =>
    [
      (NotificationCategory.orders, l10n.passengerNotifCategoryOrders),
      (NotificationCategory.support, l10n.support),
      (NotificationCategory.service, l10n.passengerNotifCategoryService),
      (NotificationCategory.bonus, l10n.passengerNotifCategoryBonus),
    ];

class _NotificationsScreenState extends State<_NotificationsScreen> {
  bool _loading = true;
  String? _error;
  List<AppNotification> _items = const [];
  NotificationCategory _category = NotificationCategory.orders;
  int? _cashbackBalanceKzt;
  double? _cheapestTariffPriceKzt;

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
        unawaited(
          widget.api
              .markAllNotificationsRead()
              .then((_) => widget.onUnreadCountChanged(0)),
        );
      } else {
        widget.onUnreadCountChanged(0);
      }
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _error = AppLocalizations.of(context).passengerNotifLoadError;
        _loading = false;
      });
    }
    unawaited(_loadBonusSummary());
  }

  // Best-effort, kept separate from _load()'s error state -- a failure here
  // must never block the notifications list itself from showing.
  Future<void> _loadBonusSummary() async {
    try {
      final balance = await widget.api.getMyClientBalance();
      if (mounted) {
        setState(() => _cashbackBalanceKzt = balance.cashbackBalanceKzt);
      }
    } catch (_) {}
    final regionId = widget.regionId;
    if (regionId == null) return;
    try {
      final tariffs = await widget.api.getTariffs(regionId);
      if (!mounted) return;
      double? cheapest;
      for (final tariff in tariffs) {
        if (tariff.minimumPrice <= 0) continue;
        if (cheapest == null || tariff.minimumPrice < cheapest) {
          cheapest = tariff.minimumPrice;
        }
      }
      if (cheapest != null) setState(() => _cheapestTariffPriceKzt = cheapest);
    } catch (_) {}
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final filtered =
        _items.where((item) => item.category == _category).toList();
    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        padding: const EdgeInsets.all(20),
        physics: const AlwaysScrollableScrollPhysics(
          parent: BouncingScrollPhysics(),
        ),
        children: [
          _TitleBlock(
            title: l10n.notifications,
            text: l10n.passengerNotifSubtitle,
          ),
          const SizedBox(height: 16),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              for (final entry in _notificationCategories(l10n))
                _SupportTopicChip(
                  label: entry.$2,
                  selected: _category == entry.$1,
                  onTap: () => setState(() => _category = entry.$1),
                ),
            ],
          ),
          const SizedBox(height: 16),
          if (_category == NotificationCategory.bonus &&
              (_cashbackBalanceKzt != null || _cheapestTariffPriceKzt != null)) ...[
            _BonusBalanceCard(
              balanceKzt: _cashbackBalanceKzt,
              cheapestTariffPriceKzt: _cheapestTariffPriceKzt,
            ),
            const SizedBox(height: 16),
          ],
          if (_loading)
            const _SkeletonList()
          else if (_error != null)
            _PremiumCard(
              child: _CompactNotice(
                icon: Icons.error_outline_rounded,
                title: l10n.passengerNotifLoadErrorTitle,
                text: _error!,
                dark: Theme.of(context).brightness == Brightness.dark,
              ),
            )
          else if (filtered.isEmpty)
            _PremiumCard(
              child: _CompactNotice(
                icon: Icons.notifications_none_rounded,
                title: _items.isEmpty
                    ? l10n.passengerNotifEmptyTitle
                    : l10n.passengerNotifEmptyCategoryTitle,
                text: _items.isEmpty
                    ? l10n.passengerNotifEmptyText
                    : l10n.passengerNotifEmptyCategoryText,
                dark: Theme.of(context).brightness == Brightness.dark,
              ),
            )
          else
            for (final group in _groupNotificationsByDay(l10n, filtered)) ...[
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

class _BonusBalanceCard extends StatelessWidget {
  const _BonusBalanceCard({
    required this.balanceKzt,
    required this.cheapestTariffPriceKzt,
  });

  final int? balanceKzt;
  final double? cheapestTariffPriceKzt;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final l10n = AppLocalizations.of(context);
    final balance = balanceKzt ?? 0;
    final price = cheapestTariffPriceKzt;
    final rides = (price != null && price > 0) ? (balance / price).floor() : null;
    return _PremiumCard(
      child: Row(
        children: [
          Container(
            width: 46,
            height: 46,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: palette.goldSurface,
              shape: BoxShape.circle,
            ),
            child: Icon(
              Icons.savings_rounded,
              color: palette.goldDeep,
              size: 22,
            ),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  '$balance ₸',
                  style: TextStyle(
                    color: palette.text,
                    fontSize: 20,
                    fontWeight: FontWeight.w900,
                  ),
                ),
                const SizedBox(height: 3),
                Text(
                  rides == null
                      ? l10n.passengerBonusBalanceLabel
                      : rides > 0
                          ? l10n.passengerBonusRidesLeft(rides)
                          : l10n.passengerBonusNotEnoughText,
                  style: TextStyle(
                    color: palette.textSecondary,
                    fontSize: 12.5,
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

class _NotificationDayGroup {
  const _NotificationDayGroup(this.label, this.items);

  final String label;
  final List<AppNotification> items;
}

List<_NotificationDayGroup> _groupNotificationsByDay(
  AppLocalizations l10n,
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
        ? l10n.passengerTripDateToday
        : day == yesterday
            ? l10n.passengerTripDateYesterday
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
      case 'CASHBACK_EARNED':
      case 'REFERRAL_BONUS':
        return Icons.savings_rounded;
      case 'SOS_ALERT':
      case 'LOST_ITEM':
        return Icons.support_agent_rounded;
      case 'BROADCAST':
        return Icons.campaign_rounded;
      default:
        return Icons.notifications_none_rounded;
    }
  }

  static String _timeAgo(AppLocalizations l10n, DateTime dateTime) {
    final diff = DateTime.now().difference(dateTime);
    if (diff.inMinutes < 1) return l10n.passengerTimeAgoJustNow;
    if (diff.inMinutes < 60) return l10n.passengerTimeAgoMinutes(diff.inMinutes);
    if (diff.inHours < 24) return l10n.passengerTimeAgoHours(diff.inHours);
    return l10n.passengerTimeAgoDays(diff.inDays);
  }

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final l10n = AppLocalizations.of(context);
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: palette.card,
        border: Border.all(
          color: notification.isUnread
              ? palette.borderStrong
              : palette.border,
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
            decoration: BoxDecoration(
              color: palette.goldSurface,
              shape: BoxShape.circle,
            ),
            child: Icon(
              _iconFor(notification.type),
              color: palette.goldDeep,
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
                        style: TextStyle(
                          color: palette.text,
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
                        decoration: BoxDecoration(
                          color: palette.gold,
                          shape: BoxShape.circle,
                        ),
                      ),
                    ],
                  ],
                ),
                const SizedBox(height: 4),
                Text(
                  notification.body,
                  style: TextStyle(
                    color: palette.textSecondary,
                    fontSize: 12.5,
                    height: 1.3,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                const SizedBox(height: 6),
                Text(
                  _timeAgo(l10n, notification.createdAt),
                  style: TextStyle(
                    color: palette.textMuted,
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
    final palette = context.palette;
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: palette.card,
        border: Border.fromBorderSide(
          BorderSide(color: palette.border),
        ),
        borderRadius: const BorderRadius.all(Radius.circular(30)),
        boxShadow: _cardShadow,
      ),
      child: child,
    );
  }
}

class _SectionLabel extends StatelessWidget {
  const _SectionLabel({
    required this.title,
    required this.text,
  });

  final String title;
  final String text;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    return Row(
      children: [
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                title,
                style: TextStyle(
                  color: palette.text,
                  fontSize: 17,
                  fontWeight: FontWeight.w800,
                ),
              ),
              const SizedBox(height: 3),
              Text(
                text,
                style: TextStyle(
                  color: palette.textSecondary,
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
          final palette = context.palette;
          return Container(
            width: widget.width,
            height: widget.height,
            decoration: BoxDecoration(
              color: Color.lerp(
                palette.goldSurface,
                palette.goldPale.withValues(alpha: 0.75),
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

// Generic list-row skeleton (icon block + two text lines) built on the
// existing _SkeletonLine shimmer primitive — reused across every list
// screen's initial-load state instead of each one showing a bare centered
// spinner (recurring bookings, favorites, driver preferences, notifications).
class _SkeletonListTile extends StatelessWidget {
  const _SkeletonListTile();

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: palette.card,
          border: Border.all(color: palette.border),
          borderRadius: BorderRadius.circular(18),
        ),
        child: const Row(
          children: [
            _SkeletonLine(width: 44, height: 44, radius: 14),
            SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  _SkeletonLine(width: double.infinity, height: 13),
                  SizedBox(height: 8),
                  _SkeletonLine(width: 120, height: 11),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _SkeletonList extends StatelessWidget {
  const _SkeletonList();

  @override
  Widget build(BuildContext context) {
    return const Column(
      children: [
        _SkeletonListTile(),
        _SkeletonListTile(),
        _SkeletonListTile(),
      ],
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

// Reusable press-down micro-interaction (scale ~0.97) for primary tap
// targets — gives a physical, tactile feel instead of an instant flat
// state change. Only listens for down/up/cancel to drive the scale; the
// child keeps owning its own tap handling (InkWell, GestureDetector, etc).
class _PressScale extends StatefulWidget {
  const _PressScale({required this.child, this.enabled = true});

  final Widget child;
  final bool enabled;

  @override
  State<_PressScale> createState() => _PressScaleState();
}

class _PressScaleState extends State<_PressScale> {
  bool _pressed = false;

  void _setPressed(bool value) {
    if (!widget.enabled || _pressed == value) return;
    if (value) unawaited(HapticFeedback.lightImpact());
    setState(() => _pressed = value);
  }

  @override
  Widget build(BuildContext context) {
    return Listener(
      onPointerDown: (_) => _setPressed(true),
      onPointerUp: (_) => _setPressed(false),
      onPointerCancel: (_) => _setPressed(false),
      child: AnimatedScale(
        scale: _pressed ? 0.97 : 1,
        duration: const Duration(milliseconds: 110),
        curve: Curves.easeOut,
        child: widget.child,
      ),
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
    return _PressScale(
      enabled: enabled && !loading,
      child: Opacity(
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
                                    fontFeatures: [FontFeature.tabularFigures()],
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
      ),
    );
  }
}

List<(String, String)> _faqItems(AppLocalizations l10n) => [
      (l10n.passengerFaqQ1, l10n.passengerFaqA1),
      (l10n.passengerFaqQ2, l10n.passengerFaqA2),
      (l10n.passengerFaqQ3, l10n.passengerFaqA3),
      (l10n.passengerFaqQ4, l10n.passengerFaqA4),
      (l10n.passengerFaqQ5, l10n.passengerFaqA5),
      (l10n.passengerFaqQ6, l10n.passengerFaqA6),
      (l10n.passengerFaqQ7, l10n.passengerFaqA7),
      (l10n.passengerFaqQ8, l10n.passengerFaqA8),
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
    final l10n = AppLocalizations.of(context);
    final items = _faqItems(l10n);
    final query = _query.trim().toLowerCase();
    final filtered = query.isEmpty
        ? items
        : items
            .where(
              (item) =>
                  item.$1.toLowerCase().contains(query) ||
                  item.$2.toLowerCase().contains(query),
            )
            .toList(growable: false);
    return ListView(
      padding: const EdgeInsets.all(20),
      children: [
        _TitleBlock(
          title: l10n.passengerDrawerFaq,
          text: l10n.passengerFaqSubtitle,
        ),
        const SizedBox(height: 16),
        TextField(
          controller: _searchController,
          onChanged: (value) => setState(() => _query = value),
          decoration: InputDecoration(
            hintText: l10n.passengerFaqSearchHint,
            prefixIcon: const Icon(Icons.search_rounded),
            suffixIcon: _query.isEmpty
                ? null
                : IconButton(
                    icon: const Icon(Icons.close_rounded),
                    tooltip: l10n.passengerFaqClearSearch,
                    onPressed: () {
                      _searchController.clear();
                      setState(() => _query = '');
                    },
                  ),
          ),
        ),
        const SizedBox(height: 16),
        if (filtered.isEmpty)
          EmptyState(
            icon: Icons.search_off_rounded,
            title: l10n.passengerFaqNoResultsTitle,
            text: l10n.passengerFaqNoResultsText,
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
    final palette = context.palette;
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
                      decoration: BoxDecoration(
                        color: palette.goldSurface,
                        shape: BoxShape.circle,
                      ),
                      child: Icon(
                        Icons.keyboard_arrow_down_rounded,
                        size: 18,
                        color: palette.goldDeep,
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
                          style: TextStyle(
                            color: palette.textSecondary,
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
          style: TextStyle(
            color: context.palette.textSecondary,
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
    final palette = context.palette;
    return Material(
      color: Colors.transparent,
      child: InkWell(
        borderRadius: BorderRadius.circular(20),
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: palette.card,
            border: Border.all(color: palette.border),
            borderRadius: BorderRadius.circular(20),
          ),
          child: Row(
            children: [
              Container(
                width: 44,
                height: 44,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: palette.goldSurface,
                  borderRadius: BorderRadius.circular(14),
                ),
                child: Icon(
                  document.icon,
                  color: palette.goldDeep,
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
              Icon(
                Icons.chevron_right_rounded,
                color: palette.textSecondary,
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
            child: Icon(icon, color: context.palette.goldDeep, size: 17),
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
    final palette = context.palette;
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 8),
      decoration: BoxDecoration(
        color: palette.goldSurface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: palette.border),
      ),
      child: Column(
        children: [
          Icon(icon, size: 18, color: palette.goldDeep),
          const SizedBox(height: 6),
          Text(
            value,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(
              fontSize: 14,
              fontWeight: FontWeight.w900,
              color: palette.text,
            ),
          ),
          const SizedBox(height: 2),
          Text(
            label,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(
              fontSize: 10.5,
              fontWeight: FontWeight.w700,
              color: palette.textSecondary,
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
    final palette = context.palette;
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
          Icon(
            Icons.copy_rounded,
            size: 14,
            color: palette.textMuted,
          ),
        ],
      ],
    );
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(
          label,
          style: TextStyle(color: palette.textSecondary),
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
            style: TextStyle(
              color: context.palette.text,
              fontSize: 17,
              fontWeight: FontWeight.w900,
            ),
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
    final palette = context.palette;
    final titleColor = danger ? palette.danger : palette.text;
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
                    style: TextStyle(
                      color: palette.textSecondary,
                      fontSize: 13,
                      height: 1.3,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ],
              ),
            ),
            if (onTap != null)
              Icon(
                Icons.chevron_right_rounded,
                color: palette.goldDeep,
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
        style: TextStyle(
          color: context.palette.textSecondary,
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
    final palette = context.palette;
    final tone = danger ? palette.danger : palette.text;
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
                    : palette.goldSurface,
                border: Border.all(
                  color: danger ? const Color(0xfffecaca) : palette.border,
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
                            color: palette.goldSurface,
                            borderRadius: BorderRadius.circular(999),
                          ),
                          child: Text(
                            badge!,
                            style: TextStyle(
                              color: palette.goldDeep,
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
                            ? palette.danger.withValues(alpha: 0.74)
                            : palette.textSecondary,
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
              color: danger ? palette.danger : palette.textMuted,
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
    final palette = context.palette;
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          width: 28,
          height: 28,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color: palette.goldSurface,
            shape: BoxShape.circle,
          ),
          child: Text(
            number,
            style: TextStyle(
              color: palette.goldDeep,
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
                style: TextStyle(
                  color: palette.textSecondary,
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
              : Icon(icon, color: context.palette.textSecondary, size: 20),
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
    final palette = context.palette;
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
        decoration: BoxDecoration(
          color: palette.card,
          borderRadius: const BorderRadius.all(Radius.circular(999)),
          boxShadow: const [
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
                color: palette.borderStrong,
                borderRadius: BorderRadius.circular(999),
              ),
            ),
            const SizedBox(height: 5),
            Icon(
              Icons.keyboard_arrow_up_rounded,
              size: 16,
              color: palette.textMuted,
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
    final palette = context.palette;
    final l10n = AppLocalizations.of(context);
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
    final labels = [
      l10n.statusStepSearching,
      l10n.statusStepGoing,
      l10n.statusStepWaiting,
      l10n.statusStepInTransit,
    ];
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
                        color: done ? palette.gold : palette.card,
                        shape: BoxShape.circle,
                        border: Border.all(
                          color: done ? palette.gold : palette.borderStrong,
                          width: 1.5,
                        ),
                        boxShadow: done
                            ? [
                                BoxShadow(
                                  color:
                                      palette.gold.withValues(alpha: 0.25),
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
                        color: done ? palette.text : palette.textSecondary,
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
                      color: stepIndex < index ? palette.gold : palette.border,
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

String _statusLabel(AppLocalizations l10n, String status) {
  return {
        'NEW': l10n.statusLabelSearching,
        'SEARCHING_DRIVER': l10n.statusLabelSearching,
        'DRIVER_ASSIGNED': l10n.statusLabelDriverFound,
        'DRIVER_FOUND': l10n.statusLabelDriverFound,
        'DRIVER_GOING_TO_CLIENT': l10n.statusLabelDriverGoingToClient,
        'DRIVER_ARRIVED': l10n.statusLabelDriverArrived,
        'WAITING_CLIENT': l10n.statusLabelWaitingClient,
        'IN_PROGRESS': l10n.passengerTripInTransitLabel,
        'TRIP_STARTED': l10n.passengerTripInTransitLabel,
        'COMPLETED': l10n.passengerTripCompletedTitle,
        'TRIP_COMPLETED': l10n.passengerTripCompletedTitle,
        'PAYMENT_PENDING': l10n.statusLabelPaymentPending,
        'PAID': l10n.statusLabelPaid,
        'RATED': l10n.statusLabelRated,
        'CANCELLED': l10n.statusLabelCancelled,
        'CANCELLED_BY_CLIENT': l10n.statusLabelCancelled,
        'CANCELLED_BY_DRIVER': l10n.statusLabelCancelledByDriver,
        'CANCELLED_BY_OPERATOR': l10n.statusLabelCancelledByOperator,
        'NO_SHOW': l10n.statusLabelNoShow,
      }[status] ??
      l10n.statusLabelUpdating;
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
  referrals,
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

String _driverPickupMeta(AppLocalizations l10n, RoutePreview route) {
  final distance = (route.distanceMeters / 1000).toStringAsFixed(1);
  final minutes = (route.durationSeconds / 60).round();
  final label = route.isToDropoff
      ? l10n.driverPickupMetaToDropoff
      : l10n.driverPickupMetaToPickup;
  return l10n.driverPickupMetaText(label, distance, minutes);
}

String _readableDriverRouteError(AppLocalizations l10n, Object error) {
  final message = error.toString();
  if (message.contains('DRIVER_LOCATION_UNAVAILABLE')) {
    return l10n.routeErrorWaitingLocation;
  }
  if (message.contains('ROUTE_UNAVAILABLE')) {
    return l10n.routeErrorDriverRouteUnavailable;
  }
  return l10n.routeErrorDriverRouteUnavailable;
}

String _readableError(AppLocalizations l10n, Object error) {
  final apiCode = _apiErrorCode(error);
  if (apiCode != null) {
    final apiMap = {
      'CLIENT_HAS_ACTIVE_ORDER': l10n.errorClientHasActiveOrder,
      'VALIDATION_ERROR': l10n.errorValidation,
      'UNAUTHORIZED': l10n.errorUnauthorized,
      'FORBIDDEN': l10n.errorForbidden,
      'RATE_LIMITED': l10n.errorRateLimited,
      'PICKUP_REGION_INACTIVE': l10n.errorPickupRegionInactive,
      'DROPOFF_REGION_INACTIVE': l10n.errorDropoffRegionInactive,
      'INTERCITY_NOT_SUPPORTED': l10n.errorIntercityNotSupported,
      'TARIFF_INACTIVE': l10n.errorTariffInactive,
      'TARIFF_REGION_MISMATCH': l10n.errorTariffRegionMismatch,
      'ROUTE_UNAVAILABLE': l10n.errorRouteUnavailable,
      'DRIVER_LOCATION_UNAVAILABLE': l10n.passengerDriverWaitingLocationLabel,
      'PROMO_CODE_REQUIRED': l10n.errorPromoCodeRequired,
      'PROMO_NOT_FOUND': l10n.errorPromoNotFound,
      'PROMO_NOT_STARTED': l10n.errorPromoNotStarted,
      'PROMO_EXPIRED': l10n.errorPromoExpired,
      'PROMO_MIN_ORDER_NOT_MET': l10n.errorPromoMinOrderNotMet,
      'PROMO_LIMIT_REACHED': l10n.errorPromoLimitReached,
      'PROMO_ALREADY_USED': l10n.errorPromoAlreadyUsed,
    };
    final mapped = apiMap[apiCode];
    if (mapped != null) return mapped;
  }
  final message = error.toString();
  if (message.contains('SocketException') ||
      message.contains('Connection') ||
      message.contains('connection') ||
      message.contains('timed out')) {
    return l10n.errorServerUnavailable;
  }
  if (message.contains('DRIVER_NAME_REQUIRED')) return l10n.errorDriverNameRequired;
  if (message.contains('DRIVER_PHONE_REQUIRED')) return l10n.errorDriverPhoneRequired;
  if (message.contains('DRIVER_CAR_REQUIRED')) {
    return l10n.errorDriverCarRequired;
  }
  if (message.contains('DRIVER_PLATE_REQUIRED')) return l10n.errorDriverPlateRequired;
  if (message.contains('DRIVER_TERMS_REQUIRED')) {
    return l10n.errorDriverTermsRequired;
  }
  final map = {
    'PICKUP_REGION_INACTIVE': l10n.errorPickupRegionInactive,
    'DROPOFF_REGION_INACTIVE': l10n.errorDropoffRegionInactive,
    'INTERCITY_NOT_SUPPORTED': l10n.errorIntercityNotSupported,
    'TARIFF_INACTIVE': l10n.errorTariffInactive,
    'TARIFF_REGION_MISMATCH': l10n.errorTariffRegionMismatch,
    'ROUTE_UNAVAILABLE': l10n.errorRouteUnavailable,
    'DRIVER_LOCATION_UNAVAILABLE': l10n.passengerDriverWaitingLocationLabel,
  };
  for (final entry in map.entries) {
    if (message.contains(entry.key)) return entry.value;
  }
  return l10n.errorGenericRequestFailed;
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
