import 'package:flutter/material.dart';

import '../../l10n/app_localizations.dart';
import '../theme/app_theme.dart';

class RouteFields extends StatelessWidget {
  const RouteFields({
    super.key,
    required this.pickupLabel,
    required this.dropoffLabel,
    required this.onPickupTap,
    required this.onDropoffTap,
    this.pickupActive = false,
    this.dropoffActive = false,
    this.dark = false,
  });

  final String pickupLabel;
  final String dropoffLabel;
  final VoidCallback? onPickupTap;
  final VoidCallback? onDropoffTap;
  final bool pickupActive;
  final bool dropoffActive;
  final bool dark;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final palette = context.palette;
    // Reads the palette rather than hardcoded darks: the two constants
    // this used in dark mode (0xe614181f panel, 0xcc1f232b field) are
    // warm greys left from an older dark theme, while every surface
    // around them is the current blue-black — the route card visibly
    // read warmer than the sheet it sits in.
    final panelColor = dark
        ? palette.cardWarm.withValues(alpha: 0.90)
        : palette.cardWarm.withValues(alpha: 0.72);
    final borderColor = palette.border;
    final lineColor = dark
        ? palette.border
        : SmartTaxiColors.borderStrong;
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: panelColor,
        border: Border.all(color: borderColor),
        borderRadius: BorderRadius.circular(24),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 30,
            height: 130,
            child: Column(
              children: [
                const SizedBox(height: 18),
                // Origin and destination are a matched pair: same accent
                // disc, same white glyph, only the icon differs. They used
                // to be styled unlike each other (near-black disc + white
                // glyph for the origin, accent disc + near-black glyph for
                // the destination), which read as two unrelated controls
                // and put a ~4:1 dark glyph on the accent.
                _RouteMarker(
                    icon: Icons.radio_button_checked_rounded,
                    background: palette.gold,
                    foreground: Colors.white),
                Expanded(
                  child: Container(
                      width: 2,
                      margin: const EdgeInsets.symmetric(vertical: 7),
                      color: lineColor),
                ),
                _RouteMarker(
                    icon: Icons.location_on_rounded,
                    background: palette.gold,
                    foreground: Colors.white),
                const SizedBox(height: 18),
              ],
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              children: [
                _RouteButton(
                    label: l10n.passengerFromLabel,
                    value: pickupLabel,
                    active: pickupActive,
                    onTap: onPickupTap,
                    dark: dark),
                const SizedBox(height: 10),
                _RouteButton(
                    label: l10n.passengerToLabel,
                    value: dropoffLabel,
                    active: dropoffActive,
                    onTap: onDropoffTap,
                    dark: dark),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _RouteMarker extends StatelessWidget {
  const _RouteMarker(
      {required this.icon, required this.background, required this.foreground});

  final IconData icon;
  final Color background;
  final Color foreground;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 24,
      height: 24,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: background,
        shape: BoxShape.circle,
        boxShadow: [
          BoxShadow(
            color: background.withValues(alpha: 0.24),
            blurRadius: 12,
            offset: const Offset(0, 5),
          ),
        ],
      ),
      child: Icon(icon, color: foreground, size: 13),
    );
  }
}

class _RouteButton extends StatelessWidget {
  const _RouteButton(
      {required this.label,
      required this.value,
      required this.active,
      required this.onTap,
      required this.dark});

  final String label;
  final String value;
  final bool active;
  final VoidCallback? onTap;
  final bool dark;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final background = dark
        ? (active ? palette.gold.withValues(alpha: 0.15) : palette.card)
        : (active ? palette.goldPale : palette.card);
    final border = active ? palette.gold : palette.border;
    final labelColor = palette.textSecondary;
    final valueColor = palette.text;
    final content = AnimatedContainer(
      duration: const Duration(milliseconds: 180),
      width: double.infinity,
      constraints: const BoxConstraints(minHeight: 60),
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      decoration: BoxDecoration(
        color: background,
        border: Border.all(color: border, width: active ? 1.8 : 1),
        borderRadius: BorderRadius.circular(18),
        boxShadow: active
            ? [
                BoxShadow(
                    color: palette.gold.withValues(alpha: 0.18),
                    blurRadius: 18,
                    offset: const Offset(0, 8))
              ]
            : null,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label,
              style: TextStyle(
                  color: labelColor,
                  fontSize: 12,
                  fontWeight: FontWeight.w700)),
          const SizedBox(height: 5),
          Text(value,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                  color: valueColor,
                  fontSize: 15,
                  fontWeight: FontWeight.w900)),
        ],
      ),
    );
    if (onTap == null) return content;
    return InkWell(
      borderRadius: BorderRadius.circular(18),
      onTap: onTap,
      child: content,
    );
  }
}
