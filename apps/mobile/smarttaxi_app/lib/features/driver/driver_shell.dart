import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:flutter/services.dart';
import 'package:geolocator/geolocator.dart';
import 'package:latlong2/latlong.dart';

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
import 'screens/documents/driver_documents_screen.dart';
import 'screens/notifications/driver_notifications_screen.dart';
import 'screens/rating/driver_rating_screen.dart';
import 'screens/wallet/driver_wallet_screen.dart';
import 'widgets/driver_common_widgets.dart';
import 'widgets/driver_line_widgets.dart';
import 'widgets/driver_order_widgets.dart';
import 'widgets/driver_profile_widgets.dart';
import 'widgets/driver_shell_chrome.dart';

const _navigationChannel = MethodChannel('smarttaxi/navigation');
const _appVersion = '1.0.0';

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
  List<OrderSummary> _orders = const [];
  List<RoadAlert> _roadAlerts = const [];
  OrderSummary? _activeOrder;
  StreamSubscription<Position>? _positionSub;
  StreamSubscription<bool>? _socketConnectionSub;
  Timer? _socketFallbackPollTimer;
  RoutePreview? _driverRoute;
  Position? _lastPosition;
  DriverStats? _driverStats;
  List<OrderSummary> _tripHistory = const [];
  bool _tripHistoryLoading = false;
  bool _roadAlertsLoading = false;
  bool _driverStatsLoading = false;
  bool _navigatorMapUnavailable = false;
  int _navigatorTileErrorCount = 0;
  String _accountPhone = '';
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
      _socketConnectionSub =
          widget.sockets.connectionChanges.listen(_handleSocketConnectionChange);
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
    setState(() {
      _orders = mergeOrder(_orders, order);
      if (_activeOrder?.id == order.id || order.isActive) {
        _activeOrder = order;
      }
      if (!order.isActive && !order.isOpen) {
        _driverRoute = null;
      }
    });
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
      final regions = await widget.api.getDriverRegions();
      setState(() {
        _regions = regions;
        _regionId ??= regions.isNotEmpty ? regions.first.id : null;
      });
    } catch (error) {
      setState(() => _error = readableError(error));
    } finally {
      if (mounted) setState(() => _regionsLoading = false);
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
      await _loadRoadAlerts();
    } catch (error) {
      setState(() => _error = readableError(error));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
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
      setState(() => _online = nextOnline);
    } catch (error) {
      setState(() {
        _error = readableError(error);
        if (nextOnline) _locationMessage = null;
      });
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
    if (!enabled) {
      setState(() =>
          _error = AppLocalizations.of(context).driverLocationRequiredError);
      return false;
    }
    var permission = await Geolocator.checkPermission();
    if (permission == LocationPermission.denied) {
      permission = await Geolocator.requestPermission();
    }
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
        setState(() => _lastPosition = position);
      }
      _checkCameraProximity(position);
      _checkSignProximity(position);
      _checkSpeedingVoiceWarning(position);
      unawaited(_maybeFetchOsmNavigation(position));
      unawaited(_maybeRefreshDriverRoute(position));
      try {
        await widget.api.updateDriverLocation(
          location: Coordinate(lat: position.latitude, lng: position.longitude),
          heading: position.heading.isFinite ? position.heading : null,
          speed: position.speed.isFinite ? position.speed : null,
          accuracy: position.accuracy.isFinite ? position.accuracy : null,
        );
      } catch (_) {
        if (mounted) {
          setState(() => _locationMessage =
              AppLocalizations.of(context).driverLocationSendFailed);
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
        setState(() => _lastPosition = current);
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
    } catch (_) {
      if (mounted) {
        setState(() => _error =
            AppLocalizations.of(context).driverLocationSendFailed);
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
      setState(() {
        _orders = orders;
        _activeOrder = restoredActive;
      });
      // Cold start (or app resume) landing on an order that's already in
      // progress — e.g. the app was killed mid-trip — needs its route line
      // fetched explicitly since nothing else has triggered it yet.
      if (needsRoute) unawaited(_loadDriverRoute(restoredActive.id));
    } catch (error) {
      setState(() => _error = readableError(error));
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

  static double _metersBetween(double lat1, double lng1, double lat2, double lng2) {
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

  bool _hasActiveDrivingLeg(String? status) => _routePhaseForStatus(status) != null;

  Future<void> _maybeRefreshDriverRoute(Position position) async {
    final order = _activeOrder;
    if (order == null || !_hasActiveDrivingLeg(order.status)) return;
    if (_routeFetchInFlight) return;

    final phase = _routePhaseForStatus(order.status);
    final now = DateTime.now();
    final elapsed = _lastRouteFetchAt == null ? null : now.difference(_lastRouteFetchAt!);
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
        _showNavigatorBanner('Камера$headingSuffix', const Duration(seconds: 6));
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

  Future<void> _accept(OrderSummary order) async {
    if (!_online) {
      setState(() => _error =
          AppLocalizations.of(context).driverGoOnlineRequiredError);
      return;
    }
    setState(() {
      _acceptingOrderId = order.id;
      _error = null;
    });
    try {
      final accepted = await widget.api.acceptOrder(order.id);
      widget.sockets.joinOrder(accepted.id);
      setState(() {
        _activeOrder = accepted;
        _orders = mergeOrder(_orders, accepted);
        _tab = 2;
        _online = true;
      });
      await _loadDriverRoute(accepted.id);
      await _loadDriverStats();
    } catch (error) {
      setState(() => _error = readableError(error));
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
      setState(() {
        _activeOrder = order;
        _orders = mergeOrder(_orders, order);
        if (!order.isActive && !order.isOpen) {
          _driverRoute = null;
        }
      });
      await _loadDriverStats();
    } catch (error) {
      setState(() => _error = readableError(error));
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
      ),
    );
    if (mounted) unawaited(_loadRoadAlerts());
  }

  void _showDriverFullSheet(Widget content) {
    Navigator.pop(context);
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: context.palette.appBackground,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
      ),
      builder: (context) => FractionallySizedBox(
        heightFactor: 0.9,
        child: SafeArea(
          top: false,
          child: Column(
            children: [
              const Padding(
                padding: EdgeInsets.only(top: 10),
                child: SheetHandle(),
              ),
              Expanded(child: content),
            ],
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
                  Container(
                    width: 52,
                    height: 52,
                    alignment: Alignment.center,
                    decoration: BoxDecoration(
                      color: context.palette.goldSurface,
                      borderRadius: BorderRadius.circular(18),
                      border: Border.all(color: context.palette.border),
                    ),
                    child: Icon(Icons.person_rounded,
                        color: context.palette.goldDeep, size: 26),
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
                          style: const TextStyle(
                              fontSize: 17, fontWeight: FontWeight.w900),
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
      backgroundColor: Colors.white,
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
                    return LegalSectionCard(section: sections[index]);
                  },
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Coordinate? get _navigatorTarget {
    final order = _activeOrder;
    if (order == null) return null;
    if (order.status == 'TRIP_STARTED' || order.status == 'IN_PROGRESS') {
      return order.dropoffCoordinate;
    }
    return order.pickupCoordinate ?? order.dropoffCoordinate;
  }

  String get _navigatorTargetLabel {
    final order = _activeOrder;
    if (order == null) return 'Свободный режим';
    if (order.status == 'TRIP_STARTED' || order.status == 'IN_PROGRESS') {
      return 'Маршрут к точке назначения';
    }
    return 'Маршрут к точке подачи';
  }

  Future<void> _openNavigator(String provider) async {
    final target = _navigatorTarget;
    if (target == null) {
      setState(() => _navigatorMessage =
          'Для открытия навигатора нужен активный заказ с координатами.');
      return;
    }
    final urls = _navigatorUrls(provider, target);
    for (final url in urls) {
      final opened = await _openExternalUrl(url);
      if (opened) {
        return;
      }
    }
    setState(() => _navigatorMessage =
        'Не удалось открыть навигатор. Проверьте установленное приложение или интернет.');
  }

  Future<bool> _openExternalUrl(String url) async {
    try {
      return await _navigationChannel.invokeMethod<bool>(
            'openUrl',
            {'url': url},
          ) ??
          false;
    } catch (_) {
      return false;
    }
  }

  List<String> _navigatorUrls(String provider, Coordinate target) {
    final lat = target.lat.toStringAsFixed(6);
    final lng = target.lng.toStringAsFixed(6);
    switch (provider) {
      case '2gis':
        return [
          'dgis://2gis.ru/routeSearch/rsType/car/to/$lng,$lat',
          'https://2gis.kz/geo/$lng,$lat',
        ];
      case 'yandex':
        return [
          'yandexnavi://build_route_on_map?lat_to=$lat&lon_to=$lng',
          'https://yandex.kz/maps/?rtext=~$lat,$lng&rtt=auto',
        ];
      case 'google':
        return [
          'google.navigation:q=$lat,$lng&mode=d',
          'https://www.google.com/maps/dir/?api=1&destination=$lat,$lng&travelmode=driving',
        ];
      default:
        return [
          'https://www.google.com/maps/dir/?api=1&destination=$lat,$lng&travelmode=driving',
        ];
    }
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
          setState(() => _tab = 0);
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
          activeTab: _tab,
          onTab: (index) {
            Navigator.pop(context);
            setState(() => _tab = index);
          },
          onPassenger: () {
            Navigator.pop(context);
            widget.onOpenPassengerMode();
          },
          onProfile: () => _showDriverFullSheet(_driverProfileContent()),
          onWallet: () =>
              _showDriverFullSheet(DriverWalletScreen(api: widget.api)),
          onDocuments: () =>
              _showDriverFullSheet(DriverDocumentsScreen(api: widget.api)),
          onRating: () =>
              _showDriverFullSheet(DriverRatingScreen(api: widget.api)),
          onNotifications: () => _showDriverFullSheet(
              DriverNotificationsScreen(api: widget.api)),
          onSupport: () => _showDriverFullSheet(_driverSupportContent()),
          onFaq: () => _showDriverFullSheet(_driverFaqContent()),
          onAbout: () => _showDriverFullSheet(_driverAboutContent()),
          onSettings: () => _showDriverFullSheet(_driverSettingsContent()),
          onRoadAlerts: () => unawaited(_openRoadAlerts()),
          onRecurringBookings: () =>
              _showDriverFullSheet(_driverRecurringBookingsContent()),
          onLogout: () {
            Navigator.pop(context);
            widget.onLogout();
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
                    _navigatorTab(),
                  ],
                ),
              ),
              FloatingNav(
                child: NavigationBar(
                  selectedIndex: _tab,
                  onDestinationSelected: (index) =>
                      setState(() => _tab = index),
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
                        label:
                            AppLocalizations.of(context).driverTabNavigator),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _lineTab() {
    final l10n = AppLocalizations.of(context);
    final disabledReason = _disabledReason();
    final busy = _activeOrder?.isActive == true;
    final openOrders =
        _orders.where((order) => order.isOpen).toList(growable: false);
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
            disabledReason: disabledReason,
            regionName: _selectedRegion?.name,
            onToggle: _loading || (!_online && disabledReason != null)
                ? null
                : () => _setOnline(!_online),
          ),
          const SizedBox(height: 12),
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
          const SizedBox(height: 12),
          DriverQuickActions(
            activeOrder: _activeOrder,
            openOrders: openOrders.length,
            roadAlerts: _roadAlerts.length,
            onOrders: () => setState(() => _tab = 1),
            onTrip: () => setState(() => _tab = 2),
            onNavigator: () => setState(() => _tab = 3),
            onRoadAlerts: () => unawaited(_openRoadAlerts()),
          ),
          const SizedBox(height: 12),
          DriverStatsGrid(
            stats: _driverStats,
            loading: _driverStatsLoading,
            openOrders: openOrders.length,
          ),
          const SizedBox(height: 14),
          PremiumCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                SectionLabel(
                  title: l10n.driverLineRegionSectionTitle,
                  text: l10n.driverLineRegionSectionText,
                ),
                const SizedBox(height: 12),
                if (_regionsLoading && _regions.isEmpty)
                  LoadingStrip(text: l10n.driverLineRegionsLoading)
                else if (_regions.isEmpty)
                  EmptyState(
                    title: l10n.driverLineNoRegionsTitle,
                    text: l10n.driverLineNoRegionsText,
                    icon: Icons.verified_user_outlined,
                  )
                else
                  DropdownButtonFormField<String>(
                    initialValue: _regionId,
                    items: _regions
                        .map((region) => DropdownMenuItem(
                              value: region.id,
                              child: Text(region.name),
                            ))
                        .toList(),
                    onChanged: _online ? null : _selectRegion,
                  ),
                if (_selectedRegion != null) ...[
                  const SizedBox(height: 12),
                  RegionSummary(region: _selectedRegion!),
                ],
              ],
            ),
          ),
          const SizedBox(height: 14),
          PremiumCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                SectionLabel(
                  title: l10n.driverLineLocationSectionTitle,
                  text: l10n.driverLineLocationSectionText,
                ),
                const SizedBox(height: 14),
                LocationNotice(
                  online: _online,
                  loading: _locationLoading,
                  message: _locationMessage,
                ),
                if (disabledReason != null) ...[
                  const SizedBox(height: 12),
                  InlineMessage(text: disabledReason),
                ],
                if (_error != null) ...[
                  const SizedBox(height: 12),
                  InlineMessage(text: _error!, danger: true),
                ],
              ],
            ),
          ),
        ],
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
              title: l10n.driverOrdersTitle,
              text: l10n.driverOrdersSubtitle),
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
                      onAccept: () => _accept(order),
                      onReject: () => _reject(order),
                      onOfferPrice: _offeringPriceOrderId == order.id
                          ? null
                          : () => _offerPrice(order)),
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
        TitleBlock(
            title: l10n.driverTripTitle, text: l10n.driverTripSubtitle),
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
          PremiumCard(
            child:
                Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              StatusPill(
                  label: statusLabel(_activeOrder!.status),
                  tone: StatusTone.warning),
              const SizedBox(height: 16),
              DriverStatusStepper(status: _activeOrder!.status),
              const SizedBox(height: 16),
              RouteFields(
                  pickupLabel: _activeOrder!.pickup,
                  dropoffLabel: _activeOrder!.dropoff,
                  onPickupTap: null,
                  onDropoffTap: null),
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
              if ((liveRouteMeta(_driverRoute) ?? routeMeta(_activeOrder!)) !=
                  null) ...[
                const SizedBox(height: 8),
                Text(liveRouteMeta(_driverRoute) ?? routeMeta(_activeOrder!)!,
                    style:
                        TextStyle(color: context.palette.textSecondary)),
              ],
              const SizedBox(height: 16),
              if (action != null)
                ElevatedButton(
                    onPressed: _tripActionLabel != null
                        ? null
                        : () => _tripAction(action.$1, action.$2),
                    child: _tripActionLabel == action.$1
                        ? ButtonSpinner(text: l10n.driverTripSavingButton)
                        : Text(action.$1))
              else if (!_activeOrder!.isActive)
                ElevatedButton(
                    onPressed: _dismissActiveOrder,
                    child: Text(l10n.driverTripDoneButton)),
              if (_canNoShow(_activeOrder!.status)) ...[
                const SizedBox(height: 10),
                OutlinedButton.icon(
                    onPressed: _tripActionLabel != null
                        ? null
                        : () => _tripAction(
                            l10n.driverTripNoShowButton, widget.api.noShow),
                    icon: const Icon(Icons.person_off_rounded),
                    label: Text(l10n.driverTripNoShowButton)),
              ],
              if (_canCancel(_activeOrder!.status)) ...[
                const SizedBox(height: 10),
                OutlinedButton(
                    onPressed: _tripActionLabel != null
                        ? null
                        : () => _tripAction(l10n.driverTripCancelButton,
                            widget.api.cancelDriverOrder),
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

  Widget _navigatorTab() {
    final current = _currentCoordinate;
    final speedKmh = _speedKmh;
    final activeTarget = _navigatorTarget;
    final speedLimit = _activeSpeedLimit;
    return RefreshIndicator(
      onRefresh: () async {
        await _loadOrders();
        await _loadRoadAlerts();
      },
      child: ListView(
        padding: driverPagePadding(context),
        children: [
          _NavigatorTopStrip(
            activeOrder: _activeOrder != null,
            targetLabel: _navigatorTargetLabel,
            online: _online,
          ),
          const SizedBox(height: 10),
          if (_navigatorBannerText != null &&
              _navigatorBannerUntil != null &&
              DateTime.now().isBefore(_navigatorBannerUntil!)) ...[
            _NavigatorVoiceBanner(text: _navigatorBannerText!),
            const SizedBox(height: 10),
          ],
          _SmartNavigatorMap(
            current: current,
            heading: _currentHeading,
            activeOrder: _activeOrder,
            route: _driverRoute?.geometry ?? const [],
            alerts: _allNavigatorAlerts,
            mapUnavailable: _navigatorMapUnavailable,
            onTileError: _handleNavigatorTileError,
            fallbackCenter: _selectedRegion?.center,
          ),
          const SizedBox(height: 14),
          _NavigatorCockpit(
            online: _online,
            targetLabel: _navigatorTargetLabel,
            speedKmh: speedKmh,
            speedLimit: speedLimit,
            nearbyAlerts: _allNavigatorAlerts.length,
            alertsLoading: _roadAlertsLoading,
            activeTarget: activeTarget != null,
            voiceEnabled: _voiceEnabled,
            onToggleVoice: _toggleVoice,
            onRefreshAlerts: _loadRoadAlerts,
            onReportAlert: () => unawaited(_openRoadAlerts()),
            onOpen2Gis: () => _openNavigator('2gis'),
            onOpenYandex: () => _openNavigator('yandex'),
            onOpenGoogle: () => _openNavigator('google'),
          ),
          if (_navigatorMessage != null) ...[
            const SizedBox(height: 12),
            InlineMessage(text: _navigatorMessage!),
          ],
        ],
      ),
    );
  }

  Coordinate? get _currentCoordinate {
    final position = _lastPosition;
    if (position == null) return null;
    return Coordinate(lat: position.latitude, lng: position.longitude);
  }

  double? get _currentHeading {
    final heading = _lastPosition?.heading;
    return heading != null && heading.isFinite ? heading : null;
  }

  int? get _speedKmh {
    final speed = _lastPosition?.speed;
    if (speed == null || !speed.isFinite || speed < 0) return null;
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
    });
  }

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
    return _online ? l10n.driverStatusOnline : l10n.driverStatusOffline;
  }

  StatusTone _driverStatusTone() {
    if (_activeOrder?.isActive == true) return StatusTone.warning;
    return _online ? StatusTone.success : StatusTone.neutral;
  }
}

