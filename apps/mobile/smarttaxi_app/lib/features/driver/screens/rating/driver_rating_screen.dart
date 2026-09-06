import 'dart:async';

import 'package:flutter/material.dart';

import '../../../../core/api/api_client.dart';
import '../../../../core/theme/app_theme.dart';
import '../../../../core/widgets/empty_state.dart';
import '../../../../l10n/app_localizations.dart';
import '../../models/driver_rating_models.dart';

class DriverRatingScreen extends StatefulWidget {
  const DriverRatingScreen({super.key, required this.api});

  final ApiClient api;

  @override
  State<DriverRatingScreen> createState() => _DriverRatingScreenState();
}

class _DriverRatingScreenState extends State<DriverRatingScreen> {
  bool _loading = true;
  String? _error;
  DriverRatingSummary? _summary;

  @override
  void initState() {
    super.initState();
    unawaited(_load());
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final summary = await widget.api.getDriverRatingSummary();
      if (!mounted) return;
      setState(() {
        _summary = summary;
        _loading = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _error = AppLocalizations.of(context).driverRatingLoadError;
        _loading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final l10n = AppLocalizations.of(context);
    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        padding: const EdgeInsets.all(20),
        physics: const AlwaysScrollableScrollPhysics(
          parent: BouncingScrollPhysics(),
        ),
        children: [
          Text(l10n.driverRatingTitle,
              style: SmartTaxiTextStyles.title.copyWith(color: palette.text)),
          const SizedBox(height: 4),
          Text(
            l10n.driverRatingSubtitle,
            style: SmartTaxiTextStyles.subtitle
                .copyWith(color: palette.textSecondary),
          ),
          const SizedBox(height: 16),
          if (_loading)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 40),
              child: Center(child: CircularProgressIndicator()),
            )
          else if (_error != null)
            EmptyState(
              title: l10n.driverRatingLoadError,
              text: _error!,
              icon: Icons.error_outline_rounded,
              action: l10n.retry,
              onAction: _load,
            )
          else if (_summary!.reviewCount == 0)
            EmptyState(
              title: l10n.driverRatingEmptyTitle,
              text: l10n.driverRatingEmptyText,
              icon: Icons.star_border_rounded,
            )
          else ...[
            _RatingHeroCard(summary: _summary!),
            const SizedBox(height: 20),
            if (_summary!.topTags.isNotEmpty) ...[
              Text(l10n.driverRatingTopTagsTitle,
                  style: SmartTaxiTextStyles.subtitle
                      .copyWith(color: palette.textSecondary)),
              const SizedBox(height: 10),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  for (final tag in _summary!.topTags)
                    Chip(
                      label: Text(l10n.driverTopTagLabel(
                          _ratingTagLabel(l10n, tag.tag), tag.count)),
                      backgroundColor: palette.brandSurface,
                      side: BorderSide.none,
                    ),
                ],
              ),
              const SizedBox(height: 20),
            ],
            Text(l10n.driverRatingRecentTitle,
                style: SmartTaxiTextStyles.subtitle
                    .copyWith(color: palette.textSecondary)),
            const SizedBox(height: 10),
            for (final review in _summary!.recent) ...[
              _ReviewRow(review: review),
              const SizedBox(height: 8),
            ],
          ],
        ],
      ),
    );
  }
}

class _RatingHeroCard extends StatelessWidget {
  const _RatingHeroCard({required this.summary});

  final DriverRatingSummary summary;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final l10n = AppLocalizations.of(context);
    final maxCount =
        summary.maxBreakdownCount == 0 ? 1 : summary.maxBreakdownCount;
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: palette.brandSurface,
        borderRadius: BorderRadius.circular(SmartTaxiRadius.lg),
        border: Border.all(color: palette.border),
        boxShadow: SmartTaxiShadows.card,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text(
                summary.rating.toStringAsFixed(2),
                style: TextStyle(
                  fontSize: 34,
                  fontWeight: FontWeight.w600,
                  color: palette.text,
                ),
              ),
              const SizedBox(width: 8),
              Padding(
                padding: const EdgeInsets.only(bottom: 6),
                child: Text(
                  l10n.driverReviewsCountLabel(summary.reviewCount),
                  style: TextStyle(
                    color: palette.textSecondary,
                    fontWeight: FontWeight.w500,
                    fontSize: 13,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),
          for (var star = 5; star >= 1; star--) ...[
            _BreakdownBar(
              star: star,
              count: summary.breakdown[star] ?? 0,
              maxCount: maxCount,
            ),
            const SizedBox(height: 6),
          ],
        ],
      ),
    );
  }
}

