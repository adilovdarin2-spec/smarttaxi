import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../../../core/api/api_client.dart';
import '../../../../core/theme/app_theme.dart';
import '../../../../core/widgets/empty_state.dart';
import '../../../../core/widgets/status_pill.dart';
import '../../../../l10n/app_localizations.dart';
import '../../models/client_wallet_models.dart';

const int _minTopupKzt = 500;

String _money(int value) {
  final text = value.abs().toString().replaceAllMapped(
        RegExp(r'\B(?=(\d{3})+(?!\d))'),
        (_) => ' ',
      );
  return '${value < 0 ? '-' : ''}$text ₸';
}

// DioException.toString() never includes the response body — the backend
// sends its AppError code as response.data['error'] on every 4xx/5xx (see
// apps/api/src/common/errors.js) — so matching against error.toString() would
// never actually catch a real rejection. Same fix already applied to the
// driver side's readableError (driver_shell_helpers.dart).
String? _apiErrorCode(Object error) {
  final data = error is DioException ? error.response?.data : null;
  return data is Map ? data['error']?.toString() : null;
}

// Inserts a space every 4 digits as the rider types, purely cosmetic — the
// backend strips spaces before validating. Mirrors driver_payout_widgets.dart's
// _CardNumberFormatter (kept as a separate copy here so this feature doesn't
// depend on the driver-side widget file).
class _CardNumberFormatter extends TextInputFormatter {
  @override
  TextEditingValue formatEditUpdate(
    TextEditingValue oldValue,
    TextEditingValue newValue,
  ) {
    final digits = newValue.text.replaceAll(RegExp(r'\D'), '');
    final limited = digits.length > 19 ? digits.substring(0, 19) : digits;
    final buffer = StringBuffer();
    for (var i = 0; i < limited.length; i++) {
      if (i != 0 && i % 4 == 0) buffer.write(' ');
      buffer.write(limited[i]);
    }
    final text = buffer.toString();
    return TextEditingValue(
      text: text,
      selection: TextSelection.collapsed(offset: text.length),
    );
  }
}

class ClientWalletScreen extends StatefulWidget {
  const ClientWalletScreen({super.key, required this.api});

  final ApiClient api;

  @override
  State<ClientWalletScreen> createState() => _ClientWalletScreenState();
}

