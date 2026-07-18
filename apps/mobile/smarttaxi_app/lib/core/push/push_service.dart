import 'dart:async';

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';

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
  VoidCallback? onMessageReceived;

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
      await messaging.requestPermission(alert: true, badge: true, sound: true);

      final token = await messaging.getToken();
      if (token != null && token.isNotEmpty) {
        unawaited(_registerToken(token));
      }
      messaging.onTokenRefresh.listen(_registerToken);

      FirebaseMessaging.onMessage.listen((message) {
        onMessageReceived?.call();
      });
      FirebaseMessaging.onMessageOpenedApp.listen((message) {
        onMessageReceived?.call();
      });
    } catch (_) {
      // Push setup failing must not crash the app; silently stay disabled.
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
