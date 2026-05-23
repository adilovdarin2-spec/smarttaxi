import 'package:socket_io_client/socket_io_client.dart' as io;

import '../auth/auth_store.dart';
import '../config/app_config.dart';

class SocketService {
  SocketService(this._authStore);

  final AuthStore _authStore;
  io.Socket? _socket;

  Future<void> connect() async {
    final token = await _authStore.readToken();
    _socket?.dispose();
    _socket = io.io(
      AppConfig.socketUrl,
      io.OptionBuilder()
          .setTransports(['websocket', 'polling'])
          .disableAutoConnect()
          .setAuth({'token': token})
          .enableReconnection()
          .build(),
    );
    _socket?.connect();
  }

  void joinDrivers() {
    _socket?.emit('join_drivers');
  }

  void joinOrder(String orderId) {
    _socket?.emit('join_order', orderId);
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
  }
}
