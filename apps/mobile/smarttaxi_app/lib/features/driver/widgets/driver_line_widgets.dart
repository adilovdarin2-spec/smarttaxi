import 'package:flutter/material.dart';

import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/status_pill.dart';
import '../../../l10n/app_localizations.dart';
import '../../shared/models.dart';
import 'driver_common_widgets.dart';

class DriverShiftHero extends StatelessWidget {
  const DriverShiftHero({
    super.key,
    required this.status,
    required this.tone,
    required this.online,
    required this.busy,
    required this.loading,
    required this.regionName,
    required this.onToggle,
    required this.onRegionTap,
    this.driverName,
    this.todayEarnings,
    this.sosButton,
  });

  final String status;
  final StatusTone tone;
  final bool online;
  final bool busy;
  final bool loading;
  final String? regionName;
  final VoidCallback? onToggle;
  final VoidCallback onRegionTap;
  // The driver's own name reads friendlier than a static brand label and is
  // usually shorter too — falls back to "Водитель SmartTaxi" if unset.
  final String? driverName;
  // Formatted "N ₸" — null while stats are still loading, so the row
  // collapses instead of showing a placeholder dash.
  final String? todayEarnings;
  final Widget? sosButton;

  Color _toneColor(BuildContext context) {
    final palette = context.palette;
    return switch (tone) {
      StatusTone.success => palette.success,
      StatusTone.warning => palette.warning,
      StatusTone.danger => palette.danger,
      StatusTone.neutral => palette.textSecondary,
    };
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final palette = context.palette;
    final toneColor = _toneColor(context);
    return Container(
      padding: const EdgeInsets.fromLTRB(18, 18, 18, 16),
      decoration: BoxDecoration(
        color: palette.card,
        borderRadius: BorderRadius.circular(28),
        border: Border.all(
          color: online
              ? palette.success.withValues(alpha: 0.35)
              : palette.border,
          width: online ? 1.4 : 1,
        ),
        boxShadow: [
          BoxShadow(
            color: (online ? palette.success : palette.gold)
                .withValues(alpha: online ? 0.14 : 0.1),
            blurRadius: 28,
            offset: const Offset(0, 14),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              LineGlyph(online: online, busy: busy),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      (driverName ?? '').trim().isNotEmpty
                          ? driverName!.trim()
                          : l10n.driverDrawerNameFallback,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        color: palette.text,
                        fontSize: 17,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                    const SizedBox(height: 3),
                    InkWell(
                      onTap: onRegionTap,
                      borderRadius: BorderRadius.circular(10),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(Icons.place_rounded,
                              size: 13, color: palette.textMuted),
                          const SizedBox(width: 3),
                          Flexible(
                            child: Text(
                              regionName ?? l10n.driverChooseRegionButton,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: TextStyle(
                                color: palette.textSecondary,
                                fontSize: 12.5,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                          ),
                          Icon(Icons.keyboard_arrow_down_rounded,
                              size: 16, color: palette.textMuted),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
              if (sosButton != null) sosButton!,
            ],
          ),
          const SizedBox(height: 16),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
            decoration: BoxDecoration(
              color: palette.goldSurface,
              borderRadius: BorderRadius.circular(18),
            ),
            child: Row(
              children: [
                Container(
                  width: 9,
                  height: 9,
                  decoration:
                      BoxDecoration(color: toneColor, shape: BoxShape.circle),
                ),
                const SizedBox(width: 9),
                Expanded(
                  child: Text(
                    status,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      color: palette.text,
                      fontSize: 13.5,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                ),
                if (todayEarnings != null) ...[
                  const SizedBox(width: 10),
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: [
                      Text(
                        l10n.driverTodayLabel,
                        // textSecondary, not textMuted — textMuted's contrast
                        // against the background fails WCAG AA (~2.5:1).
                        style: TextStyle(
                          color: palette.textSecondary,
                          fontSize: 10.5,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      Text(
                        todayEarnings!,
                        style: TextStyle(
                          color: palette.goldDeep,
                          fontSize: 17,
                          fontWeight: FontWeight.w900,
                        ),
                      ),
                    ],
                  ),
                ],
              ],
            ),
          ),
          const SizedBox(height: 16),
          if (online)
            SizedBox(
              width: double.infinity,
              child: OutlinedButton(
                onPressed: onToggle,
                style: OutlinedButton.styleFrom(
                  minimumSize: const Size.fromHeight(56),
                  foregroundColor: palette.text,
                  side: BorderSide(color: palette.borderStrong),
                ),
                child: loading
                    ? ButtonSpinner(text: l10n.driverUpdatingStatusButton)
                    : Text(l10n.driverGoOfflineButton),
              ),
            )
          else
            DriverGradientButton(
              text: l10n.driverGoOnlineButton,
              icon: Icons.power_settings_new_rounded,
              onTap: onToggle,
              loading: loading,
              enabled: onToggle != null,
              loadingText: l10n.driverUpdatingStatusButton,
            ),
        ],
      ),
    );
  }
}

/// Compact "today at a glance" row — completed trips, nearby open orders and
/// demand level side by side. Replaces the old 2x2 stat grid (which
/// duplicated revenue, now shown directly in [DriverShiftHero], and buried
/// debt/balance, which belongs on the wallet screen, not the home screen)
/// and the separate demand-hint card that used to sit above it.
class DriverTodayStrip extends StatelessWidget {
  const DriverTodayStrip({
    super.key,
    required this.stats,
    required this.loading,
    required this.openOrders,
    required this.demandLevel,
    required this.demandLoading,
  });

  final DriverStats? stats;
  final bool loading;
  final int openOrders;
  final double demandLevel;
  final bool demandLoading;

  // Short enough to fit a third-width mini-stat card at the emphasized
  // value font size without wrapping or ellipsizing.
  (String, Color) _demandMeta(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    if (demandLevel >= 1.5) return (l10n.driverDemandHigh, context.palette.danger);
    if (demandLevel > 1.0) return (l10n.driverDemandAboveNormal, context.palette.goldDeep);
    return (l10n.driverDemandNormal, context.palette.textSecondary);
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final current = stats;
    final tripsValue = loading && current == null
        ? '···'
        : current == null
            ? '—'
            : '${current.completedOrders}';
    final (demandLabel, demandColor) = _demandMeta(context);
    // IntrinsicHeight, not CrossAxisAlignment.stretch — this Row lives inside
    // a vertically-scrolling ListView, which gives it unbounded height;
    // stretch tries to hand that unbounded height straight to the children
    // and crashes with "BoxConstraints forces an infinite height".
    // IntrinsicHeight measures the tallest child first, then constrains
    // every child to that height — same equal-height look, no crash.
    return IntrinsicHeight(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Expanded(
            child: _MiniStat(
              icon: Icons.done_all_rounded,
              label: l10n.driverTripsTodayLabel,
              value: tripsValue,
              tone: context.palette.success,
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: _MiniStat(
              icon: Icons.receipt_long_rounded,
              label: l10n.driverNewOrdersLabel,
              value: '$openOrders',
              tone: context.palette.warning,
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: _MiniStat(
              icon: Icons.trending_up_rounded,
              label: l10n.driverDemandNearbyLabel,
              value: demandLabel,
              tone: demandColor,
              loading: demandLoading,
            ),
          ),
        ],
      ),
    );
  }
}

class _MiniStat extends StatelessWidget {
  const _MiniStat({
    required this.icon,
    required this.label,
    required this.value,
    required this.tone,
    this.loading = false,
  });

  final IconData icon;
  final String label;
  final String value;
  final Color tone;
  final bool loading;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 13),
      decoration: BoxDecoration(
        color: context.palette.card,
        border: Border.all(color: context.palette.border),
        borderRadius: BorderRadius.circular(20),
        boxShadow: const [
          BoxShadow(
              color: Color(0x0f102a52), blurRadius: 18, offset: Offset(0, 8)),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Row(
            children: [
              Icon(icon, size: 16, color: tone),
              if (loading) ...[
                const SizedBox(width: 6),
                SizedBox(
                  width: 10,
                  height: 10,
                  child: CircularProgressIndicator(
                      strokeWidth: 1.6, color: tone),
                ),
              ],
            ],
          ),
          const SizedBox(height: 9),
          FittedBox(
            fit: BoxFit.scaleDown,
            alignment: Alignment.centerLeft,
            child: Text(
              value,
              maxLines: 1,
              style: TextStyle(
                color: context.palette.text,
                fontSize: 17,
                fontWeight: FontWeight.w900,
              ),
            ),
          ),
          const SizedBox(height: 2),
          Text(
            label,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            // textSecondary, not textMuted — textMuted's contrast against the
            // background fails WCAG AA (~2.5:1).
            style: TextStyle(
              color: context.palette.textSecondary,
              fontSize: 10.5,
              fontWeight: FontWeight.w700,
              height: 1.2,
            ),
          ),
        ],
      ),
    );
  }
}

