import 'package:flutter/material.dart';

import '../theme/app_theme.dart';

class EmptyState extends StatelessWidget {
  const EmptyState(
      {super.key,
      required this.title,
      required this.text,
      this.icon,
      this.action,
      this.onAction});

  final String title;
  final String text;
  final IconData? icon;
  final String? action;
  final VoidCallback? onAction;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 430),
        child: Container(
          width: double.infinity,
          margin: const EdgeInsets.symmetric(vertical: 4),
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 26),
          decoration: BoxDecoration(
            color: context.palette.cardWarm,
            border: Border.all(color: context.palette.border),
            borderRadius: BorderRadius.circular(28),
            boxShadow: const [
              BoxShadow(
                color: Color(0x0f102a52),
                blurRadius: 28,
                offset: Offset(0, 14),
              ),
            ],
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 72,
                height: 72,
                decoration: BoxDecoration(
                  color: context.palette.card,
                  border: Border.all(color: context.palette.borderStrong),
                  borderRadius: BorderRadius.circular(26),
                  boxShadow: const [
                    BoxShadow(
                        color: Color(0x14102a52),
                        blurRadius: 24,
                        offset: Offset(0, 12))
                  ],
                ),
                child: Icon(icon ?? Icons.route_outlined,
                    color: context.palette.goldDeep, size: 31),
              ),
              const SizedBox(height: 16),
              Text(title,
                  textAlign: TextAlign.center,
                  style: TextStyle(
                      color: context.palette.text,
                      fontSize: 17.5,
                      height: 1.2,
                      fontWeight: FontWeight.w900)),
              const SizedBox(height: 8),
              Text(
                text,
                textAlign: TextAlign.center,
                style: TextStyle(
                    color: context.palette.textSecondary,
                    fontSize: 14,
                    height: 1.38,
                    fontWeight: FontWeight.w600),
              ),
              if (action != null && onAction != null) ...[
                const SizedBox(height: 18),
                SizedBox(
                  width: double.infinity,
                  child: ElevatedButton(
                    onPressed: onAction,
                    child: Text(action!),
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}
