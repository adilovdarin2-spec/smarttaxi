import 'package:flutter/material.dart';

import '../../../core/theme/app_theme.dart';
import '../../../l10n/app_localizations.dart';
import '../../shared/models.dart';
import 'driver_common_widgets.dart';

class DriverShiftHero extends StatelessWidget {
  const DriverShiftHero({
    super.key,
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

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final palette = context.palette;
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
        // One shadow, not two stacked. A 34px-blur coloured glow plus a
        // second tight shadow under the same card is what made this read as
        // heavy and slightly cheap — a card lit from two directions at once.
        boxShadow: [
          BoxShadow(
            color: (online ? palette.success : palette.gold)
                .withValues(alpha: online ? 0.16 : 0.11),
            blurRadius: 26,
            offset: const Offset(0, 12),
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
          // Earnings, not the status word again. This row used to open with
          // a tone dot and the very same "Занят"/"На линии" that the header
          // pill already shows a few dozen pixels higher — the screen said
          // it twice and, between the two, said the day's takings once and
          // quietly, in the corner. The status still lives in the header
          // (where it stays visible on every tab) and in the button below,
          // which names the state by naming its opposite.
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 13),
            decoration: BoxDecoration(
              color: palette.goldSurface,
              borderRadius: BorderRadius.circular(18),
            ),
            child: Row(
              children: [
                Icon(Icons.account_balance_wallet_rounded,
                    size: 18, color: palette.goldDeep),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(
                    l10n.driverTodayLabel,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    // textSecondary, not textMuted — textMuted's contrast
                    // against this background fails WCAG AA (~2.5:1).
                    style: TextStyle(
                      color: palette.textSecondary,
                      fontSize: 13,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                ),
                const SizedBox(width: 10),
                Text(
                  todayEarnings ?? '—',
                  maxLines: 1,
                  style: TextStyle(
                    color: palette.goldDeep,
                    fontSize: 20,
                    fontWeight: FontWeight.w900,
                  ),
                ),
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
    final palette = context.palette;
    final current = stats;
    final tripsValue = loading && current == null
        ? '···'
        : current == null
            ? '—'
            : '${current.completedOrders}';
    final (demandLabel, demandColor) = _demandMeta(context);
    // One shared card with internal dividers instead of three separately
    // bordered/shadowed mini-cards — the old row cast three shadows side by
    // side, which read as "another box" stacked under the hero card above.
    // Same three stats, one visual unit.
    return Container(
      decoration: BoxDecoration(
        color: palette.card,
        border: Border.all(color: palette.border),
        borderRadius: BorderRadius.circular(24),
        boxShadow: const [
          BoxShadow(
              color: Color(0x14102a52), blurRadius: 26, offset: Offset(0, 12)),
          BoxShadow(
              color: Color(0x0a102a52), blurRadius: 6, offset: Offset(0, 2)),
        ],
      ),
      // IntrinsicHeight, not CrossAxisAlignment.stretch on the outer
      // ListView — this lives inside a vertically-scrolling ListView, which
      // gives it unbounded height; stretch tries to hand that unbounded
      // height straight to the dividers and crashes with "BoxConstraints
      // forces an infinite height". IntrinsicHeight measures the tallest
      // child first, then constrains every child (including the dividers)
      // to that height.
      child: IntrinsicHeight(
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Expanded(
              child: _StatColumn(
                icon: Icons.done_all_rounded,
                label: l10n.driverTripsTodayLabel,
                value: tripsValue,
                tone: palette.success,
              ),
            ),
            _StatDivider(color: palette.border),
            Expanded(
              child: _StatColumn(
                icon: Icons.receipt_long_rounded,
                label: l10n.driverNewOrdersLabel,
                value: '$openOrders',
                tone: palette.warning,
              ),
            ),
            _StatDivider(color: palette.border),
            Expanded(
              child: _StatColumn(
                icon: Icons.trending_up_rounded,
                label: l10n.driverDemandNearbyLabel,
                value: demandLabel,
                tone: demandColor,
                loading: demandLoading,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _StatDivider extends StatelessWidget {
  const _StatDivider({required this.color});

  final Color color;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 14),
      child: SizedBox(width: 1, child: ColoredBox(color: color)),
    );
  }
}

class _StatColumn extends StatelessWidget {
  const _StatColumn({
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
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 15),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Row(
            mainAxisSize: MainAxisSize.min,
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
            textAlign: TextAlign.center,
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
