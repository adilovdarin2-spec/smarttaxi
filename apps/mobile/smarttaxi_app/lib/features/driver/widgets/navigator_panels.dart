import 'dart:math' as math;
import 'package:flutter/material.dart';
import '../../../core/theme/app_theme.dart';
import '../../../l10n/app_localizations.dart';

/// One measured column: a long street or larger text can never collide with
/// the warning below it. A GPS/route failure takes priority over a turn cue.
class NavigatorStatusStack extends StatelessWidget {
  const NavigatorStatusStack(
      {super.key, this.status, this.maneuver, this.warning});
  final Widget? status, maneuver, warning;
  @override
  Widget build(BuildContext context) {
    final primary = status ?? maneuver;
    return Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (primary != null) primary,
          if (primary != null && warning != null) const SizedBox(height: 8),
          if (warning != null) warning!,
        ]);
  }
}

class NavigatorManeuverBanner extends StatelessWidget {
  const NavigatorManeuverBanner(
      {super.key,
      required this.label,
      required this.icon,
      required this.distanceMeters,
      this.streetName});
  final String label;
  final IconData icon;
  final double distanceMeters;
  final String? streetName;
  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final meters = math.max(0, (distanceMeters / 10).round() * 10);
    final distance = distanceMeters <= 20
        ? l10n.driverNavNow
        : l10n.driverInDistanceLabel(meters >= 1000
            ? l10n.driverNavKilometers((meters / 1000).toStringAsFixed(1))
            : l10n.driverNavMeters(meters));
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
          color: const Color(0xff102341),
          borderRadius: BorderRadius.circular(22),
          boxShadow: const [
            BoxShadow(
                color: Color(0x240b4fd1), blurRadius: 20, offset: Offset(0, 6))
          ]),
      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Container(
            width: 52,
            height: 52,
            decoration: BoxDecoration(
                color: SmartTaxiColors.brand,
                borderRadius: BorderRadius.circular(16)),
            child: Icon(icon, color: Colors.white, size: 32)),
        const SizedBox(width: 14),
        Expanded(
            child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
              FittedBox(
                fit: BoxFit.scaleDown,
                alignment: Alignment.centerLeft,
                child: Text(distance,
                    maxLines: 1,
                    style: const TextStyle(
                        color: Colors.white,
                        fontSize: 23,
                        height: 1.12,
                        fontWeight: FontWeight.w700)),
              ),
              const SizedBox(height: 5),
              Text(label,
                  style: const TextStyle(
                      color: Color(0xffeaf3ff),
                      fontSize: 15,
                      height: 1.25,
                      fontWeight: FontWeight.w500)),
              if (streetName?.trim().isNotEmpty == true) ...[
                const SizedBox(height: 5),
                Text(streetName!,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                        color: Color(0xffb9ceeb), fontSize: 13, height: 1.3)),
              ],
            ])),
      ]),
    );
  }
}

class NavigatorRoadWarning extends StatelessWidget {
  const NavigatorRoadWarning({super.key, required this.text});

