import 'dart:async';

import 'package:flutter/material.dart';

import '../../../../core/api/api_client.dart';
import '../../../../core/theme/app_theme.dart';
import '../../../../core/widgets/empty_state.dart';
import '../../../../l10n/app_localizations.dart';
import '../../../shared/models.dart';

class _NotificationDayGroup {
  const _NotificationDayGroup(this.label, this.items);

  final String label;
  final List<AppNotification> items;
}

List<_NotificationDayGroup> _groupByDay(
    AppLocalizations l10n, List<AppNotification> items) {
  final now = DateTime.now();
  final today = DateTime(now.year, now.month, now.day);
  final yesterday = today.subtract(const Duration(days: 1));
  final ordered = <String, List<AppNotification>>{};
  for (final item in items) {
    final date = item.createdAt.toLocal();
    final day = DateTime(date.year, date.month, date.day);
    final label = day == today
        ? l10n.passengerTripDateToday
        : day == yesterday
            ? l10n.passengerTripDateYesterday
            : '${day.day.toString().padLeft(2, '0')}.${day.month.toString().padLeft(2, '0')}.${day.year}';
    ordered.putIfAbsent(label, () => []).add(item);
  }
  return [for (final entry in ordered.entries) _NotificationDayGroup(entry.key, entry.value)];
}

IconData _iconFor(String type) {
  switch (type) {
    case 'DRIVER_PAYOUT_STATUS':
      return Icons.account_balance_wallet_outlined;
    case 'DRIVER_DOCUMENT_STATUS':
      return Icons.description_outlined;
    case 'DRIVER_AUTO_BLOCKED':
      return Icons.block_rounded;
    case 'ORDER_STATUS':
      return Icons.local_taxi_rounded;
    default:
      return Icons.notifications_none_rounded;
  }
}

String _timeAgo(AppLocalizations l10n, DateTime dateTime) {
  final diff = DateTime.now().difference(dateTime);
  if (diff.inMinutes < 1) return l10n.passengerTimeAgoJustNow;
  if (diff.inMinutes < 60) return l10n.passengerTimeAgoMinutes(diff.inMinutes);
  if (diff.inHours < 24) return l10n.passengerTimeAgoHours(diff.inHours);
  return l10n.passengerTimeAgoDays(diff.inDays);
}

class DriverNotificationsScreen extends StatefulWidget {
  const DriverNotificationsScreen({super.key, required this.api});

  final ApiClient api;

  @override
  State<DriverNotificationsScreen> createState() =>
      _DriverNotificationsScreenState();
}

class _DriverNotificationsScreenState
    extends State<DriverNotificationsScreen> {
  bool _loading = true;
  String? _error;
  List<AppNotification> _items = const [];

  @override
  void initState() {
    super.initState();
    unawaited(_load());
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final result = await widget.api.getNotifications();
      if (!mounted) return;
      setState(() {
        _items = result.notifications;
        _loading = false;
      });
      if (result.unreadCount > 0) {
        unawaited(widget.api.markAllNotificationsRead());
      }
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _error = AppLocalizations.of(context).driverNotificationsLoadError;
        _loading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final l10n = AppLocalizations.of(context);
    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        padding: const EdgeInsets.all(20),
        physics: const AlwaysScrollableScrollPhysics(
          parent: BouncingScrollPhysics(),
        ),
        children: [
          Text(l10n.driverNotificationsTitle,
              style: SmartTaxiTextStyles.title.copyWith(color: palette.text)),
          const SizedBox(height: 4),
          Text(
            l10n.driverNotificationsSubtitle,
            style: SmartTaxiTextStyles.subtitle
                .copyWith(color: palette.textSecondary),
          ),
          const SizedBox(height: 16),
          if (_loading)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 40),
              child: Center(child: CircularProgressIndicator()),
            )
          else if (_error != null)
            EmptyState(
              title: l10n.driverNotificationsLoadError,
              text: _error!,
              icon: Icons.error_outline_rounded,
              action: l10n.retry,
              onAction: _load,
            )
          else if (_items.isEmpty)
            EmptyState(
              title: l10n.driverNotificationsEmptyTitle,
              text: l10n.driverNotificationsEmptyText,
              icon: Icons.notifications_none_rounded,
            )
          else
            for (final group in _groupByDay(l10n, _items)) ...[
              Text(group.label,
                  style: SmartTaxiTextStyles.caption
                      .copyWith(color: palette.textSecondary)),
              const SizedBox(height: 8),
              for (final item in group.items) ...[
                _DriverNotificationTile(notification: item),
                const SizedBox(height: 10),
              ],
              const SizedBox(height: 6),
            ],
        ],
      ),
    );
  }
}

class _DriverNotificationTile extends StatelessWidget {
  const _DriverNotificationTile({required this.notification});

  final AppNotification notification;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final l10n = AppLocalizations.of(context);
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: palette.card,
        border: Border.all(
          color: notification.isUnread ? palette.borderStrong : palette.border,
        ),
        borderRadius: BorderRadius.circular(20),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 38,
            height: 38,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: palette.goldSurface,
              shape: BoxShape.circle,
            ),
            child: Icon(
              _iconFor(notification.type),
              color: palette.goldDeep,
              size: 18,
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        notification.title,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          color: palette.text,
                          fontSize: 14.5,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                    ),
                    if (notification.isUnread) ...[
                      const SizedBox(width: 6),
                      Container(
                        width: 8,
                        height: 8,
                        decoration: BoxDecoration(
                          color: palette.gold,
                          shape: BoxShape.circle,
                        ),
                      ),
                    ],
                  ],
                ),
                const SizedBox(height: 4),
                Text(
                  notification.body,
                  style: TextStyle(
                    color: palette.textSecondary,
                    fontSize: 12.5,
                    height: 1.3,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                const SizedBox(height: 6),
                Text(
                  _timeAgo(l10n, notification.createdAt),
                  // textSecondary, not textMuted — textMuted's contrast
                  // against the background fails WCAG AA (~2.5:1).
                  style: TextStyle(
                    color: palette.textSecondary,
                    fontSize: 11,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
