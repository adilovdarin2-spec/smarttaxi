import 'package:flutter/material.dart';

import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/brand_logo.dart';
import '../../../core/widgets/status_pill.dart';
import '../../../l10n/app_localizations.dart';
import 'driver_common_widgets.dart';

class DriverHeader extends StatelessWidget {
  const DriverHeader(
      {super.key,
      required this.onMenu,
      required this.status,
      required this.tone});

  final VoidCallback onMenu;
  final String status;
  final StatusTone tone;

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 62,
      margin: const EdgeInsets.fromLTRB(12, 8, 12, 4),
      padding: const EdgeInsets.symmetric(horizontal: 8),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.96),
        border: Border.all(color: context.palette.border),
        borderRadius: BorderRadius.circular(24),
        boxShadow: const [
          BoxShadow(
              color: Color(0x10785a14), blurRadius: 22, offset: Offset(0, 10))
        ],
      ),
      child: Row(
        children: [
          IconButton(
              onPressed: onMenu,
              icon: const Icon(Icons.menu_rounded),
              tooltip: 'Меню'),
          const SizedBox(width: 4),
          const BrandLogo(),
          const Spacer(),
          StatusPill(label: status, tone: tone),
        ],
      ),
    );
  }
}

class DriverDrawer extends StatelessWidget {
  const DriverDrawer({
    super.key,
    required this.accountLabel,
    required this.activeTab,
    required this.onTab,
    required this.onPassenger,
    required this.onProfile,
    required this.onWallet,
    required this.onDocuments,
    required this.onRating,
    required this.onNotifications,
    required this.onSupport,
    required this.onFaq,
    required this.onAbout,
    required this.onSettings,
    required this.onRoadAlerts,
    required this.onLogout,
    required this.onRecurringBookings,
    this.regionName,
    this.online = false,
  });

