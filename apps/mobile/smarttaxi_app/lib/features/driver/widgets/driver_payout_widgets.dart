import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../../core/api/api_client.dart';
import '../../../core/theme/app_theme.dart';
import '../models/driver_shell_helpers.dart';
import '../models/driver_wallet_models.dart';
import 'driver_common_widgets.dart';
import 'driver_profile_widgets.dart';

// Settings -> "Выплаты": lets a driver save where payout money should go
// (Kaspi phone transfer or a card number) independent of actually
// submitting a withdrawal — see wallet.routes.js PUT /payout-details. Card
// numbers are never charged/tokenized with a real processor; they're
// stored purely so an admin can manually transfer to them, same trust
// model as the phone number already stored the same way. Shared between
// the driver Settings screen (driver_shell.dart) and the payout-request
// sheet's own "Изменить" shortcut (driver_payout_request_sheet.dart).
class PayoutMethodSettingsRow extends StatefulWidget {
  const PayoutMethodSettingsRow({super.key, required this.api});

  final ApiClient api;

  @override
  State<PayoutMethodSettingsRow> createState() =>
      PayoutMethodSettingsRowState();
}

class PayoutMethodSettingsRowState extends State<PayoutMethodSettingsRow> {
  bool _loading = true;
  PayoutDetailsStatus? _status;

  @override
  void initState() {
    super.initState();
    unawaited(load());
  }

  Future<void> load() async {
    if (!mounted) return;
    setState(() => _loading = true);
    try {
      final status = await widget.api.getPayoutDetailsStatus();
      if (!mounted) return;
      setState(() => _status = status);
    } catch (_) {
      // Best-effort: row just shows "Не указан" below, same as a driver who
      // genuinely never saved anything — not worth its own error state for
      // a single settings row.
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  String _summaryText() {
    if (_loading) return 'Загрузка...';
    final status = _status;
    if (status?.cardNumber != null && status!.cardNumber!.isNotEmpty) {
      return 'Карта •• •• •• ${status.cardNumber!.substring(status.cardNumber!.length - 4)}';
    }
    if (status?.phone != null && status!.phone!.isNotEmpty) {
      return 'Kaspi-перевод: ${status.phone}';
    }
    return 'Не указан — добавьте, чтобы выводить средства';
  }

  Future<void> edit() async {
    final saved = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (_) => EditPayoutMethodSheet(
        api: widget.api,
        initialCardNumber: _status?.cardNumber,
        initialPhone: _status?.phone,
      ),
    );
    if (saved == true) unawaited(load());
  }

  @override
  Widget build(BuildContext context) {
    return DriverSettingsRow(
      title: 'Способ выплаты',
      text: _summaryText(),
      onTap: _loading ? null : edit,
    );
  }
}

class _MethodChoiceButton extends StatelessWidget {
  const _MethodChoiceButton({
    required this.label,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    return Material(
      color: selected ? palette.goldSurface : palette.card,
      borderRadius: BorderRadius.circular(14),
      child: InkWell(
        borderRadius: BorderRadius.circular(14),
        onTap: onTap,
        child: Container(
          height: 46,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(14),
            border: Border.all(
              color: selected ? palette.gold : palette.border,
              width: selected ? 1.6 : 1,
            ),
          ),
          child: Text(
            label,
            style: TextStyle(
              color: selected ? palette.goldDeep : palette.textSecondary,
              fontSize: 13.5,
              fontWeight: FontWeight.w800,
            ),
          ),
        ),
      ),
    );
  }
}

// Inserts a space every 4 digits as the driver types, purely cosmetic
// (backend strips spaces before validating) — cursor-to-end on every edit
// is a deliberate simplification acceptable for a short, append-mostly
// field like this.
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

class EditPayoutMethodSheet extends StatefulWidget {
  const EditPayoutMethodSheet({
    super.key,
    required this.api,
    this.initialCardNumber,
    this.initialPhone,
  });

  final ApiClient api;
  final String? initialCardNumber;
  final String? initialPhone;

  @override
  State<EditPayoutMethodSheet> createState() => _EditPayoutMethodSheetState();
}

class _EditPayoutMethodSheetState extends State<EditPayoutMethodSheet> {
  late bool _useCard =
      widget.initialCardNumber != null && widget.initialCardNumber!.isNotEmpty;
  late final _cardController =
      TextEditingController(text: widget.initialCardNumber ?? '');
  late final _phoneController =
      TextEditingController(text: widget.initialPhone ?? '');
  bool _saving = false;
  String? _error;

  @override
  void dispose() {
    _cardController.dispose();
    _phoneController.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      if (_useCard) {
        final digits = _cardController.text.replaceAll(RegExp(r'\D'), '');
        if (digits.length < 12) {
          setState(() {
            _saving = false;
            _error = 'Введите корректный номер карты';
          });
          return;
        }
        await widget.api.savePayoutDetails(cardNumber: digits);
      } else {
        final phone = _phoneController.text.trim();
        if (phone.length < 6) {
          setState(() {
            _saving = false;
            _error = 'Введите номер телефона';
          });
          return;
        }
        await widget.api.savePayoutDetails(phone: phone);
      }
      if (!mounted) return;
      Navigator.pop(context, true);
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _saving = false;
        _error = apiErrorCode(error) == 'INVALID_CARD_NUMBER'
            ? 'Похоже, в номере карты опечатка — проверьте и попробуйте снова'
            : 'Не удалось сохранить. Проверьте данные и попробуйте снова.';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
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
          Text('Способ выплаты',
              style: SmartTaxiTextStyles.title.copyWith(color: palette.text)),
          const SizedBox(height: 4),
          Text(
            'Куда переводить деньги при выводе средств',
            style: SmartTaxiTextStyles.subtitle
                .copyWith(color: palette.textSecondary),
          ),
          const SizedBox(height: 16),
          Row(
            children: [
              Expanded(
                child: _MethodChoiceButton(
                  label: 'Kaspi-перевод',
                  selected: !_useCard,
                  onTap: () => setState(() => _useCard = false),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: _MethodChoiceButton(
                  label: 'Карта',
                  selected: _useCard,
                  onTap: () => setState(() => _useCard = true),
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),
          if (_useCard)
            TextField(
              key: const ValueKey('payout-card-field'),
              controller: _cardController,
              keyboardType: TextInputType.number,
              inputFormatters: [_CardNumberFormatter()],
              decoration: const InputDecoration(
                labelText: 'Номер карты',
                hintText: '4111 1111 1111 1111',
              ),
            )
          else
            TextField(
              key: const ValueKey('payout-phone-field'),
              controller: _phoneController,
              keyboardType: TextInputType.phone,
              decoration: const InputDecoration(
                labelText: 'Номер телефона (Kaspi)',
                hintText: '+7 700 000 00 00',
              ),
            ),
          if (_error != null) ...[
            const SizedBox(height: 10),
            Text(_error!, style: TextStyle(color: palette.danger)),
          ],
          const SizedBox(height: 18),
          DriverGradientButton(
            text: 'Сохранить',
            loading: _saving,
            loadingText: 'Сохраняем...',
            onTap: _save,
          ),
        ],
      ),
    );
  }
}