class _ClientWalletScreenState extends State<ClientWalletScreen> {
  bool _loading = true;
  String? _error;
  ClientWalletSummary? _summary;
  List<ClientCard> _cards = const [];
  List<ClientTopupRequest> _topupRequests = const [];

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
      final summaryFuture = widget.api.getClientWallet();
      final cardsFuture = widget.api.getClientCards();
      final topupFuture = widget.api.getClientTopupRequests();
      final summary = await summaryFuture;
      final cards = await cardsFuture;
      final topupRequests = await topupFuture;
      if (!mounted) return;
      setState(() {
        _summary = summary;
        _cards = cards;
        _topupRequests = topupRequests;
        _loading = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _error = AppLocalizations.of(context).passengerWalletLoadError;
        _loading = false;
      });
    }
  }

  Future<void> _openTopUp() async {
    final created = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      backgroundColor: context.palette.appBackground,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
      ),
      builder: (_) => _TopUpSheet(api: widget.api),
    );
    if (created == true) unawaited(_load());
  }

  Future<void> _openAddCard() async {
    final added = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      backgroundColor: context.palette.appBackground,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
      ),
      builder: (_) => _AddCardSheet(api: widget.api),
    );
    if (added == true) unawaited(_load());
  }

  Future<void> _setDefaultCard(ClientCard card) async {
    try {
      final cards = await widget.api.setDefaultClientCard(card.id);
      if (!mounted) return;
      setState(() => _cards = cards);
    } catch (_) {
      // Best-effort: the row just doesn't update — not worth a dedicated
      // error state for a single default-card toggle.
    }
  }

  Future<void> _removeCard(ClientCard card) async {
    final l10n = AppLocalizations.of(context);
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: Text(l10n.passengerWalletRemoveCardConfirmTitle),
        content: Text(l10n.passengerWalletRemoveCardConfirmText(
            card.maskedCardNumber)),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, false),
            child: Text(l10n.cancel),
          ),
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, true),
            child: Text(
              l10n.passengerWalletRemoveAction,
              style: TextStyle(color: context.palette.danger),
            ),
          ),
        ],
      ),
    );
    if (confirmed != true) return;
    try {
      await widget.api.removeClientCard(card.id);
      if (!mounted) return;
      unawaited(_load());
    } catch (_) {
      // Best-effort: a stale row just stays visible until the next pull-to-
      // refresh — not worth a dedicated error state for a single removal.
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
          Text(l10n.passengerWalletTitle,
              style: SmartTaxiTextStyles.title.copyWith(color: palette.text)),
          const SizedBox(height: 4),
          Text(
            l10n.passengerWalletSubtitle,
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
              title: l10n.passengerWalletLoadError,
              text: _error!,
              icon: Icons.error_outline_rounded,
              action: l10n.retry,
              onAction: _load,
            )
          else ...[
            _WalletBalanceCard(
              summary: _summary!,
              onTopUp: _openTopUp,
            ),
            if (_topupRequests.isNotEmpty) ...[
              const SizedBox(height: 20),
              Text(l10n.passengerWalletTopUpRequestsTitle,
                  style: SmartTaxiTextStyles.subtitle
                      .copyWith(color: palette.textSecondary)),
              const SizedBox(height: 10),
              for (final request in _topupRequests) ...[
                _TopupRequestRow(request: request),
                const SizedBox(height: 8),
              ],
            ],
            const SizedBox(height: 20),
            Row(
              children: [
                Expanded(
                  child: Text(l10n.passengerWalletCardsTitle,
                      style: SmartTaxiTextStyles.subtitle
                          .copyWith(color: palette.textSecondary)),
                ),
                TextButton.icon(
                  onPressed: _openAddCard,
                  icon: const Icon(Icons.add_rounded, size: 18),
                  label: Text(l10n.passengerWalletAddCardButton),
                ),
              ],
            ),
            const SizedBox(height: 4),
            if (_cards.isEmpty)
              EmptyState(
                title: l10n.passengerWalletNoCards,
                text: l10n.passengerWalletAddCardSubtitle,
                icon: Icons.credit_card_outlined,
                action: l10n.passengerWalletAddCardButton,
                onAction: _openAddCard,
              )
            else
              for (final card in _cards) ...[
                _ClientCardRow(
                  card: card,
                  onSetDefault: () => _setDefaultCard(card),
                  onRemove: () => _removeCard(card),
                ),
                const SizedBox(height: 8),
              ],
          ],
        ],
      ),
    );
  }
}

class _WalletCtaButton extends StatelessWidget {
  const _WalletCtaButton({
    required this.text,
    required this.onTap,
    this.loading = false,
  });

  final String text;
  final VoidCallback? onTap;
  final bool loading;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final active = onTap != null && !loading;
    return Material(
      color: Colors.transparent,
      child: InkWell(
        borderRadius: BorderRadius.circular(18),
        onTap: active ? onTap : null,
        child: Opacity(
          opacity: active ? 1 : 0.6,
          child: Container(
            width: double.infinity,
            height: 52,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
                colors: [palette.gold, palette.goldDeep],
              ),
              borderRadius: BorderRadius.circular(18),
              boxShadow: [
                BoxShadow(
                  color: palette.gold.withValues(alpha: 0.32),
                  blurRadius: 18,
                  offset: const Offset(0, 8),
                ),
              ],
            ),
            child: loading
                ? const SizedBox(
                    width: 22,
                    height: 22,
                    child: CircularProgressIndicator(
                        strokeWidth: 2.4, color: Colors.white),
                  )
                : Text(
                    text,
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 15,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
          ),
        ),
      ),
    );
  }
}

class _WalletBalanceCard extends StatelessWidget {
  const _WalletBalanceCard({required this.summary, required this.onTopUp});

