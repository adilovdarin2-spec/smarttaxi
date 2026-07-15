import 'dart:async';

import 'package:flutter/material.dart';

import '../../../../core/api/api_client.dart';
import '../../../../core/theme/app_theme.dart';
import '../../../../core/widgets/status_pill.dart';
import '../../../../l10n/app_localizations.dart';
import '../../models/driver_document_labels.dart';
import '../../models/driver_document_models.dart';
import 'driver_document_upload_sheet.dart';

StatusTone _documentTone(DriverDocument? document) {
  if (document == null) return StatusTone.neutral;
  if (document.isApproved) return StatusTone.success;
  if (document.isRejected) return StatusTone.danger;
  return StatusTone.warning;
}

String _documentStatusLabel(AppLocalizations l10n, DriverDocument? document) {
  if (document == null) return l10n.driverDocumentStatusMissing;
  if (document.isApproved) return l10n.driverDocumentStatusApproved;
  if (document.isRejected) return l10n.driverDocumentStatusRejected;
  return l10n.driverDocumentStatusPending;
}

class DriverDocumentsScreen extends StatefulWidget {
  const DriverDocumentsScreen({super.key, required this.api});

  final ApiClient api;

  @override
  State<DriverDocumentsScreen> createState() => _DriverDocumentsScreenState();
}

class _DriverDocumentsScreenState extends State<DriverDocumentsScreen> {
  bool _loading = true;
  String? _error;
  List<DriverDocument> _documents = const [];

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
      final documents = await widget.api.getDriverDocuments();
      if (!mounted) return;
      setState(() {
        _documents = documents;
        _loading = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _error = AppLocalizations.of(context).driverDocumentsLoadError;
        _loading = false;
      });
    }
  }

  DriverDocument? _latestOf(String type) {
    final matches = _documents.where((doc) => doc.type == type).toList()
      ..sort((a, b) => b.createdAt.compareTo(a.createdAt));
    return matches.isEmpty ? null : matches.first;
  }

  Future<void> _upload(String type) async {
    final created = await showModalBottomSheet<DriverDocument>(
      context: context,
      isScrollControlled: true,
      backgroundColor: context.palette.appBackground,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
      ),
      builder: (context) => DriverDocumentUploadSheet(
        api: widget.api,
        documentType: type,
      ),
    );
    if (created != null) unawaited(_load());
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
          Text(l10n.driverDocumentsTitle,
              style: SmartTaxiTextStyles.title.copyWith(color: palette.text)),
          const SizedBox(height: 4),
          Text(
            l10n.driverDocumentsSubtitle,
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
            Text(_error!, style: TextStyle(color: palette.danger))
          else
            for (final type in DriverDocumentType.required) ...[
              _DriverDocumentRow(
                type: type,
                document: _latestOf(type),
                onUpload: () => _upload(type),
              ),
              const SizedBox(height: 10),
            ],
        ],
      ),
    );
  }
}

class _DriverDocumentRow extends StatelessWidget {
  const _DriverDocumentRow({
    required this.type,
    required this.document,
    required this.onUpload,
  });

  final String type;
  final DriverDocument? document;
  final VoidCallback onUpload;

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
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  documentTypeLabel(l10n, type),
                  style: TextStyle(
                      fontWeight: FontWeight.w800,
                      fontSize: 14,
                      color: palette.text),
                ),
              ),
              StatusPill(
                label: _documentStatusLabel(l10n, document),
                tone: _documentTone(document),
              ),
            ],
          ),
          if (document?.isRejected == true &&
              document?.rejectionReason != null) ...[
            const SizedBox(height: 6),
            Text(
              document!.rejectionReason!,
              style: TextStyle(
                color: palette.danger,
                fontSize: 12,
                fontWeight: FontWeight.w600,
              ),
            ),
          ],
          const SizedBox(height: 10),
          SizedBox(
            width: double.infinity,
            child: OutlinedButton(
              onPressed: onUpload,
              child: Text(document == null
                  ? l10n.driverDocumentUploadButton
                  : l10n.driverDocumentReuploadButton),
            ),
          ),
        ],
      ),
    );
  }
}