// Maps the stable English keys the driver rating tags are now stored as
// (see DriverTripCompletionCard._positiveTags/_negativeTags in
// driver_order_widgets.dart) back to a localized display label. Falls back
// to the raw tag for older reviews rated before that refactor, whose tags
// are still free-text Russian in the database.
String _ratingTagLabel(AppLocalizations l10n, String tag) {
  return {
        'polite_passenger': l10n.driverRatingTagPolitePassenger,
        'waited_at_pickup': l10n.driverRatingTagWaitedAtPickup,
        'exact_address': l10n.driverRatingTagExactAddress,
        'on_time_exit': l10n.driverRatingTagOnTimeExit,
        'long_no_show': l10n.driverRatingTagLongNoShow,
        'rude_communication': l10n.driverRatingTagRudeCommunication,
        'wrong_address': l10n.driverRatingTagWrongAddress,
        'dirty_interior': l10n.driverRatingTagDirtyInterior,
      }[tag] ??
      tag;
}

class _BreakdownBar extends StatelessWidget {
  const _BreakdownBar({
    required this.star,
    required this.count,
    required this.maxCount,
  });

  final int star;
  final int count;
  final int maxCount;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final ratio = maxCount == 0 ? 0.0 : count / maxCount;
    return Row(
      children: [
        SizedBox(
          width: 14,
          child: Text('$star',
              style: TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w500,
                  color: palette.text)),
        ),
        const SizedBox(width: 4),
        Icon(Icons.star_rounded, size: 14, color: palette.brand),
        const SizedBox(width: 8),
        Expanded(
          child: ClipRRect(
            borderRadius: BorderRadius.circular(6),
            child: LinearProgressIndicator(
              value: ratio,
              minHeight: 8,
              backgroundColor: palette.card,
              valueColor: AlwaysStoppedAnimation(palette.brand),
            ),
          ),
        ),
        const SizedBox(width: 8),
        SizedBox(
          width: 24,
          child: Text('$count',
              textAlign: TextAlign.right,
              // textSecondary, not textMuted — this count is real information,
              // and textMuted's contrast against the background fails WCAG AA
              // (~2.5:1, needs 4.5:1) for text this size.
              style: TextStyle(fontSize: 12, color: palette.textSecondary)),
        ),
      ],
    );
  }
}

class _ReviewRow extends StatelessWidget {
  const _ReviewRow({required this.review});

  final DriverReviewItem review;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: palette.card,
        border: Border.all(color: palette.border),
        borderRadius: BorderRadius.circular(16),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Row(
                children: List.generate(
                  5,
                  (index) => Icon(
                    index < review.rating
                        ? Icons.star_rounded
                        : Icons.star_border_rounded,
                    size: 16,
                    color: palette.brand,
                  ),
                ),
              ),
              const Spacer(),
              if (review.orderShortId != null)
                Text('№ ${review.orderShortId}',
                    style: TextStyle(
                        color: palette.textSecondary, fontSize: 11.5)),
            ],
          ),
          if (review.tags.isNotEmpty) ...[
            const SizedBox(height: 8),
            Wrap(
              spacing: 6,
              runSpacing: 6,
              children: [
                for (final tag in review.tags)
                  Container(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                    decoration: BoxDecoration(
                      color: palette.cardWarm,
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: Text(tag,
                        style: TextStyle(
                            fontSize: 11.5,
                            fontWeight: FontWeight.w600,
                            color: palette.text)),
                  ),
              ],
            ),
          ],
          if (review.comment != null) ...[
            const SizedBox(height: 8),
            Text(review.comment!,
                style:
                    TextStyle(fontSize: 13, height: 1.35, color: palette.text)),
          ],
        ],
      ),
    );
  }
}
