import 'dart:async';

import 'package:flutter/material.dart';

import '../../../../core/api/api_client.dart';
import '../../../../core/theme/app_theme.dart';
import '../../../../core/widgets/empty_state.dart';
import '../../../../core/widgets/status_pill.dart';
import '../../../../l10n/app_localizations.dart';
import '../../models/driver_wallet_models.dart';
import '../../widgets/driver_common_widgets.dart';
import 'driver_payout_request_sheet.dart';

String _money(int value) {
  final text = value.abs().toString().replaceAllMapped(
        RegExp(r'\B(?=(\d{3})+(?!\d))'),
        (_) => ' ',
      );
  return '${value < 0 ? '-' : ''}$text ₸';
}

String _timeAgo(AppLocalizations l10n, DateTime dateTime) {
  final diff = DateTime.now().difference(dateTime);
  if (diff.inMinutes < 1) return l10n.passengerTimeAgoJustNow;
  if (diff.inMinutes < 60) return l10n.passengerTimeAgoMinutes(diff.inMinutes);
  if (diff.inHours < 24) return l10n.passengerTimeAgoHours(diff.inHours);
  return l10n.passengerTimeAgoDays(diff.inDays);
}

StatusTone _payoutTone(PayoutRequest request) {
  if (request.isPaid) return StatusTone.success;
  if (request.isRejected || request.isCancelled) return StatusTone.danger;
  if (request.isApproved) return StatusTone.neutral;
  return StatusTone.warning;
}

String _payoutStatusLabel(AppLocalizations l10n, String status) {
  switch (status) {
    case 'PENDING':
      return l10n.driverPayoutStatusPending;
    case 'APPROVED':
      return l10n.driverPayoutStatusApproved;
    case 'PAID':
      return l10n.driverPayoutStatusPaid;
    case 'REJECTED':
      return l10n.driverPayoutStatusRejected;
    case 'CANCELLED':
      return l10n.driverPayoutStatusCancelled;
    default:
      return status;
  }
}

class DriverWalletScreen extends StatefulWidget {
  const DriverWalletScreen({super.key, required this.api});

  final ApiClient api;

  @override
  State<DriverWalletScreen> createState() => _DriverWalletScreenState();
}

class _DriverWalletScreenState extends State<DriverWalletScreen> {
  bool _loading = true;
  String? _error;
  WalletSummary? _summary;
  List<WalletTransaction> _transactions = const [];
  List<PayoutRequest> _payoutRequests = const [];

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
      final summaryFuture = widget.api.getWalletSummary();
      final transactionsFuture = widget.api.getWalletTransactions(limit: 30);
      final payoutFuture = widget.api.getPayoutRequests();
      final summary = await summaryFuture;
      final transactions = await transactionsFuture;
      final payoutRequests = await payoutFuture;
      if (!mounted) return;
      setState(() {
        _summary = summary;
        _transactions = transactions.items;
        _payoutRequests = payoutRequests;
        _loading = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _error = AppLocalizations.of(context).driverWalletLoadError;
        _loading = false;
      });
    }
  }

  Future<void> _openPayoutRequest() async {
    final summary = _summary;
    if (summary == null) return;
    final palette = context.palette;
    final created = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      backgroundColor: palette.appBackground,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
      ),
      builder: (context) => DriverPayoutRequestSheet(
        api: widget.api,
        summary: summary,
      ),
    );
    if (created == true) unawaited(_load());
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
          Text(l10n.driverWalletTitle,
              style: SmartTaxiTextStyles.title.copyWith(color: palette.text)),
          const SizedBox(height: 4),
          Text(
            l10n.driverWalletSubtitle,
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
              title: l10n.driverWalletLoadError,
              text: _error!,
              icon: Icons.error_outline_rounded,
              action: l10n.retry,
              onAction: _load,
            )
          else ...[
            _WalletBalanceCard(
              summary: _summary!,
              onRequestPayout: _openPayoutRequest,
            ),
            const SizedBox(height: 20),
            Text(l10n.driverWalletPayoutRequestsTitle,
                style: SmartTaxiTextStyles.subtitle
                    .copyWith(color: palette.textSecondary)),
            const SizedBox(height: 10),
            if (_payoutRequests.isEmpty)
              _WalletEmptyRow(text: l10n.driverWalletNoPayoutRequests)
            else
              for (final request in _payoutRequests) ...[
                _PayoutRequestRow(request: request),
                const SizedBox(height: 8),
              ],
            const SizedBox(height: 20),
            Text(l10n.driverWalletTransactionsTitle,
                style: SmartTaxiTextStyles.subtitle
                    .copyWith(color: palette.textSecondary)),
            const SizedBox(height: 10),
            if (_transactions.isEmpty)
              _WalletEmptyRow(text: l10n.driverWalletNoTransactions)
            else
              for (final transaction in _transactions) ...[
                _WalletTransactionRow(transaction: transaction),
                const SizedBox(height: 8),
              ],
          ],
        ],
      ),
    );
  }
}

