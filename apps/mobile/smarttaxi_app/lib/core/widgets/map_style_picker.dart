import 'package:flutter/material.dart';

import '../map/map_style.dart';
import '../theme/app_theme.dart';
import '../../l10n/app_localizations.dart';

/// The icon that stands for a style everywhere it is offered, so the button on
/// the map and the row inside the sheet always agree.
IconData mapStyleIcon(MapStyleChoice style) => switch (style) {
      MapStyleChoice.threeD => Icons.view_in_ar_rounded,
      MapStyleChoice.twoD => Icons.map_rounded,
      MapStyleChoice.satellite => Icons.satellite_alt_rounded,
    };

String mapStyleTitle(AppLocalizations l10n, MapStyleChoice style) =>
    switch (style) {
      MapStyleChoice.threeD => l10n.mapStyle3d,
      MapStyleChoice.twoD => l10n.mapStyle2d,
      MapStyleChoice.satellite => l10n.mapStyleSatellite,
    };

String mapStyleDescription(AppLocalizations l10n, MapStyleChoice style) =>
    switch (style) {
      MapStyleChoice.threeD => l10n.mapStyle3dDescription,
      MapStyleChoice.twoD => l10n.mapStyle2dDescription,
      MapStyleChoice.satellite => l10n.mapStyleSatelliteDescription,
    };

/// Asks which of the three the map should be drawn as.
///
/// Returns the chosen style, or null if the sheet was dismissed. The caller
/// stores it; nothing here writes a preference, so the same sheet serves the
/// rider and the driver.
Future<MapStyleChoice?> showMapStylePicker(
  BuildContext context, {
  required MapStyleChoice current,
}) {
  return showModalBottomSheet<MapStyleChoice>(
    context: context,
    backgroundColor: Colors.transparent,
    builder: (context) => _MapStyleSheet(current: current),
  );
}

class _MapStyleSheet extends StatelessWidget {
  const _MapStyleSheet({required this.current});

  final MapStyleChoice current;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final palette = context.palette;
    return SafeArea(
      top: false,
      child: Container(
        margin: const EdgeInsets.fromLTRB(12, 0, 12, 12),
        padding: const EdgeInsets.fromLTRB(18, 14, 18, 18),
        decoration: BoxDecoration(
          color: palette.card,
          borderRadius: BorderRadius.circular(26),
          border: Border.all(color: palette.border),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Center(
              child: Container(
                width: 42,
                height: 4,
                decoration: BoxDecoration(
                  color: palette.border,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
            ),
            const SizedBox(height: 16),
            Text(
              l10n.mapStyleTitle,
              style: TextStyle(
                fontSize: 18,
                fontWeight: FontWeight.w700,
                color: palette.text,
              ),
            ),
            const SizedBox(height: 14),
            for (final style in MapStyleChoice.available)
              Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: _MapStyleOption(
                  style: style,
                  selected: style == current,
                  onTap: () => Navigator.of(context).pop(style),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class _MapStyleOption extends StatelessWidget {
  const _MapStyleOption({
    required this.style,
    required this.selected,
    required this.onTap,
  });

  final MapStyleChoice style;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final palette = context.palette;
    return Semantics(
      selected: selected,
      button: true,
      child: Material(
        color: selected
            ? palette.brand.withValues(alpha: 0.10)
            : palette.appBackground,
        borderRadius: BorderRadius.circular(18),
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(18),
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 13),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(18),
              border: Border.all(
                color: selected ? palette.brand : palette.border,
                width: selected ? 1.6 : 1,
              ),
            ),
            child: Row(
              children: [
                Icon(
                  mapStyleIcon(style),
                  size: 24,
                  color: selected ? palette.brand : palette.textSecondary,
                ),
                const SizedBox(width: 13),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        mapStyleTitle(l10n, style),
                        style: TextStyle(
                          fontSize: 15,
                          fontWeight: FontWeight.w700,
                          color: palette.text,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        mapStyleDescription(l10n, style),
                        style: TextStyle(
                          fontSize: 12.5,
                          height: 1.3,
                          color: palette.textSecondary,
                        ),
                      ),
                    ],
                  ),
                ),
                if (selected)
                  Icon(Icons.check_circle_rounded,
                      size: 21, color: palette.brand),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
