import 'package:flutter/material.dart';

import '../theme/app_theme.dart';

class StatusPill extends StatelessWidget {
  const StatusPill(
      {super.key, required this.label, this.tone = StatusTone.neutral});

  final String label;
  final StatusTone tone;

  @override
  Widget build(BuildContext context) {
    final colors = switch (tone) {
      StatusTone.success => (
          SmartTaxiColors.success,
          const Color(0xfff0fdf4),
          const Color(0xffbbf7d0)
        ),
      StatusTone.warning => (
          SmartTaxiColors.warning,
          SmartTaxiColors.goldSoft,
          SmartTaxiColors.borderStrong
        ),
      StatusTone.danger => (
          SmartTaxiColors.danger,
          const Color(0xfffff1f1),
          const Color(0xfffecaca)
        ),
      StatusTone.neutral => (
          SmartTaxiColors.textSecondary,
          Colors.white,
          SmartTaxiColors.border
        ),
    };

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 13, vertical: 8),
      decoration: BoxDecoration(
        color: colors.$2,
        border: Border.all(color: colors.$3),
        borderRadius: BorderRadius.circular(999),
        boxShadow: [
          BoxShadow(
            color: colors.$1.withValues(alpha: 0.08),
            blurRadius: 14,
            offset: const Offset(0, 6),
          )
        ],
      ),
      child: AnimatedDefaultTextStyle(
        duration: const Duration(milliseconds: 180),
        style: TextStyle(
            color: colors.$1, fontSize: 12, fontWeight: FontWeight.w900),
        child: Text(label),
      ),
    );
  }
}

enum StatusTone { neutral, success, warning, danger }
