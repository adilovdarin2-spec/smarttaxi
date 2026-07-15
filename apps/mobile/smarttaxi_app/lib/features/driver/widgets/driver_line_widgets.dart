import 'package:flutter/material.dart';

import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/status_pill.dart';
import '../../shared/models.dart';
import '../models/driver_shell_helpers.dart';
import 'driver_common_widgets.dart';

class DriverShiftHero extends StatelessWidget {
  const DriverShiftHero({
    super.key,
    required this.status,
    required this.tone,
    required this.online,
    required this.busy,
    required this.loading,
    required this.disabledReason,
    required this.regionName,
    required this.onToggle,
    this.sosButton,
  });

  final String status;
  final StatusTone tone;
  final bool online;
  final bool busy;
  final bool loading;
  final String? disabledReason;
  final String? regionName;
  final VoidCallback? onToggle;
  final Widget? sosButton;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(26),
        border: Border.all(color: context.palette.border),
        boxShadow: const [
          BoxShadow(
            color: Color(0x14785a14),
            blurRadius: 26,
            offset: Offset(0, 12),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Водитель SmartTaxi',
                      style: TextStyle(
                        color: context.palette.text,
                        fontSize: 19,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      regionName == null
                          ? 'Выберите рабочий регион'
                          : 'Регион: $regionName',
                      style: TextStyle(
                        color: context.palette.textSecondary,
                        fontSize: 12,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ],
                ),
              ),
              LineGlyph(online: online, busy: busy),
            ],
          ),
          const SizedBox(height: 14),
          Row(
            children: [
              StatusPill(label: status, tone: tone),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  busy
                      ? 'Есть активная поездка'
                      : online
                          ? 'Готовы принимать заказы'
                          : 'Вы не на линии',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    color: context.palette.textSecondary,
                    fontSize: 13,
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ),
              if (sosButton != null) ...[
                const SizedBox(width: 8),
                sosButton!,
              ],
            ],
          ),
          if (disabledReason != null && !online) ...[
            const SizedBox(height: 12),
            Text(
              disabledReason!,
              style: TextStyle(
                color: context.palette.gold,
                fontWeight: FontWeight.w800,
              ),
            ),
          ],
          const SizedBox(height: 14),
          SizedBox(
            width: double.infinity,
            child: ElevatedButton(
              onPressed: onToggle,
              style: ElevatedButton.styleFrom(
                minimumSize: const Size.fromHeight(54),
                backgroundColor:
                    online ? SmartTaxiColors.cardDark : context.palette.gold,
                foregroundColor:
                    online ? const Color(0xfff5f5f5) : context.palette.text,
              ),
              child: loading
                  ? const ButtonSpinner(text: 'Обновляем статус...')
                  : Text(online ? 'Уйти с линии' : 'Выйти на линию'),
            ),
          ),
        ],
      ),
    );
  }
}

class DriverStatsGrid extends StatelessWidget {
  const DriverStatsGrid({
    super.key,
    required this.stats,
    required this.loading,
    required this.openOrders,
  });

  final DriverStats? stats;
  final bool loading;
  final int openOrders;

  @override
  Widget build(BuildContext context) {
    final current = stats;
    return GridView.count(
      crossAxisCount: 2,
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      mainAxisSpacing: 10,
      crossAxisSpacing: 10,
      childAspectRatio: 1.45,
      children: [
        DriverStatCard(
          title: 'Выручка сегодня',
          value: loading && current == null
              ? '...'
              : current == null
                  ? '—'
                  : formatDriverMoney(current.revenueTotal),
          icon: Icons.payments_rounded,
          tone: context.palette.goldDeep,
        ),
        DriverStatCard(
          title: 'Завершено',
          value: loading && current == null
              ? '...'
              : current == null
                  ? '—'
                  : '${current.completedOrders}',
          icon: Icons.done_all_rounded,
          tone: context.palette.success,
        ),
        DriverStatCard(
          title: 'Новые заказы',
          value: '$openOrders',
          icon: Icons.receipt_long_rounded,
          tone: context.palette.warning,
        ),
        DriverStatCard(
          title: 'Долг / баланс',
          value: loading && current == null
              ? '...'
              : current == null
                  ? '—'
                  : '${formatDriverMoney(current.debt)} / ${formatDriverMoney(current.balance)}',
          icon: Icons.account_balance_wallet_rounded,
          tone: context.palette.textSecondary,
          compact: true,
        ),
      ],
    );
  }
}

class DriverStatCard extends StatelessWidget {
  const DriverStatCard({
    super.key,
    required this.title,
    required this.value,
    required this.icon,
    required this.tone,
    this.compact = false,
  });

