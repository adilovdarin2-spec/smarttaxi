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
          padding: const EdgeInsets.all(20),
          decoration: BoxDecoration(
            color: context.palette.card,
            border: Border.all(color: context.palette.border),
            borderRadius: BorderRadius.circular(18),
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 44,
                height: 44,
                decoration: BoxDecoration(
                  color: context.palette.brandSurface,
                  shape: BoxShape.circle,
                ),
                child: Icon(icon ?? Icons.route_outlined,
                    color: context.palette.brandDeep, size: 24),
              ),
              const SizedBox(height: 12),
              Text(title,
                  textAlign: TextAlign.start,
                  style: TextStyle(
                      color: context.palette.text,
                      fontSize: 16,
                      height: 1.2,
                      fontWeight: FontWeight.w600)),
              const SizedBox(height: 8),
              Text(
                text,
                textAlign: TextAlign.start,
                style: TextStyle(
                    color: context.palette.textSecondary,
                    fontSize: 13,
                    height: 1.38,
                    fontWeight: FontWeight.w400),
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
