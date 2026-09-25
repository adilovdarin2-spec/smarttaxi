import 'package:flutter/widgets.dart';

/// Pushed account pages and sheets belong to the session that opened them.
/// Replacing only MaterialApp.home on logout leaves those routes alive, with
/// callbacks into a disposed shell. Theme/locale rebuilds keep the same key.
class SessionNavigation {
  Object? _session;
  GlobalKey<NavigatorState>? _key;

  GlobalKey<NavigatorState> keyFor(Object session) {
    if (_key == null || session != _session) {
      _session = session;
      _key = GlobalKey<NavigatorState>();
    }
    return _key!;
  }
}
