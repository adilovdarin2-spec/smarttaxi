import 'dart:io';

import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:smarttaxi_app/features/shared/api_error_messages.dart';
import 'package:smarttaxi_app/l10n/app_localizations.dart';

// Отказ сервера должен быть объяснён на языке, на котором человек читает
// экран. Раньше приложение знало 36 кодов из 95 достижимых, остальные
// превращались в "что-то пошло не так": место в очереди закрылось, бронь
// просрочена, цена вне границ — и непонятно, что делать.
//
// Список кодов берётся из самого модуля, чтобы новый код нельзя было добавить
// без перевода на все четыре языка.
List<String> _codesInModule() {
  final src =
      File('lib/features/shared/api_error_messages.dart').readAsStringSync();
  return RegExp(r"'([A-Z_]{4,})':")
      .allMatches(src)
      .map((m) => m.group(1)!)
      .toList();
}

void main() {
  final codes = _codesInModule();

  test('the shared table actually covers the codes it was written for', () {
    expect(codes.length, greaterThanOrEqualTo(59));
    expect(codes, contains('STAND_RESERVATION_EXPIRED'));
    expect(codes, contains('OFFERED_PRICE_OUT_OF_BOUNDS'));
    expect(codes, contains('INVALID_SMS_CODE'));
    expect(codes, contains('INSUFFICIENT_CASHBACK'));
    // Коды у всех разные: опечатка в ключе съела бы соседнюю строку молча.
    expect(codes.toSet().length, codes.length);
  });

  for (final code in const ['ru', 'kk', 'uz', 'zh']) {
    test('every code reads as a sentence in $code', () async {
      final l10n = await AppLocalizations.delegate.load(Locale(code));
      final generic = l10n.errorGenericRequestFailed;
      for (final errorCode in codes) {
        final text = apiErrorMessage(errorCode, l10n);
        expect(text, isNotNull, reason: '$errorCode без текста в $code');
        expect(text!.trim(), isNotEmpty, reason: '$errorCode пуст в $code');
        expect(text, isNot(equals(generic)),
            reason: '$errorCode в $code скатился к общему тексту');
        // Сырой код в тексте означает, что перевод забыли и подставили ключ.
        expect(text, isNot(contains(errorCode)),
            reason: '$errorCode в $code показывает сам код');
      }
    });
  }

  test('an unknown code asks the caller to fall back, not invent', () async {
    final l10n = await AppLocalizations.delegate.load(const Locale('ru'));
    expect(apiErrorMessage('SOMETHING_NEW_FROM_THE_SERVER', l10n), isNull);
    expect(apiErrorMessage(null, l10n), isNull);
    expect(apiErrorMessage('', l10n), isNull);
  });
}
