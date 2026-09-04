import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:geolocator/geolocator.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../core/api/api_client.dart';
import '../../../core/theme/app_theme.dart';
import '../../../l10n/app_localizations.dart';

/// Rounded, floating chrome wrapper used around the bottom tab bar.
class FloatingNav extends StatelessWidget {
  const FloatingNav({super.key, required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    final bottom = MediaQuery.paddingOf(context).bottom;
    return Padding(
      padding: EdgeInsets.fromLTRB(14, 6, 14, 10 + bottom * 0.35),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(26),
        child: DecoratedBox(
          decoration: BoxDecoration(
            color: context.palette.card.withValues(alpha: 0.96),
            border: Border.all(color: context.palette.border),
            borderRadius: BorderRadius.circular(26),
            boxShadow: const [
              BoxShadow(
                  color: Color(0x16102a52),
                  blurRadius: 28,
                  offset: Offset(0, 12))
            ],
          ),
          child: child,
        ),
      ),
    );
  }
}

/// Tiny press feedback (haptic + scale-down) for primary tappable surfaces —
/// mirrors the passenger side's `_PressScale` so the driver's main CTAs feel
/// like the same app, not a plainer sibling.
class DriverPressScale extends StatefulWidget {
  const DriverPressScale({super.key, required this.child, this.enabled = true});

  final Widget child;
  final bool enabled;

  @override
  State<DriverPressScale> createState() => _DriverPressScaleState();
}

class _DriverPressScaleState extends State<DriverPressScale> {
  bool _pressed = false;

  void _setPressed(bool value) {
    if (!widget.enabled || _pressed == value) return;
    if (value) unawaited(HapticFeedback.lightImpact());
    setState(() => _pressed = value);
  }

  @override
  Widget build(BuildContext context) {
    return Listener(
      onPointerDown: (_) => _setPressed(true),
      onPointerUp: (_) => _setPressed(false),
      onPointerCancel: (_) => _setPressed(false),
      child: AnimatedScale(
        scale: _pressed ? 0.97 : 1,
        duration: const Duration(milliseconds: 110),
        curve: Curves.easeOut,
        child: widget.child,
      ),
    );
  }
}

/// Full-width primary CTA with a blue gradient, press-scale and a matching
/// glow shadow — the driver-side equivalent of the passenger's
/// `_BrandCtaButton`. Used for the one action per screen that should read as
/// unmistakably "the main button" (going online, confirming a step), not for
/// every button on the page.
class DriverGradientButton extends StatelessWidget {
  const DriverGradientButton({
    super.key,
    required this.text,
    required this.onTap,
    this.loading = false,
    this.loadingText,
    this.enabled = true,
    this.icon,
    this.height = 56,
    this.highlighted = false,
  });

  final String text;
  final VoidCallback? onTap;
  final bool loading;
  final String? loadingText;
  final bool enabled;
  final IconData? icon;
  final double height;
  // Set when the driver has just come within range of the pickup/dropoff
  // point this button's action applies to (see _checkArrivalProximity in
  // driver_shell.dart) — a stronger glow nudges them to notice the status
  // update is due, without silently auto-firing it (marking arrival starts
  // the waiting-fee timer and notifies the rider, so it should stay an
  // explicit tap).
  final bool highlighted;

