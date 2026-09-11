import 'dart:async';

import 'package:socket_io_client/socket_io_client.dart' as io;

import '../auth/auth_store.dart';
import '../config/app_config.dart';

Map<String, dynamic> socketOptionsForSession(String? token) => io
        .OptionBuilder()
    // dispose() does not evict socket_io_client's origin/namespace cache.
    // Each explicit session connection must own a fresh authenticated socket;
    // otherwise passenger -> driver login can keep the passenger token and
    // silently miss dispatch events. Automatic reconnect stays on this socket.
    .enableForceNew()
    .setTransports(['websocket', 'polling'])
    .disableAutoConnect()
    .setAuth({'token': token})
    .enableReconnection()
    .setReconnectionDelay(1000)
    .setReconnectionDelayMax(8000)
    .build();

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
  final Set<String> _wantedStands = {};

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
      socketOptionsForSession(token),
    );
    _socket = socket;
    socket.onConnect((_) {
      _connectionController.add(true);
      if (_wantsDrivers) socket.emit('join_drivers');
      for (final orderId in _wantedOrders) {
        socket.emit('join_order', orderId);
      }
      for (final standId in _wantedStands) {
        socket.emit('join_stand', standId);
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

  /// A stand's line is small and changes for everyone at once — a car leaves
  /// and every position behind it moves — so the server pushes the whole line
  /// rather than a delta, and this room is how it arrives.
  void joinStand(String standId) {
    _wantedStands.add(standId);
    _socket?.emit('join_stand', standId);
  }

  void leaveStand(String standId) {
    _wantedStands.remove(standId);
    _socket?.emit('leave_stand', standId);
  }

  /// The rider's view of a line. Never carries another rider's details.
  void onStandQueueUpdate(void Function(dynamic data) handler) {
    _socket?.on('stand_queue_updated', handler);
  }

  /// The driver's view of the same line, with the seat requests waiting on
  /// them. The server only sends this to sockets it has confirmed are
  /// drivers, so the two must stay separate events rather than one payload.
  void onDriverStandQueueUpdate(void Function(dynamic data) handler) {
    _socket?.on('stand_queue_updated_driver', handler);
  }

  /// Things that happen to this one person rather than to the line: a seat
  /// request arrives, their turn starts, their place is gone.
  void onStandPersonalEvent(void Function(String event, dynamic data) handler) {
    for (final event in _standPersonalEvents) {
      _socket?.on(event, (data) => handler(event, data));
    }
  }

  static const _standPersonalEvents = [
    'stand_reservation_created',
    'stand_reservation_cancelled',
    'stand_reservation_confirmed',
    'stand_reservation_declined',
    'stand_reservation_expired',
    'stand_turn_started',
    'stand_place_lost',
  ];

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

  // A driver's торг offer arrived while a DIFFERENT driver's offer is
  // already the primary one showing — see order-dispatch.service.js's
  // submitDriverPriceOffer. Distinct from onOrderUpdate: nothing on the
  // order itself changed, so this never fires order_updated.
  void onQueuedPriceOffer(void Function(dynamic data) handler) {
    _socket?.on('order.driver_price_offer_queued', handler);
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
    _socket?.off('order.driver_price_offer_queued');
    _socket?.off('stand_queue_updated');
    _socket?.off('stand_queue_updated_driver');
    for (final event in _standPersonalEvents) {
      _socket?.off(event);
    }
  }

  void dispose() {
    clearListeners();
    _socket?.dispose();
    _socket = null;
    _wantsDrivers = false;
    _wantedOrders.clear();
    _wantedStands.clear();
  }
}
