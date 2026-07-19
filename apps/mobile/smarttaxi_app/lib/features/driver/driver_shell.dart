import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:flutter/services.dart';
import 'package:geolocator/geolocator.dart';
import 'package:image_picker/image_picker.dart';
import 'package:latlong2/latlong.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/api/api_client.dart';
import '../../core/auth/auth_store.dart';
import '../../core/config/app_config.dart';
import '../../core/legal/legal_content.dart';
import '../../core/sockets/socket_service.dart';
import '../../core/theme/app_theme.dart';
import '../../core/voice/voice_alert_service.dart';
import '../../core/widgets/app_toast.dart';
import '../../core/widgets/brand_logo.dart';
import '../../core/widgets/empty_state.dart';
import '../../core/widgets/exit_on_double_back.dart';
import '../../core/widgets/route_fields.dart';
import '../../core/widgets/status_pill.dart';
import '../../l10n/app_localizations.dart';
import '../shared/models.dart';
import 'models/driver_shell_helpers.dart';
import 'screens/notifications/driver_notifications_screen.dart';
import 'screens/rating/driver_rating_screen.dart';
import 'screens/wallet/driver_wallet_screen.dart';
import 'widgets/driver_common_widgets.dart';
import 'widgets/driver_line_widgets.dart';
import 'widgets/driver_order_widgets.dart';
import 'widgets/driver_payout_widgets.dart';
import 'widgets/driver_profile_widgets.dart';
import 'widgets/driver_shell_chrome.dart';

const _appVersion = AppConfig.appVersion;

// Darkens the OSM raster tile layer for dark theme, same treatment as
// passenger_shell.dart's map (invert + hue-rotate so it isn't a plain photo
// negative — green stays green-ish, water stays blue-ish). Duplicated here
// rather than shared since these are two independent widget trees, not a
// common map component.
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

class DriverShell extends StatefulWidget {
  const DriverShell({
    super.key,
    required this.api,
    required this.authStore,
    required this.sockets,
    required this.accountLabel,
    required this.onLogout,
    required this.onOpenPassengerMode,
    this.currentLocale,
    this.onChangeLocale,
    this.themeMode,
    this.onChangeThemeMode,
  });

  final ApiClient api;
  final AuthStore authStore;
  final SocketService sockets;
  final String accountLabel;
  final Future<void> Function() onLogout;
  final Future<void> Function() onOpenPassengerMode;
  // Optional (not required) so this widget stays independently buildable
  // without forcing every call site to be updated in lockstep — main.dart
  // passes the real callback; absent it, the language row degrades to a
  // silent no-op rather than a compile error.
  final Locale? currentLocale;
  final ValueChanged<Locale>? onChangeLocale;
  final ThemeMode? themeMode;
  final ValueChanged<ThemeMode>? onChangeThemeMode;

  @override
  State<DriverShell> createState() => _DriverShellState();
}

class _DriverShellState extends State<DriverShell> {
  final _scaffoldKey = GlobalKey<ScaffoldState>();
  final _exitGuard = ExitOnDoubleBack();
  int _tab = 0;
  bool _loading = false;
  bool _regionsLoading = false;
  bool _ordersLoading = false;
  bool _locationLoading = false;
  bool _online = false;
  String? _error;
  String? _locationMessage;
  String? _acceptingOrderId;
  String? _rejectingOrderId;
  String? _tripActionLabel;
  String? _navigatorMessage;
  List<DriverRegion> _regions = const [];
  String? _regionId;
  // A cheap, cache-only GPS hint (see _loadRegionHintPosition) used only to
  // default/sort the region list by proximity — never the live navigation
  // fix (_lastPosition below), which requires an active permission prompt
  // and is only populated once a driver actually goes online.
  Coordinate? _regionHintPosition;
  List<TariffOption> _regionTariffs = const [];
  bool _demandHintLoading = false;
  List<OrderSummary> _orders = const [];
  List<RoadAlert> _roadAlerts = const [];
  OrderSummary? _activeOrder;
  // Live "km driven so far" for the trip in progress — see the matching
  // field/comment on the passenger side (_tripDistanceTraveledM in
  // passenger_shell.dart). Null until the first location ping since
  // TRIP_STARTED arrives; reset whenever the active order is dismissed.
  int? _tripDistanceTraveledM;
  StreamSubscription<Position>? _positionSub;
  StreamSubscription<bool>? _socketConnectionSub;
  Timer? _socketFallbackPollTimer;
  RoutePreview? _driverRoute;
  Position? _lastPosition;
  // GPS-reported course-over-ground (Position.heading) is only meaningful
  // once the device is actually moving at real speed — it's computed from
  // barely-distinguishable consecutive fixes at low speed and becomes
  // essentially noise, which visibly spun the driver's own map marker (and
  // the course-up camera) to an arbitrary direction while stationary or
  // crawling. Only updated from a fresh position once _headingTrustSpeedMps
  // is cleared; otherwise the map/marker keep pointing whichever way they
  // were last confidently facing instead of jittering. Null until the first
  // trustworthy fix arrives.
  double? _trustedHeading;
  static const _headingTrustSpeedMps = 2.5; // ~9 km/h

  // Shared by the real (online, dispatch) position stream and the
  // navigator-preview standalone stream below — one place for the
  // heading-trust rule so the two can never quietly drift apart.
  void _applyPositionFix(Position position) {
    _lastPosition = position;
    if (position.speed.isFinite &&
        position.speed >= _headingTrustSpeedMps &&
        position.heading.isFinite) {
      _trustedHeading = position.heading;
    }
  }

  DriverStats? _driverStats;
  List<OrderSummary> _tripHistory = const [];
  bool _tripHistoryLoading = false;
  bool _roadAlertsLoading = false;
  bool _driverStatsLoading = false;
  String? _avatarUrl;
  bool _avatarUploading = false;
  bool _navigatorMapUnavailable = false;
  int _navigatorTileErrorCount = 0;
  String _accountPhone = '';
  // Same source the passenger side reads (/regions/service-settings) — see
  // _loadServiceContacts. Falls back to '112' inside DriverSosButton if this
  // never loads, so a slow/failed fetch never blocks the SOS action itself.
  String? _sosPhone;
  // null until the driver picks one; the support sheet falls back to
  // topics.first (the localized "order problem" topic) both for the
  // selected-chip highlight and the actual submitted topic — see
  // _driverSupportContent().
  String? _supportTopic;
  bool _supportSending = false;
  final _supportController = TextEditingController();
  String? _supportMessage;
  bool _supportMessageDanger = false;

  // Live OSM-sourced navigation layer (speed cameras + posted speed limit) —
  // see osm-navigation.service.js on the backend for why this exists instead
  // of a paid Kazakhstan camera API. Refetched as the driver moves, not on
  // every 20m GPS tick — Overpass is shared public infrastructure.
  List<RoadAlert> _osmCameras = const [];
  List<OsmSign> _osmSigns = const [];
  int? _osmSpeedLimit;
  LatLng? _osmFetchCenter;
  bool _osmFetchInFlight = false;
  // Per-camera stage: 0/absent = not yet warned, 1 = 500m cue given,
  // 2 = 200m cue given, 3 = pass cue given. Removed once the camera clears
  // resetAtMeters so a later approach re-warns from stage 0.
  final Map<String, int> _cameraStage = {};
  final Set<String> _signAlertedIds = {};
  // Keyed by a rounded lat/lng of the upcoming maneuver (steps/bearing
  // changes have no stable id of their own, unlike road alerts) — same
  // stage-tracking idea as _cameraStage: 1 = "prepare" cue given, 2 =
  // "now" cue given. Cleared once _nextManeuverHint() moves on to a
  // different upcoming maneuver.
  String? _announcedManeuverKey;
  int _announcedManeuverStage = 0;
  DateTime? _navigatorBannerUntil;
  String? _navigatorBannerText;
  // Quiet on-device TTS for camera/sign/speeding call-outs — see
  // voice_alert_service.dart for why this never blocks or crashes the app.
  final VoiceAlertService _voice = VoiceAlertService();
  bool _voiceEnabled = true;

  // Live route to whatever the driver is actually headed to right now
  // (pickup or dropoff, decided server-side from order status). Refetched
  // on a timer and immediately if the driver strays off the drawn line —
  // a real navigator reroutes, it doesn't just leave a stale line on screen.
  bool _routeFetchInFlight = false;
  DateTime? _lastRouteFetchAt;
  String? _lastRoutePhase;
  int _driverRouteRequestId = 0;

  DriverRegion? get _selectedRegion {
    for (final region in _regions) {
      if (region.id == _regionId) return region;
    }
    return null;
  }

  List<RoadAlert> get _allNavigatorAlerts => [..._roadAlerts, ..._osmCameras];

  @override
  void initState() {
    super.initState();
    unawaited(_voice.initialize());
    _bootstrap();
  }

  @override
  void dispose() {
    _voice.dispose();
    _positionSub?.cancel();
    _socketConnectionSub?.cancel();
    _socketFallbackPollTimer?.cancel();
    widget.sockets.clearListeners();
    _supportController.dispose();
    super.dispose();
  }

  Future<void> _bootstrap() async {
    try {
      await widget.sockets.connect();
      widget.sockets.joinDrivers();
      widget.sockets.onOrderUpdate(_handleOrderUpdate);
      _socketConnectionSub = widget.sockets.connectionChanges
          .listen(_handleSocketConnectionChange);
    } catch (_) {
      if (mounted) {
        setState(() => _navigatorMessage =
            AppLocalizations.of(context).driverUpdatesUnavailableNote);
      }
    }
    final account = await widget.authStore.readUser();
    if (mounted) {
      setState(() {
        _accountPhone = account['phone'] ?? '';
      });
    }
    final voiceEnabled = await widget.authStore.readVoiceEnabled();
    _voice.enabled = voiceEnabled;
    if (mounted) setState(() => _voiceEnabled = voiceEnabled);
    await _loadRegions();
    await _loadOrders();
    await _loadDriverStats();
    await _loadRoadAlerts();
    unawaited(_loadTripHistory());
    unawaited(_loadServiceContacts());
    unawaited(_loadAvatar());
  }

  Future<void> _loadServiceContacts() async {
    try {
      final contacts = await widget.api.getServiceContacts();
      if (!mounted) return;
      if (contacts.sosPhone != null) {
        setState(() => _sosPhone = contacts.sosPhone);
      }
    } catch (_) {
      // Best-effort — the SOS sheet keeps its 112 fallback if this fails.
    }
  }

  // While the socket is down (network blip, backgrounded app, server
  // restart), order updates from dispatch stop arriving — fall back to
  // polling REST so an accepted/cancelled order doesn't go unnoticed.
  void _handleSocketConnectionChange(bool connected) {
    if (connected) {
      _socketFallbackPollTimer?.cancel();
      _socketFallbackPollTimer = null;
      return;
    }
    _socketFallbackPollTimer ??= Timer.periodic(
      const Duration(seconds: 8),
      (_) => unawaited(_loadOrders()),
    );
  }

  Future<void> _loadTripHistory() async {
    if (!mounted) return;
    setState(() => _tripHistoryLoading = true);
    try {
      final history = await widget.api.getDriverOrderHistory();
      if (!mounted) return;
      setState(() => _tripHistory = history);
    } catch (_) {
      // Best-effort — history is a nice-to-have, not a blocker for driving.
    } finally {
      if (mounted) setState(() => _tripHistoryLoading = false);
    }
  }

  void _handleOrderUpdate(dynamic data) {
    if (data is! Map) return;
    final payload = Map<String, dynamic>.from(data['order'] ?? data);
    final order = OrderSummary.fromJson(payload);
    final hasRouteDetails = payload.containsKey('pickup_text') ||
        payload.containsKey('pickupText') ||
        payload.containsKey('pickup') ||
        payload.containsKey('dropoff_text') ||
        payload.containsKey('dropoffText') ||
        payload.containsKey('dropoff');
    final previousPhase = _routePhaseForStatus(_activeOrder?.status);
    final nextPhase = _routePhaseForStatus(order.status);
    // Find whatever this driver already knew about this order's price offer
    // (it may be the active order, or still just sitting in the open list)
    // so a PENDING -> ACCEPTED/DECLINED transition can surface as a toast —
    // the backend already sends a push for this (notifyOrderDriver in
    // orders.routes.js), this covers the foregrounded-app case that a
    // background push wouldn't visibly interrupt.
    String? previousOfferStatus;
    if (_activeOrder?.id == order.id) {
      previousOfferStatus = _activeOrder?.driverOfferStatus;
    } else {
      for (final existing in _orders) {
        if (existing.id == order.id) {
          previousOfferStatus = existing.driverOfferStatus;
          break;
        }
      }
    }
    setState(() {
      _orders = mergeOrder(_orders, order);
      if (_activeOrder?.id == order.id || order.isActive) {
        _activeOrder = order;
      }
      if (!order.isActive && !order.isOpen) {
        _driverRoute = null;
      }
      // Never move the live distance counter backwards from what a more
      // recent location ping already established — see the matching
      // comment on the passenger side (_applyOrderSnapshot).
      if (order.distanceTraveledM != null &&
          (_tripDistanceTraveledM == null ||
              order.distanceTraveledM! > _tripDistanceTraveledM!)) {
        _tripDistanceTraveledM = order.distanceTraveledM;
      }
    });
    // Open orders are visible to every driver in the region, so
    // driverOfferStatus/driverOfferPriceKzt on one might belong to a
    // different driver's offer — only toast (and, in OrderCard, only show
    // "Ожидаем ответа") when this is actually this driver's own offer.
    final isMyOffer = _driverStats?.driverId != null &&
        order.driverOfferByDriverId == _driverStats?.driverId;
    if (isMyOffer &&
        previousOfferStatus == 'PENDING' &&
        order.driverOfferStatus == 'ACCEPTED') {
      AppToast.showSuccess(context,
          'Клиент принял вашу цену: ${formatDriverMoney(order.driverOfferPriceKzt ?? 0)}');
    } else if (isMyOffer &&
        previousOfferStatus == 'PENDING' &&
        order.driverOfferStatus == 'DECLINED') {
      AppToast.showError(context, 'Клиент отклонил ваше предложение цены');
    }
    if (!hasRouteDetails) unawaited(_loadOrders());
    if (!order.isActive) unawaited(_loadTripHistory());
    // Order flipped from "heading to pickup" to "heading to dropoff" (or
    // just became active) — the old route line points at the wrong place
    // now, so pull the new one immediately instead of waiting for the timer.
    if (nextPhase != null && nextPhase != previousPhase) {
      unawaited(_loadDriverRoute(order.id));
    }
  }

  static String? _routePhaseForStatus(String? status) {
    const toPickup = {
      'DRIVER_FOUND',
      'DRIVER_GOING_TO_CLIENT',
      'DRIVER_ASSIGNED',
      'DRIVER_ARRIVED',
      'WAITING_CLIENT',
      'NEW',
    };
    const toDropoff = {'TRIP_STARTED', 'IN_PROGRESS'};
    if (status == null) return null;
    if (toDropoff.contains(status)) return 'to_dropoff';
    if (toPickup.contains(status)) return 'to_pickup';
    return null;
  }

  Future<void> _loadRegions() async {
    setState(() {
      _regionsLoading = true;
      _error = null;
    });
    try {
      final result = await widget.api.getDriverRegions();
      final regions = result.regions;
      if (_regionHintPosition == null) {
        await _loadRegionHintPosition();
      }
      final nearestId = _regionId == null
          ? _nearestApprovedRegionId(regions, _regionHintPosition)
          : null;
      if (!mounted) return;
      setState(() {
        _regions = regions;
        if (_regionId == null) {
          if (nearestId != null) {
            // A real GPS fix beats the server's remembered region: nothing
            // updates drivers.current_region_id until the driver actually
            // goes online somewhere, so it silently goes stale the moment a
            // driver physically moves to a different city/area between
            // sessions — defaulting to it here would then point the whole
            // go-online flow at a region the driver isn't even inside
            // anymore (confirmed happening: a driver whose last session was
            // in Атакент opened the app in Мырзакент and kept getting
            // rejected until manually reselecting).
            _regionId = nearestId;
          } else {
            // No GPS fix available yet (permission not granted, nothing
            // cached) — fall back to what the backend has as
            // current_region_id, same as before, only meaningful if it's
            // still in the approved list.
            final serverRegionId = result.currentRegionId;
            final matchesApproved = serverRegionId != null &&
                regions.any((r) => r.id == serverRegionId);
            _regionId = matchesApproved
                ? serverRegionId
                : (regions.isNotEmpty ? regions.first.id : null);
          }
        }
      });
      unawaited(_loadDemandHint());
    } catch (error) {
      if (mounted) setState(() => _error = readableError(error));
    } finally {
      if (mounted) setState(() => _regionsLoading = false);
    }
  }

  // getLastKnownPosition() is a cache-only read — it never prompts for
  // permission and never talks to the GPS radio, just returns whatever the
  // OS already has cached (or null). Safe to call unconditionally here;
  // failures (no permission yet, nothing cached) just leave the hint null
  // and every caller below already treats that as "fall back to default
  // behavior," not an error.
  Future<void> _loadRegionHintPosition() async {
    try {
      final position = await Geolocator.getLastKnownPosition();
      if (position != null) {
        _regionHintPosition =
            Coordinate(lat: position.latitude, lng: position.longitude);
      }
    } catch (_) {
      // Best-effort only.
    }
  }

  String? _nearestApprovedRegionId(
      List<DriverRegion> regions, Coordinate? position) {
    if (position == null) return null;
    String? nearestId;
    double? nearestMeters;
    for (final region in regions) {
      final center = region.center;
      if (center == null) continue;
      final meters = Geolocator.distanceBetween(
          position.lat, position.lng, center.lat, center.lng);
      if (nearestMeters == null || meters < nearestMeters) {
        nearestMeters = meters;
        nearestId = region.id;
      }
    }
    return nearestId;
  }