  final String accountLabel;
  final int activeTab;
  final ValueChanged<int> onTab;
  final VoidCallback onPassenger;
  final VoidCallback onProfile;
  final VoidCallback onWallet;
  final VoidCallback onDocuments;
  final VoidCallback onRating;
  final VoidCallback onNotifications;
  final VoidCallback onSupport;
  final VoidCallback onFaq;
  final VoidCallback onAbout;
  final VoidCallback onSettings;
  final VoidCallback onRoadAlerts;
  final VoidCallback onLogout;
  final VoidCallback onRecurringBookings;
  final String? regionName;
  final bool online;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final palette = context.palette;
    final name = accountLabel.isEmpty ? 'Водитель SmartTaxi' : accountLabel;
    final initial = name.trim().isNotEmpty ? name.trim()[0].toUpperCase() : 'S';
    return Drawer(
      width: MediaQuery.sizeOf(context).width * 0.84,
      shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.horizontal(right: Radius.circular(28))),
      child: SafeArea(
        child: ListView(
          padding: EdgeInsets.zero,
          children: [
            Container(
              width: double.infinity,
              padding: const EdgeInsets.fromLTRB(20, 24, 20, 20),
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                  colors: [
                    palette.goldSurface,
                    palette.goldSurface.withValues(alpha: 0.4),
                  ],
                ),
              ),
              child: Row(
                children: [
                  Container(
                    width: 52,
                    height: 52,
                    alignment: Alignment.center,
                    decoration: BoxDecoration(
                      color: Colors.white,
                      shape: BoxShape.circle,
                      border: Border.all(color: palette.gold, width: 1.6),
                      boxShadow: [
                        BoxShadow(
                          color: palette.gold.withValues(alpha: 0.28),
                          blurRadius: 16,
                          offset: const Offset(0, 6),
                        ),
                      ],
                    ),
                    child: Text(
                      initial,
                      style: TextStyle(
                        color: palette.goldDeep,
                        fontSize: 22,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                  ),
                  const SizedBox(width: 14),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(name,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(
                                color: palette.text,
                                fontSize: 16.5,
                                fontWeight: FontWeight.w900)),
                        const SizedBox(height: 4),
                        Row(
                          children: [
                            Container(
                              width: 7,
                              height: 7,
                              decoration: BoxDecoration(
                                shape: BoxShape.circle,
                                color:
                                    online ? palette.success : palette.textMuted,
                              ),
                            ),
                            const SizedBox(width: 5),
                            Flexible(
                              child: Text(
                                online
                                    ? (regionName ?? 'На линии')
                                    : (regionName ?? 'Не на линии'),
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: TextStyle(
                                  color: palette.textSecondary,
                                  fontSize: 12.5,
                                  fontWeight: FontWeight.w700,
                                ),
                              ),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                  const BrandLogo(),
                ],
              ),
            ),
            const SizedBox(height: 6),
            const DrawerSectionLabel('Работа'),
            DrawerItem(
                label: 'Линия',
                icon: Icons.power_settings_new_rounded,
                active: activeTab == 0,
                onTap: () => onTab(0)),
            DrawerItem(
                label: 'Заказы',
                icon: Icons.receipt_long_rounded,
                active: activeTab == 1,
                onTap: () => onTab(1)),
            DrawerItem(
                label: 'Поездка',
                icon: Icons.route_rounded,
                active: activeTab == 2,
                onTap: () => onTab(2)),
            DrawerItem(
                label: 'Smart Navigator',
                icon: Icons.explore_rounded,
                active: activeTab == 3,
                onTap: () => onTab(3)),
            const Divider(height: 20, indent: 24, endIndent: 24),
            const DrawerSectionLabel('Аккаунт'),
            DrawerItem(
                label: 'Профиль',
                icon: Icons.person_rounded,
                active: false,
                onTap: onProfile),
            DrawerItem(
                label: l10n.driverDrawerWallet,
                icon: Icons.account_balance_wallet_rounded,
                active: false,
                onTap: onWallet),
            DrawerItem(
                label: l10n.driverDrawerDocuments,
                icon: Icons.description_rounded,
                active: false,
                onTap: onDocuments),
            DrawerItem(
                label: l10n.driverDrawerRating,
                icon: Icons.star_rounded,
                active: false,
                onTap: onRating),
            const Divider(height: 20, indent: 24, endIndent: 24),
            const DrawerSectionLabel('Сервис'),
            DrawerItem(
                label: l10n.driverDrawerNotifications,
                icon: Icons.notifications_rounded,
                active: false,
                onTap: onNotifications),
            DrawerItem(
                label: 'Дорожные события',
                icon: Icons.shield_rounded,
                active: false,
                onTap: onRoadAlerts),
            DrawerItem(
                label: 'Регулярные поездки',
                icon: Icons.event_repeat_rounded,
                active: false,
                onTap: onRecurringBookings),
            const Divider(height: 20, indent: 24, endIndent: 24),
            const DrawerSectionLabel('Помощь'),
            DrawerItem(
                label: 'Поддержка',
                icon: Icons.support_agent_rounded,
                active: false,
                onTap: onSupport),
            DrawerItem(
                label: 'FAQ',
                icon: Icons.help_rounded,
                active: false,
                onTap: onFaq),
            DrawerItem(
                label: 'О нас',
                icon: Icons.info_rounded,
                active: false,
                onTap: onAbout),
            DrawerItem(
                label: 'Настройки',
                icon: Icons.settings_rounded,
                active: false,
                onTap: onSettings),
            const Divider(height: 20, indent: 24, endIndent: 24),
            DrawerItem(
                label: 'Режим пассажира',
                icon: Icons.swap_horiz_rounded,
                active: false,
                onTap: onPassenger),
            DrawerItem(
                label: 'Выйти',
                icon: Icons.logout_rounded,
                active: false,
                danger: true,
                onTap: onLogout),
            const SizedBox(height: 18),
          ],
        ),
      ),
    );
  }
}
