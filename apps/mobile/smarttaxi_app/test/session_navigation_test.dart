import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:smarttaxi_app/core/auth/session_navigation.dart';

void main() {
  testWidgets('Logout removes pushed private pages and their dialogs',
      (tester) async {
    final navigation = SessionNavigation();
    Widget app(String session, {bool dark = false}) => MaterialApp(
          navigatorKey: navigation.keyFor(session),
          theme: dark ? ThemeData.dark() : ThemeData.light(),
          home: Scaffold(body: Text('root $session')),
        );
    await tester.pumpWidget(app('driver'));
    final driverKey = navigation.keyFor('driver');
    driverKey.currentState!.push(MaterialPageRoute<void>(
        builder: (_) => const Scaffold(body: Text('private profile'))));
    await tester.pumpAndSettle();
    expect(find.text('private profile'), findsOneWidget);
    // An ordinary theme/locale-style rebuild must not close the page.
    await tester.pumpWidget(app('driver', dark: true));
    await tester.pumpAndSettle();
    expect(navigation.keyFor('driver'), same(driverKey));
    expect(find.text('private profile'), findsOneWidget);
    unawaited(showDialog<void>(
      context: tester.element(find.text('private profile')),
      builder: (_) => const AlertDialog(content: Text('private dialog')),
    ));
    await tester.pumpAndSettle();
    expect(find.text('private dialog'), findsOneWidget);
    await tester.pumpWidget(app('auth'));
    await tester.pumpAndSettle();
    expect(find.text('root auth'), findsOneWidget);
    expect(find.text('private profile'), findsNothing);
    expect(find.text('private dialog'), findsNothing);
    expect(navigation.keyFor('auth').currentState!.canPop(), isFalse);
    expect(driverKey.currentState, isNull);
    expect(tester.takeException(), isNull);
    // Returning to the role must create a fresh stack, not resurrect it.
    await tester.pumpWidget(app('driver'));
    await tester.pumpAndSettle();
    expect(navigation.keyFor('driver'), isNot(same(driverKey)));
    expect(find.text('root driver'), findsOneWidget);
    expect(find.text('private profile'), findsNothing);
    expect(tester.takeException(), isNull);
  });
}
