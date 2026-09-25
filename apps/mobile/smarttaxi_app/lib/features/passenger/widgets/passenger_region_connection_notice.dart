import 'package:flutter/material.dart';

import '../../../core/theme/app_theme.dart';
import '../../../l10n/app_localizations.dart';

class PassengerRegionConnectionNotice extends StatelessWidget {
  const PassengerRegionConnectionNotice({
    super.key,
    required this.loading,
    required this.onRetry,
  });

  final bool loading;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final l10n = AppLocalizations.of(context);
    return Semantics(
      container: true,
      liveRegion: true,
      child: Container(
        width: double.infinity,
        padding: const EdgeInsets.all(10),
        decoration: BoxDecoration(
          color: palette.brandSurface,
          border: Border.all(color: palette.brand.withValues(alpha: 0.20)),
          borderRadius: BorderRadius.circular(16),
          boxShadow: [
            BoxShadow(
              color: palette.brandDeep.withValues(alpha: 0.07),
              blurRadius: 20,
              offset: const Offset(0, 8),
            ),
          ],
        ),
        child: Row(
          children: [
            Container(
              width: 36,
              height: 36,
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  colors: [palette.brand, palette.brandDeep],
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                ),
                borderRadius: BorderRadius.circular(12),
              ),
              child: const Icon(
                Icons.sync_rounded,
                color: Colors.white,
                size: 20,
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    l10n.passengerActiveRegionsNotLoadedError,
                    style: TextStyle(
                      color: palette.text,
                      fontSize: 13,
                      height: 1.2,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    l10n.serverUnavailable,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      color: palette.textSecondary,
                      fontSize: 11,
                      height: 1.3,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(width: 8),
            OutlinedButton.icon(
              onPressed: loading ? null : onRetry,
              icon: loading
                  ? SizedBox(
                      width: 14,
                      height: 14,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        color: palette.brandDeep,
                      ),
                    )
                  : Icon(
                      Icons.refresh_rounded,
                      size: 16,
                      color: palette.brandDeep,
                    ),
              label: Text(l10n.retry),
              style: OutlinedButton.styleFrom(
                foregroundColor: palette.brandDeep,
                minimumSize: const Size(0, 38),
                padding: const EdgeInsets.symmetric(horizontal: 10),
                side: BorderSide(
                  color: palette.brand.withValues(alpha: 0.22),
                ),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
                textStyle: const TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
