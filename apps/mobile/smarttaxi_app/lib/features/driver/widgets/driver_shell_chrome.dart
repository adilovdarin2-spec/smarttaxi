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
      required this.onNotifications,
      required this.status,
      required this.tone});

  final VoidCallback onMenu;
  final VoidCallback onNotifications;
  final String status;
  final StatusTone tone;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final palette = context.palette;
    Widget roundAction({
      required IconData icon,
      required String tooltip,
      required VoidCallback onTap,
    }) =>
        Tooltip(
          message: tooltip,
          child: Material(
            color: Colors.transparent,
            child: InkWell(
              onTap: onTap,
              borderRadius: BorderRadius.circular(18),
              child: Container(
                width: 52,
                height: 52,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: palette.card.withValues(alpha: 0.94),
                  border: Border.all(color: palette.borderStrong),
                  borderRadius: BorderRadius.circular(18),
                  boxShadow: const [
                    BoxShadow(
                      color: Color(0x16102a52),
                      blurRadius: 16,
                      offset: Offset(0, 7),
                    ),
                  ],
                ),
                child: Icon(icon, color: palette.brandDeep, size: 23),
              ),
            ),
          ),
        );
    return SizedBox(
      height: 60,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(14, 6, 14, 2),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            roundAction(
              icon: Icons.menu_rounded,
              tooltip: l10n.driverDrawerMenuTooltip,
              onTap: onMenu,
            ),
            StatusPill(label: status, tone: tone),
            roundAction(
              icon: Icons.notifications_none_rounded,
              tooltip: l10n.notifications,
              onTap: onNotifications,
            ),
          ],
        ),
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
    final name =
        accountLabel.isEmpty ? l10n.driverDrawerNameFallback : accountLabel;
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
                    palette.brandSurface,
                    palette.brandSurface.withValues(alpha: 0.4),
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
                      gradient: LinearGradient(
                        begin: Alignment.topLeft,
                        end: Alignment.bottomRight,
                        colors: [palette.brand, palette.brandDeep],
                      ),
                      shape: BoxShape.circle,
                      boxShadow: [
                        BoxShadow(
                          color: palette.brand.withValues(alpha: 0.28),
                          blurRadius: 16,
                          offset: const Offset(0, 6),
                        ),
                      ],
                    ),
                    child: Text(
                      initial,
                      style: const TextStyle(
                        color: Colors.white,
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
                                color: online
                                    ? palette.success
                                    : palette.textMuted,
                              ),
                            ),
                            const SizedBox(width: 5),
                            Flexible(
                              child: Text(
                                online
                                    ? (regionName ?? l10n.driverStatusOnline)
                                    : (regionName ?? l10n.driverStatusOffline),
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
            DrawerSectionLabel(l10n.driverDrawerWorkSection),
            DrawerItem(
                label: l10n.driverTabLine,
                icon: Icons.power_settings_new_rounded,
                active: activeTab == 0,
                onTap: () => onTab(0)),
            DrawerItem(
                label: l10n.driverTabOrders,
                icon: Icons.receipt_long_rounded,
                active: activeTab == 1,
                onTap: () => onTab(1)),
            DrawerItem(
                label: l10n.driverTabTrip,
                icon: Icons.route_rounded,
                active: activeTab == 2,
                onTap: () => onTab(2)),
            DrawerItem(
                // Same key the bottom bar uses. The drawer had its own
                // "brand" string for this screen, which put a Latin-script
                // name in the middle of a Cyrillic list and gave one screen
                // two names in one app.
                label: l10n.driverTabNavigator,
                icon: Icons.explore_rounded,
                active: activeTab == 3,
                onTap: () => onTab(3)),
            const Divider(height: 20, indent: 24, endIndent: 24),
            DrawerSectionLabel(l10n.passengerSettingsAccountGroup),
            DrawerItem(
                label: l10n.profile,
                icon: Icons.person_rounded,
                active: false,
                onTap: onProfile),
            DrawerItem(
                label: l10n.driverDrawerWallet,
                icon: Icons.account_balance_wallet_rounded,
                active: false,
                onTap: onWallet),
            DrawerItem(
                label: l10n.driverDrawerRating,
                icon: Icons.star_rounded,
                active: false,
                onTap: onRating),
            const Divider(height: 20, indent: 24, endIndent: 24),
            DrawerSectionLabel(l10n.driverDrawerServiceSection),
            DrawerItem(
                label: l10n.driverDrawerNotifications,
                icon: Icons.notifications_rounded,
                active: false,
                onTap: onNotifications),
            DrawerItem(
                label: l10n.driverDrawerRoadAlerts,
                icon: Icons.shield_rounded,
                active: false,
                onTap: onRoadAlerts),
            DrawerItem(
                label: l10n.passengerDrawerRecurringBookings,
                icon: Icons.event_repeat_rounded,
                active: false,
                onTap: onRecurringBookings),
            const Divider(height: 20, indent: 24, endIndent: 24),
            DrawerSectionLabel(l10n.passengerDrawerHelpSection),
            DrawerItem(
                label: l10n.support,
                icon: Icons.support_agent_rounded,
                active: false,
                onTap: onSupport),
            DrawerItem(
                label: l10n.driverFaqTitle,
                icon: Icons.help_rounded,
                active: false,
                onTap: onFaq),
            DrawerItem(
                label: l10n.passengerDrawerAboutUs,
                icon: Icons.info_rounded,
                active: false,
                onTap: onAbout),
            DrawerItem(
                label: l10n.settings,
                icon: Icons.settings_rounded,
                active: false,
                onTap: onSettings),
            const Divider(height: 20, indent: 24, endIndent: 24),
            DrawerItem(
                label: l10n.driverDrawerPassengerMode,
                icon: Icons.swap_horiz_rounded,
                active: false,
                onTap: onPassenger),
            DrawerItem(
                label: l10n.logOut,
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
