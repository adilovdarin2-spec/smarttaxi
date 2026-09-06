import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../../../core/api/api_client.dart';
import '../../../../core/theme/app_theme.dart';
import '../../../../l10n/app_localizations.dart';
import '../../models/driver_shell_helpers.dart';
import '../../models/driver_wallet_models.dart';
import '../../widgets/driver_common_widgets.dart';
import '../../widgets/driver_payout_widgets.dart';

class DriverPayoutRequestSheet extends StatefulWidget {
  const DriverPayoutRequestSheet({
    super.key,
    required this.api,
    required this.summary,
  });

  final ApiClient api;
  final WalletSummary summary;

  @override
  State<DriverPayoutRequestSheet> createState() =>
      _DriverPayoutRequestSheetState();
}

class _DriverPayoutRequestSheetState extends State<DriverPayoutRequestSheet> {
  final _amountController = TextEditingController();
  bool _submitting = false;
  bool _loadingDetails = true;
  PayoutDetailsStatus? _details;
  String? _error;

  @override
  void initState() {
    super.initState();
    unawaited(_loadDetails());
  }

  @override
  void dispose() {
    _amountController.dispose();
    super.dispose();
  }

  Future<void> _loadDetails() async {
    try {
      final status = await widget.api.getPayoutDetailsStatus();
      if (!mounted) return;
      setState(() => _details = status);
    } catch (_) {
      // Falls back to "no payout method on file yet" below, which already
      // has its own real, actionable prompt — no separate error state needed
      // for a lookup this low-stakes.
    } finally {
      if (mounted) setState(() => _loadingDetails = false);
    }
  }

  Future<void> _editPayoutMethod() async {
    final saved = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (_) => EditPayoutMethodSheet(
        api: widget.api,
        initialCardNumber: _details?.cardNumber,
        initialPhone: _details?.phone,
      ),
    );
    if (saved == true) unawaited(_loadDetails());
  }

  String _payoutDestinationText(AppLocalizations l10n) {
    final details = _details;
    if (details?.cardNumber != null && details!.cardNumber!.isNotEmpty) {
      final card = details.cardNumber!;
      final last4 = card.length >= 4 ? card.substring(card.length - 4) : card;
      return l10n.driverPayoutCardSummary(last4);
    }
    if (details?.phone != null && details!.phone!.isNotEmpty) {
      return l10n.driverPayoutKaspiSummary(details.phone!);
    }
    return l10n.driverPayoutMethodNotSetShort;
  }

  Future<void> _submit() async {
    final l10n = AppLocalizations.of(context);
    final amount = int.tryParse(_amountController.text.trim()) ?? 0;
    if (amount < widget.summary.minPayoutKzt) {
      setState(() => _error =
          l10n.driverPayoutErrorBelowMin('${widget.summary.minPayoutKzt} ₸'));
      return;
    }
    if (amount > widget.summary.balanceKzt) {
      setState(() => _error = l10n.driverPayoutErrorExceedsBalance);
      return;
    }
    if (_details == null || !_details!.hasDetails) {
      setState(() => _error = l10n.driverPayoutErrorPhoneRequired);
      return;
    }

    setState(() {
      _submitting = true;
      _error = null;
    });
    try {
      // No details passed: the backend reuses the saved payout destination
      // (wallet.routes.js resolveDriverPayoutDetails) — the whole point of
      // saving it once in Settings instead of retyping it every withdrawal.
      await widget.api.createPayoutRequest(
        amountKzt: amount,
        method: 'KASPI_TRANSFER',
      );
      if (!mounted) return;
      Navigator.pop(context, true);
    } catch (error) {
      if (!mounted) return;
      // The client-side checks above cover the common cases from the
      // summary already in hand, but the backend re-validates against
      // fresher state (wallet.service.js's createPayoutRequest) and can
      // reject for reasons this screen didn't catch locally -- e.g. debt
      // auto-settled from balance between opening this sheet and
      // submitting, or the driver got blocked meanwhile. Map those specific
      // codes to the same messages already used for the client-side
      // pre-checks instead of one generic failure for everything.
      final code = apiErrorCode(error);
      setState(() {
        _submitting = false;
        _error = switch (code) {
          'PAYOUT_EXCEEDS_BALANCE' => l10n.driverPayoutErrorExceedsBalance,
          'PAYOUT_BELOW_MINIMUM' =>
            l10n.driverPayoutErrorBelowMin('${widget.summary.minPayoutKzt} ₸'),
          'PAYOUT_DETAILS_MISSING' => l10n.driverPayoutErrorPhoneRequired,
          'DRIVER_BLOCKED' => l10n.driverErrorDriverBlocked,
          _ => l10n.driverPayoutErrorGeneric,
        };
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final l10n = AppLocalizations.of(context);
    final hasDestination = _details?.hasDetails ?? false;
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
          Text(l10n.driverPayoutSheetTitle,
              style: SmartTaxiTextStyles.title.copyWith(color: palette.text)),
          const SizedBox(height: 4),
          Text(
            l10n.driverPayoutSheetAvailable('${widget.summary.balanceKzt} ₸'),
            style: SmartTaxiTextStyles.subtitle
                .copyWith(color: palette.textSecondary),
          ),
          const SizedBox(height: 18),
          TextField(
            controller: _amountController,
            keyboardType: TextInputType.number,
            inputFormatters: [FilteringTextInputFormatter.digitsOnly],
            decoration: InputDecoration(
              labelText: l10n.driverPayoutAmountLabel,
              hintText: '5000',
            ),
          ),
          const SizedBox(height: 12),
          Material(
            color: hasDestination ? palette.card : palette.brandSurface,
            borderRadius: BorderRadius.circular(16),
            child: InkWell(
              borderRadius: BorderRadius.circular(16),
              onTap: _loadingDetails ? null : _editPayoutMethod,
              child: Container(
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(
                    color: hasDestination ? palette.border : palette.brand,
                  ),
                ),
                child: Row(
                  children: [
                    Icon(
                      hasDestination
                          ? Icons.account_balance_wallet_rounded
                          : Icons.add_card_rounded,
                      color: palette.brandDeep,
                      size: 20,
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Text(
                        _loadingDetails
                            ? l10n.loading
                            : _payoutDestinationText(l10n),
                        style: TextStyle(
                          color: palette.text,
                          fontSize: 13.5,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                    Text(
                      hasDestination
                          ? l10n.passengerChangeButton
                          : l10n.addButton,
                      style: TextStyle(
                        color: palette.brandDeep,
                        fontSize: 12.5,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
          if (_error != null) ...[
            const SizedBox(height: 10),
            Text(_error!, style: TextStyle(color: palette.danger)),
          ],
          const SizedBox(height: 18),
          DriverGradientButton(
            text: l10n.driverPayoutSubmitButton,
            loading: _submitting,
            loadingText: l10n.driverSupportSendingButton,
            onTap: _submit,
          ),
        ],
      ),
    );
  }
}
