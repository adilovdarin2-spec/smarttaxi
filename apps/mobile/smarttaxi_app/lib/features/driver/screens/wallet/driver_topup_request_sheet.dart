import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../../../core/api/api_client.dart';
import '../../../../core/theme/app_theme.dart';
import '../../../../l10n/app_localizations.dart';
import '../../models/driver_shell_helpers.dart';
import '../../widgets/driver_common_widgets.dart';

class DriverTopupRequestSheet extends StatefulWidget {
  const DriverTopupRequestSheet({super.key, required this.api});

  final ApiClient api;

  @override
  State<DriverTopupRequestSheet> createState() =>
      _DriverTopupRequestSheetState();
}

class _DriverTopupRequestSheetState extends State<DriverTopupRequestSheet> {
  final _amountController = TextEditingController();
  bool _submitting = false;
  String? _error;

  @override
  void dispose() {
    _amountController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final l10n = AppLocalizations.of(context);
    final amount = int.tryParse(_amountController.text.trim()) ?? 0;
    if (amount < 500) {
      setState(() => _error = l10n.driverTopupErrorBelowMin('500 ₸'));
      return;
    }

    setState(() {
      _submitting = true;
      _error = null;
    });
    try {
      await widget.api.createTopupRequest(amount);
      if (!mounted) return;
      Navigator.pop(context, true);
    } catch (error) {
      if (!mounted) return;
      final code = apiErrorCode(error);
      setState(() {
        _submitting = false;
        _error = code == 'TOPUP_BELOW_MINIMUM'
            ? l10n.driverTopupErrorBelowMin('500 ₸')
            : l10n.driverTopupErrorGeneric;
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
          Text(l10n.driverTopupSheetTitle,
              style: SmartTaxiTextStyles.title.copyWith(color: palette.text)),
          const SizedBox(height: 4),
          Text(
            l10n.driverTopupSheetHint,
            style: SmartTaxiTextStyles.subtitle
                .copyWith(color: palette.textSecondary),
          ),
          const SizedBox(height: 18),
          TextField(
            controller: _amountController,
            keyboardType: TextInputType.number,
            inputFormatters: [FilteringTextInputFormatter.digitsOnly],
            decoration: InputDecoration(
              labelText: l10n.driverTopupAmountLabel,
              hintText: '5000',
            ),
          ),
          if (_error != null) ...[
            const SizedBox(height: 10),
            Text(_error!, style: TextStyle(color: palette.danger)),
          ],
          const SizedBox(height: 18),
          DriverGradientButton(
            text: l10n.driverTopupSubmitButton,
            loading: _submitting,
            loadingText: l10n.driverSupportSendingButton,
            onTap: _submit,
          ),
        ],
      ),
    );
  }
}
