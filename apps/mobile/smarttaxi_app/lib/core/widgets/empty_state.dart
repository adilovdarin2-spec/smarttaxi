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
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 430),
        child: Container(
          width: double.infinity,
          margin: const EdgeInsets.symmetric(vertical: 4),
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 26),
          decoration: BoxDecoration(
            color: SmartTaxiColors.cardWarm,
            border: Border.all(color: SmartTaxiColors.border),
            borderRadius: BorderRadius.circular(28),
            boxShadow: const [
              BoxShadow(
                color: Color(0x0f785a14),
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
                  color: Colors.white,
                  border: Border.all(color: SmartTaxiColors.borderStrong),
                  borderRadius: BorderRadius.circular(26),
                  boxShadow: const [
                    BoxShadow(
                        color: Color(0x14785a14),
                        blurRadius: 24,
                        offset: Offset(0, 12))
                  ],
                ),
                child: Icon(icon ?? Icons.route_outlined,
                    color: SmartTaxiColors.goldDeep, size: 31),
              ),
              const SizedBox(height: 16),
              Text(title,
                  textAlign: TextAlign.center,
                  style: const TextStyle(
                      fontSize: 17.5,
                      height: 1.2,
                      fontWeight: FontWeight.w900)),
              const SizedBox(height: 8),
              Text(
                text,
                textAlign: TextAlign.center,
                style: const TextStyle(
                    color: SmartTaxiColors.textSecondary,
                    fontSize: 14,
                    height: 1.38,
                    fontWeight: FontWeight.w600),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
