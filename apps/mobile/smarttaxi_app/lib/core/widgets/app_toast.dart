import 'dart:collection';

import 'package:flutter/material.dart';

import '../theme/app_theme.dart';

enum AppToastType { error, success, info }

/// Single top-center toast used app-wide instead of SnackBar/AlertDialog
/// for validation and network feedback. Call `AppToast.show*` from
/// anywhere with a BuildContext — it inserts itself into the nearest
/// Overlay, so it works the same from a dialog, a bottom sheet, or a
/// plain screen. Multiple toasts queue and stack instead of overlapping.
class AppToast {
  AppToast._();

  static final Queue<_ToastRequest> _queue = Queue<_ToastRequest>();
  static final List<_ActiveToast> _active = [];
  static const _maxStacked = 3;

  static void showError(BuildContext context, String message) =>
      _enqueue(context, message, AppToastType.error);

  static void showSuccess(BuildContext context, String message) =>
      _enqueue(context, message, AppToastType.success);

  static void showInfo(BuildContext context, String message) =>
      _enqueue(context, message, AppToastType.info);

  static void _enqueue(
    BuildContext context,
    String message,
    AppToastType type,
  ) {
    final overlay = Overlay.maybeOf(context, rootOverlay: true);
    if (overlay == null) return;
    _queue.add(_ToastRequest(overlay: overlay, message: message, type: type));
    _drain();
  }

  static void _drain() {
    while (_queue.isNotEmpty && _active.length < _maxStacked) {
      final request = _queue.removeFirst();
      _show(request);
    }
  }

  static void _show(_ToastRequest request) {
    late final _ActiveToast active;
    final entry = OverlayEntry(
      builder: (context) {
        final stackIndex = _active.indexOf(active);
        return _ToastCard(
          message: request.message,
          type: request.type,
          stackIndex: stackIndex < 0 ? 0 : stackIndex,
          onDismissed: () => _remove(active),
        );
      },
    );
    active = _ActiveToast(entry: entry);
    _active.add(active);
    request.overlay.insert(entry);
  }

  static void _remove(_ActiveToast active) {
    if (!_active.remove(active)) return;
    active.entry.remove();
    for (final other in _active) {
      other.entry.markNeedsBuild();
    }
    _drain();
  }
}

class _ToastRequest {
  _ToastRequest({
    required this.overlay,
    required this.message,
    required this.type,
  });

  final OverlayState overlay;
  final String message;
  final AppToastType type;
}

class _ActiveToast {
  _ActiveToast({required this.entry});

  final OverlayEntry entry;
}

class _ToastCard extends StatefulWidget {
  const _ToastCard({
    required this.message,
    required this.type,
    required this.stackIndex,
    required this.onDismissed,
  });

  final String message;
  final AppToastType type;
  final int stackIndex;
  final VoidCallback onDismissed;

  @override
  State<_ToastCard> createState() => _ToastCardState();
}

class _ToastCardState extends State<_ToastCard>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 260),
  );
  late final Animation<double> _slide = CurvedAnimation(
    parent: _controller,
    curve: Curves.easeOutCubic,
    reverseCurve: Curves.easeInCubic,
  );

  bool _dismissing = false;

  @override
  void initState() {
    super.initState();
    _controller.forward();
    final autoDismiss = switch (widget.type) {
      AppToastType.error => const Duration(milliseconds: 4200),
      AppToastType.success => const Duration(milliseconds: 2600),
      AppToastType.info => const Duration(milliseconds: 3000),
    };
    Future.delayed(autoDismiss, _dismiss);
  }

  Future<void> _dismiss() async {
    if (!mounted || _dismissing) return;
    _dismissing = true;
    await _controller.reverse();
    widget.onDismissed();
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  (Color, Color, IconData) _tone(BuildContext context) {
    final palette = context.palette;
    switch (widget.type) {
      case AppToastType.error:
        return (palette.danger, palette.dangerSoft, Icons.error_rounded);
      case AppToastType.success:
        return (
          palette.success,
          palette.successSoft,
          Icons.check_circle_rounded
        );
      case AppToastType.info:
        return (palette.brandDeep, palette.brandSurface, Icons.info_rounded);
    }
  }

  @override
  Widget build(BuildContext context) {
    final (accent, soft, icon) = _tone(context);
    final topInset = MediaQuery.paddingOf(context).top;
    return Positioned(
      top: topInset + 10 + widget.stackIndex * 8,
      left: 16,
      right: 16,
      child: AnimatedBuilder(
        animation: _slide,
        builder: (context, child) {
          return Opacity(
            opacity: _slide.value,
            child: Transform.translate(
              offset: Offset(0, (1 - _slide.value) * -40),
              child: child,
            ),
          );
        },
        child: Material(
          color: Colors.transparent,
          child: GestureDetector(
            behavior: HitTestBehavior.opaque,
            onTap: _dismiss,
            onVerticalDragEnd: (details) {
              if ((details.primaryVelocity ?? 0) < -200) _dismiss();
            },
            child: Container(
              padding: const EdgeInsets.symmetric(
                horizontal: 16,
                vertical: 14,
              ),
              decoration: BoxDecoration(
                color: context.palette.card,
                borderRadius: BorderRadius.circular(18),
                border: Border.all(color: soft, width: 1.4),
                boxShadow: const [
                  BoxShadow(
                    color: Color(0x2611192b),
                    blurRadius: 22,
                    offset: Offset(0, 10),
                  ),
                ],
              ),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Container(
                    width: 30,
                    height: 30,
                    alignment: Alignment.center,
                    decoration: BoxDecoration(
                      color: soft,
                      shape: BoxShape.circle,
                    ),
                    child: Icon(icon, size: 17, color: accent),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Padding(
                      padding: const EdgeInsets.only(top: 4),
                      child: Text(
                        widget.message,
                        maxLines: 4,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          color: context.palette.text,
                          fontSize: 13.5,
                          height: 1.32,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
