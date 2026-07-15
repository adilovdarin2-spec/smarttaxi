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

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
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
              padding: const EdgeInsets.all(20),
              color: context.palette.goldSurface,
              child: Row(
                children: [
                  const BrandLogo(),
                  const SizedBox(width: 12),
                  Expanded(
                      child: Text(
                          accountLabel.isEmpty
                              ? 'Водитель SmartTaxi'
                              : accountLabel,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(fontWeight: FontWeight.w900))),
                ],
              ),
            ),
            const SizedBox(height: 10),
            DrawerItem(
                label: 'Линия', active: activeTab == 0, onTap: () => onTab(0)),
            DrawerItem(
                label: 'Заказы', active: activeTab == 1, onTap: () => onTab(1)),
            DrawerItem(
                label: 'Поездка',
                active: activeTab == 2,
                onTap: () => onTab(2)),
            DrawerItem(
                label: 'Smart Navigator',
                active: activeTab == 3,
                onTap: () => onTab(3)),
            DrawerItem(label: 'Профиль', active: false, onTap: onProfile),
            DrawerItem(
                label: l10n.driverDrawerWallet, active: false, onTap: onWallet),
            DrawerItem(
                label: l10n.driverDrawerDocuments,
                active: false,
                onTap: onDocuments),
            DrawerItem(
                label: l10n.driverDrawerRating, active: false, onTap: onRating),
            DrawerItem(
                label: l10n.driverDrawerNotifications,
                active: false,
                onTap: onNotifications),
            DrawerItem(
                label: 'Дорожные события', active: false, onTap: onRoadAlerts),
            DrawerItem(
                label: 'Регулярные поездки',
                active: false,
                onTap: onRecurringBookings),
            DrawerItem(label: 'Поддержка', active: false, onTap: onSupport),
            DrawerItem(label: 'FAQ', active: false, onTap: onFaq),
            DrawerItem(label: 'О нас', active: false, onTap: onAbout),
            DrawerItem(label: 'Настройки', active: false, onTap: onSettings),
            DrawerItem(
                label: 'Режим пассажира', active: false, onTap: onPassenger),
            const SizedBox(height: 10),
            DrawerItem(
                label: 'Выйти', active: false, danger: true, onTap: onLogout),
            const SizedBox(height: 18),
          ],
        ),
      ),
    );
  }
}