  final String text;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    return TweenAnimationBuilder<double>(
      tween: Tween(begin: 0, end: 1),
      duration: const Duration(milliseconds: 220),
      curve: Curves.easeOutCubic,
      builder: (context, value, child) => Opacity(
        opacity: value,
        child: Transform.translate(
          offset: Offset(0, (1 - value) * -8),
          child: child,
        ),
      ),
      child: Container(
        width: double.infinity,
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        decoration: BoxDecoration(
          color: palette.brandPale,
          border: Border.all(color: palette.brand.withValues(alpha: 0.4)),
          borderRadius: BorderRadius.circular(18),
        ),
        child: Row(
          children: [
            Container(
              width: 38,
              height: 38,
              alignment: Alignment.center,
              decoration: BoxDecoration(
                color: palette.warning,
                shape: BoxShape.circle,
              ),
              child: const Icon(Icons.speed_rounded,
                  color: Colors.white, size: 20),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Text(
                text,
                style: TextStyle(
                  color: palette.brandDeep,
                  fontSize: 15,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// The primary trip action stays outside the scrolling information panel.
class NavigatorTripControls extends StatelessWidget {
  const NavigatorTripControls(
      {super.key, required this.panel, required this.maxHeight, this.action});
  final Widget panel;
  final Widget? action;
  final double maxHeight;

  @override
  Widget build(BuildContext context) => ConstrainedBox(
        constraints: BoxConstraints(maxHeight: maxHeight),
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          Flexible(child: SingleChildScrollView(child: panel)),
          if (action != null) ...[const SizedBox(height: 8), action!],
        ]),
      );
}

class NavigatorTripPanel extends StatelessWidget {
  const NavigatorTripPanel(
      {super.key,
      this.targetLabel,
      this.targetIcon,
      this.speedKmh,
      this.speedLimit,
      this.distanceMeters,
      this.durationSeconds,
      required this.idleLabel,
      this.now});
  final String? targetLabel;
  final IconData? targetIcon;
  final int? speedKmh, speedLimit;
  final double? distanceMeters, durationSeconds;
  final String idleLabel;
  final DateTime? now;
  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    final l10n = AppLocalizations.of(context);
    final speeding =
        speedKmh != null && speedLimit != null && speedKmh! > speedLimit!;
    final meters = distanceMeters;
    final distance = meters == null
        ? '—'
        : meters >= 1000
            ? l10n.driverNavKilometers((meters / 1000).toStringAsFixed(1))
            : l10n.driverNavMeters(meters.round());
    final seconds = durationSeconds;
    final arrival = seconds == null
        ? null
        : (now ?? DateTime.now()).add(Duration(seconds: seconds.round()));
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
          color: p.card,
          borderRadius: BorderRadius.circular(24),
          border: Border.all(color: p.border),
          boxShadow: const [
            BoxShadow(
                color: Color(0x1f0b4fd1), blurRadius: 24, offset: Offset(0, 6))
          ]),
      child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            if (targetLabel != null) ...[
              Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Icon(targetIcon ?? Icons.place_rounded,
                    size: 20, color: p.brandDeep),
                const SizedBox(width: 8),
                Expanded(
                    child: Text(targetLabel!,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                            color: p.text,
                            fontSize: 14,
                            height: 1.3,
                            fontWeight: FontWeight.w600))),
              ]),
              Padding(
                  padding: const EdgeInsets.symmetric(vertical: 12),
                  child: Divider(height: 1, color: p.border)),
            ],
            Row(crossAxisAlignment: CrossAxisAlignment.center, children: [
              Semantics(
                  label: l10n.driverSpeedLabel,
                  child: Container(
                      width: 68,
                      height: 68,
                      padding: const EdgeInsets.all(7),
                      decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          color: speeding ? p.dangerSoft : p.brandSurface,
                          border: Border.all(
                              color: speeding
                                  ? p.danger
                                  : p.brand.withValues(alpha: 0.35),
                              width: 2)),
                      child: Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Expanded(
                                child: FittedBox(
                                    fit: BoxFit.scaleDown,
                                    child: Text(
                                        speedKmh == null ? '—' : '$speedKmh',
                                        style: TextStyle(
                                            color: speeding ? p.danger : p.text,
                                            fontSize: 28,
                                            height: 1,
                                            fontWeight: FontWeight.w700)))),
                            FittedBox(
                                fit: BoxFit.scaleDown,
                                child: Text(l10n.driverNavSpeedUnit,
                                    style: TextStyle(
                                        color: p.textSecondary,
                                        fontSize: 10,
                                        height: 1.2))),
                          ]))),
              const SizedBox(width: 12),
              Expanded(
                  child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      mainAxisSize: MainAxisSize.min,
                      children: [
                    FittedBox(
                        fit: BoxFit.scaleDown,
                        alignment: Alignment.centerLeft,
                        child: Text(distance,
                            style: TextStyle(
                                color: p.text,
                                fontSize: 28,
                                height: 1.1,
                                fontWeight: FontWeight.w700))),
                    const SizedBox(height: 5),
                    Text(
                        seconds == null
                            ? idleLabel
                            : l10n.driverNavMinutes((seconds / 60).ceil()),
                        style: TextStyle(
                            color: p.textSecondary,
                            fontSize: 13,
                            height: 1.25)),
                    if (arrival != null)
                      Text(
                          l10n.driverNavArrival(
                              '${arrival.hour.toString().padLeft(2, '0')}:${arrival.minute.toString().padLeft(2, '0')}'),
                          style: TextStyle(
                              color: p.textSecondary,
                              fontSize: 12,
                              height: 1.3)),
                  ])),
              if (speedLimit != null) ...[
                const SizedBox(width: 8),
                Container(
                    width: 48,
                    height: 48,
                    padding: const EdgeInsets.all(6),
                    decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        color: Colors.white,
                        border: Border.all(
                            color: const Color(0xffe0343a), width: 4)),
                    child: FittedBox(
                        fit: BoxFit.scaleDown,
                        child: Text('$speedLimit',
                            style: const TextStyle(
                                color: Colors.black,
                                fontSize: 20,
                                fontWeight: FontWeight.w700)))),
              ],
            ]),
          ]),
    );
  }
}
