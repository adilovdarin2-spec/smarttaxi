import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:smarttaxi_app/core/api/api_client.dart';
import 'package:smarttaxi_app/core/theme/app_theme.dart';
import 'package:smarttaxi_app/features/driver/models/driver_document_models.dart';
import 'package:smarttaxi_app/features/driver/screens/onboarding/driver_application_documents_screen.dart';
import 'package:smarttaxi_app/l10n/app_localizations.dart';
import 'api_transport_test.dart' show MemoryAuthStore;

class ApplicationDocumentsApi extends ApiClient {
  ApplicationDocumentsApi() : super(MemoryAuthStore('applicant'));
  bool failRead = false;
  int reads = 0;
  @override
  Future<List<DriverDocument>> getDriverApplicationDocuments(String id) async {
    expect(id, 'own');
    reads++;
    if (failRead) throw const FormatException('Unavailable snapshot');
    return [
      for (final type in DriverDocumentType.required)
        DriverDocument(
            id: type,
            type: type,
            originalFilename: 'QA-only.pdf',
            mimeType: 'application/pdf',
            sizeBytes: 10,
            status: type == DriverDocumentType.licenseFront
                ? 'REJECTED'
                : 'PENDING',
            createdAt: DateTime(2026, 9, 16)),
    ];
  }
}

Widget screen(ApplicationDocumentsApi api, double scale) => MaterialApp(
      theme: buildSmartTaxiTheme(),
      locale: const Locale('ru'),
      localizationsDelegates: AppLocalizations.localizationsDelegates,
      supportedLocales: AppLocalizations.supportedLocales,
      builder: (context, child) => MediaQuery(
          data: MediaQuery.of(context)
              .copyWith(textScaler: TextScaler.linear(scale)),
          child: child!),
      home: DriverApplicationDocumentsScreen(api: api, applicationId: 'own'),
    );

void main() {
  for (final scale in [1.0, 1.5, 2.0]) {
    testWidgets(
        'reopened documents restore status and allow rejected replacement at 320px/$scale',
        (tester) async {
      await tester.binding.setSurfaceSize(const Size(320, 844));
      addTearDown(() => tester.binding.setSurfaceSize(null));
      final api = ApplicationDocumentsApi();
      await tester.pumpWidget(screen(api, scale));
      await tester.pumpAndSettle();
      final context =
          tester.element(find.byType(DriverApplicationDocumentsScreen));
      final l10n = AppLocalizations.of(context);
      expect(api.reads, 1);
      expect(find.text(l10n.driverDocumentStatusRejected), findsOneWidget);
      expect(find.text(l10n.driverDocumentPickCameraShort), findsOneWidget);
      expect(find.text(l10n.driverDocumentPickFileShort), findsOneWidget);
      expect(find.text(l10n.driverApplicationDocumentsDone), findsNothing);
      expect(tester.takeException(), isNull);
    });
  }
  testWidgets(
      'failed document read offers retry without pretending no files exist',
      (tester) async {
    final api = ApplicationDocumentsApi()..failRead = true;
    await tester.pumpWidget(screen(api, 1));
    await tester.pumpAndSettle();
    final l10n = AppLocalizations.of(
        tester.element(find.byType(DriverApplicationDocumentsScreen)));
    expect(find.text(l10n.driverApplicationReadFailed), findsOneWidget);
    expect(find.text(l10n.driverDocumentPickFileShort), findsNothing);
    api.failRead = false;
    await tester.tap(find.text(l10n.refreshButton));
    await tester.pumpAndSettle();
    expect(api.reads, 2);
    expect(find.text(l10n.driverDocumentStatusRejected), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}
