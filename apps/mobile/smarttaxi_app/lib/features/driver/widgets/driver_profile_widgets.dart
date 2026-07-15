import 'package:flutter/material.dart';

import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/status_pill.dart';
import '../../shared/models.dart';
import '../models/driver_shell_helpers.dart';
import 'driver_common_widgets.dart';

class DriverProfileRow extends StatelessWidget {
  const DriverProfileRow({super.key, required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(
            label,
            style: TextStyle(
              color: context.palette.textSecondary,
              fontSize: 13,
              fontWeight: FontWeight.w600,
            ),
          ),
          Text(
            value,
            style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w800),
          ),
        ],
      ),
    );
  }
}

class DriverTripHistoryCard extends StatelessWidget {
  const DriverTripHistoryCard({super.key, required this.trip});

  final OrderSummary trip;

  StatusTone get _tone {
    const success = {'TRIP_COMPLETED', 'PAID', 'RATED', 'COMPLETED'};
    const danger = {
      'CANCELLED_BY_DRIVER',
      'CANCELLED_BY_CLIENT',
      'CANCELLED_BY_OPERATOR',
      'NO_SHOW',
      'CANCELLED',
    };
    if (success.contains(trip.status)) return StatusTone.success;
    if (danger.contains(trip.status)) return StatusTone.danger;
    return StatusTone.neutral;
  }

  @override
  Widget build(BuildContext context) {
    return PremiumCard(
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  formatTripHistoryDate(trip.createdAt),
                  style: TextStyle(
                    fontSize: 11.5,
                    fontWeight: FontWeight.w800,
                    color: context.palette.textSecondary,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  '${trip.pickup} → ${trip.dropoff}',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                const SizedBox(height: 6),
                StatusPill(label: statusLabel(trip.status), tone: _tone),
              ],
            ),
          ),
          const SizedBox(width: 10),
          if (trip.price != null)
            Text(
              formatDriverMoney(trip.price!.round()),
              style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w900),
            ),
        ],
      ),
    );
  }
}

class DriverSupportTopicChip extends StatelessWidget {
  const DriverSupportTopicChip({
    super.key,
    required this.label,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: selected ? context.palette.gold : context.palette.goldSurface,
      borderRadius: BorderRadius.circular(999),
      child: InkWell(
        borderRadius: BorderRadius.circular(999),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 9),
          child: Text(
            label,
            style: TextStyle(
              color: selected ? Colors.white : context.palette.text,
              fontSize: 12.5,
              fontWeight: FontWeight.w800,
            ),
          ),
        ),
      ),
    );
  }
}

class DriverFaqTile extends StatefulWidget {
  const DriverFaqTile({super.key, required this.question, required this.answer});

  final String question;
  final String answer;

  @override
  State<DriverFaqTile> createState() => _DriverFaqTileState();
}

class _DriverFaqTileState extends State<DriverFaqTile> {
  bool _expanded = false;

  @override
  Widget build(BuildContext context) {
    return PremiumCard(
      child: InkWell(
        onTap: () => setState(() => _expanded = !_expanded),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    widget.question,
                    style: const TextStyle(
                        fontSize: 14.5, fontWeight: FontWeight.w800),
                  ),
                ),
                Icon(
                  _expanded
                      ? Icons.keyboard_arrow_up_rounded
                      : Icons.keyboard_arrow_down_rounded,
                  color: context.palette.textSecondary,
                ),
              ],
            ),
            if (_expanded) ...[
              const SizedBox(height: 8),
              Text(
                widget.answer,
                style: TextStyle(
                  color: context.palette.textSecondary,
                  fontSize: 13,
                  height: 1.4,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class DriverSettingsGroup extends StatelessWidget {
  const DriverSettingsGroup({super.key, required this.title, required this.children});

  final String title;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    return PremiumCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            title,
            style: TextStyle(
              color: context.palette.textSecondary,
              fontSize: 11.5,
              fontWeight: FontWeight.w900,
              letterSpacing: 0.3,
            ),
          ),
          const SizedBox(height: 8),
          for (final child in children) child,
        ],
      ),
    );
  }
}

class DriverSettingsRow extends StatelessWidget {
  const DriverSettingsRow({
    super.key,
    required this.title,
    required this.text,
    this.onTap,
    this.danger = false,
  });

  final String title;
  final String text;
  final VoidCallback? onTap;
  final bool danger;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(14),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 10),
        child: Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    style: TextStyle(
                      color: danger
                          ? context.palette.danger
                          : context.palette.text,
                      fontSize: 14,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    text,
                    style: TextStyle(
                      color: context.palette.textSecondary,
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ],
              ),
            ),
            if (onTap != null)
              Icon(Icons.chevron_right_rounded,
                  color: context.palette.textMuted),
          ],
        ),
      ),
    );
  }
}