  @override
  Widget build(BuildContext context) {
    final resolvedLoadingText =
        loadingText ?? AppLocalizations.of(context).driverUpdatingGeneric;
    final active = enabled && onTap != null && !loading;
    return DriverPressScale(
      enabled: active,
      child: Opacity(
        opacity: enabled ? 1 : 0.5,
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 260),
          curve: Curves.easeOutCubic,
          decoration: BoxDecoration(
            // brand itself is identical in both palettes, but brandDeep isn't
            // (light 0xff0b4fd1 vs dark 0xff5b9bff) — this was const, so it
            // could never pick up the dark-theme value at all.
            gradient: LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: [
                context.palette.brandSky,
                context.palette.brand,
                context.palette.brandDeep,
              ],
            ),
            borderRadius: BorderRadius.circular(18),
            boxShadow: active
                ? [
                    BoxShadow(
                      color: context.palette.brand
                          .withValues(alpha: highlighted ? 0.55 : 0.32),
                      blurRadius: highlighted ? 28 : 20,
                      spreadRadius: highlighted ? 2 : 0,
                      offset: const Offset(0, 10),
                    ),
                  ]
                : null,
          ),
          child: Material(
            color: Colors.transparent,
            borderRadius: BorderRadius.circular(18),
            child: InkWell(
              borderRadius: BorderRadius.circular(18),
              onTap: active ? onTap : null,
              child: SizedBox(
                height: height,
                width: double.infinity,
                child: Center(
                  child: loading
                      ? Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            const SizedBox(
                              width: 18,
                              height: 18,
                              child: CircularProgressIndicator(
                                strokeWidth: 2.2,
                                color: Colors.white,
                              ),
                            ),
                            const SizedBox(width: 10),
                            Text(resolvedLoadingText,
                                style: const TextStyle(
                                    color: Colors.white,
                                    fontWeight: FontWeight.w900)),
                          ],
                        )
                      : Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            if (icon != null) ...[
                              Icon(icon, color: Colors.white, size: 20),
                              const SizedBox(width: 8),
                            ],
                            Text(
                              text,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(
                                color: Colors.white,
                                fontSize: 16,
                                fontWeight: FontWeight.w900,
                              ),
                            ),
                          ],
                        ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

EdgeInsets driverPagePadding(BuildContext context) {
  final width = MediaQuery.sizeOf(context).width;
  return EdgeInsets.all(width < 390 ? 16 : 20);
}

class SectionLabel extends StatelessWidget {
  const SectionLabel({super.key, required this.title, required this.text});

  final String title;
  final String text;

  @override
  Widget build(BuildContext context) {
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Text(title,
          style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w900)),
      const SizedBox(height: 3),
      Text(text,
          style: TextStyle(
              color: context.palette.textSecondary,
              fontSize: 12,
              fontWeight: FontWeight.w700)),
    ]);
  }
}

class LineGlyph extends StatelessWidget {
  const LineGlyph({super.key, required this.online, required this.busy});

  final bool online;
  final bool busy;

  @override
  Widget build(BuildContext context) {
    // Brand blue for "занят", not the warning amber it used to borrow — a
    // driver on a job is working normally, not in a warning state. The
    // borrowing went unnoticed while `warning` was itself a near-blue.
    final color = busy
        ? context.palette.brand
        : online
            ? context.palette.success
            : context.palette.textMuted;
    return AnimatedContainer(
      duration: const Duration(milliseconds: 220),
      width: 58,
      height: 58,
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.1),
        border: Border.all(color: color.withValues(alpha: 0.28)),
        borderRadius: BorderRadius.circular(22),
      ),
      child: Icon(
          busy
              ? Icons.local_taxi_rounded
              : online
                  ? Icons.radio_button_checked_rounded
                  : Icons.power_settings_new_rounded,
          color: color),
    );
  }
}

class LoadingStrip extends StatelessWidget {
  const LoadingStrip({super.key, required this.text});

  final String text;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: context.palette.brandSurface,
        border: Border.all(color: context.palette.border),
        borderRadius: BorderRadius.circular(18),
      ),
      child: Row(
        children: [
          SizedBox(
            width: 18,
            height: 18,
            child: CircularProgressIndicator(
                strokeWidth: 2.2, color: context.palette.brandDeep),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Text(text,
                style: TextStyle(
                    color: context.palette.textSecondary,
                    fontWeight: FontWeight.w700)),
          ),
        ],
      ),
    );
  }
}

class ButtonSpinner extends StatelessWidget {
  const ButtonSpinner({super.key, required this.text});

  final String text;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        SizedBox(
          width: 18,
          height: 18,
          child: CircularProgressIndicator(
              strokeWidth: 2.2, color: context.palette.text),
        ),
        const SizedBox(width: 10),
        Text(text, maxLines: 1, overflow: TextOverflow.ellipsis),
      ],
    );
  }
}

