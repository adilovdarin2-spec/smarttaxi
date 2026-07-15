import 'dart:async';

import 'package:flutter/material.dart';

import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/route_fields.dart';
import '../../../core/widgets/status_pill.dart';
import '../../shared/models.dart';
import '../models/driver_shell_helpers.dart';
import 'driver_common_widgets.dart';

class DriverStatusStepper extends StatelessWidget {
  const DriverStatusStepper({super.key, required this.status});

  final String status;

  @override
  Widget build(BuildContext context) {
    const steps = [
      'DRIVER_FOUND',
      'DRIVER_GOING_TO_CLIENT',
      'DRIVER_ARRIVED',
      'WAITING_CLIENT',
      'TRIP_STARTED',
      'TRIP_COMPLETED',
    ];
    const labels = [
      'Принят',
      'Едет',
      'Прибыл',
      'Ждём',
      'В пути',
      'Финиш',
    ];
    const aliases = {
      'DRIVER_ASSIGNED': 'DRIVER_FOUND',
      'IN_PROGRESS': 'TRIP_STARTED',
      'COMPLETED': 'TRIP_COMPLETED',
      'PAYMENT_PENDING': 'TRIP_COMPLETED',
      'PAID': 'TRIP_COMPLETED',
      'RATED': 'TRIP_COMPLETED',
    };
    final normalized = aliases[status] ?? status;
    final rawIndex = steps.indexOf(normalized);
    final index =
        rawIndex < 0 ? 0 : rawIndex.clamp(0, steps.length - 1).toInt();
    return Row(
      children: List.generate(steps.length, (stepIndex) {
        final done = stepIndex <= index;
        return Expanded(
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 180),
            margin:
                EdgeInsets.only(right: stepIndex == steps.length - 1 ? 0 : 6),
            padding: const EdgeInsets.symmetric(vertical: 10),
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: done ? context.palette.goldPale : Colors.white,
              border: Border.all(
                  color: done
                      ? context.palette.borderStrong
                      : context.palette.border),
              borderRadius: BorderRadius.circular(14),
            ),
            child: FittedBox(
              fit: BoxFit.scaleDown,
              child: Text(labels[stepIndex],
                  maxLines: 1,
                  style: const TextStyle(
                      fontSize: 11, fontWeight: FontWeight.w900)),
            ),
          ),
        );
      }),
    );
  }
}

class OrderCard extends StatelessWidget {
  const OrderCard({
    super.key,
    required this.order,
    required this.accepting,
    required this.rejecting,
    required this.onAccept,
    required this.onReject,
    this.onOfferPrice,
  });

  final OrderSummary order;
  final bool accepting;
  final bool rejecting;
  final VoidCallback onAccept;
  final VoidCallback onReject;
  // Null hides the "своя цена" row entirely — used once the driver has
  // already accepted the order (torg only makes sense on an open one).
  final VoidCallback? onOfferPrice;