  // Same proximity signal as the default-selection logic above, applied to
  // the manual picker's list order — a driver who does need to pick by hand
  // (no cached position yet, or their real region isn't the auto-picked
  // one) sees the most plausible options first instead of an arbitrary
  // server order.
  List<DriverRegion> _regionsSortedByDistance(List<DriverRegion> regions) {
    final position = _regionHintPosition;
    if (position == null) return regions;
    final sorted = [...regions];
    sorted.sort((a, b) {
      final distanceA = a.center == null
          ? double.infinity
          : Geolocator.distanceBetween(
              position.lat, position.lng, a.center!.lat, a.center!.lng);
      final distanceB = b.center == null
          ? double.infinity
          : Geolocator.distanceBetween(
              position.lat, position.lng, b.center!.lat, b.center!.lng);
      return distanceA.compareTo(distanceB);
    });
    return sorted;
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
      await _loadRoadAlerts();
      unawaited(_loadDemandHint());
    } catch (error) {
      if (mounted) setState(() => _error = readableError(error));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  // Uses the same public /api/tariffs the passenger price screen reads —
  // there is no dedicated spatial "demand zone" endpoint anywhere in the
  // backend, only per-tariff surgeMultiplier/demandCoefficient. Taking the
  // max combined multiplier across the region's active tariffs is an
  // honest, real signal ("prices are up right now"), not a fabricated one.
  Future<void> _loadDemandHint() async {
    final regionId = _regionId;
    if (regionId == null) return;
    setState(() => _demandHintLoading = true);
    try {
      final tariffs = await widget.api.getTariffs(regionId);
      if (!mounted) return;
      setState(() => _regionTariffs = tariffs);
    } catch (_) {
      // Best-effort — a failed demand lookup must not disrupt the line tab.
    } finally {
      if (mounted) setState(() => _demandHintLoading = false);
    }
  }

  double get _demandLevel {
    if (_regionTariffs.isEmpty) return 1;
    return _regionTariffs
        .map((t) => t.surgeMultiplier * t.demandCoefficient)
        .reduce((a, b) => a > b ? a : b);
  }

  Future<void> _setOnline(bool nextOnline) async {
    setState(() {
      _loading = true;
      _error = null;
      if (nextOnline) {
        _locationLoading = true;
        _locationMessage = AppLocalizations.of(context).driverLocationChecking;
      }
    });
    try {
      await widget.api.setDriverStatus(nextOnline ? 'FREE' : 'OFFLINE');
      if (nextOnline) {
        final locationStarted = await _startLocationFlow();
        if (!locationStarted) {
          await widget.api.setDriverStatus('OFFLINE');
          if (!mounted) return;
          setState(() {
            _online = false;
            _locationMessage = null;
          });
          return;
        }
        widget.sockets.joinDrivers();
        await _loadOrders();
        await _loadDriverStats();
        await _loadRoadAlerts();
      } else {
        await _positionSub?.cancel();
        _positionSub = null;
        _locationMessage = null;
        _navigatorMessage = null;
      }
      if (!mounted) return;
      setState(() => _online = nextOnline);
    } catch (error) {
      // Belt-and-suspenders: _disabledReason() already checks region
      // approval status up front and disables the toggle, but that status
      // is only as fresh as the last _loadRegions() call — an admin
      // approval/block landing in between would only surface here, as the
      // actual API rejection. Route it through a toast + the support sheet
      // instead of the bare inline _error banner other failures (network
      // issues, DRIVER_HAS_ACTIVE_ORDER, etc.) still use.
      //
      // DRIVER_DOCUMENTS_NOT_APPROVED is kept here even though the
      // client-side document gate was removed (see the "Stop requiring
      // driver documents" commit) — that change also removed server-side
      // enforcement in this repo, but a deployed backend that hasn't picked
      // up that change yet can still throw this code (confirmed happening
      // against the prod Railway instance — see docs/status/
      // mobile-driver-overnight-2026-07-15.md's prod-deployment-gap notes).
      // Without this, a driver hitting that stale backend gets a silent
      // toggle revert with no explanation instead of a clear message.
      const approvalCodes = {
        'DRIVER_REGION_NOT_APPROVED',
        'DRIVER_REGION_BLOCKED',
        'DRIVER_BLOCKED',
        'DRIVER_DOCUMENTS_NOT_APPROVED',
      };
      // apiErrorCode reads response.data['error'] directly — DioException's
      // own toString() never includes the response body, so matching
      // approvalCodes against error.toString() (as this used to) never
      // actually matched a real rejection and this branch was dead code.
      final isApprovalBlock =
          nextOnline && approvalCodes.contains(apiErrorCode(error));
      if (isApprovalBlock) {
        if (mounted) {
          AppToast.showError(context, readableError(error));
          _showDriverFullSheet(_driverSupportContent);
        }
      } else if (mounted) {
        setState(() => _error = readableError(error));
      }
      if (nextOnline && mounted) setState(() => _locationMessage = null);
    } finally {
      if (mounted) {
        setState(() {
          _loading = false;
          _locationLoading = false;
        });
      }
    }
  }

  Future<bool> _startLocationFlow() async {
    final enabled = await Geolocator.isLocationServiceEnabled();
    if (!mounted) return false;
    if (!enabled) {
      setState(() =>
          _error = AppLocalizations.of(context).driverLocationRequiredError);
      return false;
    }
    var permission = await Geolocator.checkPermission();
    if (permission == LocationPermission.denied) {
      permission = await Geolocator.requestPermission();
    }
    if (!mounted) return false;
    if (permission == LocationPermission.denied ||
        permission == LocationPermission.deniedForever) {
      setState(() =>
          _error = AppLocalizations.of(context).driverLocationRequiredError);
      return false;
    }
    await _positionSub?.cancel();
    _positionSub = Geolocator.getPositionStream(
      locationSettings: const LocationSettings(
          accuracy: LocationAccuracy.high, distanceFilter: 20),
    ).listen((position) async {
      if (mounted) {
        setState(() => _applyPositionFix(position));
      }
      _checkCameraProximity(position);
      _checkSignProximity(position);
      _checkSpeedingVoiceWarning(position);
      _checkManeuverVoiceAnnouncement();
      unawaited(_maybeFetchOsmNavigation(position));
      unawaited(_maybeRefreshDriverRoute(position));
      try {
        final tripDistanceM = await widget.api.updateDriverLocation(
          location: Coordinate(lat: position.latitude, lng: position.longitude),
          heading: position.heading.isFinite ? position.heading : null,
          speed: position.speed.isFinite ? position.speed : null,
          accuracy: position.accuracy.isFinite ? position.accuracy : null,
        );
        if (mounted && tripDistanceM != null) {
          setState(() => _tripDistanceTraveledM = tripDistanceM);
        }
      } catch (error) {
        // readableError, not a hardcoded generic string — the backend
        // rejects this for real, specific, non-retryable reasons too
        // (DRIVER_LOCATION_OUTSIDE_REGION, DRIVER_REGION_INACTIVE,
        // DRIVER_OFFLINE on a status race), and "Попробуйте снова" is
        // actively misleading for those: retrying an out-of-region ping
        // will never succeed until the driver is actually back in the
        // region.
        if (mounted) {
          setState(() => _locationMessage = readableError(error));
        }
      }
    }, onError: (_) {
      if (mounted) {
        setState(() => _locationMessage =
            AppLocalizations.of(context).driverLocationFetchFailed);
      }
    });
    try {
      final current = await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(
          accuracy: LocationAccuracy.high,
          timeLimit: Duration(seconds: 10),
        ),
      );
      if (mounted) {
        setState(() => _applyPositionFix(current));
      }
      await widget.api.updateDriverLocation(
        location: Coordinate(lat: current.latitude, lng: current.longitude),
        heading: current.heading.isFinite ? current.heading : null,
        speed: current.speed.isFinite ? current.speed : null,
        accuracy: current.accuracy.isFinite ? current.accuracy : null,
      );
      if (mounted) {
        setState(() => _locationMessage =
            AppLocalizations.of(context).driverLocationActive);
      }
    } on TimeoutException {
      // The position stream started above is already listening and will
      // deliver the first fix on its own once GPS resolves (cold start
      // indoors can take longer than this seed call is willing to wait) —
      // don't block "going online" on it.
      if (mounted) {
        setState(() => _locationMessage =
            AppLocalizations.of(context).driverLocationActive);
      }
    } catch (error) {
      // readableError, not a hardcoded generic string — same reasoning as
      // the position-stream catch above.
      if (mounted) {
        setState(() => _error = readableError(error));
      }
      return false;
    }
    return true;
  }

  Future<void> _loadOrders() async {
    setState(() => _ordersLoading = true);
    try {
      final orders = await widget.api.getOrders();
      final active =
          orders.where((order) => order.isActive).toList(growable: false);
      final current = _activeOrder;
      OrderSummary? retainedTerminal;
      if (current != null && !current.isActive) {
        for (final order in orders) {
          if (order.id == current.id) {
            retainedTerminal = order;
            break;
          }
        }
      }
      final restoredActive = active.isEmpty ? retainedTerminal : active.first;
      final needsRoute = restoredActive != null &&
          restoredActive.id != current?.id &&
          _hasActiveDrivingLeg(restoredActive.status);
      if (!mounted) return;
      setState(() {
        _orders = orders;
        _activeOrder = restoredActive;
        if (restoredActive != null && restoredActive.distanceTraveledM != null) {
          _tripDistanceTraveledM = restoredActive.distanceTraveledM;
        }
      });
      // Cold start (or app resume) landing on an order that's already in
      // progress — e.g. the app was killed mid-trip — needs its route line
      // fetched explicitly since nothing else has triggered it yet.
      if (needsRoute) unawaited(_loadDriverRoute(restoredActive.id));
    } catch (error) {
      if (mounted) setState(() => _error = readableError(error));
    } finally {
      if (mounted) setState(() => _ordersLoading = false);
    }
  }

  Future<void> _loadRoadAlerts() async {
    setState(() => _roadAlertsLoading = true);
    try {
      final alerts = await widget.api.getDriverRoadAlerts(regionId: _regionId);
      if (!mounted) return;
      setState(() {
        _roadAlerts = alerts;
        _navigatorMessage = null;
      });
    } catch (error) {
      if (!mounted) return;
      setState(() => _navigatorMessage = readableError(error));
    } finally {
      if (mounted) setState(() => _roadAlertsLoading = false);
    }
  }

