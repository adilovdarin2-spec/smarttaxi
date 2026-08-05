import 'package:flutter/material.dart';

import '../theme/app_theme.dart';

class StatusPill extends StatelessWidget {
  const StatusPill(
      {super.key, required this.label, this.tone = StatusTone.neutral});

  final String label;
  final StatusTone tone;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final colors = switch (tone) {
      StatusTone.success => (palette.success, palette.successSoft, palette.success.withValues(alpha: 0.35)),
      StatusTone.warning => (palette.warning, palette.warningSoft, palette.warning.withValues(alpha: 0.35)),
      StatusTone.danger => (palette.danger, palette.dangerSoft, palette.danger.withValues(alpha: 0.35)),
      // Brand blue, for a state that is neither good, bad nor a warning —
      // "Занят" is simply what a working driver is. It used to borrow the
      // warning tone, which went unnoticed while `warning` was itself a
      // near-blue and turned loudly amber the day that token became a real
      // amber.
      StatusTone.info => (palette.goldDeep, palette.goldSurface, palette.gold.withValues(alpha: 0.35)),
      StatusTone.neutral => (palette.textSecondary, palette.card, palette.border),
    };

    return ConstrainedBox(
      constraints: const BoxConstraints(maxWidth: 164),
      child: Container(
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
          child: Text(
            label,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            textAlign: TextAlign.center,
          ),
        ),
      ),
    );
  }
}

enum StatusTone { neutral, success, warning, danger, info }