class _WalletBalanceCard extends StatelessWidget {
  const _WalletBalanceCard({required this.summary, required this.onRequestPayout});

  final WalletSummary summary;
  final VoidCallback onRequestPayout;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final l10n = AppLocalizations.of(context);
    final canRequestPayout = summary.balanceKzt >= summary.minPayoutKzt;
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: palette.goldSurface,
        borderRadius: BorderRadius.circular(SmartTaxiRadius.lg),
        border: Border.all(color: palette.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(l10n.driverWalletBalanceLabel,
              style: SmartTaxiTextStyles.caption
                  .copyWith(color: palette.textSecondary)),
          const SizedBox(height: 4),
          Text(
            _money(summary.balanceKzt),
            style: TextStyle(
              fontSize: 32,
              fontWeight: FontWeight.w900,
              color: palette.text,
            ),
          ),
          if (summary.debtKzt > 0 || summary.pendingPayoutKzt > 0) ...[
            const SizedBox(height: 16),
            Container(
              decoration: BoxDecoration(
                border:
                    Border(top: BorderSide(color: palette.border, width: 1)),
              ),
              padding: const EdgeInsets.only(top: 12),
              child: Column(
                children: [
                  if (summary.debtKzt > 0)
                    _WalletBreakdownRow(
                      icon: Icons.warning_amber_rounded,
                      iconColor: palette.danger,
                      iconBg: palette.dangerSoft,
                      text: l10n.driverWalletDebtLabel(_money(summary.debtKzt)),
                      textColor: palette.danger,
                    ),
                  if (summary.debtKzt > 0 && summary.pendingPayoutKzt > 0)
                    const SizedBox(height: 8),
                  if (summary.pendingPayoutKzt > 0)
                    _WalletBreakdownRow(
                      icon: Icons.hourglass_top_rounded,
                      iconColor: palette.textSecondary,
                      iconBg: palette.card,
                      iconBorder: palette.border,
                      text: l10n.driverWalletPendingLabel(
                          _money(summary.pendingPayoutKzt)),
                      textColor: palette.textSecondary,
                    ),
                ],
              ),
            ),
          ],
          const SizedBox(height: 16),
          DriverGradientButton(
            text: l10n.driverWalletRequestPayoutButton,
            enabled: canRequestPayout,
            onTap: canRequestPayout ? onRequestPayout : null,
          ),
          if (!canRequestPayout) ...[
            const SizedBox(height: 8),
            Text(
              l10n.driverWalletMinPayoutNote(_money(summary.minPayoutKzt)),
              style: TextStyle(
                color: palette.textMuted,
                fontSize: 12,
                fontWeight: FontWeight.w600,
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _WalletBreakdownRow extends StatelessWidget {
  const _WalletBreakdownRow({
    required this.icon,
    required this.iconColor,
    required this.iconBg,
    required this.text,
    required this.textColor,
    this.iconBorder,
  });

  final IconData icon;
  final Color iconColor;
  final Color iconBg;
  final Color? iconBorder;
  final String text;
  final Color textColor;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Container(
          width: 26,
          height: 26,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color: iconBg,
            shape: BoxShape.circle,
            border: iconBorder == null ? null : Border.all(color: iconBorder!),
          ),
          child: Icon(icon, size: 14, color: iconColor),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: Text(
            text,
            style: TextStyle(
              color: textColor,
              fontWeight: FontWeight.w700,
              fontSize: 12.5,
            ),
          ),
        ),
      ],
    );
  }
}

class _PayoutRequestRow extends StatelessWidget {
  const _PayoutRequestRow({required this.request});

