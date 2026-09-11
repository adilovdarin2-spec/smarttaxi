import 'dart:async';

import 'package:flutter/material.dart';

import '../../../../core/api/api_client.dart';
import '../../../../core/theme/app_theme.dart';
import '../../../../core/widgets/empty_state.dart';
import '../../../../core/widgets/status_pill.dart';
import '../../../../l10n/app_localizations.dart';
import '../../../shared/models.dart';
import '../../models/driver_shell_helpers.dart';
import '../../widgets/driver_common_widgets.dart';
import '../../widgets/driver_profile_widgets.dart';

String _timeAgo(AppLocalizations l10n, DateTime dateTime) {
  final diff = DateTime.now().difference(dateTime);
  if (diff.inMinutes < 1) return l10n.passengerTimeAgoJustNow;
  if (diff.inMinutes < 60) return l10n.passengerTimeAgoMinutes(diff.inMinutes);
  if (diff.inHours < 24) return l10n.passengerTimeAgoHours(diff.inHours);
  return l10n.passengerTimeAgoDays(diff.inDays);
}

class DriverSupportScreen extends StatefulWidget {
  const DriverSupportScreen({
    super.key,
    required this.api,
    required this.pushMessages,
    this.activeOrderId,
  });

  final ApiClient api;
  final Stream<Map<String, dynamic>> pushMessages;
  final String? activeOrderId;

  @override
  State<DriverSupportScreen> createState() => _DriverSupportScreenState();
}

class _DriverSupportScreenState extends State<DriverSupportScreen> {
  StreamSubscription<Map<String, dynamic>>? _pushMessageSub;
  // null until the driver picks one; the form falls back to topics.first
  // (the localized "order problem" topic) both for the selected-chip
  // highlight and the actual submitted topic.
  String? _supportTopic;
  bool _supportSending = false;
  final _supportController = TextEditingController();
  String? _supportMessage;
  bool _supportMessageDanger = false;

  List<SupportMessage> _history = const [];
  bool _historyLoading = false;
  bool _historyError = false;

  @override
  void initState() {
    super.initState();
    unawaited(_loadHistory());
    _pushMessageSub = widget.pushMessages.listen((data) {
      if (data['type'] == 'SUPPORT_REPLY') unawaited(_loadHistory());
    });
  }

  @override
  void dispose() {
    _pushMessageSub?.cancel();
    _supportController.dispose();
    super.dispose();
  }

