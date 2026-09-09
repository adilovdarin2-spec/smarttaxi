import 'package:flutter/material.dart';

import '../theme/app_theme.dart';

/// One tariff decision, with the name and fare kept out of competing columns.
class TariffChoiceCard extends StatelessWidget {
  const TariffChoiceCard(
      {super.key,
      required this.title,
      required this.subtitle,
      required this.price,
      required this.art,
      required this.selected,
      required this.onTap});

  final String title;
  final String subtitle;
  final String price;
  final Widget art;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    return Semantics(
      button: true,
      selected: selected,
      child: Material(
        color: selected ? palette.brandSurface : palette.card,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(20),
          side: BorderSide(
              color: selected ? palette.brand : palette.border,
              width: selected ? 1.5 : 1),
        ),
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(20),
          child: Padding(
            padding: const EdgeInsets.all(14),
            child: Row(children: [
              SizedBox(width: 76, height: 64, child: Center(child: art)),
              const SizedBox(width: 14),
              Expanded(
                  child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                    Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Expanded(
                              child: Text(title,
                                  style: TextStyle(
                                      color: palette.text,
                                      fontSize: 16,
                                      height: 1.25,
                                      fontWeight: FontWeight.w600))),
                          const SizedBox(width: 8),
                          Container(
                              width: 20,
                              height: 20,
                              decoration: BoxDecoration(
                                shape: BoxShape.circle,
                                color: selected
                                    ? palette.brand
                                    : Colors.transparent,
                                border: Border.all(
                                    color: selected
                                        ? palette.brand
                                        : palette.borderStrong),
                              ),
                              child: selected
                                  ? const Icon(Icons.check_rounded,
                                      size: 14, color: Colors.white)
                                  : null),
                        ]),
                    const SizedBox(height: 6),
                    Text(subtitle,
                        style: TextStyle(
                            color: palette.textSecondary,
                            fontSize: 11,
                            height: 1.35,
                            fontWeight: FontWeight.w400)),
                    const SizedBox(height: 8),
                    Text(price,
                        style: TextStyle(
                            color: palette.text,
                            fontSize: 19,
                            height: 1.1,
                            fontWeight: FontWeight.w600,
                            letterSpacing: -.3)),
                  ])),
            ]),
          ),
        ),
      ),
    );
  }
}