class LocationNotice extends StatelessWidget {
  const LocationNotice({
    super.key,
    required this.online,
    required this.loading,
    required this.message,
  });

  final bool online;
  final bool loading;
  final String? message;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final text = message ??
        (online
            ? l10n.driverLocationOnlineHint
            : l10n.driverLocationRequiredError);
    final icon = loading
        ? Icons.my_location_rounded
        : online
            ? Icons.location_on_outlined
            : Icons.location_searching_rounded;
    return AnimatedContainer(
      duration: const Duration(milliseconds: 180),
      width: double.infinity,
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: context.palette.goldSurface,
        border: Border.all(color: context.palette.border),
        borderRadius: BorderRadius.circular(20),
      ),
      child: Row(
        children: [
          Container(
            width: 38,
            height: 38,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: context.palette.card,
              shape: BoxShape.circle,
            ),
            child: loading
                ? SizedBox(
                    width: 17,
                    height: 17,
                    child: CircularProgressIndicator(
                      strokeWidth: 2.2,
                      color: context.palette.goldDeep,
                    ),
                  )
                : Icon(icon, size: 20, color: context.palette.goldDeep),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Text(
              text,
              style: TextStyle(
                  color: context.palette.textSecondary,
                  fontWeight: FontWeight.w700,
                  height: 1.35),
            ),
          ),
        ],
      ),
    );
  }
}
