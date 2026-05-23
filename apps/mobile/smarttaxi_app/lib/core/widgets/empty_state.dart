import 'package:flutter/material.dart';

import '../theme/app_theme.dart';

class EmptyState extends StatelessWidget {
  const EmptyState(
      {super.key, required this.title, required this.text, this.icon});

  final String title;
  final String text;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Container(
        width: double.infinity,
        margin: const EdgeInsets.symmetric(vertical: 4),
        padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 24),
        decoration: BoxDecoration(
          color: SmartTaxiColors.cardWarm,
          border: Border.all(color: SmartTaxiColors.border),
          borderRadius: BorderRadius.circular(26),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 68,
              height: 68,
              decoration: BoxDecoration(
                color: Colors.white,
                border: Border.all(color: SmartTaxiColors.borderStrong),
                borderRadius: BorderRadius.circular(24),
                boxShadow: const [
                  BoxShadow(
                      color: Color(0x12785a14),
                      blurRadius: 22,
                      offset: Offset(0, 10))
                ],
              ),
              child: Icon(icon ?? Icons.route_outlined,
                  color: SmartTaxiColors.goldDeep, size: 30),
            ),
            const SizedBox(height: 14),
            Text(title,
                textAlign: TextAlign.center,
                style:
                    const TextStyle(fontSize: 17, fontWeight: FontWeight.w800)),
            const SizedBox(height: 8),
            Text(
              text,
              textAlign: TextAlign.center,
              style: const TextStyle(
                  color: SmartTaxiColors.textSecondary,
                  fontSize: 14,
                  height: 1.35),
            ),
          ],
        ),
      ),
    );
  }
}
