import 'package:flutter/material.dart';
import '../../../core/theme/app_theme.dart';
import '../../../l10n/app_localizations.dart';

/// Read-only route, deliberately distinct from the passenger's address inputs.
/// Never truncate a house number or entrance on a narrow screen.
class DriverRouteSummary extends StatelessWidget {
  const DriverRouteSummary(
      {super.key, required this.pickup, required this.dropoff});
  final String pickup;
  final String dropoff;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final palette = context.palette;
    Widget stop(String caption, String address, bool destination) => Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            SizedBox(
                width: 24,
                child: Padding(
                  padding: const EdgeInsets.only(top: 5),
                  child: Icon(
                      destination
                          ? Icons.stop_rounded
                          : Icons.radio_button_checked_rounded,
                      size: 16,
                      color: destination ? palette.brand : palette.text),
                )),
            const SizedBox(width: 10),
            Expanded(
                child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                  Text(caption,
                      style: TextStyle(
                          color: palette.textSecondary,
                          fontSize: 12,
                          height: 1.4)),
                  const SizedBox(height: 3),
                  Text(address,
                      style: TextStyle(
                          color: palette.text,
                          fontSize: 15,
                          height: 1.4,
                          fontWeight: FontWeight.w600)),
                ])),
          ],
        );
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      stop(l10n.passengerFromLabel, pickup, false),
      Padding(
          padding: const EdgeInsets.only(left: 11, top: 5, bottom: 5),
          child: Align(
              alignment: Alignment.centerLeft,
              child: Container(
                  width: 2, height: 16, color: palette.borderStrong))),
      stop(l10n.passengerToLabel, dropoff, true),
    ]);
  }
}
