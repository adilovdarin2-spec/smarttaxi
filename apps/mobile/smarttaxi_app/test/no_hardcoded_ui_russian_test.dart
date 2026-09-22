import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

/// Words that are the same in every language this app ships, or are units
/// rather than prose. Everything else that reads as a Russian word inside a
/// widget is a string the Kazakh, Uzbek and Chinese apps will show in
/// Russian — which is how "Рекомендованная" sat under the price stepper on a
/// Kazakh phone until a device found it.
const _allowedWords = {
  'км', // kilometres — written the same in ru and kk
  'мин', // minutes, likewise
};

/// Literals that are deliberately Russian, each for a stated reason. A new
/// one has to be argued for here rather than slipped in, which is the whole
/// point of this test.
const _knownExceptions = {
  // The label for a session whose stored user payload is not a map at all,
  // produced in _AppState above the MaterialApp — there is no Localizations
  // ancestor to read there. Reached only when the payload is corrupt, and the
  // same text exists as `defaultAccountLabel` for every screen with a context.
  'lib/main.dart:Аккаунт BaiSapar',

  // Sent, not shown: the SOS message goes to the operator on duty and to the
  // admin panel, both of which are read in Russian whatever language the
  // phone that raised the alarm is set to.
  'lib/features/driver/widgets/driver_common_widgets.dart:координаты недоступны',
  r'lib/features/driver/widgets/driver_common_widgets.dart:Экстренный вызов водителя. Координаты: $locationText.',
  'lib/features/passenger/passenger_shell.dart:координаты недоступны',
  r'lib/features/passenger/passenger_shell.dart:Экстренный вызов во время поездки. Координаты: $locationText.',

  // Same reason: the support topic the rider picks is shown to them from
  // AppLocalizations, and sent to the backend in Russian because support
  // staff read the admin panel in Russian. See topicRuLabel.
  'lib/features/passenger/passenger_shell.dart:Проблема с поездкой',
  'lib/features/passenger/passenger_shell.dart:Водитель не приехал',
  'lib/features/passenger/passenger_shell.dart:Забыл вещь',
  'lib/features/passenger/passenger_shell.dart:Оплата',
  'lib/features/passenger/passenger_shell.dart:Другое',

  // Initial field values that are always replaced before anything renders
  // them: the map picker sets its label from AppLocalizations the moment it
  // opens, and every assignment to _pickup/_dropoff sets the matching label
  // in the same setState.
  'lib/features/passenger/passenger_shell.dart:Точка на карте',
  'lib/features/passenger/passenger_shell.dart:Выберите точку подачи',
  'lib/features/passenger/passenger_shell.dart:Введите адрес назначения',

  // The sentinel the order merge compares against, deliberately untranslated
  // — see kPickupPlaceholder in models.dart for why a translated one breaks.
  'lib/features/shared/models.dart:Точка посадки',
  'lib/features/shared/models.dart:Точка назначения',

  // _roadAlertLabelFallback: RoadAlert.label is filled during JSON parsing,
  // where there is no context. Nothing renders that field — every screen
  // calls roadAlertLabel(l10n, alert.type) instead — so these never reach a
  // rider or a driver.
  'lib/features/shared/models.dart:Дорожная опасность',
  'lib/features/shared/models.dart:ДТП',
  'lib/features/shared/models.dart:Ремонт дороги',
  'lib/features/shared/models.dart:Камера скорости',
  'lib/features/shared/models.dart:Контроль движения',
  'lib/features/shared/models.dart:Пробка',
  'lib/features/shared/models.dart:Закрытая дорога',
  'lib/features/shared/models.dart:Плохая дорога',
  'lib/features/shared/models.dart:Яма',
  'lib/features/shared/models.dart:Лежачий полицейский',
  'lib/features/shared/models.dart:Скользкая дорога',
  'lib/features/shared/models.dart:Школьная зона',
  'lib/features/shared/models.dart:Временное ограничение',
  'lib/features/shared/models.dart:Опасный поворот',
  'lib/features/shared/models.dart:Ж/д переезд',
  'lib/features/shared/models.dart:Пешеходный переход',
  'lib/features/shared/models.dart:Другое',
  'lib/features/shared/models.dart:Дорожный знак',
  'lib/features/shared/models.dart:Тариф',

  // compassLabel: the 16-point abbreviation shown and spoken beside a camera
  // that faces a particular way. This one IS a gap — a Kazakh driver reads
  // "СВ" and a Chinese one reads nothing at all — but the abbreviations are
  // not the same letters in Kazakh, and inventing Uzbek and Chinese ones
  // without someone who speaks them is worse than leaving it. Recorded in
  // docs/status so it is a decision rather than an oversight.
  'lib/features/shared/models.dart:ССВ',
  'lib/features/shared/models.dart:ВСВ',
  'lib/features/shared/models.dart:ВЮВ',
  'lib/features/shared/models.dart:ЮЮВ',
  'lib/features/shared/models.dart:ЮЮЗ',
  'lib/features/shared/models.dart:ЗЮЗ',
  'lib/features/shared/models.dart:ЗСЗ',
  'lib/features/shared/models.dart:ССЗ',
};