  final ClientWalletSummary summary;
  final VoidCallback onTopUp;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final l10n = AppLocalizations.of(context);
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
          Text(l10n.passengerWalletBalanceLabel,
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
          const SizedBox(height: 16),
          _WalletCtaButton(
            text: l10n.passengerWalletTopUpButton,
            onTap: onTopUp,
          ),
        ],
      ),
    );
  }
}

StatusTone _topupTone(ClientTopupRequest request) {
  if (request.isCompleted) return StatusTone.success;
  if (request.isFailed || request.isCancelled) return StatusTone.danger;
  return StatusTone.warning;
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
      return status;
  }
}

class _TopupRequestRow extends StatelessWidget {
  const _TopupRequestRow({required this.request});

  final ClientTopupRequest request;

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
            child: Text(_money(request.amountKzt),
                style: TextStyle(
                    fontWeight: FontWeight.w800,
                    fontSize: 15,
                    color: palette.text)),
          ),
          StatusPill(
            label: _topupStatusLabel(l10n, request.status),
            tone: _topupTone(request),
          ),
        ],
      ),
    );
  }
}

class _ClientCardRow extends StatelessWidget {
  const _ClientCardRow({
    required this.card,
    required this.onSetDefault,
    required this.onRemove,
  });

  final ClientCard card;
  final VoidCallback onSetDefault;
  final VoidCallback onRemove;

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
          Container(
            width: 36,
            height: 36,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: palette.goldSurface,
              shape: BoxShape.circle,
            ),
            child: Icon(Icons.credit_card_rounded,
                size: 18, color: palette.goldDeep),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(card.maskedCardNumber,
                    style: TextStyle(
                        fontWeight: FontWeight.w700,
                        fontSize: 13.5,
                        color: palette.text)),
                if (card.holderName != null && card.holderName!.isNotEmpty)
                  Text(card.holderName!,
                      style: TextStyle(
                          color: palette.textSecondary, fontSize: 11.5)),
              ],
            ),
          ),
          if (card.isDefault)
            StatusPill(
              label: l10n.passengerWalletDefaultBadge,
              tone: StatusTone.success,
            ),
          PopupMenuButton<String>(
            icon: Icon(Icons.more_vert_rounded, color: palette.textSecondary),
            onSelected: (value) {
              if (value == 'default') onSetDefault();
              if (value == 'remove') onRemove();
            },
            itemBuilder: (context) => [
              if (!card.isDefault)
                PopupMenuItem(
                  value: 'default',
                  child: Text(l10n.passengerWalletSetDefaultAction),
                ),
              PopupMenuItem(
                value: 'remove',
                child: Text(
                  l10n.passengerWalletRemoveAction,
                  style: TextStyle(color: palette.danger),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _AddCardSheet extends StatefulWidget {
  const _AddCardSheet({required this.api});

  final ApiClient api;

  @override
  State<_AddCardSheet> createState() => _AddCardSheetState();
}

class _AddCardSheetState extends State<_AddCardSheet> {
  final _cardController = TextEditingController();
  final _holderController = TextEditingController();
  bool _saving = false;
  String? _error;

  @override
  void dispose() {
    _cardController.dispose();
    _holderController.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    final l10n = AppLocalizations.of(context);
    final digits = _cardController.text.replaceAll(RegExp(r'\D'), '');
    if (digits.length < 12) {
      setState(() => _error = l10n.passengerErrorInvalidCardNumber);
      return;
    }
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      await widget.api.addClientCard(
        cardNumber: digits,
        holderName: _holderController.text.trim(),
      );
      if (!mounted) return;
      Navigator.pop(context, true);
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _saving = false;
        _error = _apiErrorCode(error) == 'INVALID_CARD_NUMBER'
            ? l10n.passengerErrorCardTypo
            : l10n.errorGenericRequestFailed;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final palette = context.palette;
    return Padding(
      padding: EdgeInsets.only(
        left: 20,
        right: 20,
        top: 16,
        bottom: MediaQuery.viewInsetsOf(context).bottom + 24,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Center(
            child: Container(
              width: 44,
              height: 4,
              decoration: BoxDecoration(
                color: palette.border,
                borderRadius: BorderRadius.circular(4),
              ),
            ),
          ),
          const SizedBox(height: 16),
          Text(l10n.passengerWalletAddCardButton,
              style: SmartTaxiTextStyles.title.copyWith(color: palette.text)),
          const SizedBox(height: 4),
          Text(
            l10n.passengerWalletAddCardSubtitle,
            style: SmartTaxiTextStyles.subtitle
                .copyWith(color: palette.textSecondary),
          ),
          const SizedBox(height: 16),
          TextField(
            key: const ValueKey('client-card-number-field'),
            controller: _cardController,
            keyboardType: TextInputType.number,
            inputFormatters: [_CardNumberFormatter()],
            decoration: InputDecoration(
              labelText: l10n.passengerCardNumberLabel,
              hintText: '4111 1111 1111 1111',
            ),
          ),
          const SizedBox(height: 12),
          TextField(
            key: const ValueKey('client-card-holder-field'),
            controller: _holderController,
            textCapitalization: TextCapitalization.words,
            decoration: InputDecoration(
              labelText: l10n.passengerCardHolderNameLabel,
            ),
          ),
          if (_error != null) ...[
            const SizedBox(height: 10),
            Text(_error!, style: TextStyle(color: palette.danger)),
          ],
          const SizedBox(height: 18),
          _WalletCtaButton(
            text: l10n.save,
            loading: _saving,
            onTap: _save,
          ),
        ],
      ),
    );
  }
}

class _TopUpSheet extends StatefulWidget {
  const _TopUpSheet({required this.api});

  final ApiClient api;

  @override
  State<_TopUpSheet> createState() => _TopUpSheetState();
}

class _TopUpSheetState extends State<_TopUpSheet> {
  final _amountController = TextEditingController();
  bool _saving = false;
  String? _error;

  @override
  void dispose() {
    _amountController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final l10n = AppLocalizations.of(context);
    final amount = int.tryParse(_amountController.text.trim());
    if (amount == null || amount < _minTopupKzt) {
      setState(() => _error =
          l10n.passengerWalletTopUpMinNote(_money(_minTopupKzt)));
      return;
    }
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      await widget.api.createClientTopupRequest(amountKzt: amount);
      if (!mounted) return;
      Navigator.pop(context, true);
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _saving = false;
        _error = l10n.errorGenericRequestFailed;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final palette = context.palette;
    return Padding(
      padding: EdgeInsets.only(
        left: 20,
        right: 20,
        top: 16,
        bottom: MediaQuery.viewInsetsOf(context).bottom + 24,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Center(
            child: Container(
              width: 44,
              height: 4,
              decoration: BoxDecoration(
                color: palette.border,
                borderRadius: BorderRadius.circular(4),
              ),
            ),
          ),
          const SizedBox(height: 16),
          Text(l10n.passengerWalletTopUpSheetTitle,
              style: SmartTaxiTextStyles.title.copyWith(color: palette.text)),
          const SizedBox(height: 4),
          Text(
            l10n.passengerWalletTopUpMinNote(_money(_minTopupKzt)),
            style: SmartTaxiTextStyles.subtitle
                .copyWith(color: palette.textSecondary),
          ),
          const SizedBox(height: 16),
          TextField(
            key: const ValueKey('client-topup-amount-field'),
            controller: _amountController,
            keyboardType: TextInputType.number,
            inputFormatters: [FilteringTextInputFormatter.digitsOnly],
            decoration: InputDecoration(
              labelText: l10n.passengerWalletTopUpAmountLabel,
              suffixText: '₸',
            ),
          ),
          if (_error != null) ...[
            const SizedBox(height: 10),
            Text(_error!, style: TextStyle(color: palette.danger)),
          ],
          const SizedBox(height: 14),
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: palette.cardWarm,
              borderRadius: BorderRadius.circular(14),
            ),
            child: Text(
              l10n.passengerWalletTopUpPendingNote,
              style: TextStyle(color: palette.textSecondary, fontSize: 12.5),
            ),
          ),
          const SizedBox(height: 18),
          _WalletCtaButton(
            text: l10n.passengerWalletTopUpSubmitButton,
            loading: _saving,
            onTap: _submit,
          ),
        ],
      ),
    );
  }
}
