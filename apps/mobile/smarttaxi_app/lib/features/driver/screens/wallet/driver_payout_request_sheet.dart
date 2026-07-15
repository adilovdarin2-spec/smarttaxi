import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../../../core/api/api_client.dart';
import '../../../../core/theme/app_theme.dart';
import '../../../../l10n/app_localizations.dart';
import '../../models/driver_wallet_models.dart';
import '../../widgets/driver_common_widgets.dart';

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
  final _phoneController = TextEditingController();
  bool _submitting = false;
  String? _error;

  @override
  void dispose() {
    _amountController.dispose();
    _phoneController.dispose();
    super.dispose();
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
    if (_phoneController.text.trim().length < 6) {
      setState(() => _error = l10n.driverPayoutErrorPhoneRequired);
      return;
    }

    setState(() {
      _submitting = true;
      _error = null;
    });
    try {
      await widget.api.createPayoutRequest(
        amountKzt: amount,
        method: 'KASPI_TRANSFER',
        details: {'phone': _phoneController.text.trim()},
      );
      if (!mounted) return;
      Navigator.pop(context, true);
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _submitting = false;
        _error = l10n.driverPayoutErrorGeneric;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final l10n = AppLocalizations.of(context);
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
          TextField(
            controller: _phoneController,
            keyboardType: TextInputType.phone,
            decoration: InputDecoration(
              labelText: l10n.driverPayoutPhoneLabel,
              hintText: '+7 700 000 00 00',
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
            loadingText: 'Отправляем...',
            onTap: _submit,
          ),
        ],
      ),
    );
  }
}
