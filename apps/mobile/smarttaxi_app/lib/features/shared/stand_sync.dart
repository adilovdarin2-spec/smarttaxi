/// Do not replay seat writes. Reconcile even a lost acknowledgement before
/// accepting another action; an older poll cannot overwrite that snapshot.
class StandSync {
  int _sequence = 0;
  int? _write;
  bool _disposed = false;
  bool blocked = true;

  int? beginRead({bool reconcile = false}) {
    if (_disposed || (_write != null && !reconcile)) return null;
    return ++_sequence;
  }

  bool currentRead(int ticket) => !_disposed && ticket == _sequence;

  bool settleRead(int ticket, bool success) {
    if (!currentRead(ticket)) return false;
    blocked = !success;
    return true;
  }

  int? beginWrite() {
    if (_disposed || blocked || _write != null) return null;
    blocked = true;
    return _write = ++_sequence;
  }

  bool currentWrite(int ticket) => !_disposed && _write == ticket;

  bool finishWrite(int ticket) {
    if (!currentWrite(ticket)) return false;
    _write = null;
    return true;
  }

  void dispose() {
    _disposed = true;
    _sequence++;
    _write = null;
  }
}
