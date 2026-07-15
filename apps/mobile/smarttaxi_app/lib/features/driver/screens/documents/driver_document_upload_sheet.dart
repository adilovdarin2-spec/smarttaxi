import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';

import '../../../../core/api/api_client.dart';
import '../../../../core/theme/app_theme.dart';
import '../../../../l10n/app_localizations.dart';
import '../../models/driver_document_labels.dart';

/// Lets the driver capture a photo or pick a file for [documentType] and
/// uploads it via [api]. Pops with the created document on success, or
/// `null` if the user backed out / the upload failed.
class DriverDocumentUploadSheet extends StatefulWidget {
  const DriverDocumentUploadSheet({
    super.key,
    required this.api,
    required this.documentType,
  });

  final ApiClient api;
  final String documentType;

  @override
  State<DriverDocumentUploadSheet> createState() =>
      _DriverDocumentUploadSheetState();
}

class _DriverDocumentUploadSheetState
    extends State<DriverDocumentUploadSheet> {
  bool _uploading = false;
  String? _error;

  Future<void> _uploadFromPath(String? path) async {
    if (path == null) return;
    setState(() {
      _uploading = true;
      _error = null;
    });
    try {
      final document = await widget.api.uploadDriverDocument(
        type: widget.documentType,
        filePath: path,
      );
      if (!mounted) return;
      Navigator.pop(context, document);
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _uploading = false;
        _error = AppLocalizations.of(context).driverDocumentUploadError;
      });
    }
  }

  Future<void> _pickFromCamera() async {
    final file = await ImagePicker().pickImage(
      source: ImageSource.camera,
      imageQuality: 85,
    );
    await _uploadFromPath(file?.path);
  }

  Future<void> _pickFromGallery() async {
    final result = await FilePicker.platform.pickFiles(
      type: FileType.custom,
      allowedExtensions: const ['jpg', 'jpeg', 'png', 'pdf'],
    );
    await _uploadFromPath(result?.files.single.path);
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
          Text(documentTypeLabel(l10n, widget.documentType),
              style: SmartTaxiTextStyles.title.copyWith(color: palette.text)),
          const SizedBox(height: 4),
          Text(
            l10n.driverDocumentUploadHint,
            style: SmartTaxiTextStyles.subtitle
                .copyWith(color: palette.textSecondary),
          ),
          const SizedBox(height: 18),
          if (_uploading)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 24),
              child: Center(child: CircularProgressIndicator()),
            )
          else ...[
            if (_error != null) ...[
              Text(_error!, style: TextStyle(color: palette.danger)),
              const SizedBox(height: 12),
            ],
            SizedBox(
              width: double.infinity,
              child: ElevatedButton.icon(
                onPressed: _pickFromCamera,
                icon: const Icon(Icons.photo_camera_outlined),
                label: Text(l10n.driverDocumentPickCamera),
              ),
            ),
            const SizedBox(height: 10),
            SizedBox(
              width: double.infinity,
              child: OutlinedButton.icon(
                onPressed: _pickFromGallery,
                icon: const Icon(Icons.folder_open_outlined),
                label: Text(l10n.driverDocumentPickFile),
              ),
            ),
          ],
        ],
      ),
    );
  }
}
