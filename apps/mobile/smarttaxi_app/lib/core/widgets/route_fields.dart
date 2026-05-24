import 'package:flutter/material.dart';

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
  });

  final String pickupLabel;
  final String dropoffLabel;
  final VoidCallback onPickupTap;
  final VoidCallback onDropoffTap;
  final bool pickupActive;
  final bool dropoffActive;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: SmartTaxiColors.cardWarm.withValues(alpha: 0.72),
        border: Border.all(color: SmartTaxiColors.border),
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
                const _RouteMarker(
                    label: 'A',
                    background: SmartTaxiColors.text,
                    foreground: Colors.white),
                Expanded(
                  child: Container(
                      width: 2,
                      margin: const EdgeInsets.symmetric(vertical: 7),
                      color: SmartTaxiColors.borderStrong),
                ),
                const _RouteMarker(
                    label: 'B',
                    background: SmartTaxiColors.gold,
                    foreground: SmartTaxiColors.text),
                const SizedBox(height: 18),
              ],
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              children: [
                _RouteButton(
                    label: 'Откуда',
                    value: pickupLabel,
                    active: pickupActive,
                    onTap: onPickupTap),
                const SizedBox(height: 10),
                _RouteButton(
                    label: 'Куда',
                    value: dropoffLabel,
                    active: dropoffActive,
                    onTap: onDropoffTap),
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
      {required this.label,
      required this.background,
      required this.foreground});

  final String label;
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
      child: Text(label,
          style: TextStyle(
              color: foreground, fontSize: 11, fontWeight: FontWeight.w900)),
    );
  }
}

class _RouteButton extends StatelessWidget {
  const _RouteButton(
      {required this.label,
      required this.value,
      required this.active,
      required this.onTap});

  final String label;
  final String value;
  final bool active;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      borderRadius: BorderRadius.circular(18),
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 180),
        width: double.infinity,
        constraints: const BoxConstraints(minHeight: 60),
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        decoration: BoxDecoration(
          color: active ? SmartTaxiColors.goldPale : Colors.white,
          border: Border.all(
              color: active ? SmartTaxiColors.gold : SmartTaxiColors.border,
              width: active ? 1.8 : 1),
          borderRadius: BorderRadius.circular(18),
          boxShadow: active
              ? const [
                  BoxShadow(
                      color: Color(0x14785a14),
                      blurRadius: 18,
                      offset: Offset(0, 8))
                ]
              : null,
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(label,
                style: const TextStyle(
                    color: SmartTaxiColors.textSecondary,
                    fontSize: 12,
                    fontWeight: FontWeight.w700)),
            const SizedBox(height: 5),
            Text(value,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style:
                    const TextStyle(fontSize: 15, fontWeight: FontWeight.w800)),
          ],
        ),
      ),
    );
  }
}