  static double _metersBetween(
      double lat1, double lng1, double lat2, double lng2) {
    const earthRadius = 6371000.0;
    final dLat = (lat2 - lat1) * math.pi / 180;
    final dLng = (lng2 - lng1) * math.pi / 180;
    final a = math.sin(dLat / 2) * math.sin(dLat / 2) +
        math.cos(lat1 * math.pi / 180) *
            math.cos(lat2 * math.pi / 180) *
            math.sin(dLng / 2) *
            math.sin(dLng / 2);
    return earthRadius * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a));
  }

  Future<void> _maybeFetchOsmNavigation(Position position) async {
    if (_osmFetchInFlight) return;
    final center = _osmFetchCenter;
    final movedFar = center == null ||
        _metersBetween(
              center.latitude,
              center.longitude,
              position.latitude,
              position.longitude,
            ) >
            800;
    if (!movedFar) return;
    _osmFetchInFlight = true;
    try {
      final info = await widget.api.getOsmNavigation(
        location: Coordinate(lat: position.latitude, lng: position.longitude),
      );
      if (!mounted) return;
      final previousLimit = _osmSpeedLimit;
      setState(() {
        _osmCameras = info.cameras;
        _osmSigns = info.signs;
        _osmSpeedLimit = info.speedLimit;
        _osmFetchCenter = LatLng(position.latitude, position.longitude);
      });
      _announceSpeedLimitChange(previousLimit, info.speedLimit);
    } catch (_) {
      // Best-effort layer — a failed OSM lookup must not disrupt the rest
      // of the navigator (crowd-reported alerts keep working regardless).
    } finally {
      _osmFetchInFlight = false;
    }
  }

  // Calls out a change in the posted limit as the driver crosses into a new
  // stretch of road. Skips the very first reading (previous == null, just the
  // navigator warming up) and uses a shared dedupe key with a cooldown —
  // not one keyed by value — so GPS jitter right at a boundary between two
  // limits can't bounce back and forth into repeated announcements.
  void _announceSpeedLimitChange(int? previous, int? next) {
    if (next == null || previous == null || previous == next) return;
    unawaited(_voice.announce(
      'Ограничение скорости $next',
      dedupeKey: 'speed-limit-change',
      cooldown: const Duration(seconds: 15),
    ));
  }

  // Minimum distance in meters from a point to any segment of a polyline —
  // used to detect when the driver has left the drawn route (took a
  // different street than planned) so it can be recomputed, like a real
  // turn-by-turn navigator rerouting instead of leaving a stale line drawn.
  static double _distanceToPolylineMeters(LatLng point, List<LatLng> line) {
    if (line.isEmpty) return double.infinity;
    if (line.length == 1) {
      return _metersBetween(
          point.latitude, point.longitude, line[0].latitude, line[0].longitude);
    }
    double best = double.infinity;
    for (var i = 0; i < line.length - 1; i++) {
      final a = line[i];
      final b = line[i + 1];
      final distance = _distanceToSegmentMeters(point, a, b);
      if (distance < best) best = distance;
    }
    return best;
  }

  static double _distanceToSegmentMeters(LatLng p, LatLng a, LatLng b) {
    // Equirectangular projection is accurate enough at street scale and
    // much cheaper than true great-circle segment math for a live UI check.
    final lat0 = p.latitude * math.pi / 180;
    final cosLat = math.cos(lat0);
    double x(LatLng v) => v.longitude * cosLat;
    double y(LatLng v) => v.latitude;
    final px = x(p), py = y(p);
    final ax = x(a), ay = y(a);
    final bx = x(b), by = y(b);
    final dx = bx - ax, dy = by - ay;
    final lengthSquared = dx * dx + dy * dy;
    double t = lengthSquared == 0
        ? 0
        : ((px - ax) * dx + (py - ay) * dy) / lengthSquared;
    t = t.clamp(0.0, 1.0);
    final closestLng = (ax + t * dx) / cosLat;
    final closestLat = ay + t * dy;
    return _metersBetween(p.latitude, p.longitude, closestLat, closestLng);
  }

  static double _bearingBetween(LatLng a, LatLng b) {
    final lat1 = a.latitude * math.pi / 180;
    final lat2 = b.latitude * math.pi / 180;
    final dLng = (b.longitude - a.longitude) * math.pi / 180;
    final y = math.sin(dLng) * math.cos(lat2);
    final x = math.cos(lat1) * math.sin(lat2) -
        math.sin(lat1) * math.cos(lat2) * math.cos(dLng);
    return (math.atan2(y, x) * 180 / math.pi + 360) % 360;
  }

  // Signed difference in degrees, positive = turning right, negative = left,
  // normalized to (-180, 180] so a bearing wrap (e.g. 350° -> 10°) reads as
  // a small +20 turn instead of a huge -340.
  static double _bearingDelta(double from, double to) {
    var delta = (to - from) % 360;
    if (delta > 180) delta -= 360;
    if (delta < -180) delta += 360;
    return delta;
  }

  // routing.service.js now asks OSRM for steps=true, so real turn-by-turn
  // data (actual street names, actual maneuver type — not a guess) is
  // available whenever the current route came from a live OSRM answer.
  // Falls back to the old bearing-change heuristic only when steps is empty
  // (the straight-line degraded-mode fallback route, which has no real
  // steps to offer — see routing.service.js's straightLineRouteFallback).
  ({
    String label,
    IconData icon,
    double distanceMeters,
    String? streetName,
    LatLng location,
  })?
      _nextManeuverHint() {
    final geometry = _driverRoute?.geometry;
    final position = _currentCoordinate;
    if (geometry == null || geometry.length < 3 || position == null) {
      return null;
    }
    final current = position.toLatLng();

    var nearestIndex = 0;
    var nearestDistance = double.infinity;
    for (var i = 0; i < geometry.length - 1; i++) {
      final distance =
          _distanceToSegmentMeters(current, geometry[i], geometry[i + 1]);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestIndex = i;
      }
    }
    // More than ~120m off every segment means the drawn route is stale
    // (already handled by _maybeRefreshDriverRoute's own reroute check) —
    // don't guess a maneuver against a route that's about to be replaced.
    if (nearestDistance > 120) return null;

    final steps = _driverRoute?.steps ?? const [];
    if (steps.isNotEmpty) {
      final fromSteps =
          _nextManeuverFromSteps(steps, geometry, nearestIndex, current);
      if (fromSteps != null) return fromSteps;
    }
    return _nextManeuverFromBearing(geometry, nearestIndex, current);
  }

  // Each step's real maneuver.location is matched to its nearest point on
  // the already-drawn geometry, so "is this step still ahead of the driver"
  // reuses the exact same route-progress signal (nearestIndex) as the
  // bearing fallback below — one consistent notion of "where on the route
  // the driver currently is" either way.
  ({
    String label,
    IconData icon,
    double distanceMeters,
    String? streetName,
    LatLng location,
  })?
      _nextManeuverFromSteps(List<RouteStep> steps, List<LatLng> geometry,
          int nearestIndex, LatLng current) {
    for (final step in steps) {
      // The depart step just marks the trip's starting point, not something
      // to alert the driver about.
      if (step.type == 'depart') continue;
      final stepPoint = step.location.toLatLng();
      var stepIndex = 0;
      var stepNearestDistance = double.infinity;
      for (var i = 0; i < geometry.length; i++) {
        final distance = _metersBetween(geometry[i].latitude,
            geometry[i].longitude, stepPoint.latitude, stepPoint.longitude);
        if (distance < stepNearestDistance) {
          stepNearestDistance = distance;
          stepIndex = i;
        }
      }
      if (stepIndex < nearestIndex) continue; // already passed
      final (label, icon) =
          maneuverLabelAndIcon(step.type, step.modifier, exit: step.exit);
      return (
        label: label,
        icon: icon,
        distanceMeters: _metersBetween(current.latitude, current.longitude,
            stepPoint.latitude, stepPoint.longitude),
        streetName: step.streetName.isEmpty ? null : step.streetName,
        location: stepPoint,
      );
    }
    return null;
  }

  // Real turn data unavailable (straight-line fallback route, see
  // routing.service.js's straightLineRouteFallback) — derive a maneuver
  // from bearing changes in the plain geometry instead. Degraded but still
  // genuinely derived from real geometry, not invented.
  ({
    String label,
    IconData icon,
    double distanceMeters,
    String? streetName,
    LatLng location,
  })?
      _nextManeuverFromBearing(
          List<LatLng> route, int nearestIndex, LatLng current) {
    const lookaheadMeters = 800.0;
    const turnThresholdDegrees = 28.0;
    final baseBearing =
        _bearingBetween(route[nearestIndex], route[nearestIndex + 1]);
    var cumulative = _metersBetween(
      current.latitude,
      current.longitude,
      route[nearestIndex + 1].latitude,
      route[nearestIndex + 1].longitude,
    );
    for (var i = nearestIndex + 1;
        i < route.length - 1 && cumulative < lookaheadMeters;
        i++) {
      final segmentBearing = _bearingBetween(route[i], route[i + 1]);
      final delta = _bearingDelta(baseBearing, segmentBearing);
      if (delta.abs() >= turnThresholdDegrees) {
        final (label, icon) = delta.abs() >= 150
            ? ('Разворот', Icons.u_turn_left_rounded)
            : delta > 0
                ? ('Поворот направо', Icons.turn_right_rounded)
                : ('Поворот налево', Icons.turn_left_rounded);
        return (
          label: label,
          icon: icon,
          distanceMeters: cumulative,
          streetName: null,
          location: route[i],
        );
      }
      cumulative += _metersBetween(
        route[i].latitude,
        route[i].longitude,
        route[i + 1].latitude,
        route[i + 1].longitude,
      );
    }
    return null;
  }

  bool _hasActiveDrivingLeg(String? status) =>
      _routePhaseForStatus(status) != null;

  Future<void> _maybeRefreshDriverRoute(Position position) async {
    final order = _activeOrder;
    if (order == null || !_hasActiveDrivingLeg(order.status)) return;
    if (_routeFetchInFlight) return;

    final phase = _routePhaseForStatus(order.status);
    final now = DateTime.now();
    final elapsed =
        _lastRouteFetchAt == null ? null : now.difference(_lastRouteFetchAt!);
    final phaseChanged = phase != _lastRoutePhase;
    final dueForRefresh = elapsed == null || elapsed.inSeconds >= 12;
    final route = _driverRoute;
    final offRoute = route == null ||
        route.geometry.isEmpty ||
        _distanceToPolylineMeters(
              LatLng(position.latitude, position.longitude),
              route.geometry,
            ) >
            60;

    if (!phaseChanged && !dueForRefresh && !offRoute) return;
    // Hard floor so erratic GPS near the deviation threshold can't spam the
    // routing provider — never more than one refetch every few seconds.
    if (elapsed != null && elapsed.inSeconds < 4) return;

    _routeFetchInFlight = true;
    try {
      await _loadDriverRoute(order.id);
    } finally {
      _routeFetchInFlight = false;
    }
  }

  // Shows the navigator banner for [duration], then forces a rebuild once it
  // expires so it disappears without waiting on the next GPS tick.
  void _showNavigatorBanner(String text, Duration duration) {
    if (!mounted) return;
    setState(() {
      _navigatorBannerText = text;
      _navigatorBannerUntil = DateTime.now().add(duration);
    });
    Timer(duration, () {
      if (mounted) setState(() {});
    });
  }

  // Warns the driver as they approach a known camera in three stages —
  // 500m, 200m, then a short cue as they reach it — each spoken at most
  // once per approach. A camera can only advance forward through its own
  // stages (never re-announce a stage already given), and its stage resets
  // once it clears resetAtMeters so a later approach warns again from 0.
  void _checkCameraProximity(Position position) {
    const warnAtMeters = 500.0;
    const nearAtMeters = 200.0;
    const passAtMeters = 60.0;
    const resetAtMeters = 700.0;
    for (final alert in _allNavigatorAlerts) {
      if (alert.type != 'SPEED_CAMERA') continue;
      final distance = _metersBetween(
        position.latitude,
        position.longitude,
        alert.lat,
        alert.lng,
      );
      if (distance > resetAtMeters) {
        _cameraStage.remove(alert.id);
        continue;
      }
      final stage = _cameraStage[alert.id] ?? 0;
      if (stage >= 3) continue;
      final headingSuffix =
          alert.heading != null ? ', ${compassLabel(alert.heading!)}' : '';
      if (stage < 1 && distance <= warnAtMeters) {
        _cameraStage[alert.id] = 1;
        unawaited(HapticFeedback.mediumImpact());
        unawaited(_voice.announce('Через 500 метров камера',
            dedupeKey: 'cam-${alert.id}-500'));
        _showNavigatorBanner(
            'Камера через 500 м$headingSuffix', const Duration(seconds: 10));
      } else if (stage < 2 && distance <= nearAtMeters) {
        _cameraStage[alert.id] = 2;
        unawaited(HapticFeedback.heavyImpact());
        unawaited(_voice.announce('Через 200 метров камера',
            dedupeKey: 'cam-${alert.id}-200'));
        _showNavigatorBanner(
            'Камера через 200 м$headingSuffix', const Duration(seconds: 10));
      } else if (stage < 3 && distance <= passAtMeters) {
        _cameraStage[alert.id] = 3;
        unawaited(HapticFeedback.heavyImpact());
        unawaited(_voice.announce('Камера', dedupeKey: 'cam-${alert.id}-pass'));
        _showNavigatorBanner(
            'Камера$headingSuffix', const Duration(seconds: 6));
      }
    }
  }

  // Calls out a mapped roadside sign as the driver passes it — same
  // once-per-approach pattern as the camera check (see the comment there for
  // why "nearest not-yet-alerted" beats "nearest overall"), just a shorter
  // trigger radius since a sign is a point of interest, not a hazard to
  // brake for.
  void _checkSignProximity(Position position) {
    const warnAtMeters = 120.0;
    const resetAtMeters = 250.0;
    OsmSign? candidate;
    double candidateDistance = double.infinity;
    for (final sign in _osmSigns) {
      final distance = _metersBetween(
        position.latitude,
        position.longitude,
        sign.lat,
        sign.lng,
      );
      if (distance > resetAtMeters) {
        _signAlertedIds.remove(sign.id);
        continue;
      }
      if (distance <= warnAtMeters &&
          !_signAlertedIds.contains(sign.id) &&
          distance < candidateDistance) {
        candidateDistance = distance;
        candidate = sign;
      }
    }
    if (candidate == null) return;
    _signAlertedIds.add(candidate.id);
    final limitSuffix =
        candidate.speedLimit != null ? ' ${candidate.speedLimit}' : '';
    unawaited(_voice.announce(
      '${candidate.label}$limitSuffix',
      dedupeKey: 'sign-${candidate.id}',
    ));
    if (mounted) {
      setState(() {
        _navigatorBannerText = 'Знак: ${candidate!.label}$limitSuffix';
        _navigatorBannerUntil = DateTime.now().add(const Duration(seconds: 8));
      });
      Timer(const Duration(seconds: 8), () {
        if (mounted) setState(() {});
      });
    }
  }

  // Speaks a single, rate-limited warning while the driver is over the
  // known limit — never on every GPS tick, which would be constant nagging.
  void _checkSpeedingVoiceWarning(Position position) {
    final limit = _activeSpeedLimit;
    if (limit == null) return;
    final speed = position.speed;
    if (!speed.isFinite || speed < 0) return;
    final speedKmh = (speed * 3.6).round();
    if (speedKmh <= limit + 5) return;
    unawaited(_voice.announce(
      'Превышение скорости',
      dedupeKey: 'speeding',
      cooldown: const Duration(seconds: 25),
    ));
  }

  // Voice-announces the upcoming turn from the same real maneuver data the
  // banner shows — a driver's eyes should stay on the road, not need to
  // glance at the screen to know a turn is coming. Same two-stage,
  // once-per-approach idea as _checkCameraProximity, just keyed by the
  // maneuver's own location (rounded) since a step/bearing-derived turn has
  // no stable id of its own the way a road alert does.
  void _checkManeuverVoiceAnnouncement() {
    final maneuver = _nextManeuverHint();
    if (maneuver == null) {
      _announcedManeuverKey = null;
      _announcedManeuverStage = 0;
      return;
    }
    const prepareAtMeters = 200.0;
    const nowAtMeters = 40.0;
    final key = '${(maneuver.location.latitude * 2000).round()}'
        '_${(maneuver.location.longitude * 2000).round()}';
    if (key != _announcedManeuverKey) {
      _announcedManeuverKey = key;
      _announcedManeuverStage = 0;
    }
    if (_announcedManeuverStage >= 2) return;
    final streetSuffix =
        maneuver.streetName == null ? '' : ' на ${maneuver.streetName}';
    if (_announcedManeuverStage < 1 &&
        maneuver.distanceMeters <= prepareAtMeters) {
      _announcedManeuverStage = 1;
      unawaited(_voice.announce(
        'Через 200 метров ${maneuver.label.toLowerCase()}$streetSuffix',
        dedupeKey: 'maneuver-$key-prepare',
      ));
    } else if (_announcedManeuverStage < 2 &&
        maneuver.distanceMeters <= nowAtMeters) {
      _announcedManeuverStage = 2;
      unawaited(
          _voice.announce(maneuver.label, dedupeKey: 'maneuver-$key-now'));
    }
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
    widget.onChangeLocale?.call(Locale(code));
  }

  Future<void> _chooseTheme() async {
    final current = widget.themeMode ?? ThemeMode.light;
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

  void _toggleVoice() {
    final next = !_voiceEnabled;
    setState(() => _voiceEnabled = next);
    _voice.setEnabled(next);
    unawaited(widget.authStore.saveVoiceEnabled(next));
  }

  Future<void> _loadDriverStats() async {
    setState(() => _driverStatsLoading = true);
    try {
      final stats = await widget.api.getDriverStats();
      if (!mounted) return;
      setState(() => _driverStats = stats);
    } catch (_) {
      // Stats should never block line work or order handling.
    } finally {
      if (mounted) setState(() => _driverStatsLoading = false);
    }
  }

  Future<void> _loadAvatar() async {
    try {
      final url = await widget.api.getDriverAvatarUrl();
      if (!mounted) return;
      setState(() => _avatarUrl = url);
    } catch (_) {
      // No avatar yet, or the fetch failed — the profile screen falls back
      // to a plain icon either way, not worth surfacing an error for.
    }
  }

  // Camera only, never a gallery pick — a photo passengers rely on to
  // recognize their driver has to actually be this driver, not whatever
  // picture happens to be saved on their phone.
  Future<void> _captureAvatar() async {
    final l10n = AppLocalizations.of(context);
    final file = await ImagePicker().pickImage(
      source: ImageSource.camera,
      preferredCameraDevice: CameraDevice.front,
      imageQuality: 85,
    );
    if (file == null) return;
    if (!mounted) return;
    setState(() => _avatarUploading = true);
    try {
      final url = await widget.api.uploadDriverAvatar(file.path);
      if (!mounted) return;
      setState(() => _avatarUrl = url);
      AppToast.showSuccess(context, l10n.driverAvatarUpdated);
    } catch (_) {
      if (!mounted) return;
      AppToast.showError(context, l10n.driverAvatarUploadError);
    } finally {
      if (mounted) setState(() => _avatarUploading = false);
    }
  }

  Future<void> _accept(OrderSummary order) async {
    if (!_online) {
      setState(() =>
          _error = AppLocalizations.of(context).driverGoOnlineRequiredError);
      return;
    }
    setState(() {
      _acceptingOrderId = order.id;
      _error = null;
    });
    try {
      final accepted = await widget.api.acceptOrder(order.id);
      widget.sockets.joinOrder(accepted.id);
      if (!mounted) return;
      setState(() {
        _activeOrder = accepted;
        _orders = mergeOrder(_orders, accepted);
        _tab = 2;
        _online = true;
      });
      await _loadDriverRoute(accepted.id);
      await _loadDriverStats();
    } catch (error) {
      if (mounted) setState(() => _error = readableError(error));
    } finally {
      if (mounted) setState(() => _acceptingOrderId = null);
    }
  }

  Future<void> _reject(OrderSummary order) async {
    if (!_online) {
      setState(() => _error =
          AppLocalizations.of(context).driverGoOnlineRequiredRejectError);
      return;
    }
    setState(() {
      _rejectingOrderId = order.id;
      _error = null;
    });
    try {
      await widget.api.rejectDriverOrder(order.id);
      if (!mounted) return;
      setState(() {
        _orders = _orders.where((item) => item.id != order.id).toList();
      });
    } catch (error) {
      if (!mounted) return;
      setState(() => _error = readableError(error));
    } finally {
      if (mounted) setState(() => _rejectingOrderId = null);
    }
  }

  String? _offeringPriceOrderId;

  Future<void> _offerPrice(OrderSummary order) async {
    final priceKzt = await showModalBottomSheet<int>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => _PriceOfferSheet(currentPrice: order.price),
    );
    if (priceKzt == null || !mounted) return;
    setState(() => _offeringPriceOrderId = order.id);
    try {
      final updated = await widget.api.submitDriverPriceOffer(
        orderId: order.id,
        priceKzt: priceKzt,
      );
      if (!mounted) return;
      setState(() => _orders = mergeOrder(_orders, updated));
      AppToast.showSuccess(context, 'Предложение цены отправлено клиенту');
    } catch (error) {
      if (!mounted) return;
      AppToast.showError(context, readableError(error));
    } finally {
      if (mounted) setState(() => _offeringPriceOrderId = null);
    }
  }

  Future<void> _tripAction(
    String label,
    Future<OrderSummary> Function(String id) action,
  ) async {
    if (_activeOrder == null) return;
    setState(() {
      _tripActionLabel = label;
      _error = null;
    });
    try {
      final order = await action(_activeOrder!.id);
      if (!mounted) return;
      setState(() {
        _activeOrder = order;
        _orders = mergeOrder(_orders, order);
        if (!order.isActive && !order.isOpen) {
          _driverRoute = null;
        }
      });
      await _loadDriverStats();
    } catch (error) {
      if (mounted) setState(() => _error = readableError(error));
    } finally {
      if (mounted) setState(() => _tripActionLabel = null);
    }
  }

  Future<void> _loadDriverRoute(String orderId) async {
    // _maybeRefreshDriverRoute's own in-flight guard only covers its own
    // periodic calls — this is also called directly on bootstrap, order
    // restore, and order acceptance, so two fetches can still overlap. Only
    // the most recently issued request's response is ever applied, so a
    // slower/older one can't land after a newer one and paint a stale route
    // back onto the map.
    _lastRouteFetchAt = DateTime.now();
    final requestId = ++_driverRouteRequestId;
    try {
      final route = await widget.api.driverToPickupRoute(orderId);
      if (requestId != _driverRouteRequestId) return;
      _lastRoutePhase = route.phase;
      if (mounted) {
        setState(() {
          _driverRoute = route;
          _error = null;
        });
      }
    } catch (error) {
      if (requestId != _driverRouteRequestId) return;
      if (mounted) {
        setState(() {
          _driverRoute = null;
          _error = readableError(error);
        });
      }
    }
  }

  void _openDrawer() => _scaffoldKey.currentState?.openDrawer();

  Future<void> _openRoadAlerts() async {
    final scaffold = _scaffoldKey.currentState;
    if (scaffold?.isDrawerOpen ?? false) {
      Navigator.pop(context);
    }
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (context) => _RoadAlertsSheet(
        api: widget.api,
        regionId: _regionId,
        initialCenter: _lastPosition != null
            ? Coordinate(
                lat: _lastPosition!.latitude, lng: _lastPosition!.longitude)
            : (_regionHintPosition ?? _currentRegionCenter()),
      ),
    );
    if (mounted) unawaited(_loadRoadAlerts());
  }

  // GPS and the region-hint hue both need a live/recent position fix, which
  // a driver who just logged in and hasn't gone online yet won't have —
  // the assigned region's own center (loaded with the region list at login,
  // no GPS required) is the next best guess before falling back to a
  // hardcoded default.
  Coordinate? _currentRegionCenter() {
    for (final region in _regions) {
      if (region.id == _regionId) return region.center;
    }
    return null;
  }

  // contentBuilder is called fresh every time this sheet rebuilds (not just
  // once at the call site) — content built via context.palette.X used to be
  // baked in as a plain Widget at the moment the caller tapped through, so
  // toggling the theme while the sheet was open left borders/backgrounds
  // showing the old colors until the sheet was closed and reopened.
  //
  // The sheet's own backdrop paints inside the builder too, not via
  // showModalBottomSheet's `backgroundColor` argument — that argument is
  // resolved once, outside the builder, so it froze at whatever theme was
  // active when the sheet first opened (visible as a dark strip behind the
  // title and between cards after switching to light while the sheet was
  // already up).
  void _showDriverFullSheet(Widget Function() contentBuilder) {
    Navigator.pop(context);
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (context) => ClipRRect(
        borderRadius: const BorderRadius.vertical(top: Radius.circular(28)),
        child: ColoredBox(
          color: context.palette.appBackground,
          child: FractionallySizedBox(
            heightFactor: 0.9,
            child: SafeArea(
              top: false,
              child: Column(
                children: [
                  const Padding(
                    padding: EdgeInsets.only(top: 10),
                    child: SheetHandle(),
                  ),
                  Expanded(child: contentBuilder()),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _driverProfileContent() {
    final l10n = AppLocalizations.of(context);
    final region = _regions.firstWhere(
      (r) => r.id == _regionId,
      orElse: () => _regions.isNotEmpty
          ? _regions.first
          : DriverRegion(
              id: '',
              name: l10n.driverProfileRegionNotSelected,
              status: 'PENDING',
              isActive: false),
    );
    final stats = _driverStats;
    return ListView(
      padding: const EdgeInsets.all(20),
      children: [
        TitleBlock(
          title: l10n.driverProfileTitle,
          text: l10n.driverProfileSubtitle,
        ),
        const SizedBox(height: 16),
        PremiumCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  GestureDetector(
                    onTap: _avatarUploading ? null : _captureAvatar,
                    child: Stack(
                      clipBehavior: Clip.none,
                      children: [
                        Container(
                          width: 52,
                          height: 52,
                          alignment: Alignment.center,
                          clipBehavior: Clip.antiAlias,
                          decoration: BoxDecoration(
                            color: context.palette.goldSurface,
                            borderRadius: BorderRadius.circular(18),
                            border: Border.all(color: context.palette.border),
                          ),
                          child: _avatarUrl == null
                              ? Icon(Icons.person_rounded,
                                  color: context.palette.goldDeep, size: 26)
                              : Image.network(
                                  '${AppConfig.apiBaseUrl}$_avatarUrl',
                                  fit: BoxFit.cover,
                                  width: 52,
                                  height: 52,
                                  errorBuilder: (context, error, stackTrace) =>
                                      Icon(Icons.person_rounded,
                                          color: context.palette.goldDeep,
                                          size: 26),
                                ),
                        ),
                        Positioned(
                          right: -2,
                          bottom: -2,
                          child: Container(
                            width: 22,
                            height: 22,
                            alignment: Alignment.center,
                            decoration: BoxDecoration(
                              color: context.palette.goldDeep,
                              shape: BoxShape.circle,
                              border: Border.all(
                                  color: context.palette.card, width: 2),
                            ),
                            child: _avatarUploading
                                ? const SizedBox(
                                    width: 10,
                                    height: 10,
                                    child: CircularProgressIndicator(
                                        strokeWidth: 1.6,
                                        color: Colors.white),
                                  )
                                : const Icon(Icons.camera_alt_rounded,
                                    size: 12, color: Colors.white),
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          widget.accountLabel.isEmpty
                              ? l10n.driverProfileNameFallback
                              : widget.accountLabel,
                          style: TextStyle(
                              color: context.palette.text,
                              fontSize: 17,
                              fontWeight: FontWeight.w900),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          _accountPhone.isEmpty
                              ? l10n.driverProfilePhoneMissing
                              : _accountPhone,
                          style: TextStyle(
                            color: context.palette.textSecondary,
                            fontSize: 12.5,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 16),
              const Divider(height: 1),
              const SizedBox(height: 16),
              DriverProfileRow(
                  label: l10n.driverProfileRegionLabel, value: region.name),
              DriverProfileRow(
                label: l10n.driverProfileLineStatusLabel,
                value: _online
                    ? l10n.driverStatusOnline
                    : l10n.driverStatusOffline,
              ),
              if (stats != null) ...[
                DriverProfileRow(
                  label: l10n.driverProfileOrdersTodayLabel,
                  value: '${stats.completedOrders}',
                ),
                DriverProfileRow(
                  label: l10n.driverProfileEarnedTodayLabel,
                  value: formatDriverMoney(stats.revenueTotal),
                ),
                DriverProfileRow(
                  label: l10n.driverProfileDebtLabel,
                  value: formatDriverMoney(stats.debt),
                  valueColor:
                      stats.debt > 0 ? context.palette.danger : null,
                ),
              ],
            ],
          ),
        ),
        const SizedBox(height: 12),
        InlineMessage(
          text: l10n.driverProfileDocumentsNote,
        ),
        if (_tripHistory.isNotEmpty) ...[
          const SizedBox(height: 20),
          Text(
            l10n.driverProfileTripHistoryTitle,
            style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w900),
          ),
          const SizedBox(height: 10),
          for (final trip in _tripHistory) ...[
            DriverTripHistoryCard(trip: trip),
            const SizedBox(height: 8),
          ],
        ] else if (_tripHistoryLoading) ...[
          const SizedBox(height: 20),
          const Center(
            child: Padding(
              padding: EdgeInsets.all(12),
              child: CircularProgressIndicator(strokeWidth: 2),
            ),
          ),
        ],
      ],
    );
  }

  Widget _driverRecurringBookingsContent() =>
      _DriverRecurringBookingsScreen(api: widget.api);

  Widget _driverSupportContent() {
    return StatefulBuilder(
      builder: (context, setSheetState) {
        final l10n = AppLocalizations.of(context);
        final topics = [
          l10n.driverSupportTopicOrder,
          l10n.driverSupportTopicRegion,
          l10n.driverSupportTopicBilling,
          l10n.driverSupportTopicOther,
        ];
        return ListView(
          padding: const EdgeInsets.all(20),
          children: [
            TitleBlock(
              title: l10n.driverSupportTitle,
              text: l10n.driverSupportSubtitle,
            ),
            const SizedBox(height: 16),
            PremiumCard(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  SectionLabel(
                    title: l10n.driverSupportTopicSectionTitle,
                    text: l10n.driverSupportTopicSectionText,
                  ),
                  const SizedBox(height: 12),
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: topics
                        .map(
                          (topic) => DriverSupportTopicChip(
                            label: topic,
                            selected: (_supportTopic ?? topics.first) == topic,
                            onTap: () =>
                                setSheetState(() => _supportTopic = topic),
                          ),
                        )
                        .toList(),
                  ),
                  const SizedBox(height: 16),
                  TextField(
                    controller: _supportController,
                    minLines: 5,
                    maxLines: 7,
                    decoration: InputDecoration(
                      labelText: l10n.driverSupportMessageLabel,
                      hintText: l10n.driverSupportMessageHint,
                      alignLabelWithHint: true,
                    ),
                  ),
                  if (_supportMessage != null) ...[
                    const SizedBox(height: 12),
                    InlineMessage(
                      text: _supportMessage!,
                      danger: _supportMessageDanger,
                    ),
                  ],
                  const SizedBox(height: 16),
                  ElevatedButton(
                    onPressed: _supportSending
                        ? null
                        : () async {
                            final text = _supportController.text.trim();
                            if (text.length < 8) {
                              setSheetState(() {
                                _supportMessageDanger = true;
                                _supportMessage =
                                    l10n.driverSupportMessageTooShort;
                              });
                              return;
                            }
                            setSheetState(() => _supportSending = true);
                            try {
                              await widget.api.submitSupportMessage(
                                topic: _supportTopic ?? topics.first,
                                message: text,
                                orderId: _activeOrder?.id,
                              );
                              _supportController.clear();
                              setSheetState(() {
                                _supportMessageDanger = false;
                                _supportMessage = l10n.driverSupportMessageSent;
                              });
                            } catch (error) {
                              setSheetState(() {
                                _supportMessageDanger = true;
                                _supportMessage = readableError(error);
                              });
                            } finally {
                              setSheetState(() => _supportSending = false);
                            }
                          },
                    style: ElevatedButton.styleFrom(
                        minimumSize: const Size.fromHeight(52)),
                    child: _supportSending
                        ? ButtonSpinner(text: l10n.driverSupportSendingButton)
                        : Text(l10n.driverSupportSendButton),
                  ),
                ],
              ),
            ),
          ],
        );
      },
    );
  }

  Widget _driverFaqContent() {
    final l10n = AppLocalizations.of(context);
    final items = [
      (l10n.driverFaqQ1, l10n.driverFaqA1),
      (l10n.driverFaqQ2, l10n.driverFaqA2),
      (l10n.driverFaqQ3, l10n.driverFaqA3),
      (l10n.driverFaqQ4, l10n.driverFaqA4),
      (l10n.driverFaqQ5, l10n.driverFaqA5),
      (l10n.driverFaqQ6, l10n.driverFaqA6),
    ];
    return ListView(
      padding: const EdgeInsets.all(20),
      children: [
        TitleBlock(
          title: l10n.driverFaqTitle,
          text: l10n.driverFaqSubtitle,
        ),
        const SizedBox(height: 16),
        for (final item in items)
          Padding(
            padding: const EdgeInsets.only(bottom: 10),
            child: DriverFaqTile(question: item.$1, answer: item.$2),
          ),
      ],
    );
  }

  Widget _driverAboutContent() {
    final l10n = AppLocalizations.of(context);
    return ListView(
      padding: const EdgeInsets.all(20),
      children: [
        PremiumCard(
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
                l10n.driverAboutDescription,
                style: TextStyle(
                  color: context.palette.textSecondary,
                  height: 1.45,
                  fontWeight: FontWeight.w600,
                ),
              ),
              const SizedBox(height: 16),
              DriverProfileRow(
                  label: l10n.driverAboutVersionLabel, value: _appVersion),
            ],
          ),
        ),
      ],
    );
  }

  Widget _driverSettingsContent() {
    final l10n = AppLocalizations.of(context);
    return ListView(
      padding: const EdgeInsets.all(20),
      children: [
        TitleBlock(
          title: l10n.driverSettingsTitle,
          text: l10n.driverSettingsSubtitle,
        ),
        const SizedBox(height: 16),
        DriverSettingsGroup(
          title: l10n.driverSettingsAccountGroup,
          children: [
            DriverSettingsRow(
              title: l10n.driverSettingsPhoneLabel,
              text: _accountPhone.isEmpty
                  ? l10n.driverSettingsPhoneMissing
                  : _accountPhone,
              onTap: _accountPhone.isEmpty
                  ? null
                  : () async {
                      await Clipboard.setData(
                          ClipboardData(text: _accountPhone));
                      if (!mounted) return;
                      AppToast.showSuccess(
                          context, l10n.driverSettingsPhoneCopied);
                    },
            ),
            DriverSettingsRow(
              title: l10n.driverSettingsLogoutTitle,
              text: l10n.driverSettingsLogoutText,
              danger: true,
              onTap: () {
                Navigator.of(context).pop();
                widget.onLogout();
              },
            ),
          ],
        ),
        const SizedBox(height: 14),
        DriverSettingsGroup(
          title: 'Выплаты',
          children: [
            PayoutMethodSettingsRow(api: widget.api),
          ],
        ),
        const SizedBox(height: 14),
        DriverSettingsGroup(
          title: l10n.driverSettingsInterfaceGroup,
          children: [
            DriverSettingsRow(
              title: l10n.driverSettingsLanguageLabel,
              text: widget.currentLocale?.languageCode == 'kk'
                  ? l10n.languageKazakh
                  : l10n.languageRussian,
              onTap: _chooseLanguage,
            ),
            DriverSettingsRow(
              title: 'Тема',
              text: switch (widget.themeMode ?? ThemeMode.light) {
                ThemeMode.dark => 'Тёмная',
                ThemeMode.system => 'Как в системе',
                ThemeMode.light => 'Светлая',
              },
              onTap: _chooseTheme,
            ),
          ],
        ),
        const SizedBox(height: 14),
        DriverSettingsGroup(
          title: l10n.driverSettingsAboutGroup,
          children: [
            DriverSettingsRow(
                title: l10n.driverAboutVersionLabel, text: _appVersion),
            DriverSettingsRow(
              title: l10n.driverSettingsTermsTitle,
              text: l10n.driverSettingsTermsText,
              onTap: () => _showDriverLegalSheet(
                title: l10n.termsOfUseLink,
                lead: termsOfUseLead,
                sections: termsOfUseSections,
              ),
            ),
            DriverSettingsRow(
              title: l10n.driverSettingsPrivacyTitle,
              text: l10n.driverSettingsPrivacyText,
              onTap: () => _showDriverLegalSheet(
                title: l10n.privacyPolicyTitle,
                lead: privacyPolicyLead,
                sections: privacyPolicySections,
              ),
            ),
          ],
        ),
      ],
    );
  }

  void _showDriverLegalSheet({
    required String title,
    required String lead,
    required List<LegalSection> sections,
  }) {
    showModalBottomSheet<void>(
      context: context,
      useSafeArea: true,
      backgroundColor: context.palette.card,
      showDragHandle: true,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(30)),
      ),
      builder: (context) => FractionallySizedBox(
        heightFactor: 0.85,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(24, 0, 24, 18),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                title,
                style: TextStyle(
                  color: context.palette.text,
                  fontSize: 20,
                  fontWeight: FontWeight.w900,
                ),
              ),
              const SizedBox(height: 8),
              Text(
                lead,
                style: TextStyle(
                  color: context.palette.textSecondary,
                  fontSize: 13,
                  fontWeight: FontWeight.w700,
                ),
              ),
              const SizedBox(height: 14),
              Expanded(
                child: ListView.separated(
                  physics: const BouncingScrollPhysics(),
                  itemCount: sections.length,
                  separatorBuilder: (_, __) => const SizedBox(height: 10),
                  itemBuilder: (context, index) {
                    return LegalSectionCard(
                      section: sections[index],
                      dark: Theme.of(context).brightness == Brightness.dark,
                    );
                  },
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    // The 4 bottom-nav tabs switch via local state, not a pushed route, so
    // there is nothing on the Navigator stack for back to pop. Walk back to
    // the Line tab first, and only offer to close the app once we're
    // already there.
    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, result) {
        if (didPop) return;
        if (_tab != 0) {
          _switchTab(0);
          return;
        }
        _exitGuard.handle(context);
      },
      child: Scaffold(
        key: _scaffoldKey,
        backgroundColor: context.palette.appBackground,
        drawerScrimColor: Colors.black.withValues(alpha: 0.26),
        drawer: DriverDrawer(
          accountLabel: widget.accountLabel,
          regionName: _selectedRegion?.name,
          online: _online,
          activeTab: _tab,
          onTab: (index) {
            Navigator.pop(context);
            // Smart Navigator (index 3) is a pushed full-screen route, not a
            // 4th IndexedStack pane — see the matching guard on
            // NavigationBar.onDestinationSelected above. IndexedStack only
            // has 3 children, so setState(() => _tab = 3) here would throw.
            if (index == 3) {
              unawaited(_openFullScreenNavigator());
              return;
            }
            _switchTab(index);
          },
          onPassenger: () {
            Navigator.pop(context);
            widget.onOpenPassengerMode();
          },
          onProfile: () => _showDriverFullSheet(_driverProfileContent),
          onWallet: () =>
              _showDriverFullSheet(() => DriverWalletScreen(api: widget.api)),
          onRating: () =>
              _showDriverFullSheet(() => DriverRatingScreen(api: widget.api)),
          onNotifications: () => _showDriverFullSheet(
              () => DriverNotificationsScreen(api: widget.api)),
          onSupport: () => _showDriverFullSheet(_driverSupportContent),
          onFaq: () => _showDriverFullSheet(_driverFaqContent),
          onAbout: () => _showDriverFullSheet(_driverAboutContent),
          onSettings: () => _showDriverFullSheet(_driverSettingsContent),
          onRoadAlerts: () => unawaited(_openRoadAlerts()),
          onRecurringBookings: () =>
              _showDriverFullSheet(_driverRecurringBookingsContent),
          onLogout: () async {
            Navigator.pop(context);
            final confirmed = await _confirmDriverAction(
              title: 'Выйти из аккаунта?',
              message:
                  'Придётся снова войти по номеру телефона, чтобы продолжить работу в SmartTaxi.',
              confirmLabel: 'Выйти',
            );
            if (confirmed) widget.onLogout();
          },
        ),
        body: SafeArea(
          child: Column(
            children: [
              DriverHeader(
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
              FloatingNav(
                child: NavigationBar(
                  selectedIndex: _tab,
                  onDestinationSelected: (index) {
                    // Smart Navigator isn't a 4th tab content pane — it's a
                    // dedicated full-screen mode (own back control, no
                    // bottom nav/app bar chrome) pushed as a real route, so
                    // the driver reads it as "I'm in navigation now," not
                    // "I switched to another tab of the same screen."
                    if (index == 3) {
                      unawaited(_openFullScreenNavigator());
                      return;
                    }
                    _switchTab(index);
                  },
                  destinations: [
                    NavigationDestination(
                        icon: const Icon(Icons.power_settings_new),
                        selectedIcon:
                            const Icon(Icons.power_settings_new_rounded),
                        label: AppLocalizations.of(context).driverTabLine),
                    NavigationDestination(
                        icon: const Icon(Icons.receipt_long_outlined),
                        selectedIcon: const Icon(Icons.receipt_long),
                        label: AppLocalizations.of(context).driverTabOrders),
                    NavigationDestination(
                        icon: const Icon(Icons.route_outlined),
                        selectedIcon: const Icon(Icons.route),
                        label: AppLocalizations.of(context).driverTabTrip),
                    NavigationDestination(
                        icon: const Icon(Icons.explore_outlined),
                        selectedIcon: const Icon(Icons.explore_rounded),
                        label: AppLocalizations.of(context).driverTabNavigator),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  // A failed action on one tab (e.g. a region-selection error on Линия)
  // otherwise leaves `_error` set indefinitely — every tab that renders it
  // (see _tripTab) would keep showing that same stale, unrelated message
  // until some other action happens to reset it. Switching tabs is a clean
  // enough signal that the user has moved on from whatever caused it.
  void _switchTab(int index) {
    setState(() {
      _tab = index;
      _error = null;
    });
  }

  Widget _lineTab() {
    final disabledReason = _disabledReason();
    final availabilityIssue = _availabilityIssue();
    final busy = _activeOrder?.isActive == true;
    final openOrders =
        _orders.where((order) => order.isOpen).toList(growable: false);
    final stats = _driverStats;
    final todayEarnings =
        stats == null ? null : formatDriverMoney(stats.revenueTotal);
    return RefreshIndicator(
      onRefresh: () async {
        await _loadRegions();
        await _loadOrders();
        await _loadDriverStats();
        await _loadRoadAlerts();
      },
      child: ListView(
        padding: driverPagePadding(context),
        children: [
          DriverShiftHero(
            status: _driverStatusLabel(),
            tone: _driverStatusTone(),
            online: _online,
            busy: busy,
            loading: _loading,
            regionName: _selectedRegion?.name,
            driverName: widget.accountLabel,
            todayEarnings: todayEarnings,
            onToggle: _loading || (!_online && disabledReason != null)
                ? null
                : () => _setOnline(!_online),
            onRegionTap: () => unawaited(_showRegionPicker()),
            sosButton: DriverSosButton(
                sosPhone: _sosPhone,
                api: widget.api,
                orderId: _activeOrder?.id),
          ),
          // Every reason the toggle is disabled gets a real banner here —
          // icon, plain-language explanation, and a working next step where
          // there is one — instead of a single line of text competing for
          // space inside the hero card above.
          if (availabilityIssue != null) ...[
            const SizedBox(height: 12),
            _DriverIssueBanner(
              issue: availabilityIssue,
              danger: _selectedRegion?.status == 'BLOCKED',
            ),
          ],
          const SizedBox(height: 12),
          DriverTodayStrip(
            stats: stats,
            loading: _driverStatsLoading,
            openOrders: openOrders.length,
            demandLevel: _demandLevel,
            demandLoading: _demandHintLoading,
          ),
          const SizedBox(height: 12),
          Stack(
            children: [
              _SmartNavigatorMap(
                current: _currentCoordinate,
                heading: _currentHeading,
                activeOrder: _activeOrder,
                route: _driverRoute?.geometry ?? const [],
                alerts: _roadAlerts,
                mapUnavailable: _navigatorMapUnavailable,
                onTileError: _handleNavigatorTileError,
                fallbackCenter: _selectedRegion?.center,
                height: 238,
              ),
              Positioned(
                top: 14,
                right: 14,
                child: _MapChipButton(
                  icon: Icons.add_location_alt_rounded,
                  semanticLabel: 'Дорожные события',
                  badge: _roadAlerts.isEmpty ? null : _roadAlerts.length,
                  onTap: () => unawaited(_openRoadAlerts()),
                ),
              ),
            ],
          ),
          // Only worth a banner when there's an actual permission/GPS
          // problem to act on — a permanently-present "we use your
          // location" caption is chrome, not information.
          if (_locationMessage != null) ...[
            const SizedBox(height: 12),
            LocationNotice(
              online: _online,
              loading: _locationLoading,
              message: _locationMessage,
            ),
          ],
          if (_error != null) ...[
            const SizedBox(height: 12),
            InlineMessage(text: _error!, danger: true),
          ],
        ],
      ),
    );
  }

  Future<void> _showRegionPicker() async {
    final l10n = AppLocalizations.of(context);
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (sheetContext) => Container(
        constraints: BoxConstraints(
            maxHeight: MediaQuery.sizeOf(sheetContext).height * 0.82),
        decoration: BoxDecoration(
          color: context.palette.appBackground,
          borderRadius: const BorderRadius.vertical(top: Radius.circular(28)),
        ),
        child: SafeArea(
          top: false,
          child: SingleChildScrollView(
            padding: const EdgeInsets.fromLTRB(20, 12, 20, 20),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Center(child: SheetHandle()),
                const SizedBox(height: 16),
                SectionLabel(
                  title: l10n.driverLineRegionSectionTitle,
                  text: _online
                      ? 'Чтобы сменить регион, сначала уйдите с линии'
                      : l10n.driverLineRegionSectionText,
                ),
                const SizedBox(height: 14),
                if (_regionsLoading && _regions.isEmpty)
                  LoadingStrip(text: l10n.driverLineRegionsLoading)
                else if (_regions.isEmpty)
                  EmptyState(
                    title: l10n.driverLineNoRegionsTitle,
                    text: l10n.driverLineNoRegionsText,
                    icon: Icons.verified_user_outlined,
                  )
                else
                  for (final region in _regionsSortedByDistance(_regions)) ...[
                    _RegionPickerRow(
                      region: region,
                      selected: region.id == _regionId,
                      enabled: !_online,
                      onTap: () {
                        Navigator.pop(sheetContext);
                        if (region.id != _regionId) {
                          unawaited(_selectRegion(region.id));
                        }
                      },
                    ),
                    const SizedBox(height: 8),
                  ],
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _ordersTab() {
    final l10n = AppLocalizations.of(context);
    final openOrders =
        _orders.where((order) => order.isOpen).toList(growable: false);
    return RefreshIndicator(
      onRefresh: _loadOrders,
      child: ListView(
        padding: driverPagePadding(context),
        children: [
          TitleBlock(
              title: l10n.driverOrdersTitle, text: l10n.driverOrdersSubtitle),
          const SizedBox(height: 16),
          if (_ordersLoading && _online)
            LoadingStrip(text: l10n.driverOrdersUpdating)
          else if (!_online)
            EmptyState(
                title: l10n.driverOrdersGoOnlineTitle,
                text: l10n.driverOrdersGoOnlineText,
                icon: Icons.power_settings_new_rounded)
          else if (openOrders.isEmpty)
            EmptyState(
                title: l10n.driverOrdersEmptyTitle,
                text: l10n.driverOrdersEmptyText,
                icon: Icons.receipt_long_outlined)
          else
            ...openOrders.map((order) => Padding(
                  padding: const EdgeInsets.only(bottom: 12),
                  child: OrderCard(
                      order: order,
                      accepting: _acceptingOrderId == order.id,
                      rejecting: _rejectingOrderId == order.id,
                      offeringPrice: _offeringPriceOrderId == order.id,
                      onAccept: () => _accept(order),
                      onReject: () => _reject(order),
                      onOfferPrice: _offeringPriceOrderId == order.id
                          ? null
                          : () => _offerPrice(order),
                      myDriverId: _driverStats?.driverId),
                )),
          if (_error != null) InlineMessage(text: _error!, danger: true),
        ],
      ),
    );
  }

  Widget _tripTab() {
    final l10n = AppLocalizations.of(context);
    final action = _nextAction();
    return ListView(
      padding: driverPagePadding(context),
      children: [
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              child: TitleBlock(
                  title: l10n.driverTripTitle, text: l10n.driverTripSubtitle),
            ),
            if (_activeOrder != null) ...[
              const SizedBox(width: 10),
              DriverSosButton(
                  sosPhone: _sosPhone,
                  api: widget.api,
                  orderId: _activeOrder!.id),
            ],
          ],
        ),
        const SizedBox(height: 16),
        if (_activeOrder == null)
          EmptyState(
              title: l10n.driverTripEmptyTitle,
              text: l10n.driverTripEmptyText,
              icon: Icons.route_outlined)
        else ...[
          _TripMap(
              order: _activeOrder!,
              route: _driverRoute?.geometry ?? const [],
              current: _currentCoordinate,
              heading: _currentHeading),
          const SizedBox(height: 12),
          if (_isTripFinished(_activeOrder!.status))
            DriverTripCompletionCard(
              order: _activeOrder!,
              api: widget.api,
              onDone: _dismissActiveOrder,
            )
          else
            PremiumCard(
              child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    StatusPill(
                        label: statusLabel(_activeOrder!.status),
                        tone: StatusTone.warning),
                    const SizedBox(height: 16),
                    DriverStatusStepper(status: _activeOrder!.status),
                    const SizedBox(height: 16),
                    if ((_activeOrder!.riderPhone ?? '').trim().isNotEmpty) ...[
                      Row(
                        children: [
                          Expanded(
                            child: Text(
                              (_activeOrder!.riderName ?? '').trim().isNotEmpty
                                  ? _activeOrder!.riderName!.trim()
                                  : 'Пассажир',
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: TextStyle(
                                color: context.palette.text,
                                fontSize: 14,
                                fontWeight: FontWeight.w800,
                              ),
                            ),
                          ),
                          // IntrinsicWidth works around a Flutter footgun:
                          // a Material button as a bare (non-Expanded) Row
                          // child inside a sliver list can get dry-laid-out
                          // with an infinite width constraint on first frame,
                          // throwing "BoxConstraints forces an infinite
                          // width" and aborting layout for the rest of this
                          // card (price/route/action button all silently
                          // disappear below it) — live-verified via
                          // `flutter run`, not visible in logcat alone.
                          IntrinsicWidth(
                            child: OutlinedButton.icon(
                              onPressed: () => launchUrl(Uri(
                                  scheme: 'tel',
                                  path: _activeOrder!.riderPhone)),
                              icon: const Icon(Icons.call_rounded, size: 16),
                              label: const Text('Позвонить'),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 12),
                    ],
                    RouteFields(
                        pickupLabel: _activeOrder!.pickup,
                        dropoffLabel: _activeOrder!.dropoff,
                        onPickupTap: null,
                        onDropoffTap: null),
                    if (_activeOrder!.status == 'WAITING_CLIENT' &&
                        _activeOrder!.waitingStartedAt != null) ...[
                      const SizedBox(height: 12),
                      DriverWaitingTimerCard(
                        waitingStartedAt: _activeOrder!.waitingStartedAt!,
                        freeWaitingUntil: _activeOrder!.freeWaitingUntil,
                        waitingPricePerMinute:
                            _activeOrder!.waitingPricePerMinute,
                      ),
                    ],
                    if ((_activeOrder!.status == 'TRIP_STARTED' ||
                            _activeOrder!.status == 'IN_PROGRESS') &&
                        _tripDistanceTraveledM != null) ...[
                      const SizedBox(height: 12),
                      DriverTripDistanceCard(
                        distanceTraveledM: _tripDistanceTraveledM!,
                      ),
                    ],
                    if ((_activeOrder!.notes ?? '').isNotEmpty) ...[
                      const SizedBox(height: 10),
                      Container(
                        width: double.infinity,
                        padding: const EdgeInsets.symmetric(
                            horizontal: 12, vertical: 10),
                        decoration: BoxDecoration(
                          color: context.palette.goldSurface,
                          border:
                              Border.all(color: context.palette.borderStrong),
                          borderRadius: BorderRadius.circular(14),
                        ),
                        child: Row(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Icon(Icons.sticky_note_2_outlined,
                                size: 17, color: context.palette.goldDeep),
                            const SizedBox(width: 8),
                            Expanded(
                              child: Text(
                                _activeOrder!.notes!,
                                style: TextStyle(
                                  color: context.palette.text,
                                  fontSize: 12.5,
                                  fontWeight: FontWeight.w700,
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                    if (_activeOrder!.price != null) ...[
                      const SizedBox(height: 14),
                      Text('${_activeOrder!.price!.round()} ₸',
                          style: const TextStyle(
                              fontSize: 26, fontWeight: FontWeight.w900)),
                    ],
                    if (_activeOrder!.tariff != null &&
                        _activeOrder!.tariff!.isNotEmpty) ...[
                      const SizedBox(height: 6),
                      Text(l10n.driverTripTariffLabel(_activeOrder!.tariff!),
                          style:
                              TextStyle(color: context.palette.textSecondary)),
                    ],
                    if ((liveRouteMeta(_driverRoute) ??
                            routeMeta(_activeOrder!)) !=
                        null) ...[
                      const SizedBox(height: 8),
                      Text(
                          liveRouteMeta(_driverRoute) ??
                              routeMeta(_activeOrder!)!,
                          style:
                              TextStyle(color: context.palette.textSecondary)),
                    ],
                    const SizedBox(height: 12),
                    SizedBox(
                      width: double.infinity,
                      child: OutlinedButton.icon(
                        onPressed: () => showModalBottomSheet<void>(
                          context: context,
                          isScrollControlled: true,
                          backgroundColor: Colors.transparent,
                          builder: (_) => _DriverQuickMessageSheet(
                            api: widget.api,
                            orderId: _activeOrder!.id,
                          ),
                        ),
                        icon: const Icon(Icons.chat_bubble_outline_rounded,
                            size: 18),
                        label: const Text('Быстрое сообщение клиенту'),
                      ),
                    ),
                    const SizedBox(height: 16),
                    if (action != null)
                      DriverGradientButton(
                        text: action.$1,
                        enabled: _tripActionLabel == null ||
                            _tripActionLabel == action.$1,
                        loading: _tripActionLabel == action.$1,
                        loadingText: l10n.driverTripSavingButton,
                        onTap: _tripActionLabel != null
                            ? null
                            : () => _tripAction(action.$1, action.$2),
                      ),
                    if (_canNoShow(_activeOrder!.status)) ...[
                      const SizedBox(height: 10),
                      // IntrinsicWidth for the same reason as the "Позвонить"
                      // button above — a bare Material button in this same
                      // sliver-list card can get an infinite-width dry-layout
                      // pass, aborting the rest of the card's layout.
                      IntrinsicWidth(
                        child: OutlinedButton.icon(
                            onPressed: _tripActionLabel != null
                                ? null
                                : () async {
                                    final confirmed =
                                        await _confirmDriverAction(
                                      title: 'Клиент не вышел?',
                                      message:
                                          'Поездка будет отмечена как неявка клиента — убедитесь, что вы дождались бесплатное время ожидания.',
                                      confirmLabel: 'Подтвердить неявку',
                                    );
                                    if (confirmed) {
                                      _tripAction(l10n.driverTripNoShowButton,
                                          widget.api.noShow);
                                    }
                                  },
                            icon: const Icon(Icons.person_off_rounded),
                            label: Text(l10n.driverTripNoShowButton)),
                      ),
                    ],
                    if (_canCancel(_activeOrder!.status)) ...[
                      const SizedBox(height: 10),
                      OutlinedButton(
                          onPressed: _tripActionLabel != null
                              ? null
                              : () async {
                                  final confirmed = await _confirmDriverAction(
                                    title: 'Отменить поездку?',
                                    message:
                                        'Заказ вернётся в поиск для других водителей. Частые отмены могут повлиять на ваш рейтинг.',
                                    confirmLabel: 'Отменить поездку',
                                  );
                                  if (confirmed) {
                                    _tripAction(l10n.driverTripCancelButton,
                                        widget.api.cancelDriverOrder);
                                  }
                                },
                          child: Text(l10n.driverTripCancelButton)),
                    ],
                  ]),
            ),
        ],
        if (_error != null) ...[
          const SizedBox(height: 12),
          InlineMessage(text: _error!, danger: true)
        ],
      ],
    );
  }

  // Smart Navigator is a real pushed route, not tab index 3 — the driver
  // reads it as leaving the shell for a dedicated navigation mode (own
  // back control, full-bleed map, no bottom nav/app bar), not switching
  // panes on the same screen. All the underlying state it reads (GPS
  // stream, road alerts, voice service, route fetch) already lives on
  // this State and keeps running regardless of which route is on top, so
  // the pushed screen is a thin, polling presentation layer over it — see
  // _DriverFullScreenNavigatorState.
  Future<void> _openFullScreenNavigator() async {
    await Navigator.of(context).push<void>(
      MaterialPageRoute<void>(
        fullscreenDialog: true,
        builder: (_) => _DriverFullScreenNavigator(shell: this),
      ),
    );
  }

  Coordinate? get _currentCoordinate {
    final position = _lastPosition;
    if (position == null) return null;
    return Coordinate(lat: position.latitude, lng: position.longitude);
  }

  double? get _currentHeading => _trustedHeading;

  int? get _speedKmh {
    final position = _lastPosition;
    if (position == null) return null;
    final speed = position.speed;
    if (!speed.isFinite || speed < 0) return null;
    // speedAccuracy of exactly 0.0 means "not reported by this device" (see
    // geolocator's own doc comment on Position.speedAccuracy), not "zero
    // uncertainty" — only treat a speed reading as GPS jitter when the
    // device actually reports a real accuracy figure and the speed itself
    // is within that margin of error (a stationary/near-stationary phone
    // commonly reports a few km/h of "speed" that's well inside its own
    // stated uncertainty — this was showing as a real, moving speed).
    final accuracy = position.speedAccuracy;
    if (accuracy.isFinite && accuracy > 0 && speed < accuracy) return 0;
    return (speed * 3.6).round();
  }

  // Prefer the live OSM road lookup (the actual posted limit for wherever
  // the driver is right now) over a driver-reported TEMPORARY_SPEED_LIMIT
  // alert, which only covers a specific spot someone flagged.
  int? get _activeSpeedLimit {
    if (_osmSpeedLimit != null) return _osmSpeedLimit;
    for (final alert in _roadAlerts) {
      final limit = alert.speedLimit;
      if (limit != null && limit > 0) return limit;
    }
    return null;
  }

  void _handleNavigatorTileError() {
    if (_navigatorMapUnavailable || !mounted) return;
    _navigatorTileErrorCount += 1;
    if (_navigatorTileErrorCount < 12) return;
    setState(() => _navigatorMapUnavailable = true);
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

  // Structured twin of _disabledReason() — same precedence, same 6 states,
  // but carries an icon and an actual next step instead of a bare string.
  // Kept separate rather than refactoring _disabledReason() itself: that
  // getter's plain String? return is still relied on for the toggle-disable
  // gate and the header status label, and touching those tonight isn't
  // worth the risk for what's purely a rendering upgrade.
  _DriverAvailabilityIssue? _availabilityIssue() {
    final region = _selectedRegion;
    if (_regions.isEmpty) {
      return _DriverAvailabilityIssue(
        icon: Icons.map_outlined,
        title: 'Нет одобренных регионов',
        message:
            'Чтобы выйти на линию, нужен хотя бы один одобренный регион. Напишите в поддержку, чтобы вам открыли доступ к региону.',
        actionLabel: 'Написать в поддержку',
        onAction: () => _showDriverFullSheet(_driverSupportContent),
      );
    }
    if (_regionId == null) {
      return _DriverAvailabilityIssue(
        icon: Icons.place_outlined,
        title: 'Выберите рабочий регион',
        message:
            'У вас есть одобренные регионы — выберите один, чтобы начать принимать заказы.',
        actionLabel: 'Выбрать регион',
        onAction: () => unawaited(_showRegionPicker()),
      );
    }
    if (region?.isActive == false) {
      return _DriverAvailabilityIssue(
        icon: Icons.pause_circle_outline_rounded,
        title: 'Регион временно отключён',
        message: 'Работа в регионе «${region!.name}» сейчас приостановлена. '
            '${_regions.length > 1 ? 'Попробуйте позже или выберите другой регион.' : 'Попробуйте позже.'}',
        actionLabel: _regions.length > 1 ? 'Сменить регион' : null,
        onAction:
            _regions.length > 1 ? () => unawaited(_showRegionPicker()) : null,
      );
    }
    if (region?.status == 'BLOCKED') {
      return _DriverAvailabilityIssue(
        icon: Icons.block_rounded,
        title: 'Доступ заблокирован',
        message: region!.blockReason.trim().isEmpty
            ? 'Работа в регионе «${region.name}» заблокирована администратором.'
            : region.blockReason,
        actionLabel: 'Написать в поддержку',
        onAction: () => _showDriverFullSheet(_driverSupportContent),
      );
    }
    if (region?.status != 'APPROVED') {
      return _DriverAvailabilityIssue(
        icon: Icons.hourglass_top_rounded,
        title: 'Заявка на рассмотрении',
        message:
            'Мы проверяем ваш доступ к региону «${region?.name}». Обычно это занимает немного времени.',
      );
    }
    return null;
  }

  // Cancel and no-show both affect the rider (and the driver's own stats),
  // so — like the passenger side's own _confirmAndLogout/cancel dialogs —
  // neither should fire straight off a single tap.
  Future<bool> _confirmDriverAction({
    required String title,
    required String message,
    required String confirmLabel,
  }) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        backgroundColor: Colors.white,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(22)),
        title: Text(title, style: const TextStyle(fontWeight: FontWeight.w900)),
        content: Text(
          message,
          style: TextStyle(
            color: context.palette.textSecondary,
            fontWeight: FontWeight.w600,
            height: 1.4,
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, false),
            child: const Text('Назад'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, true),
            style:
                TextButton.styleFrom(foregroundColor: context.palette.danger),
            child: Text(confirmLabel,
                style: const TextStyle(fontWeight: FontWeight.w900)),
          ),
        ],
      ),
    );
    return confirmed == true;
  }

  (String, Future<OrderSummary> Function(String id))? _nextAction() {
    final l10n = AppLocalizations.of(context);
    final status = _activeOrder?.status;
    if (status == 'DRIVER_FOUND' || status == 'DRIVER_ASSIGNED') {
      return (l10n.driverActionGoingToClient, widget.api.goingToClient);
    }
    if (status == 'DRIVER_GOING_TO_CLIENT') {
      return (l10n.driverActionArrived, widget.api.arrived);
    }
    if (status == 'DRIVER_ARRIVED') {
      return (l10n.driverActionStartWaiting, widget.api.waitingClient);
    }
    if (status == 'WAITING_CLIENT') {
      return (l10n.driverActionStartTrip, widget.api.startTrip);
    }
    if (status == 'TRIP_STARTED' || status == 'IN_PROGRESS') {
      return (l10n.driverActionCompleteTrip, widget.api.completeTrip);
    }
    return null;
  }

  // Once an order settles into any terminal state (completed/paid/rated or
  // any cancellation variant), _nextAction() has nothing left to offer —
  // without this, the trip tab was a permanent dead end: _activeOrder is
  // never cleared elsewhere, and _loadOrders() deliberately re-retains a
  // terminal order by id so it doesn't vanish on refresh, so the driver had
  // no way back to accepting new orders after finishing a trip.
  void _dismissActiveOrder() {
    setState(() {
      _activeOrder = null;
      _driverRoute = null;
      _tripDistanceTraveledM = null;
    });
  }

  bool _isTripFinished(String status) => const [
        'TRIP_COMPLETED',
        'PAYMENT_PENDING',
        'PAID',
        'RATED',
        'COMPLETED',
      ].contains(status);

  bool _canNoShow(String status) =>
      status == 'DRIVER_ARRIVED' || status == 'WAITING_CLIENT';

  bool _canCancel(String status) =>
      status == 'DRIVER_FOUND' ||
      status == 'DRIVER_GOING_TO_CLIENT' ||
      status == 'DRIVER_ASSIGNED' ||
      status == 'DRIVER_ARRIVED';

  String _driverStatusLabel() {
    final l10n = AppLocalizations.of(context);
    if (_activeOrder?.isActive == true) return l10n.driverStatusBusy;
    if (!_online && _disabledReason() != null) return 'Недоступен по региону';
    return _online ? l10n.driverStatusOnline : l10n.driverStatusOffline;
  }

  StatusTone _driverStatusTone() {
    if (_activeOrder?.isActive == true) return StatusTone.warning;
    if (!_online && _disabledReason() != null) return StatusTone.danger;
    return _online ? StatusTone.success : StatusTone.neutral;
  }
}

// Level is max(surgeMultiplier * demandCoefficient) across the region's
// active tariffs — a real server-computed pricing signal, not a spatial
// heatmap (the backend has no such endpoint). Thresholds are a judgment
// call, not a server-defined boundary.
// Explains *why* the line toggle is disabled instead of leaving the driver
// staring at a greyed-out button. Two independent gates feed this, checked
// in the same order the backend checks them (assertDriverRegionApproved in
// driver-region-approvals.service.js): required driver_documents rows must
// each have an APPROVED latest submission first, then
// driver_region_approvals.status — missing row / any non-terminal status
// reads as "under review" (there's no distinct PENDING enum value —
// absence of an APPROVED/BLOCKED row means an admin hasn't acted on it
// yet), 'BLOCKED' carries a real block_reason to show verbatim.
/// A single reason the "Выйти на линию" toggle is disabled, structured
/// enough to render as a real banner (icon, title, message, an optional
/// next step) instead of one line of plain text buried in the hero card.
class _DriverAvailabilityIssue {
  const _DriverAvailabilityIssue({
    required this.icon,
    required this.title,
    required this.message,
    this.actionLabel,
    this.onAction,
  });

  final IconData icon;
  final String title;
  final String message;
  final String? actionLabel;
  final VoidCallback? onAction;
}

class _DriverIssueBanner extends StatelessWidget {
  const _DriverIssueBanner({required this.issue, this.danger = false});

  final _DriverAvailabilityIssue issue;
  // Only the "BLOCKED" state reads as an actual problem (red) — missing
  // docs / pending review / pick-a-region are just the normal setup path
  // every new driver walks through, not something gone wrong.
  final bool danger;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final color = danger ? palette.danger : palette.gold;
    final background = danger ? palette.dangerSoft : palette.goldSurface;
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: background,
        border: Border.all(color: color.withValues(alpha: 0.4)),
        borderRadius: BorderRadius.circular(20),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Icon(issue.icon, color: color, size: 20),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  issue.title,
                  style: TextStyle(
                    color: palette.text,
                    fontSize: 15,
                    fontWeight: FontWeight.w900,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Text(
            issue.message,
            style: TextStyle(
              color: palette.textSecondary,
              fontSize: 13,
              height: 1.35,
              fontWeight: FontWeight.w600,
            ),
          ),
          if (issue.actionLabel != null && issue.onAction != null) ...[
            const SizedBox(height: 12),
            SizedBox(
              width: double.infinity,
              child: OutlinedButton(
                onPressed: issue.onAction,
                child: Text(issue.actionLabel!),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

/// Small floating circular button overlaid on a map corner — the
/// "report/view road events" shortcut, styled like a real navigation app's
/// map controls instead of taking up a whole row of chrome below the map.
class _MapChipButton extends StatelessWidget {
  const _MapChipButton({
    required this.icon,
    required this.onTap,
    required this.semanticLabel,
    this.badge,
  });

  final IconData icon;
  final VoidCallback onTap;
  final String semanticLabel;
  final int? badge;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      label: semanticLabel,
      child: Material(
        color: Colors.white,
        shape: const CircleBorder(),
        elevation: 3,
        shadowColor: Colors.black26,
        child: InkWell(
          customBorder: const CircleBorder(),
          onTap: onTap,
          child: SizedBox(
            width: 42,
            height: 42,
            child: Stack(
              clipBehavior: Clip.none,
              children: [
                Center(
                    child:
                        Icon(icon, size: 20, color: context.palette.goldDeep)),
                if (badge != null)
                  Positioned(
                    top: -3,
                    right: -3,
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 5, vertical: 1.5),
                      decoration: BoxDecoration(
                        color: context.palette.danger,
                        borderRadius: BorderRadius.circular(999),
                        border: Border.all(color: Colors.white, width: 1.4),
                      ),
                      child: Text(
                        '$badge',
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 10,
                          fontWeight: FontWeight.w900,
                        ),
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

class _RegionPickerRow extends StatelessWidget {
  const _RegionPickerRow({
    required this.region,
    required this.selected,
    required this.enabled,
    required this.onTap,
  });

  final DriverRegion region;
  final bool selected;
  final bool enabled;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    return InkWell(
      onTap: enabled ? onTap : null,
      borderRadius: BorderRadius.circular(18),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
        decoration: BoxDecoration(
          color: selected ? palette.goldPale : Colors.white,
          border: Border.all(
              color: selected ? palette.borderStrong : palette.border),
          borderRadius: BorderRadius.circular(18),
        ),
        child: Row(
          children: [
            Icon(Icons.place_rounded,
                size: 18,
                color: selected ? palette.goldDeep : palette.textMuted),
            const SizedBox(width: 10),
            Expanded(
              child: Text(
                region.name,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  fontWeight: FontWeight.w800,
                  fontSize: 14.5,
                  color: enabled ? palette.text : palette.textMuted,
                ),
              ),
            ),
            const SizedBox(width: 8),
            // The backend only ever hands the driver *approved, active*
            // regions here (GET /drivers/me/regions filters both), so this
            // reads "Одобрен" unconditionally in practice — kept as a real
            // status computation rather than a hardcoded label so it stays
            // correct if that contract ever loosens.
            StatusPill(
              label: !region.isActive
                  ? 'Отключён'
                  : region.status == 'BLOCKED'
                      ? 'Заблокирован'
                      : region.status == 'APPROVED'
                          ? 'Одобрен'
                          : 'На рассмотрении',
              tone: !region.isActive || region.status == 'BLOCKED'
                  ? StatusTone.danger
                  : region.status == 'APPROVED'
                      ? StatusTone.success
                      : StatusTone.warning,
            ),
            if (selected) ...[
              const SizedBox(width: 8),
              Icon(Icons.check_circle_rounded, color: palette.gold, size: 20),
            ],
          ],
        ),
      ),
    );
  }
}

class _SmartNavigatorMap extends StatefulWidget {
  const _SmartNavigatorMap({
    required this.current,
    required this.activeOrder,
    required this.route,
    required this.alerts,
    required this.mapUnavailable,
    required this.onTileError,
    this.heading,
    this.fallbackCenter,
    this.height,
  });

  final Coordinate? current;
  final double? heading;
  final OrderSummary? activeOrder;
  final List<LatLng> route;
  final List<RoadAlert> alerts;
  final bool mapUnavailable;
  final VoidCallback onTileError;
  final Coordinate? fallbackCenter;
  final double? height;

  @override
  State<_SmartNavigatorMap> createState() => _SmartNavigatorMapState();
}

class _SmartNavigatorMapState extends State<_SmartNavigatorMap> {
  // Kept alive for the widget's lifetime so the map doesn't fully remount
  // (losing the driver's own pan/zoom) on every GPS tick — only route/order
  // changes trigger an explicit refit.
  final MapController _mapController = MapController();
  late String _lastRefitSignature;

  @override
  void initState() {
    super.initState();
    _lastRefitSignature = _refitSignature(widget);
  }

  @override
  void didUpdateWidget(covariant _SmartNavigatorMap oldWidget) {
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

  List<LatLng> _refitPoints(_SmartNavigatorMap w) {
    return [
      if (w.activeOrder?.pickupCoordinate != null)
        w.activeOrder!.pickupCoordinate!.toLatLng(),
      if (w.activeOrder?.dropoffCoordinate != null)
        w.activeOrder!.dropoffCoordinate!.toLatLng(),
      ...w.route,
    ];
  }

  String _refitSignature(_SmartNavigatorMap w) =>
      _refitPoints(w).map(_driverMapPointKey).join('|');

  static const _refitPadding = EdgeInsets.fromLTRB(42, 64, 42, 70);

  void _refitCamera() {
    final points = _refitPoints(widget);
    final fallback =
        widget.current?.toLatLng() ?? widget.fallbackCenter?.toLatLng();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      if (points.length > 1) {
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
      } else if (points.isNotEmpty || fallback != null) {
        _mapController.move(points.isNotEmpty ? points.first : fallback!, 14);
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final screenHeight = MediaQuery.sizeOf(context).height;
    final mapHeight = widget.height ?? (screenHeight < 850 ? 330.0 : 420.0);
    final center = widget.current?.toLatLng() ??
        widget.activeOrder?.pickupCoordinate?.toLatLng() ??
        widget.activeOrder?.dropoffCoordinate?.toLatLng() ??
        widget.fallbackCenter?.toLatLng() ??
        (widget.alerts.isNotEmpty
            ? widget.alerts.first.toLatLng()
            : const LatLng(40.844435, 68.509021));
    final initialPoints = <LatLng>[
      if (widget.current != null) widget.current!.toLatLng(),
      if (widget.activeOrder?.pickupCoordinate != null)
        widget.activeOrder!.pickupCoordinate!.toLatLng(),
      if (widget.activeOrder?.dropoffCoordinate != null)
        widget.activeOrder!.dropoffCoordinate!.toLatLng(),
      ...widget.route,
    ];
    final fit = initialPoints.length > 1
        ? CameraFit.coordinates(
            coordinates: initialPoints,
            padding: const EdgeInsets.fromLTRB(42, 64, 42, 70),
            maxZoom: 15.5,
          )
        : null;
    return ClipRRect(
      borderRadius: BorderRadius.circular(30),
      child: SizedBox(
        height: mapHeight,
        child: Stack(
          children: [
            if (widget.mapUnavailable)
              const Positioned.fill(child: _RoadAlertMapFallback())
            else
              FlutterMap(
                mapController: _mapController,
                options: MapOptions(
                  initialCenter: center,
                  initialZoom:
                      widget.current == null && widget.activeOrder == null
                          ? 13
                          : 14,
                  initialCameraFit: fit,
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
                      errorTileCallback: (_, __, ___) => widget.onTileError(),
                    ),
                  ),
                  if (widget.route.isNotEmpty)
                    PolylineLayer(
                      polylines: [
                        Polyline(
                          points: widget.route,
                          color: Colors.white.withValues(alpha: 0.9),
                          strokeWidth: 9,
                        ),
                        Polyline(
                          points: widget.route,
                          color: SmartTaxiColors.goldDeep,
                          strokeWidth: 5.5,
                        ),
                      ],
                    ),
                  MarkerLayer(
                    markers: [
                      if (widget.activeOrder?.pickupCoordinate != null)
                        Marker(
                          point:
                              widget.activeOrder!.pickupCoordinate!.toLatLng(),
                          width: 34,
                          height: 34,
                          child: const _NavigatorPointMarker(
                            icon: Icons.navigation_rounded,
                            background: SmartTaxiColors.gold,
                            foreground: Colors.white,
                          ),
                        ),
                      if (widget.activeOrder?.dropoffCoordinate != null)
                        Marker(
                          point:
                              widget.activeOrder!.dropoffCoordinate!.toLatLng(),
                          width: 34,
                          height: 34,
                          child: const _NavigatorPointMarker(
                            icon: Icons.location_on_rounded,
                            background: SmartTaxiColors.gold,
                            foreground: SmartTaxiColors.text,
                          ),
                        ),
                      for (final alert in widget.alerts.take(12))
                        Marker(
                          point: alert.toLatLng(),
                          width: 44,
                          height: 44,
                          child: _RoadAlertPin(
                            label: _alertShortLabel(alert.type),
                            color: _alertColor(alert.type),
                            heading: alert.heading,
                          ),
                        ),
                    ],
                  ),
                  if (widget.current != null)
                    _AnimatedSelfMarkerLayer(
                      point: widget.current!.toLatLng(),
                      rotationRadians: widget.heading == null
                          ? null
                          : widget.heading! * math.pi / 180,
                    ),
                ],
              ),
            Positioned(
              left: 14,
              top: 14,
              // No right: — a badge stretched edge-to-edge with left-aligned
              // text inside a white rounded pill reads as a search/input
              // bar (it visually is one), which it isn't and does nothing
              // when tapped. Shrink-wrapped instead, matching how the same
              // widget already renders on the trip map — also stops it
              // extending under the "report an event" chip button that
              // overlays this same top-right corner.
              child: _DriverMapBadge(
                text: widget.activeOrder == null
                    ? 'Свободный режим'
                    : 'Активный заказ',
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _NavigatorCurrentMarker extends StatelessWidget {
  const _NavigatorCurrentMarker();

  @override
  Widget build(BuildContext context) {
    return Container(
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: SmartTaxiColors.gold.withValues(alpha: 0.2),
        shape: BoxShape.circle,
        border: Border.all(
            color: SmartTaxiColors.gold.withValues(alpha: 0.13), width: 1),
      ),
      child: Container(
        width: 24,
        height: 24,
        decoration: BoxDecoration(
          color: SmartTaxiColors.gold,
          shape: BoxShape.circle,
          border: Border.all(color: Colors.white, width: 4),
          boxShadow: [
            BoxShadow(
              color: SmartTaxiColors.gold.withValues(alpha: 0.33),
              blurRadius: 18,
              offset: const Offset(0, 6),
            ),
          ],
        ),
      ),
    );
  }
}

const _driverSelfCarAsset = 'assets/map/driver_car_topview_white.png';

Widget _driverSelfMarkerContent({
  double size = 46,
  double rotationRadians = 0,
}) {
  return Semantics(
    label: 'Ваш автомобиль',
    image: true,
    child: Transform.rotate(
      angle: rotationRadians,
      child: Image.asset(
        _driverSelfCarAsset,
        width: size,
        height: size,
        fit: BoxFit.contain,
        errorBuilder: (_, __, ___) => const _NavigatorCurrentMarker(),
      ),
    ),
  );
}

// Glides the driver's own marker between successive GPS fixes instead of
// snapping — Geolocator only emits a new fix every >=20m of movement (see
// _startLocationFlow's distanceFilter), so a direct jump reads as skipping.
class _AnimatedSelfMarkerLayer extends StatefulWidget {
  const _AnimatedSelfMarkerLayer({
    required this.point,
    required this.rotationRadians,
  });

  final LatLng point;
  // Null means "heading unavailable for this fix" (e.g. GPS course is
  // meaningless while stationary) — the marker should hold its last known
  // angle rather than snap to north, see didUpdateWidget below.
  final double? rotationRadians;

  @override
  State<_AnimatedSelfMarkerLayer> createState() =>
      _AnimatedSelfMarkerLayerState();
}

class _AnimatedSelfMarkerLayerState extends State<_AnimatedSelfMarkerLayer>
    with SingleTickerProviderStateMixin {
  static const _glideDuration = Duration(milliseconds: 700);
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
    _fromAngle = widget.rotationRadians ?? 0;
    _toAngle = widget.rotationRadians ?? 0;
    _controller = AnimationController(vsync: this, duration: _glideDuration)
      ..value = 1;
  }

  @override
  void didUpdateWidget(covariant _AnimatedSelfMarkerLayer oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.point == oldWidget.point &&
        widget.rotationRadians == oldWidget.rotationRadians) {
      return;
    }
    final currentPoint = _currentPoint;
    final currentAngle = _currentAngle;
    final jumpMeters = _DriverShellState._metersBetween(
      currentPoint.latitude,
      currentPoint.longitude,
      widget.point.latitude,
      widget.point.longitude,
    );
    _fromPoint = currentPoint;
    _toPoint = widget.point;
    _fromAngle = currentAngle;
    _toAngle = widget.rotationRadians == null
        ? currentAngle
        : _shortestAngleTarget(currentAngle, widget.rotationRadians!);
    if (jumpMeters > _snapThresholdMeters) {
      _controller.value = 1;
    } else {
      _controller
        ..stop()
        ..value = 0
        ..animateTo(1, curve: Curves.easeOutCubic);
    }
  }

  LatLng get _currentPoint => LatLng(
        _fromPoint.latitude +
            (_toPoint.latitude - _fromPoint.latitude) * _controller.value,
        _fromPoint.longitude +
            (_toPoint.longitude - _fromPoint.longitude) * _controller.value,
      );

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
              width: 64,
              height: 64,
              child: _driverSelfMarkerContent(rotationRadians: _currentAngle),
            ),
          ],
        );
      },
    );
  }
}

class _NavigatorPointMarker extends StatelessWidget {
  const _NavigatorPointMarker({
    required this.icon,
    required this.background,
    required this.foreground,
  });

  final IconData icon;
  final Color background;
  final Color foreground;

  @override
  Widget build(BuildContext context) {
    return Container(
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: background,
        shape: BoxShape.circle,
        border: Border.all(color: Colors.white, width: 3),
        boxShadow: const [
          BoxShadow(
            color: Color(0x44d4af37),
            blurRadius: 16,
            offset: Offset(0, 7),
          ),
        ],
      ),
      child: Icon(
        icon,
        color: foreground,
        size: 18,
      ),
    );
  }
}

class _NavigatorMetric extends StatelessWidget {
  const _NavigatorMetric({
    required this.title,
    required this.value,
    required this.suffix,
    this.emphasize = false,
    this.valueColor,
  });

  final String title;
  final String value;
  final String suffix;
  // Bumps the value's font size for the primary GPS speed readout — the one
  // number a driver needs to read at a glance without looking away long.
  final bool emphasize;
  final Color? valueColor;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: SmartTaxiColors.goldSurface,
        border: Border.all(color: SmartTaxiColors.border),
        borderRadius: BorderRadius.circular(20),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            title,
            style: const TextStyle(
              color: SmartTaxiColors.textSecondary,
              fontSize: 12,
              fontWeight: FontWeight.w800,
            ),
          ),
          const SizedBox(height: 8),
          Row(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Flexible(
                child: Text(
                  value,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    color: valueColor ?? SmartTaxiColors.text,
                    fontSize: emphasize ? 40 : 23,
                    fontWeight: FontWeight.w900,
                  ),
                ),
              ),
              if (suffix.isNotEmpty) ...[
                const SizedBox(width: 5),
                Padding(
                  padding: const EdgeInsets.only(bottom: 3),
                  child: Text(
                    suffix,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      color: SmartTaxiColors.textSecondary,
                      fontSize: 11,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                ),
              ],
            ],
          ),
        ],
      ),
    );
  }
}

/// Smart Navigator's dedicated full-screen presentation — pushed as a real
/// route (see _DriverShellState._openFullScreenNavigator), not tab index 3.
/// Deliberately reads state straight off the [_DriverShellState] it was
/// pushed from (`shell`) rather than duplicating the GPS stream / road-alert
/// fetch / voice service the shell already owns and keeps running
/// regardless of which route is on top — a lightweight poll (a plain
/// `setState` tick, no heavy work) is what actually turns those live field
/// updates into a rebuild here, since this route isn't a descendant of the
/// shell's widget tree and its own `setState` calls don't reach us.
class _DriverFullScreenNavigator extends StatefulWidget {
  const _DriverFullScreenNavigator({required this.shell});

  final _DriverShellState shell;

  @override
  State<_DriverFullScreenNavigator> createState() =>
      _DriverFullScreenNavigatorState();
}

class _DriverFullScreenNavigatorState
    extends State<_DriverFullScreenNavigator> {
  final MapController _mapController = MapController();
  Timer? _pollTimer;
  bool _autoFollow = true;
  bool _mapReady = false;
  bool _mapUnavailable = false;
  int _tileErrorCount = 0;
  DateTime? _lastFixAt;
  // The shell's own GPS stream (the class doc above relies on) only starts
  // once the driver actually goes online (_setOnline -> _startLocationFlow)
  // — a driver who opens the navigator first, just to preview the map/area
  // before deciding to go online, previously saw a permanently-stuck "Ищу
  // сигнал GPS..." even though the device's GPS is perfectly able to
  // produce a fix; nothing had ever asked it to. Starts a scoped stream of
  // its own, but only when the shell doesn't already have one running, so
  // there are never two competing listeners — feeds the exact same shell
  // fields (_applyPositionFix) every rendering path here already reads, so
  // no other code needs to know which stream actually produced a fix.
  // Deliberately skips updateDriverLocation (dispatch-only, and the backend
  // rejects it while OFFLINE anyway) and the camera/sign proximity voice
  // alerts (trip-safety features, not needed for a standalone preview).
  StreamSubscription<Position>? _standalonePositionSub;

  @override
  void initState() {
    super.initState();
    _pollTimer =
        Timer.periodic(const Duration(milliseconds: 350), (_) => _tick());
    if (widget.shell._currentCoordinate != null) {
      _lastFixAt = DateTime.now();
    }
    if (widget.shell._positionSub == null) {
      unawaited(_startStandalonePositionTracking());
    }
  }

  Future<void> _startStandalonePositionTracking() async {
    try {
      final enabled = await Geolocator.isLocationServiceEnabled();
      if (!enabled) return;
      var permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.denied) {
        permission = await Geolocator.requestPermission();
      }
      if (permission == LocationPermission.denied ||
          permission == LocationPermission.deniedForever) {
        return;
      }
      // Re-check after the awaits above: the driver may have gone online
      // (starting the real stream) or left this screen while permission was
      // being requested.
      if (!mounted || widget.shell._positionSub != null) return;
      _standalonePositionSub = Geolocator.getPositionStream(
        locationSettings: const LocationSettings(
            accuracy: LocationAccuracy.high, distanceFilter: 20),
      ).listen((position) {
        if (!mounted) return;
        widget.shell.setState(() => widget.shell._applyPositionFix(position));
        unawaited(widget.shell._maybeFetchOsmNavigation(position));
      });
    } catch (_) {
      // Best-effort — the screen still works, just without a live position
      // until the driver goes online (which starts the shell's real
      // stream).
    }
  }

  @override
  void dispose() {
    _pollTimer?.cancel();
    _standalonePositionSub?.cancel();
    _mapController.dispose();
    super.dispose();
  }

  void _tick() {
    if (!mounted) return;
    final current = widget.shell._currentCoordinate;
    if (current != null) _lastFixAt = DateTime.now();
    if (_autoFollow && _mapReady && current != null) {
      final heading = widget.shell._currentHeading;
      final point = current.toLatLng();
      try {
        _mapController.moveAndRotate(
          point,
          math.max(_mapController.camera.zoom, 17),
          heading == null ? 0 : -heading,
        );
      } catch (_) {
        // Best-effort — a mid-gesture camera nudge failing shouldn't crash
        // the whole screen; the next tick tries again.
      }
    }
    setState(() {});
  }

  // Only these sources are an actual finger/mouse on the map — anything
  // else (mapController, the initial nonRotatedSizeChange on first layout,
  // custom events) must not be treated as "the driver panned away," or the
  // recenter FAB shows up immediately on open with nothing having moved.
  static const _userGestureSources = {
    MapEventSource.onDrag,
    MapEventSource.onMultiFinger,
    MapEventSource.flingAnimationController,
    MapEventSource.doubleTapZoomAnimationController,
    MapEventSource.scrollWheel,
    MapEventSource.cursorKeyboardRotation,
  };

  void _handleMapEvent(MapEvent event) {
    if (!_mapReady) _mapReady = true;
    if (_userGestureSources.contains(event.source) && _autoFollow) {
      setState(() => _autoFollow = false);
    }
  }

  void _recenter() {
    setState(() => _autoFollow = true);
    final current = widget.shell._currentCoordinate;
    if (current != null) {
      final heading = widget.shell._currentHeading;
      _mapController.moveAndRotate(
        current.toLatLng(),
        math.max(_mapController.camera.zoom, 17),
        heading == null ? 0 : -heading,
      );
    }
  }

  bool get _gpsLost {
    final lastFix = _lastFixAt;
    if (widget.shell._currentCoordinate == null) return true;
    if (lastFix == null) return true;
    return DateTime.now().difference(lastFix) > const Duration(seconds: 12);
  }

  @override
  Widget build(BuildContext context) {
    final shell = widget.shell;
    final current = shell._currentCoordinate;
    final heading = shell._currentHeading;
    final speedKmh = shell._speedKmh;
    final speedLimit = shell._activeSpeedLimit;
    final maneuver = shell._nextManeuverHint();
    // A stale-but-non-null position (GPS lost mid-trip, e.g. a tunnel or
    // urban canyon) still lets _nextManeuverHint() return a value computed
    // from that old fix — showing a turn instruction (and its live
    // distance) off a position that's seconds to tens-of-seconds out of
    // date is actively misleading, not just imprecise. Suppress the banner
    // in that case; this also removes the layout conflict where it and the
    // "GPS lost" banner would otherwise render at the same position.
    final showManeuverBanner = maneuver != null && !_gpsLost;
    final speeding =
        speedKmh != null && speedLimit != null && speedKmh > speedLimit;
    final route = shell._driverRoute?.geometry ?? const <LatLng>[];
    final alerts = shell._allNavigatorAlerts;
    final targetMeta = liveRouteMeta(shell._driverRoute);
    final showVoiceBanner = shell._navigatorBannerText != null &&
        shell._navigatorBannerUntil != null &&
        DateTime.now().isBefore(shell._navigatorBannerUntil!);
    final center = current?.toLatLng() ??
        shell._activeOrder?.pickupCoordinate?.toLatLng() ??
        shell._selectedRegion?.center?.toLatLng() ??
        const LatLng(40.844435, 68.509021);
    final topInset = MediaQuery.paddingOf(context).top;
    final bottomInset = MediaQuery.paddingOf(context).bottom;

    return Scaffold(
      backgroundColor: const Color(0xff0b1b33),
      body: Stack(
        children: [
          Positioned.fill(
            child: _mapUnavailable
                ? const _RoadAlertMapFallback()
                : FlutterMap(
                    mapController: _mapController,
                    options: MapOptions(
                      initialCenter: center,
                      initialZoom: 17,
                      onMapEvent: _handleMapEvent,
                    ),
                    children: [
                      // Unconditional (not theme-gated): this screen's
                      // scaffold is always dark navy regardless of app
                      // theme (turn-by-turn nav stays low-glare day or
                      // night), so the tiles must always match it.
                      ColorFiltered(
                        colorFilter: ColorFilter.matrix(_darkMapTileMatrix),
                        child: TileLayer(
                          urlTemplate: AppConfig.osmTileUrl,
                          subdomains: const ['a', 'b', 'c', 'd'],
                          retinaMode: true,
                          userAgentPackageName: 'com.smarttaxi.app',
                          errorTileCallback: (_, __, ___) {
                            if (_mapUnavailable) return;
                            _tileErrorCount++;
                            if (_tileErrorCount >= 12 && mounted) {
                              setState(() => _mapUnavailable = true);
                            }
                          },
                        ),
                      ),
                      if (route.isNotEmpty)
                        PolylineLayer(
                          polylines: [
                            Polyline(
                              points: route,
                              color: Colors.white.withValues(alpha: 0.9),
                              strokeWidth: 9,
                            ),
                            Polyline(
                              points: route,
                              color: SmartTaxiColors.goldDeep,
                              strokeWidth: 5.5,
                            ),
                          ],
                        ),
                      MarkerLayer(
                        markers: [
                          if (shell._activeOrder?.pickupCoordinate != null)
                            Marker(
                              point: shell._activeOrder!.pickupCoordinate!
                                  .toLatLng(),
                              width: 34,
                              height: 34,
                              child: const _NavigatorPointMarker(
                                icon: Icons.navigation_rounded,
                                background: SmartTaxiColors.gold,
                                foreground: Colors.white,
                              ),
                            ),
                          if (shell._activeOrder?.dropoffCoordinate != null)
                            Marker(
                              point: shell._activeOrder!.dropoffCoordinate!
                                  .toLatLng(),
                              width: 34,
                              height: 34,
                              child: const _NavigatorPointMarker(
                                icon: Icons.location_on_rounded,
                                background: SmartTaxiColors.gold,
                                foreground: SmartTaxiColors.text,
                              ),
                            ),
                          for (final alert in alerts.take(12))
                            Marker(
                              point: alert.toLatLng(),
                              width: 44,
                              height: 44,
                              child: _RoadAlertPin(
                                label: _alertShortLabel(alert.type),
                                color: _alertColor(alert.type),
                                heading: alert.heading,
                              ),
                            ),
                        ],
                      ),
                      if (current != null)
                        _AnimatedSelfMarkerLayer(
                          point: current.toLatLng(),
                          rotationRadians:
                              heading == null ? null : heading * math.pi / 180,
                        ),
                    ],
                  ),
          ),
          // Top zone: back button + status chips on one row, own space from
          // the maneuver banner below so neither ever fights the other for
          // room regardless of text length.
          Positioned(
            top: topInset + 10,
            left: 14,
            right: 14,
            child: Row(
              children: [
                _NavCircleButton(
                  icon: Icons.arrow_back_rounded,
                  semanticLabel: 'Назад',
                  onTap: () => Navigator.of(context).pop(),
                ),
                const Spacer(),
                _NavCircleButton(
                  icon: shell._voiceEnabled
                      ? Icons.volume_up_rounded
                      : Icons.volume_off_rounded,
                  semanticLabel: shell._voiceEnabled
                      ? 'Выключить голосовые подсказки'
                      : 'Включить голосовые подсказки',
                  onTap: shell._toggleVoice,
                ),
                const SizedBox(width: 8),
                _NavCircleButton(
                  icon: Icons.add_location_alt_rounded,
                  semanticLabel: 'Сообщить о дорожном событии',
                  badge: alerts.isEmpty ? null : alerts.length,
                  loading: shell._roadAlertsLoading,
                  onTap: () => unawaited(shell._openRoadAlerts()),
                ),
              ],
            ),
          ),
          // Maneuver banner — its own row, always directly under the top
          // controls regardless of whether a voice-warning popup is also
          // showing right now (that one lives further down, see below).
          if (showManeuverBanner)
            Positioned(
              top: topInset + 66,
              left: 14,
              right: 14,
              child: _NextManeuverBanner(
                label: maneuver.label,
                icon: maneuver.icon,
                distanceMeters: maneuver.distanceMeters,
                streetName: maneuver.streetName,
              ),
            ),
          // Camera/sign proximity warning — a separate popup zone below the
          // maneuver banner's row, so a warning firing mid-turn never
          // covers the turn instruction it's warning about. The maneuver
          // banner grew an extra line for the street name (real OSRM step
          // data) after this offset was first calibrated for a fixed
          // two-line banner — account for that extra line here too, or a
          // long/present street name pushes the banner tall enough to clip
          // into this one.
          if (showVoiceBanner)
            Positioned(
              top: topInset +
                  (!showManeuverBanner
                      ? 66
                      : (maneuver.streetName == null ? 140 : 160)),
              left: 14,
              right: 14,
              child: _NavigatorVoiceBanner(text: shell._navigatorBannerText!),
            ),
          if (_gpsLost)
            Positioned(
              top: topInset + 66,
              left: 14,
              right: 14,
              child: const _GpsSearchingBanner(),
            )
          else if (shell._navigatorMessage != null)
            Positioned(
              top: topInset + 66,
              left: 14,
              right: 14,
              child: InlineMessage(text: shell._navigatorMessage!),
            ),
          if (!_autoFollow)
            Positioned(
              right: 14,
              bottom: bottomInset + 190,
              child: _NavCircleButton(
                icon: Icons.my_location_rounded,
                semanticLabel: 'Вернуться к текущей позиции',
                onTap: _recenter,
                filled: true,
              ),
            ),
          // Bottom zone: target distance/ETA strip, then the speed cockpit —
          // stacked in their own column so they never overlap the map
          // controls above no matter the screen height.
          Positioned(
            left: 14,
            right: 14,
            bottom: bottomInset + 14,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                if (targetMeta != null) ...[
                  _NavTargetStrip(text: targetMeta),
                  const SizedBox(height: 10),
                ],
                Row(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    Expanded(
                      flex: 3,
                      child: _NavigatorMetric(
                        title: 'Скорость',
                        value: speedKmh == null ? '--' : '$speedKmh',
                        suffix: 'км/ч',
                        emphasize: true,
                        valueColor: speeding ? SmartTaxiColors.danger : null,
                      ),
                    ),
                    // A posted limit is real, sourced data (OSM maxspeed
                    // tags) — genuinely absent for most of these small-town
                    // regions today (confirmed: zero results for the test
                    // area), so a permanent "Лимит --" card was dead weight
                    // on screen almost all the time. Only takes its slot
                    // when there's an actual number to show.
                    if (speedLimit != null) ...[
                      const SizedBox(width: 10),
                      Expanded(
                        flex: 2,
                        child: _NavigatorMetric(
                          title: 'Лимит',
                          value: '$speedLimit',
                          suffix: 'км/ч',
                        ),
                      ),
                    ],
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _NavCircleButton extends StatelessWidget {
  const _NavCircleButton({
    required this.icon,
    required this.onTap,
    required this.semanticLabel,
    this.badge,
    this.filled = false,
    this.loading = false,
  });

  final IconData icon;
  final VoidCallback onTap;
  // Every instance is an icon-only circular button with no visible text —
  // without this a screen reader (TalkBack/VoiceOver) announces nothing
  // meaningful, which matters most for the back button: it's the only
  // non-gesture way out of this full-screen route.
  final String semanticLabel;
  final int? badge;
  final bool filled;
  final bool loading;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      label: semanticLabel,
      child: Material(
        color: filled
            ? SmartTaxiColors.gold
            : Colors.white.withValues(alpha: 0.94),
        shape: const CircleBorder(),
        elevation: 4,
        shadowColor: Colors.black38,
        child: InkWell(
          customBorder: const CircleBorder(),
          onTap: onTap,
          child: SizedBox(
            width: 44,
            height: 44,
            child: Stack(
              clipBehavior: Clip.none,
              children: [
                Center(
                  child: loading
                      ? SizedBox(
                          width: 18,
                          height: 18,
                          child: CircularProgressIndicator(
                            strokeWidth: 2,
                            color: filled
                                ? Colors.white
                                : SmartTaxiColors.goldDeep,
                          ),
                        )
                      : Icon(icon,
                          size: 21,
                          color: filled ? Colors.white : SmartTaxiColors.text),
                ),
                if (badge != null)
                  Positioned(
                    top: -3,
                    right: -3,
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 5, vertical: 1.5),
                      decoration: BoxDecoration(
                        color: SmartTaxiColors.danger,
                        borderRadius: BorderRadius.circular(999),
                        border: Border.all(color: Colors.white, width: 1.4),
                      ),
                      child: Text(
                        '$badge',
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 10,
                          fontWeight: FontWeight.w900,
                        ),
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

class _NavTargetStrip extends StatelessWidget {
  const _NavTargetStrip({required this.text});

  final String text;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.96),
        borderRadius: BorderRadius.circular(16),
        boxShadow: const [
          BoxShadow(
              color: Colors.black26, blurRadius: 14, offset: Offset(0, 6)),
        ],
      ),
      child: Row(
        children: [
          const Icon(Icons.route_rounded,
              size: 18, color: SmartTaxiColors.goldDeep),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              text,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(
                fontSize: 13.5,
                fontWeight: FontWeight.w800,
                color: SmartTaxiColors.text,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _GpsSearchingBanner extends StatelessWidget {
  const _GpsSearchingBanner();

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 13),
      decoration: BoxDecoration(
        color: const Color(0xff10192e),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: Colors.white24),
      ),
      child: Row(
        children: [
          const SizedBox(
            width: 16,
            height: 16,
            child:
                CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
          ),
          const SizedBox(width: 10),
          const Expanded(
            child: Text(
              'Ищу сигнал GPS…',
              style: TextStyle(
                color: Colors.white,
                fontSize: 13.5,
                fontWeight: FontWeight.w800,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _TripMap extends StatefulWidget {
  const _TripMap({
    required this.order,
    required this.route,
    this.current,
    this.heading,
  });

  final OrderSummary order;
  final List<LatLng> route;
  final Coordinate? current;
  final double? heading;

  @override
  State<_TripMap> createState() => _TripMapState();
}

class _TripMapState extends State<_TripMap> {
  final MapController _mapController = MapController();
  late String _lastRefitSignature;

  @override
  void initState() {
    super.initState();
    _lastRefitSignature = _refitSignature(widget);
  }

  @override
  void didUpdateWidget(covariant _TripMap oldWidget) {
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

  List<LatLng> _refitPoints(_TripMap w) {
    final pickup = w.order.pickupCoordinate?.toLatLng();
    final dropoff = w.order.dropoffCoordinate?.toLatLng();
    return [
      if (w.route.isNotEmpty) ...w.route,
      if (pickup != null) pickup,
      if (dropoff != null) dropoff,
    ];
  }

  String _refitSignature(_TripMap w) =>
      _refitPoints(w).map(_driverMapPointKey).join('|');

  static const _refitPadding = EdgeInsets.fromLTRB(36, 54, 36, 62);

  void _refitCamera() {
    final points = _refitPoints(widget);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted || points.isEmpty) return;
      if (points.length > 1) {
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
        _mapController.move(points.first, 14);
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final pickup = widget.order.pickupCoordinate?.toLatLng();
    final dropoff = widget.order.dropoffCoordinate?.toLatLng();
    if (pickup == null && dropoff == null && widget.route.isEmpty) {
      return const SizedBox.shrink();
    }
    final center = pickup ?? dropoff ?? widget.route.first;
    final initialPoints = [
      if (widget.route.isNotEmpty) ...widget.route,
      if (pickup != null) pickup,
      if (dropoff != null) dropoff,
    ];
    final cameraFit = initialPoints.length > 1
        ? CameraFit.coordinates(
            coordinates: initialPoints,
            padding: const EdgeInsets.fromLTRB(36, 54, 36, 62),
            maxZoom: 15.5,
          )
        : null;
    return ClipRRect(
      borderRadius: BorderRadius.circular(28),
      child: SizedBox(
        height: 246,
        child: Stack(
          children: [
            FlutterMap(
              mapController: _mapController,
              options: MapOptions(
                initialCenter: center,
                initialZoom: 14,
                initialCameraFit: cameraFit,
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
                      userAgentPackageName: 'com.smarttaxi.app'),
                ),
                if (widget.route.isNotEmpty)
                  PolylineLayer(polylines: [
                    Polyline(
                        points: widget.route,
                        color: Colors.white.withValues(alpha: 0.9),
                        strokeWidth: 7.5),
                    Polyline(
                        points: widget.route,
                        color: SmartTaxiColors.goldDeep,
                        strokeWidth: 4)
                  ]),
                MarkerLayer(markers: [
                  if (pickup != null)
                    _routePointMarker(
                      pickup,
                      icon: Icons.navigation_rounded,
                      background: SmartTaxiColors.gold,
                      foreground: Colors.white,
                    ),
                  if (dropoff != null)
                    _routePointMarker(
                      dropoff,
                      icon: Icons.location_on_rounded,
                      background: SmartTaxiColors.gold,
                      foreground: SmartTaxiColors.text,
                    ),
                ]),
                if (widget.current != null)
                  _AnimatedSelfMarkerLayer(
                    point: widget.current!.toLatLng(),
                    rotationRadians: widget.heading == null
                        ? null
                        : widget.heading! * math.pi / 180,
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
                        Color(0x00fffcf6),
                        Color(0x1afff8e6),
                        Color(0xcafffcf6),
                      ],
                    ),
                  ),
                ),
              ),
            ),
            Positioned(
              left: 12,
              top: 12,
              child: _DriverMapBadge(
                text: widget.route.isEmpty
                    ? 'Маршрут появится после расчёта'
                    : 'Маршрут до точки посадки',
              ),
            ),
          ],
        ),
      ),
    );
  }
}

Marker _routePointMarker(
  LatLng point, {
  required IconData icon,
  required Color background,
  required Color foreground,
}) {
  return Marker(
    point: point,
    width: 34,
    height: 34,
    child: Container(
      alignment: Alignment.center,
      decoration: BoxDecoration(
          color: background,
          shape: BoxShape.circle,
          border: Border.all(color: Colors.white, width: 2.5),
          boxShadow: const [
            BoxShadow(color: Color(0x24000000), blurRadius: 14)
          ]),
      child: Icon(icon, color: foreground, size: 18),
    ),
  );
}

String _driverMapPointKey(LatLng point) =>
    '${point.latitude.toStringAsFixed(5)},${point.longitude.toStringAsFixed(5)}';

// True when every point already renders inside the padded-in viewport, so a
// camera refit (which recenters/rezooms) can be skipped entirely — the
// driver-to-target route shrinks on almost every refresh, and refitting
// unconditionally would keep re-zooming the map as the trip progresses.
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

class _DriverMapBadge extends StatelessWidget {
  const _DriverMapBadge({required this.text});

  final String text;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.94),
        border: Border.all(color: SmartTaxiColors.border),
        borderRadius: BorderRadius.circular(16),
        boxShadow: const [
          BoxShadow(
            color: Color(0x14785a14),
            blurRadius: 18,
            offset: Offset(0, 8),
          )
        ],
      ),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        child: Text(
          text,
          style: const TextStyle(
            fontSize: 12,
            fontWeight: FontWeight.w800,
            color: SmartTaxiColors.text,
          ),
        ),
      ),
    );
  }
}

// Bottom sheet the driver uses to counter-propose a price on an open order
// (torg). Server enforces a flat 200–1,000,000 KZT sanity range regardless
// of the order's own estimate — see offeredPriceBounds() in
// order-pricing.service.js — so the same bounds are mirrored here just for
// input validation, not because they're derived from `currentPrice`.
// Fixed vocabulary mirrored from the backend's QUICK_MESSAGES map
// (apps/api/src/modules/orders/orders.routes.js) — the server owns the
// canonical text and rejects any key outside this set.
class _DriverQuickMessageSheet extends StatefulWidget {
  const _DriverQuickMessageSheet({required this.api, required this.orderId});

  final ApiClient api;
  final String orderId;

  @override
  State<_DriverQuickMessageSheet> createState() =>
      _DriverQuickMessageSheetState();
}

class _DriverQuickMessageSheetState extends State<_DriverQuickMessageSheet> {
  static const _messages = {
    'I_ARRIVED': 'Я приехал',
    'WAITING_AT_ENTRANCE': 'Жду у входа',
    'RUNNING_LATE_2MIN': 'Опаздываю на 2 минуты',
    'PLEASE_COME_OUT': 'Пожалуйста, выходите',
    'ON_MY_WAY': 'Уже еду к вам',
  };

  String? _sending;

  Future<void> _send(String key, String text) async {
    setState(() => _sending = key);
    try {
      await widget.api
          .sendQuickMessage(orderId: widget.orderId, messageKey: key);
      if (!mounted) return;
      Navigator.of(context).pop();
      AppToast.showSuccess(context, 'Отправлено: $text');
    } catch (error) {
      if (!mounted) return;
      setState(() => _sending = null);
      AppToast.showError(context, readableError(error));
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
            const Text(
              'Быстрое сообщение',
              style: TextStyle(fontSize: 17, fontWeight: FontWeight.w900),
            ),
            const SizedBox(height: 14),
            ..._messages.entries.map(
              (entry) => Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: SizedBox(
                  width: double.infinity,
                  child: OutlinedButton(
                    onPressed: _sending != null
                        ? null
                        : () => _send(entry.key, entry.value),
                    child: _sending == entry.key
                        ? const SizedBox(
                            width: 18,
                            height: 18,
                            child: CircularProgressIndicator(strokeWidth: 2.2),
                          )
                        : Text(entry.value),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _PriceOfferSheet extends StatefulWidget {
  const _PriceOfferSheet({this.currentPrice});

  final double? currentPrice;

  @override
  State<_PriceOfferSheet> createState() => _PriceOfferSheetState();
}

class _PriceOfferSheetState extends State<_PriceOfferSheet> {
  late final TextEditingController _controller = TextEditingController(
    text: widget.currentPrice == null
        ? ''
        : widget.currentPrice!.round().toString(),
  );
  String? _error;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _submit() {
    final value = int.tryParse(_controller.text.trim());
    if (value == null || value < 200 || value > 1000000) {
      setState(() => _error = 'Введите цену от 200 до 1 000 000 ₸');
      return;
    }
    Navigator.of(context).pop(value);
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(
        bottom: MediaQuery.viewInsetsOf(context).bottom,
      ),
      child: Container(
        padding: const EdgeInsets.fromLTRB(20, 12, 20, 24),
        decoration: BoxDecoration(
          color: context.palette.appBackground,
          borderRadius: const BorderRadius.vertical(top: Radius.circular(28)),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Center(
              child: Container(
                width: 44,
                height: 5,
                margin: const EdgeInsets.only(bottom: 16),
                decoration: BoxDecoration(
                  color: context.palette.borderStrong,
                  borderRadius: BorderRadius.circular(999),
                ),
              ),
            ),
            const Text(
              'Предложить свою цену',
              style: TextStyle(fontSize: 19, fontWeight: FontWeight.w900),
            ),
            const SizedBox(height: 6),
            Text(
              widget.currentPrice == null
                  ? 'Клиент увидит вашу цену и сможет согласиться или отказаться'
                  : 'Текущая цена заказа: ${formatDriverMoney(widget.currentPrice!.round())}',
              style: TextStyle(
                color: context.palette.textSecondary,
                fontSize: 13,
                fontWeight: FontWeight.w600,
              ),
            ),
            const SizedBox(height: 16),
            TextField(
              controller: _controller,
              autofocus: true,
              keyboardType: TextInputType.number,
              onChanged: (_) {
                if (_error != null) setState(() => _error = null);
              },
              onSubmitted: (_) => _submit(),
              decoration: InputDecoration(
                labelText: 'Цена, ₸',
                errorText: _error,
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(16),
                ),
              ),
            ),
            const SizedBox(height: 16),
            DriverGradientButton(
              text: 'Отправить предложение',
              onTap: _submit,
            ),
          ],
        ),
      ),
    );
  }
}

// Its own widget class, not inline content built by a DriverShell method —
// _showDriverFullSheet re-invokes contentBuilder() on every sheet rebuild
// (e.g. a theme change), constructing a new instance each time. Flutter
// reconciles same-type widgets at the same tree position as an update
// (didUpdateWidget), not a remount, so keeping this as its own
// StatefulWidget preserves _bookings/_loading across those rebuilds instead
// of re-fetching every time the sheet redraws.
class _DriverRecurringBookingsScreen extends StatefulWidget {
  const _DriverRecurringBookingsScreen({required this.api});

  final ApiClient api;

  @override
  State<_DriverRecurringBookingsScreen> createState() =>
      _DriverRecurringBookingsScreenState();
}

class _DriverRecurringBookingsScreenState
    extends State<_DriverRecurringBookingsScreen> {
  List<RecurringBooking> _bookings = const [];
  bool _loading = true;
  bool _error = false;
  final Set<String> _updating = {};

  @override
  void initState() {
    super.initState();
    unawaited(_load());
  }

  Future<void> _load() async {
    if (!mounted) return;
    setState(() {
      _loading = true;
      _error = false;
    });
    try {
      final bookings = await widget.api.getDriverRecurringBookings();
      if (!mounted) return;
      setState(() => _bookings = bookings);
    } catch (_) {
      if (mounted) setState(() => _error = true);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _respond(RecurringBooking booking, bool accept) async {
    if (_updating.contains(booking.id)) return;
    setState(() => _updating.add(booking.id));
    try {
      final updated = await widget.api.respondToRecurringBooking(
        id: booking.id,
        accept: accept,
      );
      if (!mounted) return;
      setState(() {
        _bookings =
            _bookings.map((b) => b.id == updated.id ? updated : b).toList();
      });
      if (mounted) {
        AppToast.showSuccess(
          context,
          accept ? 'Маршрут принят' : 'Маршрут отклонён',
        );
      }
    } catch (error) {
      if (!mounted) return;
      AppToast.showError(context, readableError(error));
    } finally {
      if (mounted) setState(() => _updating.remove(booking.id));
    }
  }

  Future<void> _updateStatus(RecurringBooking booking, String status) async {
    if (_updating.contains(booking.id)) return;
    setState(() => _updating.add(booking.id));
    try {
      final updated = await widget.api.updateRecurringBookingStatus(
        id: booking.id,
        status: status,
      );
      if (!mounted) return;
      setState(() {
        _bookings =
            _bookings.map((b) => b.id == updated.id ? updated : b).toList();
      });
    } catch (error) {
      if (!mounted) return;
      AppToast.showError(context, readableError(error));
    } finally {
      if (mounted) setState(() => _updating.remove(booking.id));
    }
  }

  @override
  Widget build(BuildContext context) {
    final pending =
        _bookings.where((b) => b.isPendingDriver).toList(growable: false);
    final others =
        _bookings.where((b) => !b.isPendingDriver).toList(growable: false);
    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        padding: const EdgeInsets.all(20),
        physics: const AlwaysScrollableScrollPhysics(
          parent: BouncingScrollPhysics(),
        ),
        children: [
          const TitleBlock(
            title: 'Регулярные поездки',
            text: 'Входящие заявки и ваши активные маршруты',
          ),
          const SizedBox(height: 16),
          if (_loading && _bookings.isEmpty)
            const Center(
              child: Padding(
                padding: EdgeInsets.all(24),
                child: CircularProgressIndicator(strokeWidth: 2.4),
              ),
            )
          else if (_error && _bookings.isEmpty)
            EmptyState(
              icon: Icons.wifi_off_rounded,
              title: 'Не удалось загрузить',
              text: 'Потяните экран вниз, чтобы попробовать снова.',
              action: 'Повторить',
              onAction: () => unawaited(_load()),
            )
          else if (_bookings.isEmpty)
            const EmptyState(
              icon: Icons.event_repeat_rounded,
              title: 'Пока нет заявок',
              text:
                  'Клиенты смогут предложить вам регулярный маршрут после совместной поездки.',
            )
          else ...[
            if (pending.isNotEmpty) ...[
              const SectionLabel(
                title: 'Новые заявки',
                text: 'Примите, если готовы возить по расписанию',
              ),
              const SizedBox(height: 8),
              ...pending.map(
                (booking) => Padding(
                  padding: const EdgeInsets.only(bottom: 10),
                  child: _DriverRecurringBookingCard(
                    booking: booking,
                    updating: _updating.contains(booking.id),
                    onAccept: () => _respond(booking, true),
                    onDecline: () => _respond(booking, false),
                  ),
                ),
              ),
              const SizedBox(height: 12),
            ],
            if (others.isNotEmpty) ...[
              const SectionLabel(title: 'Ваши маршруты', text: ''),
              const SizedBox(height: 8),
              ...others.map(
                (booking) => Padding(
                  padding: const EdgeInsets.only(bottom: 10),
                  child: _DriverRecurringBookingCard(
                    booking: booking,
                    updating: _updating.contains(booking.id),
                    onPause: booking.isActive
                        ? () => _updateStatus(booking, 'PAUSED')
                        : null,
                    onResume: booking.isPaused
                        ? () => _updateStatus(booking, 'ACTIVE')
                        : null,
                    onCancel: booking.isCancelled
                        ? null
                        : () => _updateStatus(booking, 'CANCELLED'),
                  ),
                ),
              ),
            ],
          ],
        ],
      ),
    );
  }
}

class _DriverRecurringBookingCard extends StatelessWidget {
  const _DriverRecurringBookingCard({
    required this.booking,
    required this.updating,
    this.onAccept,
    this.onDecline,
    this.onPause,
    this.onResume,
    this.onCancel,
  });

  final RecurringBooking booking;
  final bool updating;
  final VoidCallback? onAccept;
  final VoidCallback? onDecline;
  final VoidCallback? onPause;
  final VoidCallback? onResume;
  final VoidCallback? onCancel;

  (StatusTone, String) get _statusMeta {
    switch (booking.status) {
      case 'ACTIVE':
        return (StatusTone.success, 'Активна');
      case 'PAUSED':
        return (StatusTone.neutral, 'На паузе');
      case 'CANCELLED':
        return (StatusTone.neutral, 'Отменена');
      default:
        return (StatusTone.neutral, 'Новая заявка');
    }
  }

  @override
  Widget build(BuildContext context) {
    final (tone, label) = _statusMeta;
    return Opacity(
      opacity: booking.isCancelled ? 0.6 : 1,
      child: PremiumCard(
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
                DriverOrderChip(
                  icon: Icons.event_repeat_rounded,
                  label: booking.daysLabel,
                ),
                DriverOrderChip(
                  icon: Icons.schedule_rounded,
                  label: booking.timeOfDay,
                ),
                DriverOrderChip(
                  icon: Icons.payments_outlined,
                  label: formatDriverMoney(booking.priceKzt),
                ),
                if ((booking.clientName ?? '').isNotEmpty)
                  DriverOrderChip(
                    icon: Icons.person_outline_rounded,
                    label: booking.clientName!,
                  ),
              ],
            ),
            if (onAccept != null || onDecline != null) ...[
              const SizedBox(height: 12),
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton(
                      onPressed: updating ? null : onDecline,
                      child: const Text('Отклонить'),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    flex: 2,
                    child: ElevatedButton(
                      onPressed: updating ? null : onAccept,
                      child: updating
                          ? const ButtonSpinner(text: 'Принимаем...')
                          : const Text('Принять'),
                    ),
                  ),
                ],
              ),
            ] else if (onPause != null ||
                onResume != null ||
                onCancel != null) ...[
              const SizedBox(height: 12),
              Row(
                children: [
                  if (onPause != null)
                    Expanded(
                      child: OutlinedButton(
                        onPressed: updating ? null : onPause,
                        child: const Text('Пауза'),
                      ),
                    )
                  else if (onResume != null)
                    Expanded(
                      child: OutlinedButton(
                        onPressed: updating ? null : onResume,
                        child: const Text('Возобновить'),
                      ),
                    ),
                  if (onCancel != null) ...[
                    const SizedBox(width: 10),
                    TextButton(
                      onPressed: updating ? null : onCancel,
                      style: TextButton.styleFrom(
                        foregroundColor: context.palette.danger,
                      ),
                      child: const Text('Отменить'),
                    ),
                  ],
                ],
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _RoadAlertsSheet extends StatefulWidget {
  const _RoadAlertsSheet({
    required this.api,
    required this.regionId,
    this.initialCenter,
  });

  final ApiClient api;
  final String? regionId;
  final Coordinate? initialCenter;

  @override
  State<_RoadAlertsSheet> createState() => _RoadAlertsSheetState();
}

class _RoadAlertsSheetState extends State<_RoadAlertsSheet> {
  final _commentController = TextEditingController();
  final _speedLimitController = TextEditingController();
  bool _loading = true;
  bool _saving = false;
  bool _mapUnavailable = false;
  String _selectedType = roadAlertTypes.first;
  String? _message;
  String? _updatingAlertId;
  Coordinate? _selectedPoint;
  double? _selectedHeading;
  List<RoadAlert> _alerts = const [];

  @override
  void initState() {
    super.initState();
    _loadAlerts();
  }

  @override
  void dispose() {
    _commentController.dispose();
    _speedLimitController.dispose();
    super.dispose();
  }

  Future<void> _loadAlerts() async {
    setState(() {
      _loading = true;
      _message = null;
    });
    try {
      final alerts =
          await widget.api.getDriverRoadAlerts(regionId: widget.regionId);
      if (!mounted) return;
      setState(() => _alerts = alerts);
    } catch (error) {
      if (!mounted) return;
      setState(() => _message = readableError(error));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _useGps() async {
    setState(() => _message = null);
    final enabled = await Geolocator.isLocationServiceEnabled();
    if (!enabled) {
      setState(
          () => _message = 'Включите геолокацию или выберите точку на карте.');
      return;
    }
    var permission = await Geolocator.checkPermission();
    if (permission == LocationPermission.denied) {
      permission = await Geolocator.requestPermission();
    }
    if (permission == LocationPermission.denied ||
        permission == LocationPermission.deniedForever) {
      setState(
          () => _message = 'Разрешите геолокацию или выберите точку на карте.');
      return;
    }
    try {
      final position = await Geolocator.getCurrentPosition();
      if (!mounted) return;
      setState(() {
        _selectedPoint =
            Coordinate(lat: position.latitude, lng: position.longitude);
        // GPS course of travel at the report moment — a reasonable proxy for
        // which direction a SPEED_CAMERA faces, since drivers can't measure
        // that directly. Null (not 0.0) when the device reports no heading.
        _selectedHeading = position.heading.isFinite ? position.heading : null;
        _message = 'Координаты выбраны из GPS.';
      });
    } catch (_) {
      if (mounted) {
        setState(() => _message = 'Не удалось получить геолокацию.');
      }
    }
  }

  Future<void> _submitAlert() async {
    final point = _selectedPoint;
    if (point == null) {
      setState(
          () => _message = 'Выберите точку события на карте или через GPS.');
      return;
    }
    setState(() {
      _saving = true;
      _message = null;
    });
    try {
      final speedText = _speedLimitController.text.trim();
      final speedLimit = speedText.isEmpty ? null : int.tryParse(speedText);
      if (speedText.isNotEmpty && speedLimit == null) {
        setState(() {
          _saving = false;
          _message = 'Укажите ограничение скорости числом.';
        });
        return;
      }
      final alert = await widget.api.createDriverRoadAlert(
        regionId: widget.regionId,
        type: _selectedType,
        location: point,
        comment: _commentController.text.trim(),
        speedLimit: speedLimit,
        heading: _selectedType == 'SPEED_CAMERA' ? _selectedHeading : null,
      );
      if (!mounted) return;
      _commentController.clear();
      _speedLimitController.clear();
      setState(() {
        _alerts = [alert, ..._alerts];
        _selectedPoint = null;
        _selectedHeading = null;
        _message = 'Событие отправлено для безопасности движения.';
      });
    } catch (error) {
      if (!mounted) return;
      setState(() => _message = readableError(error));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _confirmAlert(RoadAlert alert) async {
    setState(() {
      _updatingAlertId = alert.id;
      _message = null;
    });
    try {
      final updated = await widget.api.confirmDriverRoadAlert(alert.id);
      if (!mounted) return;
      setState(() {
        _alerts = _replaceAlert(_alerts, updated);
        _message = 'Спасибо. Подтверждение поможет другим водителям.';
      });
    } catch (error) {
      if (!mounted) return;
      setState(() => _message = readableError(error));
    } finally {
      if (mounted) setState(() => _updatingAlertId = null);
    }
  }

  Future<void> _dismissAlert(RoadAlert alert) async {
    setState(() {
      _updatingAlertId = alert.id;
      _message = null;
    });
    try {
      await widget.api.dismissDriverRoadAlert(alert.id);
      if (!mounted) return;
      setState(() {
        _alerts = _alerts.where((item) => item.id != alert.id).toList();
        _message = 'Событие скрыто из активного списка.';
      });
    } catch (error) {
      if (!mounted) return;
      setState(() => _message = readableError(error));
    } finally {
      if (mounted) setState(() => _updatingAlertId = null);
    }
  }

  @override
  Widget build(BuildContext context) {
    final bottomPadding = MediaQuery.viewInsetsOf(context).bottom;
    return DraggableScrollableSheet(
      initialChildSize: 0.88,
      minChildSize: 0.58,
      maxChildSize: 0.96,
      builder: (context, controller) => Container(
        decoration: BoxDecoration(
          color: context.palette.appBackground,
          borderRadius: const BorderRadius.vertical(top: Radius.circular(32)),
        ),
        child: ListView(
          controller: controller,
          padding: EdgeInsets.fromLTRB(18, 12, 18, bottomPadding + 24),
          children: [
            const Center(child: SheetHandle()),
            const SizedBox(height: 16),
            Row(
              children: [
                const Expanded(
                  child: TitleBlock(
                    title: 'Дорожные события',
                    text:
                        'Сообщения нужны для безопасности движения и соблюдения правил.',
                  ),
                ),
                IconButton.filledTonal(
                  onPressed: _loadAlerts,
                  tooltip: 'Обновить',
                  icon: const Icon(Icons.refresh_rounded),
                ),
              ],
            ),
            const SizedBox(height: 14),
            _RoadAlertMap(
              alerts: _alerts,
              selectedPoint: _selectedPoint,
              initialCenter: widget.initialCenter,
              mapUnavailable: _mapUnavailable,
              onTileError: () => setState(() => _mapUnavailable = true),
              onTap: (point) => setState(() {
                _selectedPoint =
                    Coordinate(lat: point.latitude, lng: point.longitude);
                // A manually tapped point carries no GPS course of travel.
                _selectedHeading = null;
                _message = 'Координаты выбраны на карте.';
              }),
            ),
            const SizedBox(height: 14),
            PremiumCard(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const SectionLabel(
                    title: 'Новое событие',
                    text:
                        'Выберите тип и точку. Сообщение увидят водители в регионе.',
                  ),
                  const SizedBox(height: 12),
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: [
                      for (final type in roadAlertTypes)
                        ChoiceChip(
                          label: Text(roadAlertLabel(type)),
                          selected: _selectedType == type,
                          onSelected: (_) =>
                              setState(() => _selectedType = type),
                        ),
                    ],
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: _commentController,
                    maxLines: 3,
                    maxLength: 300,
                    decoration: const InputDecoration(
                      labelText: 'Комментарий',
                      hintText: 'Например: правая полоса закрыта',
                      counterText: '',
                    ),
                  ),
                  const SizedBox(height: 10),
                  TextField(
                    controller: _speedLimitController,
                    keyboardType: TextInputType.number,
                    decoration: const InputDecoration(
                      labelText: 'Ограничение, км/ч',
                      hintText: 'Только если указано знаком',
                    ),
                  ),
                  const SizedBox(height: 12),
                  Row(
                    children: [
                      Expanded(
                        child: OutlinedButton.icon(
                          onPressed: _saving ? null : _useGps,
                          icon: const Icon(Icons.my_location_rounded),
                          label: const Text('GPS'),
                        ),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: ElevatedButton.icon(
                          onPressed: _saving ? null : _submitAlert,
                          icon: _saving
                              ? const SizedBox(
                                  width: 16,
                                  height: 16,
                                  child: CircularProgressIndicator(
                                    strokeWidth: 2,
                                    color: SmartTaxiColors.text,
                                  ),
                                )
                              : const Icon(Icons.send_rounded),
                          label: FittedBox(
                            fit: BoxFit.scaleDown,
                            child: Text(
                              _saving ? 'Отправляем...' : 'Отправить',
                              maxLines: 1,
                            ),
                          ),
                        ),
                      ),
                    ],
                  ),
                  if (_selectedPoint != null) ...[
                    const SizedBox(height: 10),
                    InlineMessage(
                      text:
                          'Точка выбрана: ${_selectedPoint!.lat.toStringAsFixed(5)}, ${_selectedPoint!.lng.toStringAsFixed(5)}',
                    ),
                  ],
                  if (_message != null) ...[
                    const SizedBox(height: 10),
                    InlineMessage(text: _message!),
                  ],
                ],
              ),
            ),
            const SizedBox(height: 14),
            PremiumCard(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const SectionLabel(
                    title: 'События рядом',
                    text: 'Показываем только сохранённые активные сообщения.',
                  ),
                  const SizedBox(height: 12),
                  if (_loading)
                    const LoadingStrip(text: 'Загружаем события...')
                  else if (_alerts.isEmpty)
                    const EmptyState(
                      title: 'Пока нет дорожных событий рядом',
                      text:
                          'Когда водитель отправит сообщение, оно появится здесь.',
                      icon: Icons.signpost_outlined,
                    )
                  else
                    ..._alerts.map(
                      (alert) => _RoadAlertRow(
                        alert: alert,
                        updating: _updatingAlertId == alert.id,
                        onConfirm: () => _confirmAlert(alert),
                        onDismiss: () => _dismissAlert(alert),
                      ),
                    ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _RoadAlertMap extends StatelessWidget {
  const _RoadAlertMap({
    required this.alerts,
    required this.selectedPoint,
    required this.mapUnavailable,
    required this.onTileError,
    required this.onTap,
    this.initialCenter,
  });

  final List<RoadAlert> alerts;
  final Coordinate? selectedPoint;
  final Coordinate? initialCenter;
  final bool mapUnavailable;
  final VoidCallback onTileError;
  final ValueChanged<LatLng> onTap;

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    // Falls back to the driver's own region/GPS before the hardcoded
    // Shymkent coordinate — that default only fires if we somehow have
    // neither (e.g. location permission denied and region lookup failed).
    final center = selectedPoint?.toLatLng() ??
        (alerts.isNotEmpty
            ? alerts.first.toLatLng()
            : (initialCenter?.toLatLng() ?? const LatLng(42.3167, 69.5958)));
    return ClipRRect(
      borderRadius: BorderRadius.circular(28),
      child: SizedBox(
        height: 250,
        child: Stack(
          children: [
            if (mapUnavailable)
              const Positioned.fill(child: _RoadAlertMapFallback())
            else
              FlutterMap(
                options: MapOptions(
                  initialCenter: center,
                  initialZoom: 13,
                  onTap: (_, point) => onTap(point),
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
                  MarkerLayer(
                    markers: [
                      for (final alert in alerts) _alertMarker(alert),
                      if (selectedPoint != null)
                        Marker(
                          point: selectedPoint!.toLatLng(),
                          width: 46,
                          height: 46,
                          child: const _RoadAlertPin(
                            label: '!',
                            color: SmartTaxiColors.goldDeep,
                          ),
                        ),
                    ],
                  ),
                ],
              ),
            Positioned(
              left: 12,
              right: 12,
              top: 12,
              child: Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                decoration: BoxDecoration(
                  color: Colors.white.withValues(alpha: 0.94),
                  border: Border.all(color: SmartTaxiColors.border),
                  borderRadius: BorderRadius.circular(18),
                ),
                child: const Row(
                  children: [
                    Icon(Icons.shield_outlined,
                        color: SmartTaxiColors.goldDeep, size: 18),
                    SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        'Нажмите на карту, чтобы выбрать точку события',
                        style: TextStyle(
                          color: SmartTaxiColors.text,
                          fontSize: 12.5,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Marker _alertMarker(RoadAlert alert) {
    return Marker(
      point: alert.toLatLng(),
      width: 46,
      height: 46,
      child: _RoadAlertPin(
        label: _alertShortLabel(alert.type),
        color: _alertColor(alert.type),
        heading: alert.heading,
      ),
    );
  }
}

class _RoadAlertMapFallback extends StatelessWidget {
  const _RoadAlertMapFallback();

  @override
  Widget build(BuildContext context) {
    return ColoredBox(
      color: SmartTaxiColors.goldSurface,
      child: Center(
        child: Container(
          margin: const EdgeInsets.all(18),
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: Colors.white.withValues(alpha: 0.94),
            border: Border.all(color: SmartTaxiColors.border),
            borderRadius: BorderRadius.circular(22),
          ),
          child: const Row(
            children: [
              Icon(Icons.map_outlined, color: SmartTaxiColors.goldDeep),
              SizedBox(width: 10),
              Expanded(
                child: Text(
                  'Карта временно недоступна. Выберите точку через GPS или повторите позже.',
                  style: TextStyle(
                    fontWeight: FontWeight.w800,
                    color: SmartTaxiColors.text,
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

class _RoadAlertPin extends StatelessWidget {
  const _RoadAlertPin({required this.label, required this.color, this.heading});

  final String label;
  final Color color;

  /// Compass heading (0-360) the underlying alert/camera faces, if known —
  /// drawn as a small arrow so a driver can tell which direction it watches.
  final double? heading;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: 42,
      height: 42,
      child: Stack(
        clipBehavior: Clip.none,
        alignment: Alignment.center,
        children: [
          Container(
            width: 42,
            height: 42,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: color,
              shape: BoxShape.circle,
              border: Border.all(color: Colors.white, width: 2),
              boxShadow: [
                BoxShadow(
                  color: color.withValues(alpha: 0.30),
                  blurRadius: 20,
                  offset: const Offset(0, 10),
                ),
              ],
            ),
            child: Text(
              label,
              style: const TextStyle(
                color: Colors.white,
                fontWeight: FontWeight.w900,
                fontSize: 13,
              ),
            ),
          ),
          if (heading != null)
            Positioned(
              top: -8,
              child: Transform.rotate(
                angle: heading! * math.pi / 180,
                child: Icon(Icons.navigation,
                    size: 16,
                    color: color,
                    shadows: const [
                      Shadow(color: Colors.white, blurRadius: 2),
                    ]),
              ),
            ),
        ],
      ),
    );
  }
}

class _RoadAlertRow extends StatelessWidget {
  const _RoadAlertRow({
    required this.alert,
    required this.updating,
    required this.onConfirm,
    required this.onDismiss,
  });

  final RoadAlert alert;
  final bool updating;
  final VoidCallback onConfirm;
  final VoidCallback onDismiss;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: context.palette.goldSurface,
        border: Border.all(color: context.palette.border),
        borderRadius: BorderRadius.circular(20),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _RoadAlertPin(
              label: _alertShortLabel(alert.type),
              color: _alertColor(alert.type)),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(alert.label,
                    style: const TextStyle(
                        fontSize: 15, fontWeight: FontWeight.w900)),
                if (alert.comment.isNotEmpty) ...[
                  const SizedBox(height: 4),
                  Text(
                    alert.comment,
                    style: TextStyle(
                      color: context.palette.textSecondary,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ],
                const SizedBox(height: 6),
                Text(
                  'Доверие: ${alert.confidenceScore}% · подтверждений: ${alert.confirmationsCount}',
                  // textSecondary, not textMuted — textMuted's contrast
                  // against the background fails WCAG AA (~2.5:1).
                  style: TextStyle(
                    color: context.palette.textSecondary,
                    fontSize: 12,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                if (alert.speedLimit != null) ...[
                  const SizedBox(height: 4),
                  Text(
                    'Ограничение: ${alert.speedLimit} км/ч',
                    style: TextStyle(
                      color: context.palette.textSecondary,
                      fontSize: 12,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                ],
                if (alert.heading != null) ...[
                  const SizedBox(height: 4),
                  Text(
                    'Смотрит: ${compassLabel(alert.heading!)}',
                    style: TextStyle(
                      color: context.palette.textSecondary,
                      fontSize: 12,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                ],
                const SizedBox(height: 10),
                Row(
                  children: [
                    Expanded(
                      child: OutlinedButton(
                        onPressed: updating ? null : onConfirm,
                        child: Text(updating ? '...' : 'На месте'),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: TextButton(
                        onPressed: updating ? null : onDismiss,
                        child: const Text(
                          'Нет',
                          style: TextStyle(fontWeight: FontWeight.w900),
                        ),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

String _alertShortLabel(String type) {
  return const {
        'ROAD_HAZARD': '!',
        'ACCIDENT': 'ДТП',
        'ROAD_WORK': 'Р',
        'SPEED_CAMERA': 'К',
        'POLICE': 'КД',
        'TRAFFIC_JAM': 'П',
        'ROAD_CLOSED': 'X',
        'BAD_ROAD': 'БД',
        'POTHOLE': 'Я',
        'SPEED_BUMP': 'ЛП',
        'ICY_ROAD': 'Л',
        'SCHOOL_ZONE': 'Ш',
        'TEMPORARY_SPEED_LIMIT': 'ЛИМ',
        'DANGEROUS_TURN': 'ПВ',
        'RAILROAD_CROSSING': 'ЖД',
        'PEDESTRIAN_CROSSING': 'ПЕШ',
        'OTHER': '?',
      }[type] ??
      '?';
}

Color _alertColor(String type) {
  return const {
        'ROAD_HAZARD': SmartTaxiColors.warning,
        'ACCIDENT': SmartTaxiColors.danger,
        'ROAD_WORK': SmartTaxiColors.goldDeep,
        'SPEED_CAMERA': SmartTaxiColors.text,
        'POLICE': SmartTaxiColors.text,
        'TRAFFIC_JAM': SmartTaxiColors.gold,
        'ROAD_CLOSED': SmartTaxiColors.danger,
        'BAD_ROAD': SmartTaxiColors.warning,
        'POTHOLE': SmartTaxiColors.warning,
        'SPEED_BUMP': SmartTaxiColors.goldDeep,
        'ICY_ROAD': Color(0xff0284c7),
        'SCHOOL_ZONE': SmartTaxiColors.gold,
        'TEMPORARY_SPEED_LIMIT': SmartTaxiColors.text,
        'DANGEROUS_TURN': SmartTaxiColors.warning,
        'RAILROAD_CROSSING': SmartTaxiColors.textSecondary,
        'PEDESTRIAN_CROSSING': SmartTaxiColors.success,
        'OTHER': SmartTaxiColors.textSecondary,
      }[type] ??
      SmartTaxiColors.textSecondary;
}

// Dark, high-contrast turn-instruction banner — deliberately styled like a
// dedicated navigation app's maneuver strip (not a card matching the rest
// of the cockpit), since this is the one thing a driver needs to read at
// a glance while actually driving.
class _NextManeuverBanner extends StatelessWidget {
  const _NextManeuverBanner({
    required this.label,
    required this.icon,
    required this.distanceMeters,
    this.streetName,
  });

  final String label;
  final IconData icon;
  final double distanceMeters;
  // Real OSRM step street name when available (routing.service.js's
  // steps=true) — null for the bearing-heuristic fallback, which has no
  // street data to offer, or when OSRM itself has no name for the way.
  final String? streetName;

  @override
  Widget build(BuildContext context) {
    final rounded = math.max(20, (distanceMeters / 20).round() * 20);
    final distanceLabel = rounded >= 1000
        ? '${(rounded / 1000).toStringAsFixed(1)} км'
        : '$rounded м';
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      decoration: BoxDecoration(
        color: const Color(0xff10192e),
        borderRadius: BorderRadius.circular(18),
      ),
      child: Row(
        children: [
          Container(
            width: 42,
            height: 42,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: Colors.white.withValues(alpha: 0.14),
              shape: BoxShape.circle,
            ),
            child: Icon(icon, color: Colors.white, size: 24),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Через $distanceLabel',
                  style: const TextStyle(
                    color: Colors.white70,
                    fontSize: 12,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  label,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 17,
                    fontWeight: FontWeight.w900,
                  ),
                ),
                if (streetName != null && streetName!.isNotEmpty) ...[
                  const SizedBox(height: 1),
                  Text(
                    streetName!,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      color: Colors.white60,
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _NavigatorVoiceBanner extends StatelessWidget {
  const _NavigatorVoiceBanner({required this.text});

  final String text;

  @override
  Widget build(BuildContext context) {
    return TweenAnimationBuilder<double>(
      tween: Tween(begin: 0, end: 1),
      duration: const Duration(milliseconds: 220),
      curve: Curves.easeOutCubic,
      builder: (context, value, child) => Opacity(
        opacity: value,
        child: Transform.translate(
          offset: Offset(0, (1 - value) * -8),
          child: child,
        ),
      ),
      child: Container(
        width: double.infinity,
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        decoration: BoxDecoration(
          color: const Color(0xfffff1e6),
          border: Border.all(color: const Color(0xffffcc99)),
          borderRadius: BorderRadius.circular(18),
        ),
        child: Row(
          children: [
            Container(
              width: 38,
              height: 38,
              alignment: Alignment.center,
              decoration: const BoxDecoration(
                color: Color(0xffff8a00),
                shape: BoxShape.circle,
              ),
              child: const Icon(Icons.speed_rounded,
                  color: Colors.white, size: 20),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Text(
                text,
                style: const TextStyle(
                  color: Color(0xff9a4b00),
                  fontSize: 15,
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

List<RoadAlert> _replaceAlert(List<RoadAlert> alerts, RoadAlert next) {
  final updated = [...alerts];
  final index = updated.indexWhere((alert) => alert.id == next.id);
  if (index >= 0) {
    updated[index] = next;
  } else {
    updated.insert(0, next);
  }
  return updated;
}
