import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../l10n/app_localizations.dart';
import 'app_toast.dart';

/// Shared "press back again to exit" helper for screens that sit at the
/// root of the in-app back stack (nowhere left to go back to). Keeps a
/// single hardware/gesture back press from closing the app by accident.
class ExitOnDoubleBack {
  DateTime? _lastPressAt;

  void handle(BuildContext context,
      {Duration window = const Duration(seconds: 2)}) {
    final now = DateTime.now();
    final last = _lastPressAt;
    if (last != null && now.difference(last) <= window) {
      SystemNavigator.pop();
      return;
    }
    _lastPressAt = now;
    // AppToast (root Overlay, not Scaffold-anchored) instead of a plain
    // SnackBar — the home screens on both the passenger and driver side
    // keep an opaque panel pinned to the bottom of the Scaffold at all
    // times, which sits above (and fully hides) a default bottom-docked
    // SnackBar. The rider/driver would see nothing happen on the first
    // back press and exit on the second, with no warning ever visible.
    AppToast.showInfo(
        context, AppLocalizations.of(context).pressBackAgainToExit);
  }
}
