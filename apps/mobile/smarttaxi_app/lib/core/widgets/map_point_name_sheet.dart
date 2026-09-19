import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../theme/app_theme.dart';
import '../../l10n/app_localizations.dart';

/// The shortest name the server will accept for an address, and the longest it
/// stores. Kept in step with orders.routes.js: `pickupText`/`dropoffText` are
/// `z.string().trim().min(2).max(180)`, and an order rejected after the rider
/// has already typed a name is the worst possible place to find that out.
const int mapPointNameMinLength = 2;
const int mapPointNameMaxLength = 120;

/// Asks the rider what to call a place the map has no name for.
///
/// Six of the thirteen regions this service runs in have streets in OSM and
/// almost no house numbers, so "no address here" is the ordinary case, not the
/// edge case. Until now such a point reached the driver as the literal words
/// "Точка на карте", which tells them nothing they cannot already see from the
/// pin — the rider is the only person who knows it is the blue gate past the
/// mosque.
///
/// Returns the trimmed name, or null if the rider backed out.
Future<String?> showMapPointNameSheet(
  BuildContext context, {
  String? initialValue,
}) {
  return showModalBottomSheet<String>(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.transparent,
    builder: (context) => _MapPointNameSheet(initialValue: initialValue),
  );
}

class _MapPointNameSheet extends StatefulWidget {
  const _MapPointNameSheet({this.initialValue});

  final String? initialValue;

  @override
  State<_MapPointNameSheet> createState() => _MapPointNameSheetState();
}

class _MapPointNameSheetState extends State<_MapPointNameSheet> {
  late final TextEditingController _controller =
      TextEditingController(text: widget.initialValue ?? '');
  late final FocusNode _focusNode = FocusNode();

  @override
  void initState() {
    super.initState();
    _controller.addListener(_onChanged);
    // The sheet exists to be typed into; opening it with the keyboard down
    // costs the rider an extra tap in the one flow that already took several.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) _focusNode.requestFocus();
    });
  }

  void _onChanged() => setState(() {});

  @override
  void dispose() {
    _controller.removeListener(_onChanged);
    _controller.dispose();
    _focusNode.dispose();
    super.dispose();
  }

  String get _value => _controller.text.trim();

  bool get _canSubmit => _value.length >= mapPointNameMinLength;

  void _submit() {
    if (!_canSubmit) return;
    Navigator.of(context).pop(_value);
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final palette = context.palette;
    return Padding(
      // Lifts the sheet above the keyboard it opens itself.
      padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(context).bottom),
      child: SafeArea(
        top: false,
        child: Container(
          margin: const EdgeInsets.fromLTRB(12, 0, 12, 12),
          padding: const EdgeInsets.fromLTRB(18, 14, 18, 18),
          decoration: BoxDecoration(
            color: palette.card,
            borderRadius: BorderRadius.circular(26),
            border: Border.all(color: palette.border),
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Center(
                child: Container(
                  width: 42,
                  height: 4,
                  decoration: BoxDecoration(
                    color: palette.border,
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),
              ),
              const SizedBox(height: 16),
              Text(
                l10n.passengerNamePointTitle,
                style: TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.w700,
                  color: palette.text,
                ),
              ),
              const SizedBox(height: 6),
              Text(
                l10n.passengerNamePointSubtitle,
                style: TextStyle(
                  fontSize: 13.5,
                  height: 1.35,
                  color: palette.textSecondary,
                ),
              ),
              const SizedBox(height: 14),
              TextField(
                controller: _controller,
                focusNode: _focusNode,
                autofocus: true,
                textInputAction: TextInputAction.done,
                textCapitalization: TextCapitalization.sentences,
                maxLength: mapPointNameMaxLength,
                maxLengthEnforcement: MaxLengthEnforcement.enforced,
                onSubmitted: (_) => _submit(),
                decoration: InputDecoration(
                  hintText: l10n.passengerNamePointHint,
                  counterText: '',
                  prefixIcon: const Icon(Icons.push_pin_outlined),
                ),
              ),
              const SizedBox(height: 14),
              SizedBox(
                height: 50,
                child: FilledButton(
                  onPressed: _canSubmit ? _submit : null,
                  child: Text(l10n.passengerNamePointConfirm),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