final _cyrillicWord = RegExp(r'[А-Яа-яЁёӘәҒғҚқҢңӨөҰұҮүҺһІі]{3,}');
final _readsAValue = RegExp(r"""(==|!=|contains\(|startsWith\(|endsWith\(|case )\s*'""");

// Windows hands back a path with backslashes; compare on one spelling.
String _slashes(String path) =>
    path.replaceAll(String.fromCharCode(92), '/');

/// Files that are deliberately Russian whatever the interface language.
bool _isExempt(String path) {
  final normalized = _slashes(path);
  // The offer and the privacy policy are legal documents with one
  // authoritative language, stated in their own final clause. The texts now
  // arrive in legal_content.g.dart, generated from the same JSON the website
  // shows, so neither file is translated here.
  if (normalized.contains('legal_content.dart')) return true;
  if (normalized.contains('legal_content.g.dart')) return true;
  // The translations themselves, and the code generated from them.
  return normalized.contains('/l10n/');
}

void main() {
  test('nothing a widget renders is written in Russian in the source', () {
    final offenders = <String>[];
    for (final file in Directory('lib')
        .listSync(recursive: true)
        .whereType<File>()
        .where((file) => file.path.endsWith('.dart'))
        .where((file) => !_isExempt(file.path))) {
      final lines = file.readAsLinesSync();
      for (var i = 0; i < lines.length; i++) {
        final line = lines[i];
        // Comments explain the code, often about Russian-language data.
        if (line.trimLeft().startsWith('//')) continue;
        // Matching server-supplied Russian data (tariff names, address
        // labels, alert codes) is not interface copy: those lines read a
        // value, they do not show one.
        if (_readsAValue.hasMatch(line)) continue;
        for (final match in RegExp("'([^']*)'").allMatches(line)) {
          // A raw string in this codebase is a pattern, never copy: regexes
          // that match Russian street words, region spellings and the "no
          // address" sentinel read data, they do not show it.
          if (match.start > 0 && line[match.start - 1] == 'r') continue;
          final literal = match.group(1)!;
          final flagged = _cyrillicWord
              .allMatches(literal)
              .map((m) => m[0]!)
              .where((word) => !_allowedWords.contains(word.toLowerCase()));
          if (flagged.isEmpty) continue;
          if (_knownExceptions.contains('${_slashes(file.path)}:$literal')) {
            continue;
          }
          offenders.add('${_slashes(file.path)}:${i + 1}: $literal');
        }
      }
    }
    expect(
      offenders,
      isEmpty,
      reason: 'these read as Russian prose and are not translated:\n'
          '${offenders.join('\n')}',
    );
  });
}