  final String title;
  final String value;
  final IconData icon;
  final Color tone;
  final bool compact;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white,
        border: Border.all(color: context.palette.border),
        borderRadius: BorderRadius.circular(24),
        boxShadow: const [
          BoxShadow(
            color: Color(0x0f785a14),
            blurRadius: 22,
            offset: Offset(0, 10),
          )
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Row(
            children: [
              Icon(icon, size: 19, color: tone),
              const SizedBox(width: 7),
              Expanded(
                child: Text(
                  title,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    color: context.palette.textSecondary,
                    fontSize: 12,
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ),
            ],
          ),
          Text(
            value,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(
              color: context.palette.text,
              fontSize: compact ? 17 : 22,
              fontWeight: FontWeight.w900,
            ),
          ),
        ],
      ),
    );
  }
}

class DriverQuickActions extends StatelessWidget {
  const DriverQuickActions({
    super.key,
    required this.activeOrder,
    required this.openOrders,
    required this.roadAlerts,
    required this.onOrders,
    required this.onTrip,
    required this.onNavigator,
    required this.onRoadAlerts,
  });

  final OrderSummary? activeOrder;
  final int openOrders;
  final int roadAlerts;
  final VoidCallback onOrders;
  final VoidCallback onTrip;
  final VoidCallback onNavigator;
  final VoidCallback onRoadAlerts;

  @override
  Widget build(BuildContext context) {
    return PremiumCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const SectionLabel(
            title: 'Быстрые действия',
            text: 'Самые важные рабочие экраны без лишнего меню',
          ),
          const SizedBox(height: 12),
          DriverActionCard(
            icon: Icons.explore_rounded,
            title: 'Smart Navigator',
            text: 'Карта, скорость, события и внешняя навигация',
            onTap: onNavigator,
            primary: true,
          ),
          const SizedBox(height: 10),
          Row(
            children: [
              Expanded(
                child: DriverActionCard(
                  icon: Icons.receipt_long_rounded,
                  title: 'Заказы',
                  text: '$openOrders новых',
                  onTap: onOrders,
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: DriverActionCard(
                  icon: activeOrder == null
                      ? Icons.route_outlined
                      : Icons.route_rounded,
                  title: 'Поездка',
                  text: activeOrder == null ? 'Нет активной' : 'Открыть',
                  onTap: onTrip,
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          DriverActionCard(
            icon: Icons.add_location_alt_rounded,
            title: 'Дорожные события',
            text: roadAlerts == 0
                ? 'Сообщить о событии'
                : '$roadAlerts активных рядом',
            onTap: onRoadAlerts,
          ),
        ],
      ),
    );
  }
}

class DriverActionCard extends StatelessWidget {
  const DriverActionCard({
    super.key,
    required this.icon,
    required this.title,
    required this.text,
    required this.onTap,
    this.primary = false,
  });

  final IconData icon;
  final String title;
  final String text;
  final VoidCallback onTap;
  final bool primary;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      borderRadius: BorderRadius.circular(22),
      onTap: onTap,
      child: Container(
        constraints: const BoxConstraints(minHeight: 74),
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color:
              primary ? context.palette.goldPale : context.palette.goldSurface,
          border: Border.all(
            color:
                primary ? context.palette.borderStrong : context.palette.border,
          ),
          borderRadius: BorderRadius.circular(22),
        ),
        child: Row(
          children: [
            Container(
              width: 42,
              height: 42,
              alignment: Alignment.center,
              decoration: BoxDecoration(
                color: Colors.white.withValues(alpha: 0.88),
                shape: BoxShape.circle,
              ),
              child: Icon(icon, color: context.palette.goldDeep),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Text(
                    title,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      fontSize: 15,
                      fontWeight: FontWeight.w900,
                    ),
                  ),
                  const SizedBox(height: 3),
                  Text(
                    text,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      color: context.palette.textSecondary,
                      fontSize: 12,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ],
              ),
            ),
            Icon(Icons.chevron_right_rounded,
                color: context.palette.textSecondary),
          ],
        ),
      ),
    );
  }
}

class RegionSummary extends StatelessWidget {
  const RegionSummary({super.key, required this.region});

  final DriverRegion region;

  @override
  Widget build(BuildContext context) {
    final blocked = region.status == 'BLOCKED';
    final inactive = !region.isActive;
    final label = blocked
        ? 'Заблокирован'
        : inactive
            ? 'Отключён'
            : 'Одобрен';
    final tone = blocked || inactive ? StatusTone.danger : StatusTone.success;
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: context.palette.goldSurface,
        border: Border.all(color: context.palette.border),
        borderRadius: BorderRadius.circular(20),
      ),
      child: Row(
        children: [
          Expanded(
            child:
                Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(region.name,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                      fontSize: 15, fontWeight: FontWeight.w900)),
              const SizedBox(height: 4),
              Text(
                'Заказы показываются только из этого региона',
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                    color: context.palette.textSecondary,
                    fontWeight: FontWeight.w700),
              ),
            ]),
          ),
          StatusPill(label: label, tone: tone),
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
    final text = message ??
        (online
            ? 'Геолокация отправляется только во время работы на линии.'
            : 'Для работы на линии нужна геолокация.');
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
              color: Colors.white.withValues(alpha: 0.82),
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