  final PayoutRequest request;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final l10n = AppLocalizations.of(context);
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: palette.card,
        border: Border.all(color: palette.border),
        borderRadius: BorderRadius.circular(16),
      ),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(_money(request.amountKzt),
                    style: TextStyle(
                        fontWeight: FontWeight.w800,
                        fontSize: 15,
                        color: palette.text)),
                const SizedBox(height: 2),
                Text(_timeAgo(l10n, request.createdAt),
                    style:
                        TextStyle(color: palette.textMuted, fontSize: 11.5)),
                if (request.isRejected && request.rejectionReason != null) ...[
                  const SizedBox(height: 4),
                  Text(
                    request.rejectionReason!,
                    style: TextStyle(
                      color: palette.danger,
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ],
              ],
            ),
          ),
          StatusPill(
            label: _payoutStatusLabel(l10n, request.status),
            tone: _payoutTone(request),
          ),
        ],
      ),
    );
  }
}

class _WalletTransactionRow extends StatelessWidget {
  const _WalletTransactionRow({required this.transaction});

  final WalletTransaction transaction;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final l10n = AppLocalizations.of(context);
    final isCharge = transaction.isDebtCharge;
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: palette.card,
        border: Border.all(color: palette.border),
        borderRadius: BorderRadius.circular(16),
      ),
      child: Row(
        children: [
          Container(
            width: 36,
            height: 36,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: isCharge ? palette.dangerSoft : palette.successSoft,
              shape: BoxShape.circle,
            ),
            child: Icon(
              isCharge
                  ? Icons.south_west_rounded
                  : Icons.north_east_rounded,
              size: 18,
              color: isCharge ? palette.danger : palette.success,
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  isCharge
                      ? l10n.driverWalletTxCashCommission
                      : transaction.kind == 'ADJUSTMENT'
                          ? l10n.driverWalletTxAdjustment
                          : l10n.driverWalletTxEarning,
                  style: TextStyle(
                      fontWeight: FontWeight.w700,
                      fontSize: 13.5,
                      color: palette.text),
                ),
                const SizedBox(height: 2),
                Text(
                  transaction.orderShortId != null
                      ? '№ ${transaction.orderShortId} · ${_timeAgo(l10n, transaction.createdAt)}'
                      : _timeAgo(l10n, transaction.createdAt),
                  style:
                      TextStyle(color: palette.textSecondary, fontSize: 11.5),
                ),
              ],
            ),
          ),
          Text(
            '${isCharge ? '-' : '+'}${_money(transaction.amountKzt)}',
            style: TextStyle(
              fontWeight: FontWeight.w800,
              color: isCharge ? palette.danger : palette.success,
            ),
          ),
        ],
      ),
    );
  }
}

class _WalletEmptyRow extends StatelessWidget {
  const _WalletEmptyRow({required this.text});

  final String text;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: palette.cardWarm,
        borderRadius: BorderRadius.circular(16),
      ),
      child: Text(
        text,
        style: TextStyle(color: palette.textSecondary, fontSize: 13),
      ),
    );
  }
}