  Future<void> _loadHistory() async {
    if (!mounted) return;
    setState(() {
      _historyLoading = true;
      _historyError = false;
    });
    try {
      final messages = await widget.api.getMySupportMessages();
      if (!mounted) return;
      setState(() => _history = messages);
    } catch (_) {
      // The submit form still works without history, but a failed refresh
      // should say so instead of just leaving the list empty.
      if (mounted) setState(() => _historyError = true);
    } finally {
      if (mounted) setState(() => _historyLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final topics = [
      l10n.driverSupportTopicOrder,
      l10n.driverSupportTopicRegion,
      l10n.driverSupportTopicBilling,
      l10n.driverSupportTopicOther,
    ];
    return RefreshIndicator(
      onRefresh: _loadHistory,
      child: ListView(
        padding: const EdgeInsets.all(20),
        physics: const AlwaysScrollableScrollPhysics(
          parent: BouncingScrollPhysics(),
        ),
        children: [
          TitleBlock(
            title: l10n.driverSupportTitle,
            text: l10n.driverSupportSubtitle,
          ),
          const SizedBox(height: 16),
          PremiumCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                SectionLabel(
                  title: l10n.driverSupportTopicSectionTitle,
                  text: l10n.driverSupportTopicSectionText,
                ),
                const SizedBox(height: 12),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: topics
                      .map(
                        (topic) => DriverSupportTopicChip(
                          label: topic,
                          selected: (_supportTopic ?? topics.first) == topic,
                          onTap: () => setState(() => _supportTopic = topic),
                        ),
                      )
                      .toList(),
                ),
                const SizedBox(height: 16),
                TextField(
                  controller: _supportController,
                  minLines: 5,
                  maxLines: 7,
                  decoration: InputDecoration(
                    labelText: l10n.driverSupportMessageLabel,
                    hintText: l10n.driverSupportMessageHint,
                    alignLabelWithHint: true,
                  ),
                ),
                if (_supportMessage != null) ...[
                  const SizedBox(height: 12),
                  InlineMessage(
                    text: _supportMessage!,
                    danger: _supportMessageDanger,
                  ),
                ],
                const SizedBox(height: 16),
                ElevatedButton(
                  onPressed: _supportSending
                      ? null
                      : () async {
                          final text = _supportController.text.trim();
                          if (text.length < 8) {
                            setState(() {
                              _supportMessageDanger = true;
                              _supportMessage =
                                  l10n.driverSupportMessageTooShort;
                            });
                            return;
                          }
                          setState(() => _supportSending = true);
                          try {
                            await widget.api.submitSupportMessage(
                              topic: _supportTopic ?? topics.first,
                              message: text,
                              orderId: widget.activeOrderId,
                            );
                            if (!mounted) return;
                            _supportController.clear();
                            setState(() {
                              _supportMessageDanger = false;
                              _supportMessage = l10n.driverSupportMessageSent;
                            });
                            unawaited(_loadHistory());
                          } catch (error) {
                            if (!mounted) return;
                            setState(() {
                              _supportMessageDanger = true;
                              _supportMessage = readableError(
                                  AppLocalizations.of(context), error);
                            });
                          } finally {
                            if (mounted) {
                              setState(() => _supportSending = false);
                            }
                          }
                        },
                  style: ElevatedButton.styleFrom(
                      minimumSize: const Size.fromHeight(52)),
                  child: _supportSending
                      ? ButtonSpinner(text: l10n.driverSupportSendingButton)
                      : Text(l10n.driverSupportSendButton),
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),
          SectionLabel(title: l10n.driverSupportHistoryTitle, text: ''),
          const SizedBox(height: 8),
          if (_historyLoading && _history.isEmpty)
            const Center(
              child: Padding(
                padding: EdgeInsets.all(24),
                child: CircularProgressIndicator(strokeWidth: 2.4),
              ),
            )
          else if (_historyError && _history.isEmpty)
            EmptyState(
              icon: Icons.wifi_off_rounded,
              title: l10n.driverSupportLoadError,
              text: l10n.pullToRetry,
              action: l10n.retry,
              onAction: () => unawaited(_loadHistory()),
            )
          else if (_history.isEmpty)
            EmptyState(
              icon: Icons.support_agent_rounded,
              title: l10n.driverSupportEmptyTitle,
              text: l10n.driverSupportEmptyText,
            )
          else
            for (final item in _history) ...[
              _DriverSupportHistoryCard(item: item),
              const SizedBox(height: 10),
            ],
        ],
      ),
    );
  }
}

class _DriverSupportHistoryCard extends StatelessWidget {
  const _DriverSupportHistoryCard({required this.item});

  final SupportMessage item;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final l10n = AppLocalizations.of(context);
    return PremiumCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  item.topic,
                  style: const TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
              StatusPill(
                label: item.isResolved
                    ? l10n.driverSupportStatusResolved
                    : l10n.driverSupportStatusPending,
                tone: item.isResolved ? StatusTone.success : StatusTone.neutral,
              ),
            ],
          ),
          const SizedBox(height: 6),
          Text(
            item.message,
            maxLines: 3,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(
              color: palette.textSecondary,
              fontSize: 12.5,
              height: 1.35,
              fontWeight: FontWeight.w600,
            ),
          ),
          if (item.adminResponse != null && item.adminResponse!.isNotEmpty) ...[
            const SizedBox(height: 10),
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                color: palette.brandSurface,
                borderRadius: BorderRadius.circular(12),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    l10n.driverSupportResponseLabel,
                    style: TextStyle(
                      color: palette.brandDeep,
                      fontSize: 11,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  const SizedBox(height: 3),
                  Text(
                    item.adminResponse!,
                    style: const TextStyle(
                      fontSize: 12.5,
                      height: 1.35,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ],
              ),
            ),
          ],
          if (item.createdAt != null) ...[
            const SizedBox(height: 8),
            Text(
              _timeAgo(l10n, item.createdAt!.toLocal()),
              style: TextStyle(
                color: palette.textSecondary,
                fontSize: 11,
                fontWeight: FontWeight.w500,
              ),
            ),
          ],
        ],
      ),
    );
  }
}
