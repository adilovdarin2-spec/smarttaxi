import 'dart:async';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import '../../../../core/api/api_client.dart';
import '../../../../core/theme/app_theme.dart';
import '../../../../core/widgets/empty_state.dart';
import '../../../../core/widgets/status_pill.dart';
import '../../../../l10n/app_localizations.dart';
import '../../models/client_wallet_models.dart';

String _money(int value) {
  final text = value
      .abs()
      .toString()
      .replaceAllMapped(RegExp(r'\B(?=(\d{3})+(?!\d))'), (_) => ' ');
  return '${value < 0 ? '-' : ''}$text ₸';
}

class ClientWalletScreen extends StatefulWidget {
  const ClientWalletScreen({super.key, required this.api});
  final ApiClient api;
  @override
  State<ClientWalletScreen> createState() => _ClientWalletScreenState();
}

class _ClientWalletScreenState extends State<ClientWalletScreen> {
  bool _loading = true, _confirming = false, _uncertain = false;
  String? _error, _removingId, _notice;
  int _generation = 0;
  ClientWalletSummary? _summary;
  List<ClientCard> _cards = const [];
  List<ClientTopupRequest> _topupRequests = const [];

  @override
  void initState() {
    super.initState();
    unawaited(_load());
  }

  Future<void> _load({String? notice}) async {
    if (_removingId != null) return;
    final request = ++_generation;
    setState(() {
      _loading = true;
      _summary = null;
      _error = null;
      _notice = null;
    });
    try {
      // Observe all failures immediately; sequential awaits left a cards/history
      // rejection unhandled while the summary request was still pending.
      final result = await Future.wait<Object>([
        widget.api.getClientWallet(),
        widget.api.getClientCards(),
        widget.api.getClientTopupRequests(),
      ]);
      if (!mounted || request != _generation) return;
      setState(() {
        _summary = result[0] as ClientWalletSummary;
        _cards = result[1] as List<ClientCard>;
        _topupRequests = result[2] as List<ClientTopupRequest>;
        _loading = false;
        _uncertain = false;
        _notice = notice;
      });
    } catch (_) {
      if (!mounted || request != _generation) return;
      setState(() {
        _error = AppLocalizations.of(context).passengerWalletLoadError;
        _loading = false;
      });
    }
  }

