import 'dart:async';

import 'package:socket_io_client/socket_io_client.dart' as io;

import '../auth/auth_store.dart';
import '../config/app_config.dart';

class SocketService {
  SocketService(this._authStore);

  final AuthStore _authStore;
  io.Socket? _socket;

  // The server only knows which rooms a socket belongs to for the lifetime
  // of that underlying transport connection. socket.io's automatic
  // reconnection (network blip, app foregrounded, server restart) opens a
  // fresh connection under the hood, so without re-emitting join_drivers /
  // join_order on every 'connect' event, order and driver-location updates
  // would silently stop after any reconnect until the screen was rebuilt.
  bool _wantsDrivers = false;
  final Set<String> _wantedOrders = {};

  final _connectionController = StreamController<bool>.broadcast();

  /// Emits the live connected/disconnected state. UI code can use this to
  /// show a "reconnecting" indicator or fall back to REST polling while
  /// real-time updates are unavailable.
  Stream<bool> get connectionChanges => _connectionController.stream;

  bool get isConnected => _socket?.connected ?? false;

  Future<void> connect() async {
    final token = await _authStore.readToken();
    _socket?.dispose();
    final socket = io.io(
      AppConfig.socketUrl,
      io.OptionBuilder()
          .setTransports(['websocket', 'polling'])
          .disableAutoConnect()
          .setAuth({'token': token})
          .enableReconnection()
          .setReconnectionDelay(1000)
          .setReconnectionDelayMax(8000)
          .build(),
    );
    _socket = socket;
    socket.onConnect((_) {
      _connectionController.add(true);
      if (_wantsDrivers) socket.emit('join_drivers');
      for (final orderId in _wantedOrders) {
        socket.emit('join_order', orderId);
      }
    });
    socket.onDisconnect((_) => _connectionController.add(false));
    socket.onConnectError((_) => _connectionController.add(false));
    socket.connect();
  }

  void joinDrivers() {
    _wantsDrivers = true;
    _socket?.emit('join_drivers');
  }

  void joinOrder(String orderId) {
    _wantedOrders.add(orderId);
    _socket?.emit('join_order', orderId);
  }

  /// Stops tracking a finished/abandoned order so a later reconnect doesn't
  /// keep re-joining a room that's no longer relevant to this screen.
  void leaveOrder(String orderId) {
    _wantedOrders.remove(orderId);
  }

  void onOrderUpdate(void Function(dynamic data) handler) {
    _socket?.on('order_update', handler);
    _socket?.on('order_updated', handler);
    _socket?.on('order_status', handler);
    _socket?.on('order_status_public', handler);
    _socket?.on('order_created', handler);
    _socket?.on('order_accepted', handler);
    _socket?.on('order_assigned', handler);
  }

  void onDriverLocation(void Function(dynamic data) handler) {
    _socket?.on('driver_location_updated', handler);
    _socket?.on('driver_location_update', handler);
  }

  void clearListeners() {
    _socket?.off('order_update');
    _socket?.off('order_updated');
    _socket?.off('order_status');
    _socket?.off('order_status_public');
    _socket?.off('order_created');
    _socket?.off('order_accepted');
    _socket?.off('order_assigned');
    _socket?.off('driver_location_updated');
    _socket?.off('driver_location_update');
  }

  void dispose() {
    clearListeners();
    _socket?.dispose();
    _socket = null;
    _wantsDrivers = false;
    _wantedOrders.clear();
  }
}