  @override
  Widget build(BuildContext context) {
    final priceLabel = order.price == null
        ? 'Цена после расчёта'
        : formatDriverMoney(order.price!.round());
    final meta = routeMeta(order);
    final payment = driverPaymentLabel(order.paymentMethod);
    final phone = (order.riderPhone ?? '').trim();
    final riderName = (order.riderName ?? '').trim();
    return TweenAnimationBuilder<double>(
      tween: Tween(begin: 0.98, end: 1),
      duration: const Duration(milliseconds: 180),
      curve: Curves.easeOutCubic,
      builder: (context, value, child) =>
          Transform.scale(scale: value, child: child),
      child: PremiumCard(
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(
            children: [
              Container(
                width: 44,
                height: 44,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: context.palette.gold,
                  borderRadius: BorderRadius.circular(16),
                  boxShadow: const [
                    BoxShadow(
                      color: Color(0x33d4af37),
                      blurRadius: 18,
                      offset: Offset(0, 8),
                    )
                  ],
                ),
                child: Icon(Icons.local_taxi_rounded,
                    color: context.palette.text, size: 24),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: SectionLabel(
                  title: 'Новый заказ',
                  text: order.tariff == null || order.tariff!.isEmpty
                      ? 'Рабочий регион'
                      : 'Тариф ${order.tariff}',
                ),
              ),
              StatusPill(
                  label: statusLabel(order.status), tone: StatusTone.neutral),
            ],
          ),
          const SizedBox(height: 14),
          Container(
            width: double.infinity,
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
            decoration: BoxDecoration(
              color: context.palette.goldSurface,
              border: Border.all(color: context.palette.borderStrong),
              borderRadius: BorderRadius.circular(20),
            ),
            child: Row(
              children: [
                Expanded(
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Flexible(
                        child: Text(
                          priceLabel,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            fontSize: 28,
                            height: 1,
                            fontWeight: FontWeight.w900,
                          ),
                        ),
                      ),
                      if (order.offeredPriceKzt != null) ...[
                        const SizedBox(width: 8),
                        Container(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 8, vertical: 4),
                          decoration: BoxDecoration(
                            color: context.palette.success,
                            borderRadius: BorderRadius.circular(999),
                          ),
                          child: const Text(
                            'Своя цена',
                            style: TextStyle(
                              color: Colors.white,
                              fontSize: 10.5,
                              fontWeight: FontWeight.w900,
                            ),
                          ),
                        ),
                      ],
                    ],
                  ),
                ),
                DriverOrderChip(
                    icon: Icons.account_balance_wallet_rounded, label: payment),
              ],
            ),
          ),
          const SizedBox(height: 12),
          RouteFields(
              pickupLabel: order.pickup,
              dropoffLabel: order.dropoff,
              onPickupTap: null,
              onDropoffTap: null),
          if (meta != null || phone.isNotEmpty || riderName.isNotEmpty) ...[
            const SizedBox(height: 12),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                if (riderName.isNotEmpty)
                  DriverOrderChip(
                      icon: Icons.person_outline_rounded, label: riderName),
                if (meta != null)
                  DriverOrderChip(icon: Icons.route_rounded, label: meta),
                if (phone.isNotEmpty)
                  DriverOrderChip(icon: Icons.phone_rounded, label: phone),
              ],
            ),
          ],
          const SizedBox(height: 14),
          Row(
            children: [
              Expanded(
                child: OutlinedButton(
                  onPressed: accepting || rejecting ? null : onReject,
                  child: rejecting
                      ? const ButtonSpinner(text: 'Пропускаем...')
                      : const Text('Пропустить'),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                flex: 2,
                child: ElevatedButton(
                  onPressed: accepting || rejecting ? null : onAccept,
                  child: accepting
                      ? const ButtonSpinner(text: 'Принимаем...')
                      : const Text('Принять'),
                ),
              ),
            ],
          ),
          if (onOfferPrice != null) ...[
            const SizedBox(height: 10),
            if (order.driverOfferStatus == 'PENDING')
              Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(Icons.hourglass_top_rounded,
                      size: 15, color: context.palette.textSecondary),
                  const SizedBox(width: 6),
                  Text(
                    order.driverOfferPriceKzt == null
                        ? 'Ожидаем ответа клиента'
                        : 'Ожидаем ответа: ${formatDriverMoney(order.driverOfferPriceKzt!)}',
                    style: TextStyle(
                      color: context.palette.textSecondary,
                      fontSize: 12.5,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ],
              )
            else
              SizedBox(
                width: double.infinity,
                child: TextButton.icon(
                  onPressed: accepting || rejecting ? null : onOfferPrice,
                  icon: const Icon(Icons.local_offer_outlined, size: 17),
                  label: const Text('Предложить свою цену'),
                  style: TextButton.styleFrom(
                    foregroundColor: context.palette.goldDeep,
                  ),
                ),
              ),
          ],
        ]),
      ),
    );
  }
}

