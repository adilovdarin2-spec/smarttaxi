import 'dart:async';

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';

import '../api/api_client.dart';

/// Registers this device for push notifications and keeps the backend's
/// device_tokens table in sync.
///
/// Every step is wrapped in try/catch so that any push-setup failure (no
/// network, revoked permission, misconfigured Firebase project) disables
/// push silently instead of crashing the app — the rest of the app must
/// keep working even if notifications can't be delivered.
class PushService {
  PushService(this._api);

  final ApiClient _api;
  bool _initialized = false;
  bool _permissionGranted = false;
  final _messageController = StreamController<Map<String, dynamic>>.broadcast();

  /// Emits the `data` payload of every push notification received while the
  /// app is running — both a foreground arrival and a tray-tap that opened
  /// it. Screens listen and filter on `data['type']` (e.g.
  /// 'DRIVER_REGION_STATUS', 'SUPPORT_REPLY') to refresh themselves instead
  /// of waiting for a manual pull-to-refresh.
  Stream<Map<String, dynamic>> get messages => _messageController.stream;

  /// Starts the Firebase message listeners without interrupting first-run
  /// address selection with an operating-system permission dialog. The
  /// dialog is requested later from an intentional notifications action.
  Future<void> initialize() async {
    if (_initialized) return;
    _initialized = true;

    try {
      await Firebase.initializeApp();
    } catch (_) {
      return;
    }

    try {
      final messaging = FirebaseMessaging.instance;
      final settings = await messaging.getNotificationSettings();
      _permissionGranted = _isGranted(settings.authorizationStatus);
      if (_permissionGranted) {
        unawaited(_registerCurrentToken(messaging));
      }
      messaging.onTokenRefresh.listen((token) {
        if (_permissionGranted) unawaited(_registerToken(token));
      });

      FirebaseMessaging.onMessage.listen((message) {
        _messageController.add(message.data);
      });
      FirebaseMessaging.onMessageOpenedApp.listen((message) {
        _messageController.add(message.data);
      });
    } catch (_) {
      // Push setup failing must not crash the app; silently stay disabled.
    }
  }

  /// Requests notification access only after a person explicitly opens the
  /// notifications area. This avoids stacking Android's prompt over the
  /// location explanation shown on the first map screen.
  Future<void> requestPermission() async {
    await initialize();
    try {
      final messaging = FirebaseMessaging.instance;
      var settings = await messaging.getNotificationSettings();
      if (!_isGranted(settings.authorizationStatus)) {
        settings = await messaging.requestPermission(
          alert: true,
          badge: true,
          sound: true,
        );
      }
      _permissionGranted = _isGranted(settings.authorizationStatus);
      if (_permissionGranted) {
        await _registerCurrentToken(messaging);
      }
    } catch (_) {
      // Push remains optional. A denied or unavailable permission must not
      // interrupt the map, navigation or order flows.
    }
  }

  bool _isGranted(AuthorizationStatus status) =>
      status == AuthorizationStatus.authorized ||
      status == AuthorizationStatus.provisional;

  Future<void> _registerCurrentToken(FirebaseMessaging messaging) async {
    final token = await messaging.getToken();
    if (token != null && token.isNotEmpty) {
      await _registerToken(token);
    }
  }

  Future<void> _registerToken(String token) async {
    try {
      await _api.registerPushToken(token);
    } catch (_) {
      // Non-critical: the device just won't receive push until next retry.
    }
  }
}
