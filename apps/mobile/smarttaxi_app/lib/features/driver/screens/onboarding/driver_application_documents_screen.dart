import 'dart:async';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';

import '../../../../core/api/api_client.dart';
import '../../../../core/theme/app_theme.dart';
import '../../../../core/widgets/status_pill.dart';
import '../../../../l10n/app_localizations.dart';
import '../../models/driver_document_labels.dart';
import '../../models/driver_document_models.dart';

/// Shown right after a prospective driver submits their application
/// (`ApiClient.submitDriverApplication`). The application has no user
/// account yet, so uploads go through the unauthenticated
/// `uploadDriverApplicationDocument` endpoint, scoped by [applicationId].
class DriverApplicationDocumentsScreen extends StatefulWidget {
  const DriverApplicationDocumentsScreen({
    super.key,
    required this.api,
    required this.applicationId,
  });

  final ApiClient api;
  final String applicationId;

  @override
  State<DriverApplicationDocumentsScreen> createState() =>
      _DriverApplicationDocumentsScreenState();
}

class _DriverApplicationDocumentsScreenState
    extends State<DriverApplicationDocumentsScreen> {
  final Map<String, DriverDocument> _uploaded = {};
  String? _uploadingType;
  String? _error;

  Future<void> _uploadFromPath(String type, String? path) async {
    if (path == null) return;
    setState(() {
      _uploadingType = type;
      _error = null;
    });
    try {
      final document = await widget.api.uploadDriverApplicationDocument(
        applicationId: widget.applicationId,
        type: type,
        filePath: path,
      );
      if (!mounted) return;
      setState(() {
        _uploaded[type] = document;
        _uploadingType = null;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _uploadingType = null;
        _error = AppLocalizations.of(context).driverDocumentUploadError;
      });
    }
  }

  Future<void> _pickFromCamera(String type) async {
    final file = await ImagePicker().pickImage(
      source: ImageSource.camera,
      imageQuality: 85,
    );
    await _uploadFromPath(type, file?.path);
  }

  Future<void> _pickFromGallery(String type) async {
    final result = await FilePicker.platform.pickFiles(
      type: FileType.custom,
      allowedExtensions: const ['jpg', 'jpeg', 'png', 'pdf'],
    );
    await _uploadFromPath(type, result?.files.single.path);
  }

  bool get _allRequiredUploaded =>
      DriverDocumentType.required.every(_uploaded.containsKey);

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final l10n = AppLocalizations.of(context);
    return Scaffold(
      backgroundColor: palette.appBackground,
      appBar: AppBar(
        backgroundColor: palette.appBackground,
        elevation: 0,
        title: Text(l10n.driverApplicationDocumentsTitle),
      ),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(20),
          children: [
            Text(
              l10n.driverApplicationDocumentsIntro,
              style: SmartTaxiTextStyles.body.copyWith(color: palette.text),
            ),
            const SizedBox(height: 16),
            if (_error != null) ...[
              Text(_error!, style: TextStyle(color: palette.danger)),
              const SizedBox(height: 12),
            ],
            for (final type in DriverDocumentType.required) ...[
              _ApplicationDocumentRow(
                type: type,
                uploaded: _uploaded[type],
                uploading: _uploadingType == type,
                onCamera: () => _pickFromCamera(type),
                onFile: () => _pickFromGallery(type),
              ),
              const SizedBox(height: 10),
            ],
            const SizedBox(height: 10),
            SizedBox(
              width: double.infinity,
              child: ElevatedButton(
                onPressed: () => Navigator.of(context).pop(),
                child: Text(_allRequiredUploaded
                    ? l10n.driverApplicationDocumentsDone
                    : l10n.driverApplicationDocumentsLater),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _ApplicationDocumentRow extends StatelessWidget {
  const _ApplicationDocumentRow({
    required this.type,
    required this.uploaded,
    required this.uploading,
    required this.onCamera,
    required this.onFile,
  });

  final String type;
  final DriverDocument? uploaded;
  final bool uploading;
  final VoidCallback onCamera;
  final VoidCallback onFile;

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
              if (uploaded != null)
                StatusPill(
                    label: l10n.driverApplicationDocumentUploaded,
                    tone: StatusTone.success),
            ],
          ),
          const SizedBox(height: 10),
          if (uploading)
            const Center(
              child: Padding(
                padding: EdgeInsets.symmetric(vertical: 8),
                child: SizedBox(
                  width: 22,
                  height: 22,
                  child: CircularProgressIndicator(strokeWidth: 2.4),
                ),
              ),
            )
          else if (uploaded == null)
            Row(
              children: [
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: onCamera,
                    icon: const Icon(Icons.photo_camera_outlined, size: 18),
                    label: Text(l10n.driverDocumentPickCameraShort),
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: onFile,
                    icon: const Icon(Icons.folder_open_outlined, size: 18),
                    label: Text(l10n.driverDocumentPickFileShort),
                  ),
                ),
              ],
            ),
        ],
      ),
    );
  }
}
