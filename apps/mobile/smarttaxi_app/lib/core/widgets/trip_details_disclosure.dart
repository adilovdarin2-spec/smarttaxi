import 'package:flutter/material.dart';

import '../theme/app_theme.dart';

/// Secondary trip data must not push contact/cancel actions below the fold.
/// Keep full addresses accessible, with native keyboard/semantics support.
class TripDetailsDisclosure extends StatelessWidget {
  const TripDetailsDisclosure({
    super.key,
    required this.title,
    required this.child,
  });

  final String title;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final shape = RoundedRectangleBorder(
      borderRadius: BorderRadius.circular(18),
      side: BorderSide(color: palette.border),
    );
    return ExpansionTile(
      title: Text(title,
          style: TextStyle(
              color: palette.text, fontSize: 14, fontWeight: FontWeight.w600)),
      leading: Icon(Icons.route_rounded, size: 20, color: palette.brand),
      tilePadding: const EdgeInsets.symmetric(horizontal: 14),
      childrenPadding: const EdgeInsets.fromLTRB(10, 0, 10, 12),
      shape: shape,
      collapsedShape: shape,
      backgroundColor: palette.card,
      collapsedBackgroundColor: palette.card,
      children: [child],
    );
  }
}

/// Expanded details deliberately wrap: a house number must not disappear
/// behind an ellipsis when the rider opens the complete trip information.
class TripAddressDetails extends StatelessWidget {
  const TripAddressDetails({
    super.key,
    required this.fromLabel,
    required this.toLabel,
    required this.pickup,
    required this.dropoff,
  });

  final String fromLabel;
  final String toLabel;
  final String pickup;
  final String dropoff;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    Widget row(String label, String address, IconData icon, Color color) => Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Padding(
              padding: const EdgeInsets.only(top: 2),
              child: Icon(icon, color: color, size: 20),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(label,
                      style: TextStyle(
                          color: palette.textSecondary, fontSize: 12)),
                  const SizedBox(height: 3),
                  Text(address,
                      style: TextStyle(
                          color: palette.text,
                          fontSize: 14,
                          height: 1.4,
                          fontWeight: FontWeight.w500)),
                ],
              ),
            ),
          ],
        );
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 8),
      child: Column(children: [
        row(fromLabel, pickup, Icons.radio_button_checked, palette.brand),
        Divider(height: 24, color: palette.border),
        row(toLabel, dropoff, Icons.location_on_rounded, palette.text),
      ]),
    );
  }
}
