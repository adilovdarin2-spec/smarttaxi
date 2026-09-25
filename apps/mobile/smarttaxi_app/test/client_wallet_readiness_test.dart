import 'dart:async';
import 'dart:io';
import 'dart:ui' as ui;
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:smarttaxi_app/core/api/api_client.dart';
import 'package:smarttaxi_app/core/theme/app_theme.dart';
import 'package:smarttaxi_app/features/passenger/models/client_wallet_models.dart';
import 'package:smarttaxi_app/features/passenger/screens/wallet/client_wallet_screen.dart';
import 'package:smarttaxi_app/l10n/app_localizations.dart';
import 'api_transport_test.dart'
    show MemoryAuthStore, TestAdapter, jsonResponse;

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUpAll(() async {
    await (FontLoader('Inter')
          ..addFont(rootBundle.load('assets/fonts/InterVariable.ttf')))
        .load();
    await (FontLoader('MaterialIcons')
          ..addFont(rootBundle.load('fonts/MaterialIcons-Regular.otf')))
        .load();
  });
  test(
      'wallet requires confirmed KZT balance and masks legacy card values defensively',
      () {
    for (final value in [null, '', 'invalid', double.nan]) {
      expect(
          () => ClientWalletSummary.fromJson(
              {'balanceKzt': value, 'currency': 'KZT'}),
          throwsFormatException);
    }
    expect(
        ClientWalletSummary.fromJson({'balanceKzt': 0, 'currency': 'KZT'})
            .balanceKzt,
        0);
    expect(
        ClientCard.fromJson(
                {'id': 'old', 'maskedCardNumber': '4111111111111111'})
            .maskedCardNumber,
        '•••• 1111');
  });

  for (final locale in ['ru', 'kk', 'uz', 'zh']) {
    for (final dark in [false, true]) {
      for (final scale in [1.0, 1.6]) {
        testWidgets(
            'wallet $locale dark=$dark scale=$scale remains readable without payment forms',
            (tester) async {
          tester.view.physicalSize = const Size(320, 844);
          tester.view.devicePixelRatio = 1;
          addTearDown(tester.view.resetPhysicalSize);
          addTearDown(tester.view.resetDevicePixelRatio);
          final adapter = TestAdapter((request) async {
            expect(request.method, 'GET');
            if (request.path.endsWith('/cards')) {
              return jsonResponse({
                'cards': [
                  {
                    'id': 'old-card',
                    'maskedCardNumber': '•••• 1234',
                    'holderName': 'Local QA'
                  }
                ]
              });
            }
            if (request.path.endsWith('/topup-requests')) {
              return jsonResponse({
                'topupRequests': [
                  {
                    'id': 'old-request',
                    'amountKzt': 5000,
                    'status': 'PENDING',
                    'createdAt': '2026-09-09T10:00:00Z'
                  }
                ]
              });
            }
            return jsonResponse({
              'balanceKzt': 1450,
              'currency': 'KZT',
              'capabilities': {'cardBinding': false, 'topUp': false}
            });
          });
          final dio = Dio(BaseOptions(baseUrl: 'http://127.0.0.1:1'))
            ..httpClientAdapter = adapter;
          addTearDown(() => dio.close(force: true));
          final api =
              ApiClient(MemoryAuthStore('local-test-session'), dio: dio);
          final boundary = GlobalKey();
          await tester.pumpWidget(MaterialApp(
            theme: buildSmartTaxiTheme(),
            darkTheme: buildSmartTaxiDarkTheme(),
            themeMode: dark ? ThemeMode.dark : ThemeMode.light,
            locale: Locale(locale),
            localizationsDelegates: AppLocalizations.localizationsDelegates,
            supportedLocales: AppLocalizations.supportedLocales,
            builder: (context, child) => MediaQuery(
                data: MediaQuery.of(context)
                    .copyWith(textScaler: TextScaler.linear(scale)),
                child: child!),
            home: RepaintBoundary(
                key: boundary,
                child: Scaffold(body: ClientWalletScreen(api: api))),
          ));
          await tester.pumpAndSettle();
          expect(tester.takeException(), isNull);
          expect(find.text('1 450 ₸'), findsOneWidget);
          expect(find.byType(TextField), findsNothing);
          final output = Platform.environment['CLIENT_WALLET_QA_OUTPUT'];
          if (output != null && locale == 'ru' && scale == 1) {
            final render = boundary.currentContext!.findRenderObject()!
                as RenderRepaintBoundary;
            await tester.runAsync(() async {
              final picture = await render.toImage(pixelRatio: 2);
              final bytes =
                  (await picture.toByteData(format: ui.ImageByteFormat.png))!;
              await Directory(output).create(recursive: true);
              await File(
                      '$output/flutter-wallet-${dark ? 'dark' : 'light'}-320.png')
                  .writeAsBytes(bytes.buffer.asUint8List());
              picture.dispose();
            });
          }
          await tester.drag(find.byType(ListView), const Offset(0, -1600));
          await tester.pumpAndSettle();
          expect(tester.takeException(), isNull);
          expect(find.text('•••• 1234'), findsOneWidget);
          expect(adapter.requests.length, 3);
        });
      }
    }
  }

  testWidgets(
      'failed concurrent read does not show a fabricated zero or fail after disposal',
      (tester) async {
    final summary = Completer<ResponseBody>();
    final adapter = TestAdapter((request) async {
      if (request.path.endsWith('/wallet')) return summary.future;
      return jsonResponse({'error': 'FORBIDDEN'}, 403);
    });
    final dio = Dio(BaseOptions(baseUrl: 'http://127.0.0.1:1'))
      ..httpClientAdapter = adapter;
    addTearDown(() => dio.close(force: true));
    await tester.pumpWidget(MaterialApp(
        locale: const Locale('ru'),
        localizationsDelegates: AppLocalizations.localizationsDelegates,
        supportedLocales: AppLocalizations.supportedLocales,
        home: Scaffold(
            body: ClientWalletScreen(
                api: ApiClient(MemoryAuthStore('local-test-session'),
                    dio: dio)))));
    await tester.pump(const Duration(milliseconds: 100));
    expect(tester.takeException(), isNull);
    summary.complete(jsonResponse({'balanceKzt': 1450, 'currency': 'KZT'}));
    await tester.pumpAndSettle();
    expect(find.text('0 ₸'), findsNothing);
    expect(find.text('Повторить'), findsWidgets);
    await tester.pumpWidget(const SizedBox());
    expect(tester.takeException(), isNull);
  });

  testWidgets('uncertain removal stays visible and locked until refresh',
      (tester) async {
    var deletions = 0;
    final adapter = TestAdapter((request) async {
      if (request.method == 'DELETE') {
        deletions++;
        throw DioException(
            requestOptions: request, type: DioExceptionType.connectionError);
      }
      if (request.path.endsWith('/cards')) {
        return jsonResponse({
          'cards': [
            {'id': 'old-card', 'maskedCardNumber': '•••• 1234'}
          ]
        });
      }
      if (request.path.endsWith('/topup-requests')) {
        return jsonResponse({'topupRequests': []});
      }
      return jsonResponse({'balanceKzt': 0, 'currency': 'KZT'});
    });
    final dio = Dio(BaseOptions(baseUrl: 'http://127.0.0.1:1'))
      ..httpClientAdapter = adapter;
    addTearDown(() => dio.close(force: true));
    await tester.pumpWidget(MaterialApp(
        theme: buildSmartTaxiTheme(),
        locale: const Locale('ru'),
        localizationsDelegates: AppLocalizations.localizationsDelegates,
        supportedLocales: AppLocalizations.supportedLocales,
        home: Scaffold(
            body: ClientWalletScreen(
                api: ApiClient(MemoryAuthStore('local-test-session'),
                    dio: dio)))));
    await tester.pumpAndSettle();
    final remove = find.byWidgetPredicate(
        (widget) => widget is IconButton && widget.tooltip == 'Удалить');
    final refresh = find.byWidgetPredicate(
        (widget) => widget is IconButton && widget.tooltip == 'Повторить');
    await tester.ensureVisible(remove);
    await tester.pumpAndSettle();
    await tester.tap(remove);
    await tester.pumpAndSettle();
    expect(find.byType(AlertDialog), findsOneWidget);
    await tester.tap(find.widgetWithText(TextButton, 'Удалить'));
    await tester.pumpAndSettle();
    expect(deletions, 1);
    expect(
        find.text(
            'Не удалось подтвердить удаление. Обновите данные перед повторной попыткой.'),
        findsOneWidget);
    expect(tester.widget<IconButton>(remove).onPressed, isNull);
    await tester.drag(find.byType(ListView), const Offset(0, 1600));
    await tester.pumpAndSettle();
    await tester.ensureVisible(refresh);
    await tester.pumpAndSettle();
    await tester.tap(refresh);
    await tester.pumpAndSettle();
    await tester.drag(find.byType(ListView), const Offset(0, -1600));
    await tester.pumpAndSettle();
    expect(tester.widget<IconButton>(remove).onPressed, isNotNull);
    expect(deletions, 1);
    expect(tester.takeException(), isNull);
  });

  test('card deletion requires an actual acknowledgement', () async {
    final adapter = TestAdapter((_) async => jsonResponse({}));
    final dio = Dio(BaseOptions(baseUrl: 'http://127.0.0.1:1'))
      ..httpClientAdapter = adapter;
    addTearDown(() => dio.close(force: true));
    await expectLater(
        ApiClient(MemoryAuthStore('local-test-session'), dio: dio)
            .removeClientCard('old'),
        throwsStateError);
    expect(adapter.requests.length, 1);
    expect(adapter.requests.single.method, 'DELETE');
  });
}