class SheetHandle extends StatelessWidget {
  const SheetHandle({super.key});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 46,
      height: 5,
      decoration: BoxDecoration(
        color: context.palette.borderStrong,
        borderRadius: BorderRadius.circular(99),
      ),
    );
  }
}

class DrawerItem extends StatelessWidget {
  const DrawerItem(
      {super.key,
      required this.label,
      required this.icon,
      required this.active,
      required this.onTap,
      this.danger = false});

  final String label;
  final IconData icon;
  final bool active;
  final bool danger;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    // Coloring the Icon/Text widgets directly rather than relying on
    // ListTile's selected/selectedColor plumbing, which doesn't reliably
    // reach the title/leading widgets in practice.
    final tint = danger ? palette.danger : (active ? palette.brandDeep : palette.text);
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 3),
      child: ListTile(
        minTileHeight: 52,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        selected: active,
        selectedTileColor: palette.brandSurface,
        leading: Icon(icon, size: 22, color: tint),
        title: Text(label,
            style: TextStyle(fontWeight: FontWeight.w800, color: tint)),
        onTap: onTap,
      ),
    );
  }
}

/// Small uppercase label separating groups of [DrawerItem]s so a 16-item
/// menu reads as five short lists instead of one long undifferentiated one.
class DrawerSectionLabel extends StatelessWidget {
  const DrawerSectionLabel(this.label, {super.key});

  final String label;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(24, 18, 24, 6),
      child: Text(
        label.toUpperCase(),
        // textSecondary, not textMuted — textMuted's contrast against a
        // plain background fails WCAG AA at this size (same reasoning as
        // elsewhere in this codebase).
        style: TextStyle(
          color: context.palette.textSecondary,
          fontSize: 11,
          fontWeight: FontWeight.w800,
          letterSpacing: 0.6,
        ),
      ),
    );
  }
}

class PremiumCard extends StatelessWidget {
  const PremiumCard({super.key, required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: context.palette.card,
        border: Border.all(color: context.palette.border),
        borderRadius: BorderRadius.circular(30),
        boxShadow: SmartTaxiShadows.raised,
      ),
      child: child,
    );
  }
}

class TitleBlock extends StatelessWidget {
  const TitleBlock({super.key, required this.title, required this.text});

  final String title;
  final String text;

  @override
  Widget build(BuildContext context) {
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Text(title,
          style: TextStyle(
              color: context.palette.text,
              fontSize: 30,
              height: 1.08,
              letterSpacing: -0.4,
              fontWeight: FontWeight.w900)),
      const SizedBox(height: 7),
      Text(text,
          style: TextStyle(
              color: context.palette.textSecondary,
              fontSize: 14,
              height: 1.35,
              fontWeight: FontWeight.w600)),
    ]);
  }
}

/// Floating SOS control shown on the Line tab and during an active trip.
/// Mirrors the passenger side's `_SafetyButton`/`_SafetySheet` pattern —
/// same sosPhone source (`/regions/service-settings`) and same
/// call-first-then-best-effort-alert behavior.
class DriverSosButton extends StatelessWidget {
  const DriverSosButton(
      {super.key, this.sosPhone, required this.api, this.orderId});

  final String? sosPhone;
  final ApiClient api;
  final String? orderId;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      label: AppLocalizations.of(context).driverEmergencyHelpTitle,
      child: Material(
        color: context.palette.dangerSoft,
        shape: const CircleBorder(),
        child: InkWell(
          customBorder: const CircleBorder(),
          onTap: () => showModalBottomSheet<void>(
            context: context,
            isScrollControlled: true,
            backgroundColor: Colors.transparent,
            builder: (_) => _DriverSosSheet(
                sosPhone: sosPhone, api: api, orderId: orderId),
          ),
          child: SizedBox(
            width: 46,
            height: 46,
            child: Icon(Icons.sos_rounded, color: context.palette.danger),
          ),
        ),
      ),
    );
  }
}

