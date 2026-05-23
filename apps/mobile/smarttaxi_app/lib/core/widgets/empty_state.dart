import 'package:flutter/material.dart';

import '../theme/app_theme.dart';

class EmptyState extends StatelessWidget {
  const EmptyState({super.key, required this.title, required this.text});

  final String title;
  final String text;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 28),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 62,
              height: 62,
              decoration: BoxDecoration(
                color: SmartTaxiColors.cardWarm,
                border: Border.all(color: SmartTaxiColors.border),
                borderRadius: BorderRadius.circular(22),
              ),
              child: const Icon(Icons.route_outlined, color: SmartTaxiColors.goldDeep),
            ),
            const SizedBox(height: 14),
            Text(title, textAlign: TextAlign.center, style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w800)),
            const SizedBox(height: 8),
            Text(
              text,
              textAlign: TextAlign.center,
              style: const TextStyle(color: SmartTaxiColors.textSecondary, fontSize: 14, height: 1.35),
            ),
          ],
        ),
      ),
    );
  }
}