class DriverOrderChip extends StatelessWidget {
  const DriverOrderChip({super.key, required this.icon, required this.label});

  final IconData icon;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
      decoration: BoxDecoration(
        color: Colors.white,
        border: Border.all(color: context.palette.border),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 15, color: context.palette.goldDeep),
          const SizedBox(width: 6),
          ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 180),
            child: Text(
              label,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                color: context.palette.text,
                fontSize: 12,
                fontWeight: FontWeight.w900,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// Free-then-paid waiting timer shown while the driver is waiting at pickup
/// (WAITING_CLIENT). `freeWaitingUntil` is the server-precomputed expiry of
/// the free window (orders.routes.js sets waiting_started_at/
/// free_waiting_until on that transition from waitingStartedAt + the
/// tariff's freeWaitingMinutes) — comparing the local clock against it keeps
/// the paid/free split in sync with what TRIP_COMPLETED actually bills, and
/// it survives an app restart instead of resetting to zero. Ticks locally
/// off those fixed timestamps — self-contained so callers don't need to
/// wire up their own periodic rebuild.
class DriverWaitingTimerCard extends StatefulWidget {
  const DriverWaitingTimerCard({
    super.key,
    required this.waitingStartedAt,
    required this.freeWaitingUntil,
    required this.waitingPricePerMinute,
  });

  final DateTime waitingStartedAt;
  final DateTime? freeWaitingUntil;
  final int waitingPricePerMinute;

  @override
  State<DriverWaitingTimerCard> createState() =>
      _DriverWaitingTimerCardState();
}

class _DriverWaitingTimerCardState extends State<DriverWaitingTimerCard> {
  Timer? _timer;
  DateTime _now = DateTime.now();

  @override
  void initState() {
    super.initState();
    _timer = Timer.periodic(
        const Duration(seconds: 1), (_) => setState(() => _now = DateTime.now()));
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  String _fmt(Duration d) {
    final clamped = d.isNegative ? Duration.zero : d;
    final m = clamped.inMinutes.remainder(100).toString().padLeft(2, '0');
    final s = clamped.inSeconds.remainder(60).toString().padLeft(2, '0');
    return '$m:$s';
  }

  @override
  Widget build(BuildContext context) {
    final freeUntil = widget.freeWaitingUntil ?? widget.waitingStartedAt;
    final isPaid = _now.isAfter(freeUntil);
    final billableMinutes =
        isPaid ? (_now.difference(freeUntil).inSeconds / 60).ceil() : 0;
    final owedKzt = billableMinutes * widget.waitingPricePerMinute;

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: isPaid ? context.palette.dangerSoft : context.palette.goldSurface,
        border: Border.all(
            color: isPaid ? context.palette.danger : context.palette.border),
        borderRadius: BorderRadius.circular(18),
      ),
      child: Row(
        children: [
          Icon(
            isPaid ? Icons.timer_outlined : Icons.hourglass_top_rounded,
            color: isPaid ? context.palette.danger : context.palette.goldDeep,
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  isPaid ? 'Платное ожидание' : 'Бесплатное ожидание',
                  style: TextStyle(
                    fontSize: 12.5,
                    fontWeight: FontWeight.w800,
                    color: isPaid
                        ? context.palette.danger
                        : context.palette.textSecondary,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  _fmt(isPaid
                      ? _now.difference(freeUntil)
                      : freeUntil.difference(_now)),
                  style: TextStyle(
                    fontSize: 20,
                    fontWeight: FontWeight.w900,
                    color: context.palette.text,
                  ),
                ),
              ],
            ),
          ),
          if (isPaid && widget.waitingPricePerMinute > 0)
            Text(
              '+$owedKzt ₸',
              style: TextStyle(
                fontSize: 18,
                fontWeight: FontWeight.w900,
                color: context.palette.danger,
              ),
            ),
        ],
      ),
    );
  }
}