class _DriverSosSheet extends StatelessWidget {
  const _DriverSosSheet({this.sosPhone, required this.api, this.orderId});

  final String? sosPhone;
  final ApiClient api;
  final String? orderId;

  Future<void> _callEmergency() async {
    await launchUrl(Uri(scheme: 'tel', path: sosPhone ?? '112'));
  }

  // Fires alongside the emergency call, never instead of it — the call is
  // the safety-critical action. Location is best-effort (short GPS timeout)
  // and folded into the message body since the support endpoint has no
  // dedicated location field.
  Future<void> _sendSosAlert() async {
    var locationText = 'координаты недоступны';
    try {
      final position = await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(
          accuracy: LocationAccuracy.high,
          timeLimit: Duration(seconds: 6),
        ),
      );
      locationText =
          '${position.latitude.toStringAsFixed(5)}, ${position.longitude.toStringAsFixed(5)}';
    } catch (_) {
      // Best-effort — the alert still goes out without coordinates.
    }
    try {
      await api.submitSupportMessage(
        topic: 'SOS',
        message:
            'Экстренный вызов водителя. Координаты: $locationText.',
        orderId: orderId,
      );
    } catch (_) {
      // Best-effort — the phone call already went out, which is what
      // actually keeps the driver safe.
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return SafeArea(
      top: false,
      child: Container(
        margin: const EdgeInsets.all(12),
        padding: const EdgeInsets.fromLTRB(20, 16, 20, 20),
        decoration: BoxDecoration(
          color: context.palette.card,
          borderRadius: BorderRadius.circular(28),
          boxShadow: const [
            BoxShadow(
              color: Color(0x30102a52),
              blurRadius: 30,
              offset: Offset(0, 14),
            ),
          ],
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Center(child: SheetHandle()),
            const SizedBox(height: 14),
            Row(
              children: [
                Container(
                  width: 44,
                  height: 44,
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    color: context.palette.dangerSoft,
                    borderRadius: BorderRadius.circular(15),
                  ),
                  child: Icon(Icons.sos_rounded, color: context.palette.danger),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Text(
                    l10n.driverEmergencyHelpTitle,
                    style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w900),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 14),
            _DriverSosRow(
              title: l10n.driverEmergencyCallButton(sosPhone ?? '112'),
              text: l10n.driverEmergencyLineSubtitle,
              onTap: () {
                Navigator.pop(context);
                unawaited(_callEmergency());
                unawaited(_sendSosAlert());
              },
            ),
            const Divider(height: 18),
            _DriverSosRow(
              title: l10n.driverSupportWillReceiveSignal,
              text: l10n.driverSupportSignalDescription,
            ),
          ],
        ),
      ),
    );
  }
}

class _DriverSosRow extends StatelessWidget {
  const _DriverSosRow({required this.title, required this.text, this.onTap});

  final String title;
  final String text;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(14),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 6),
        child: Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(title,
                      style: TextStyle(
                          fontSize: 15,
                          fontWeight: FontWeight.w800,
                          color: onTap != null
                              ? context.palette.danger
                              : context.palette.text)),
                  const SizedBox(height: 2),
                  Text(text,
                      style: TextStyle(
                          fontSize: 12,
                          color: context.palette.textSecondary,
                          height: 1.3)),
                ],
              ),
            ),
            if (onTap != null)
              Icon(Icons.chevron_right_rounded,
                  color: context.palette.textMuted),
          ],
        ),
      ),
    );
  }
}

class InlineMessage extends StatelessWidget {
  const InlineMessage({super.key, required this.text, this.danger = false});

  final String text;
  final bool danger;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: danger ? context.palette.dangerSoft : context.palette.brandSurface,
        border: Border.all(
            color: danger
                ? context.palette.danger.withValues(alpha: 0.3)
                : context.palette.border),
        borderRadius: BorderRadius.circular(16),
      ),
      child: Text(text,
          style: TextStyle(
              color: danger
                  ? context.palette.danger
                  : context.palette.textSecondary,
              fontWeight: FontWeight.w700)),
    );
  }
}
