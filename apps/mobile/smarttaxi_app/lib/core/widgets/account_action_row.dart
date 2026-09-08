import 'package:flutter/material.dart';

import '../theme/app_theme.dart';

/// Shared account/support row. Long labels wrap instead of squeezing the
/// action or overflowing on narrow devices and enlarged system text.
class AccountActionRow extends StatelessWidget {
  const AccountActionRow({
    super.key,
    required this.icon,
    required this.title,
    this.subtitle,
    this.onTap,
    this.selected,
    this.danger = false,
  });

  final IconData icon;
  final String title;
  final String? subtitle;
  final VoidCallback? onTap;
  final bool? selected;
  final bool danger;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final accent = danger ? palette.danger : palette.brandDeep;
    return Semantics(
      selected: selected,
      button: onTap != null,
      child: Material(
        color: selected == true ? palette.brandSurface : Colors.transparent,
        borderRadius: BorderRadius.circular(14),
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(14),
          child: ConstrainedBox(
            constraints: const BoxConstraints(minHeight: 64),
            child: Padding(
              padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 4),
              child: Row(
                children: [
                  Container(
                    width: 36,
                    height: 36,
                    decoration: BoxDecoration(
                      color: danger ? palette.dangerSoft : palette.brandSurface,
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Icon(icon, size: 20, color: accent),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(title,
                            style: TextStyle(
                              color: danger ? accent : palette.text,
                              fontSize: 14,
                              fontWeight: FontWeight.w500,
                              height: 1.35,
                            )),
                        if (subtitle != null && subtitle!.isNotEmpty) ...[
                          const SizedBox(height: 3),
                          Text(subtitle!,
                              style: TextStyle(
                                color: palette.textSecondary,
                                fontSize: 12,
                                fontWeight: FontWeight.w400,
                                height: 1.4,
                              )),
                        ],
                      ],
                    ),
                  ),
                  if (onTap != null) ...[
                    const SizedBox(width: 8),
                    Icon(
                        selected == true
                            ? Icons.check_circle_rounded
                            : Icons.chevron_right_rounded,
                        size: 20,
                        color: selected == true ? accent : palette.textMuted),
                  ],
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
