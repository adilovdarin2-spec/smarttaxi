import 'dart:async';

/// Serializes GPS writes while retaining only the newest waiting fix. The
/// acknowledgement, not the raw GPS event, unlocks server-backed routing.
class DriverLocationSync<T, R> {
  DriverLocationSync({
    required this.publish,
    required this.onPublished,
    required this.onError,
    required this.isCurrent,
  });

  final Future<R> Function(T) publish;
  final void Function(T, R) onPublished;
  final void Function(Object) onError;
  final bool Function() isCurrent;
  _LocationBatch<T>? _pending;
  bool _running = false;
  bool _disposed = false;

  Future<bool> add(T position) {
    if (_disposed || !isCurrent()) return Future.value(false);
    final result = Completer<bool>();
    final pending = _pending;
    if (pending == null) {
      _pending = _LocationBatch(position, [result]);
    } else {
      pending.position = position;
      pending.waiters.add(result);
    }
    if (!_running) unawaited(_drain());
    return result.future;
  }

  Future<void> _drain() async {
    _running = true;
    while (!_disposed && isCurrent() && _pending != null) {
      final batch = _pending!;
      _pending = null;
      var accepted = false;
      try {
        final response = await publish(batch.position);
        if (!_disposed && isCurrent()) {
          onPublished(batch.position, response);
          accepted = true;
        }
      } catch (error) {
        if (!_disposed && isCurrent()) onError(error);
      } finally {
        for (final waiter in batch.waiters) {
          waiter.complete(accepted);
        }
      }
    }
    _running = false;
    if (_disposed || !isCurrent()) dispose();
  }

  void dispose() {
    _disposed = true;
    for (final waiter in _pending?.waiters ?? <Completer<bool>>[]) {
      waiter.complete(false);
    }
    _pending = null;
  }
}

class _LocationBatch<T> {
  _LocationBatch(this.position, this.waiters);
  T position;
  final List<Completer<bool>> waiters;
}

/// Preserve the existing 4s deviation floor and 12s normal refresh interval,
/// but schedule the remaining delay instead of discarding the latest fix.
Duration driverRouteRefreshDelay({
  required Duration? elapsed,
  required bool phaseChanged,
  required bool offRoute,
}) {
  if (elapsed == null) return Duration.zero;
  final interval = Duration(seconds: phaseChanged || offRoute ? 4 : 12);
  final remaining = interval - elapsed;
  return remaining.isNegative ? Duration.zero : remaining;
}