class _NavigatorTopStrip extends StatelessWidget {
  const _NavigatorTopStrip({
    required this.activeOrder,
    required this.targetLabel,
    required this.online,
  });

  final bool activeOrder;
  final String targetLabel;
  final bool online;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
      decoration: BoxDecoration(
        color: SmartTaxiColors.cardDark,
        borderRadius: BorderRadius.circular(22),
        border: Border.all(color: Colors.white.withValues(alpha: 0.08)),
      ),
      child: Row(
        children: [
          Container(
            width: 36,
            height: 36,
            decoration: BoxDecoration(
              color: activeOrder
                  ? SmartTaxiColors.gold.withValues(alpha: 0.18)
                  : Colors.white.withValues(alpha: 0.08),
              borderRadius: BorderRadius.circular(14),
            ),
            child: Icon(
              activeOrder ? Icons.route_rounded : Icons.near_me_rounded,
              color: activeOrder ? SmartTaxiColors.gold : Colors.white,
              size: 21,
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  activeOrder ? 'Активный маршрут' : 'Свободный режим',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 16,
                    fontWeight: FontWeight.w900,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  online ? targetLabel : 'Выйдите на линию для подсказок',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    color: Colors.white70,
                    fontSize: 12,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ],
            ),
          ),
          StatusPill(
            label: online ? 'На линии' : 'Оффлайн',
            tone: online ? StatusTone.success : StatusTone.neutral,
          ),
        ],
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
    final fallback = widget.current?.toLatLng() ??
        widget.fallbackCenter?.toLatLng();
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
                  initialZoom: widget.current == null &&
                          widget.activeOrder == null
                      ? 13
                      : 14,
                  initialCameraFit: fit,
                  backgroundColor: SmartTaxiColors.goldSurface,
                ),
                children: [
                  TileLayer(
                    urlTemplate: AppConfig.osmTileUrl,
                    subdomains: const ['a', 'b', 'c', 'd'],
                    retinaMode: true,
                    userAgentPackageName: 'com.smarttaxi.app',
                    errorTileCallback: (_, __, ___) => widget.onTileError(),
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
                          point: widget.activeOrder!.dropoffCoordinate!
                              .toLatLng(),
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
              right: 14,
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
        border:
            Border.all(color: SmartTaxiColors.gold.withValues(alpha: 0.13), width: 1),
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

class _NavigatorCockpit extends StatelessWidget {
  const _NavigatorCockpit({
    required this.online,
    required this.targetLabel,
    required this.speedKmh,
    required this.speedLimit,
    required this.nearbyAlerts,
    required this.alertsLoading,
    required this.activeTarget,
    required this.voiceEnabled,
    required this.onToggleVoice,
    required this.onRefreshAlerts,
    required this.onReportAlert,
    required this.onOpen2Gis,
    required this.onOpenYandex,
    required this.onOpenGoogle,
  });

  final bool online;
  final String targetLabel;
  final int? speedKmh;
  final int? speedLimit;
  final int nearbyAlerts;
  final bool alertsLoading;
  final bool activeTarget;
  final bool voiceEnabled;
  final VoidCallback onToggleVoice;
  final VoidCallback onRefreshAlerts;
  final VoidCallback onReportAlert;
  final VoidCallback onOpen2Gis;
  final VoidCallback onOpenYandex;
  final VoidCallback onOpenGoogle;

  @override
  Widget build(BuildContext context) {
    final speeding =
        speedKmh != null && speedLimit != null && speedKmh! > speedLimit!;
    return PremiumCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: _NavigatorMetric(
                  title: 'Скорость',
                  value: speedKmh == null ? '--' : '$speedKmh',
                  suffix: 'км/ч',
                  emphasize: true,
                  valueColor: speeding ? SmartTaxiColors.danger : null,
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: _NavigatorMetric(
                  title: 'Лимит',
                  value: speedLimit == null ? '--' : '$speedLimit',
                  suffix: speedLimit == null ? 'нет данных' : 'км/ч',
                ),
              ),
              const SizedBox(width: 8),
              IconButton(
                onPressed: onToggleVoice,
                tooltip: voiceEnabled
                    ? 'Выключить голосовые подсказки'
                    : 'Включить голосовые подсказки',
                icon: Icon(
                  voiceEnabled
                      ? Icons.volume_up_rounded
                      : Icons.volume_off_rounded,
                  color: voiceEnabled
                      ? SmartTaxiColors.text
                      : SmartTaxiColors.textMuted,
                ),
              ),
            ],
          ),
          if (speeding) ...[
            const SizedBox(height: 12),
            InlineMessage(
              text:
                  'Снизьте скорость: текущая скорость выше сохранённого дорожного ограничения.',
              danger: true,
            ),
          ],
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: onRefreshAlerts,
                  icon: const Icon(Icons.sync_rounded),
                  label: const Text('События'),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: ElevatedButton.icon(
                  onPressed: onReportAlert,
                  icon: const Icon(Icons.add_location_alt_rounded),
                  label: const Text('Сообщить'),
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          InlineMessage(
            text: online
                ? '$targetLabel. Дорожных событий: ${alertsLoading ? 'обновляем...' : nearbyAlerts}.'
                : 'Выйдите на линию, чтобы навигатор показывал рабочий контекст.',
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: _NavigatorButton(
                  label: '2GIS',
                  enabled: activeTarget,
                  onTap: onOpen2Gis,
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: _NavigatorButton(
                  label: 'Yandex',
                  enabled: activeTarget,
                  onTap: onOpenYandex,
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: _NavigatorButton(
                  label: 'Google',
                  enabled: activeTarget,
                  onTap: onOpenGoogle,
                ),
              ),
            ],
          ),
        ],
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

class _NavigatorButton extends StatelessWidget {
  const _NavigatorButton({
    required this.label,
    required this.enabled,
    required this.onTap,
  });

  final String label;
  final bool enabled;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return OutlinedButton(
      onPressed: enabled ? onTap : null,
      style: OutlinedButton.styleFrom(
        minimumSize: const Size.fromHeight(48),
        side: BorderSide(
          color:
              enabled ? SmartTaxiColors.borderStrong : SmartTaxiColors.border,
        ),
      ),
      child: Text(label),
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
                TileLayer(
                    urlTemplate: AppConfig.osmTileUrl,
                    subdomains: const ['a', 'b', 'c', 'd'],
                    retinaMode: true,
                    userAgentPackageName: 'com.smarttaxi.app'),
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
          style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w800),
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
            SizedBox(
              width: double.infinity,
              child: ElevatedButton(
                onPressed: _submit,
                child: const Text('Отправить предложение'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// Standalone, not coupled to DriverShell's own state — it's shown inside
// _showDriverFullSheet's static `Widget content` (built once, not a
// builder), so a screen that needs to load/refresh/mutate its own list
// has to own that state itself rather than relying on the parent's
// setState reaching a route it doesn't rebuild automatically.
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
            ] else if (onPause != null || onResume != null || onCancel != null) ...[
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
  });

  final ApiClient api;
  final String? regionId;

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
        decoration: const BoxDecoration(
          color: SmartTaxiColors.appBackground,
          borderRadius: BorderRadius.vertical(top: Radius.circular(32)),
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
                          label: Text(_saving ? 'Отправляем...' : 'Отправить'),
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
  });

  final List<RoadAlert> alerts;
  final Coordinate? selectedPoint;
  final bool mapUnavailable;
  final VoidCallback onTileError;
  final ValueChanged<LatLng> onTap;

  @override
  Widget build(BuildContext context) {
    final center = selectedPoint?.toLatLng() ??
        (alerts.isNotEmpty
            ? alerts.first.toLatLng()
            : const LatLng(42.3167, 69.5958));
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
                  backgroundColor: SmartTaxiColors.goldSurface,
                ),
                children: [
                  TileLayer(
                    urlTemplate: AppConfig.osmTileUrl,
                    subdomains: const ['a', 'b', 'c', 'd'],
                    retinaMode: true,
                    userAgentPackageName: 'com.smarttaxi.app',
                    errorTileCallback: (_, __, ___) => onTileError(),
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
                  style: TextStyle(fontWeight: FontWeight.w800),
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
                    size: 16, color: color, shadows: const [
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
        color: SmartTaxiColors.goldSurface,
        border: Border.all(color: SmartTaxiColors.border),
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
                    style: const TextStyle(
                      color: SmartTaxiColors.textSecondary,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ],
                const SizedBox(height: 6),
                Text(
                  'Доверие: ${alert.confidenceScore}% · подтверждений: ${alert.confirmationsCount}',
                  style: const TextStyle(
                    color: SmartTaxiColors.textMuted,
                    fontSize: 12,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                if (alert.speedLimit != null) ...[
                  const SizedBox(height: 4),
                  Text(
                    'Ограничение: ${alert.speedLimit} км/ч',
                    style: const TextStyle(
                      color: SmartTaxiColors.textSecondary,
                      fontSize: 12,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                ],
                if (alert.heading != null) ...[
                  const SizedBox(height: 4),
                  Text(
                    'Смотрит: ${compassLabel(alert.heading!)}',
                    style: const TextStyle(
                      color: SmartTaxiColors.textSecondary,
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
