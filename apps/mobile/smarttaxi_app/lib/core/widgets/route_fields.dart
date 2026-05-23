import 'package:flutter/material.dart';

import '../theme/app_theme.dart';

class RouteFields extends StatelessWidget {
  const RouteFields({
    super.key,
    required this.pickupLabel,
    required this.dropoffLabel,
    required this.onPickupTap,
    required this.onDropoffTap,
  });

  final String pickupLabel;
  final String dropoffLabel;
  final VoidCallback onPickupTap;
  final VoidCallback onDropoffTap;

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        SizedBox(
          width: 28,
          child: Column(
            children: [
              const SizedBox(height: 21),
              const _RouteDot(color: SmartTaxiColors.text),
              Expanded(
                child: Container(width: 2, margin: const EdgeInsets.symmetric(vertical: 4), color: SmartTaxiColors.border),
              ),
              const _RouteDot(color: SmartTaxiColors.gold),
              const SizedBox(height: 21),
            ],
          ),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            children: [
              _RouteButton(label: 'Откуда', value: pickupLabel, onTap: onPickupTap),
              const SizedBox(height: 12),
              _RouteButton(label: 'Куда', value: dropoffLabel, onTap: onDropoffTap),
            ],
          ),
        ),
      ],
    );
  }
}

class _RouteDot extends StatelessWidget {
  const _RouteDot({required this.color});

  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(width: 10, height: 10, decoration: BoxDecoration(color: color, shape: BoxShape.circle));
  }
}

class _RouteButton extends StatelessWidget {
  const _RouteButton({required this.label, required this.value, required this.onTap});

  final String label;
  final String value;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      borderRadius: BorderRadius.circular(18),
      onTap: onTap,
      child: Container(
        width: double.infinity,
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        decoration: BoxDecoration(
          color: Colors.white,
          border: Border.all(color: SmartTaxiColors.border),
          borderRadius: BorderRadius.circular(18),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(label, style: const TextStyle(color: SmartTaxiColors.textSecondary, fontSize: 12, fontWeight: FontWeight.w700)),
            const SizedBox(height: 4),
            Text(value, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w800)),
          ],
        ),
      ),
    );
  }
}