  Future<void> _removeCard(ClientCard card) async {
    if (_confirming || _loading || _removingId != null || _uncertain) return;
    _confirming = true;
    final l10n = AppLocalizations.of(context);
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: Text(l10n.passengerWalletRemoveCardConfirmTitle),
        content: Text(
            l10n.passengerWalletRemoveCardConfirmText(card.maskedCardNumber)),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(dialogContext, false),
              child: Text(l10n.cancel)),
          TextButton(
              onPressed: () => Navigator.pop(dialogContext, true),
              child: Text(l10n.passengerWalletRemoveAction,
                  style: TextStyle(color: context.palette.danger))),
        ],
      ),
    );
    _confirming = false;
    if (!mounted || confirmed != true || _removingId != null) return;
    ++_generation;
    setState(() {
      _removingId = card.id;
      _error = null;
      _notice = null;
    });
    try {
      await widget.api.removeClientCard(card.id);
      if (!mounted) return;
      setState(() {
        _removingId = null;
      });
      await _load(notice: l10n.passengerWalletRecordRemoved);
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _removingId = null;
        _uncertain = error is! DioException ||
            error.response == null ||
            (error.response?.statusCode ?? 500) >= 500;
        _error = _uncertain
            ? l10n.passengerWalletRemovalUnconfirmed
            : l10n.errorGenericRequestFailed;
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
        physics: const AlwaysScrollableScrollPhysics(),
        children: [
          Row(children: [
            Expanded(
                child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                  Text(l10n.passengerWalletTitle,
                      style: SmartTaxiTextStyles.title
                          .copyWith(color: palette.text)),
                  const SizedBox(height: 4),
                  Text(l10n.passengerWalletSubtitle,
                      style: SmartTaxiTextStyles.subtitle
                          .copyWith(color: palette.textSecondary)),
                ])),
            IconButton(
                tooltip: l10n.retry,
                onPressed: _loading || _removingId != null ? null : _load,
                icon: Icon(Icons.refresh_rounded, color: palette.brand)),
          ]),
          const SizedBox(height: 20),
          if (_loading)
            const Padding(
                padding: EdgeInsets.symmetric(vertical: 40),
                child: Center(child: CircularProgressIndicator()))
          else if (_summary == null)
            EmptyState(
                title: l10n.passengerWalletLoadError,
                text: _error ?? l10n.errorGenericRequestFailed,
                icon: Icons.error_outline_rounded,
                action: l10n.retry,
                onAction: _load)
          else ...[
            Container(
              padding: const EdgeInsets.all(24),
              decoration: BoxDecoration(
                  gradient: LinearGradient(
                      colors: [palette.brand, palette.brandDeep]),
                  borderRadius: BorderRadius.circular(24)),
              child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(l10n.passengerWalletBalanceLabel,
                        style:
                            const TextStyle(color: Colors.white, fontSize: 13)),
                    const SizedBox(height: 12),
                    Text(_money(_summary!.balanceKzt),
                        style: const TextStyle(
                            color: Colors.white,
                            fontSize: 36,
                            fontWeight: FontWeight.w700)),
                    const SizedBox(height: 10),
                    Text(l10n.passengerWalletCashbackUsage,
                        style: const TextStyle(
                            color: Colors.white, fontSize: 12, height: 1.5)),
                  ]),
            ),
            const SizedBox(height: 20),
            Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Icon(Icons.shield_outlined, color: palette.brand, size: 24),
              const SizedBox(width: 12),
              Expanded(
                  child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                    Text(l10n.passengerWalletAvailabilityTitle,
                        style: TextStyle(
                            color: palette.text,
                            fontSize: 15,
                            fontWeight: FontWeight.w700)),
                    const SizedBox(height: 6),
                    Text(l10n.passengerWalletUnavailable,
                        style: TextStyle(
                            color: palette.textSecondary,
                            fontSize: 13,
                            height: 1.6)),
                  ])),
            ]),
            if (_notice != null)
              Padding(
                  padding: const EdgeInsets.only(top: 16),
                  child:
                      Text(_notice!, style: TextStyle(color: palette.success))),
            if (_error != null)
              Padding(
                  padding: const EdgeInsets.only(top: 16),
                  child: Semantics(
                      liveRegion: true,
                      child: Text(_error!,
                          style: TextStyle(color: palette.danger)))),
            const SizedBox(height: 24),
            _WalletCard(
                title: l10n.passengerWalletTopUpRequestsTitle,
                icon: Icons.history_rounded,
                children: [
                  Text(l10n.passengerWalletHistoryNote,
                      style: TextStyle(
                          color: palette.textSecondary,
                          fontSize: 12,
                          height: 1.6)),
                  if (_topupRequests.isEmpty)
                    Padding(
                        padding: const EdgeInsets.only(top: 16),
                        child: Text(l10n.passengerWalletNoRequests,
                            style:
                                TextStyle(color: palette.text, fontSize: 13))),
                  for (final request in _topupRequests)
                    Padding(
                      padding: const EdgeInsets.only(top: 16),
                      child: Wrap(
                          alignment: WrapAlignment.spaceBetween,
                          crossAxisAlignment: WrapCrossAlignment.center,
                          spacing: 12,
                          runSpacing: 8,
                          children: [
                            Text(_money(request.amountKzt),
                                style: TextStyle(
                                    color: palette.text,
                                    fontWeight: FontWeight.w600)),
                            StatusPill(
                                label: _topupStatusLabel(l10n, request.status),
                                tone: request.isCompleted
                                    ? StatusTone.success
                                    : request.isFailed || request.isCancelled
                                        ? StatusTone.danger
                                        : StatusTone.warning),
                          ]),
                    ),
                ]),
            const SizedBox(height: 16),
            _WalletCard(
                title: l10n.passengerWalletCardsTitle,
                icon: Icons.credit_card_outlined,
                children: [
                  Text(l10n.passengerWalletSavedRecordsNote,
                      style: TextStyle(
                          color: palette.textSecondary,
                          fontSize: 12,
                          height: 1.6)),
                  if (_cards.isEmpty)
                    Padding(
                        padding: const EdgeInsets.only(top: 16),
                        child: Text(l10n.passengerWalletNoCards,
                            style:
                                TextStyle(color: palette.text, fontSize: 13))),
                  for (final card in _cards)
                    Padding(
                      padding: const EdgeInsets.only(top: 14),
                      child: Row(children: [
                        Expanded(
                            child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                              Text(card.maskedCardNumber,
                                  style: TextStyle(
                                      color: palette.text,
                                      fontSize: 14,
                                      fontWeight: FontWeight.w600)),
                              if (card.holderName?.isNotEmpty == true)
                                Text(card.holderName!,
                                    style: TextStyle(
                                        color: palette.textSecondary,
                                        fontSize: 12)),
                            ])),
                        IconButton(
                            tooltip: l10n.passengerWalletRemoveAction,
                            onPressed: _removingId != null || _uncertain
                                ? null
                                : () => _removeCard(card),
                            icon: _removingId == card.id
                                ? const SizedBox(
                                    width: 20,
                                    height: 20,
                                    child: CircularProgressIndicator(
                                        strokeWidth: 2))
                                : Icon(Icons.delete_outline_rounded,
                                    color: palette.danger)),
                      ]),
                    ),
                ]),
          ],
        ],
      ),
    );
  }
}

class _WalletCard extends StatelessWidget {
  const _WalletCard(
      {required this.title, required this.icon, required this.children});
  final String title;
  final IconData icon;
  final List<Widget> children;
  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
          color: palette.card,
          border: Border.all(color: palette.border),
          borderRadius: BorderRadius.circular(22)),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Row(children: [
          Icon(icon, color: palette.brand, size: 22),
          const SizedBox(width: 12),
          Expanded(
              child: Text(title,
                  style: TextStyle(
                      color: palette.text,
                      fontWeight: FontWeight.w700,
                      fontSize: 15)))
        ]),
        const SizedBox(height: 12),
        ...children,
      ]),
    );
  }
}

String _topupStatusLabel(AppLocalizations l10n, String status) {
  switch (status) {
    case 'PENDING':
      return l10n.passengerWalletTopupStatusPending;
    case 'COMPLETED':
      return l10n.passengerWalletTopupStatusCompleted;
    case 'FAILED':
      return l10n.passengerWalletTopupStatusFailed;
    case 'CANCELLED':
      return l10n.passengerWalletTopupStatusCancelled;
    default:
      return l10n.passengerWalletStatusUnknown;
  }
}
