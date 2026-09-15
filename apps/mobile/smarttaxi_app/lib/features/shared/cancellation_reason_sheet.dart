import 'package:flutter/material.dart';

import '../../core/theme/app_theme.dart';
import '../../l10n/app_localizations.dart';

/// What the person cancelling says happened. Shared by both apps because the
/// two halves of the same problem live on opposite sides of it: a driver who
/// cancels after pulling up, and a rider who cancels because that driver asked
/// them to. Neither is visible to the server any other way.
///
/// Nothing here charges anybody. The answer is recorded with the cancellation
/// and read later by a person.
class CancellationReason {
  const CancellationReason({required this.code, this.note = ''});

  final String code;
  final String note;
}

/// Reason codes, matching the server's DRIVER_CANCEL_REASONS.
const driverCancelReasonCodes = <String>[
  'CLIENT_NO_SHOW',
  'CLIENT_ASKED',
  'WRONG_ADDRESS',
  'CAR_PROBLEM',
  'TOO_FAR',
  'OTHER',
];

/// Matching the server's CLIENT_CANCEL_REASONS.
const clientCancelReasonCodes = <String>[
  'CHANGED_MIND',
  'DRIVER_ASKED_TO_CANCEL',
  'WAITED_TOO_LONG',
  'FOUND_ANOTHER_CAR',
  'WRONG_ADDRESS',
  'OTHER',
];

String driverCancelReasonLabel(AppLocalizations l10n, String code) {
  switch (code) {
    case 'CLIENT_NO_SHOW':
      return l10n.cancelReasonClientNoShow;
    case 'CLIENT_ASKED':
      return l10n.cancelReasonClientAsked;
    case 'WRONG_ADDRESS':
      return l10n.cancelReasonWrongAddress;
    case 'CAR_PROBLEM':
      return l10n.cancelReasonCarProblem;
    case 'TOO_FAR':
      return l10n.cancelReasonTooFar;
    default:
      return l10n.cancelReasonOther;
  }
}

String clientCancelReasonLabel(AppLocalizations l10n, String code) {
  switch (code) {
    case 'CHANGED_MIND':
      return l10n.clientCancelReasonChangedMind;
    case 'DRIVER_ASKED_TO_CANCEL':
      return l10n.clientCancelReasonDriverAsked;
    case 'WAITED_TOO_LONG':
      return l10n.clientCancelReasonWaited;
    case 'FOUND_ANOTHER_CAR':
      return l10n.clientCancelReasonFoundAnother;
    case 'WRONG_ADDRESS':
      return l10n.cancelReasonWrongAddress;
    default:
      return l10n.clientCancelReasonOther;
  }
}

/// Returns the chosen reason, or null when the person backs out — which must
/// mean the trip is NOT cancelled, not that it is cancelled without a reason.
Future<CancellationReason?> askCancellationReason(
  BuildContext context, {
  required bool isDriver,
}) {
  return showModalBottomSheet<CancellationReason>(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.transparent,
    builder: (context) => _CancellationReasonSheet(isDriver: isDriver),
  );
}

class _CancellationReasonSheet extends StatefulWidget {
  const _CancellationReasonSheet({required this.isDriver});

  final bool isDriver;

  @override
  State<_CancellationReasonSheet> createState() =>
      _CancellationReasonSheetState();
}

class _CancellationReasonSheetState extends State<_CancellationReasonSheet> {
  final _note = TextEditingController();
  String? _selected;

  @override
  void dispose() {
    _note.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final palette = context.palette;
    final codes =
        widget.isDriver ? driverCancelReasonCodes : clientCancelReasonCodes;
    final label = widget.isDriver ? driverCancelReasonLabel : clientCancelReasonLabel;
    return Padding(
      // The note field raises the keyboard and the gesture bar sits under the
      // buttons; both have to be cleared or the confirm button is unreachable.
      padding: EdgeInsets.only(
        bottom: MediaQuery.of(context).viewInsets.bottom +
            MediaQuery.of(context).viewPadding.bottom,
      ),
      child: Container(
        decoration: BoxDecoration(
          color: palette.card,
          borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
        ),
        padding: const EdgeInsets.fromLTRB(20, 12, 20, 24),
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Center(
                child: Container(
                  width: 40,
                  height: 4,
                  decoration: BoxDecoration(
                    color: palette.border,
                    borderRadius: BorderRadius.circular(999),
                  ),
                ),
              ),
              const SizedBox(height: 14),
              Text(
                widget.isDriver
                    ? l10n.cancelReasonDriverTitle
                    : l10n.clientCancelReasonTitle,
                style: TextStyle(
                  color: palette.text,
                  fontSize: 20,
                  fontWeight: FontWeight.w700,
                ),
              ),
              const SizedBox(height: 6),
              Text(
                widget.isDriver
                    ? l10n.cancelReasonNotice
                    : l10n.clientCancelReasonNotice,
                style: TextStyle(color: palette.textSecondary, fontSize: 13),
              ),
              const SizedBox(height: 16),
              for (final code in codes)
                InkWell(
                  onTap: () => setState(() => _selected = code),
                  borderRadius: BorderRadius.circular(12),
                  child: Padding(
                    padding: const EdgeInsets.symmetric(vertical: 10),
                    child: Row(
                      children: [
                        Icon(
                          _selected == code
                              ? Icons.radio_button_checked
                              : Icons.radio_button_unchecked,
                          color: _selected == code
                              ? palette.brand
                              : palette.textMuted,
                          size: 22,
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Text(
                            label(l10n, code),
                            style: TextStyle(
                              color: palette.text,
                              fontSize: 15,
                              fontWeight: _selected == code
                                  ? FontWeight.w600
                                  : FontWeight.w400,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              const SizedBox(height: 8),
              TextField(
                controller: _note,
                maxLength: 300,
                decoration: InputDecoration(
                  labelText: l10n.cancelReasonNoteHint,
                  counterText: '',
                ),
              ),
              const SizedBox(height: 16),
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton(
                      onPressed: () => Navigator.of(context).pop(),
                      child: Text(l10n.cancelReasonKeep),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: FilledButton(
                      // Without a reason there is nothing to record, and an
                      // unexplained cancellation is exactly the case this
                      // exists to make visible — so the button waits.
                      onPressed: _selected == null
                          ? null
                          : () => Navigator.of(context).pop(
                                CancellationReason(
                                  code: _selected!,
                                  note: _note.text.trim(),
                                ),
                              ),
                      child: Text(l10n.cancelReasonSubmit),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}
