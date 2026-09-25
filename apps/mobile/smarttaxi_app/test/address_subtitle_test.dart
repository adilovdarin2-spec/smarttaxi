import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:smarttaxi_app/features/passenger/address_subtitle.dart';
import 'package:smarttaxi_app/features/shared/models.dart';
import 'package:smarttaxi_app/l10n/app_localizations.dart';

// Приложение открывают на четырёх языках. Подпись под найденным адресом
// приходила от сервера готовой русской фразой — «Атакент, улица Абая» —
// и стояла так же посреди казахского, узбекского и китайского экрана.
//
// Теперь сервер присылает название места и тип (settlement_centre, street,
// district_centre, settlement), а фразу собирает клиент. Название посёлка и
// улицы остаётся как есть: это имена собственные, их не переводят.
AddressSuggestion _place({
  required String label,
  String? city,
  String? placeKind,
  String? street,
  String? subtitle,
}) {
  return AddressSuggestion(
    label: label,
    coordinate: const Coordinate(lat: 40.84, lng: 68.51),
    city: city,
    placeKind: placeKind,
    street: street,
    subtitle: subtitle,
  );
}

void main() {
  Future<AppLocalizations> load(String code) =>
      AppLocalizations.delegate.load(Locale(code));

  test('the centre of a settlement reads in each language', () async {
    final place = _place(
      label: 'Атакент (Ильич)',
      city: 'Атакент',
      placeKind: 'settlement_centre',
    );
    expect(localizedAddressSubtitle(await load('ru'), place), 'Атакент, центр');
    expect(
        localizedAddressSubtitle(await load('kk'), place), 'Атакент, орталық');
    expect(localizedAddressSubtitle(await load('uz'), place), 'Атакент, markaz');
    expect(localizedAddressSubtitle(await load('zh'), place), 'Атакент中心');
  });

  test('a street keeps its own name and translates the word around it',
      () async {
    final place = _place(
      label: 'ул. Абая, Атакент',
      city: 'Атакент',
      placeKind: 'street',
      street: 'Абая',
    );
    expect(localizedAddressSubtitle(await load('ru'), place),
        'Атакент, улица Абая');
    expect(localizedAddressSubtitle(await load('kk'), place),
        'Атакент, Абая көшесі');
    expect(localizedAddressSubtitle(await load('uz'), place),
        "Атакент, Абая ko'chasi");
    expect(localizedAddressSubtitle(await load('zh'), place), 'Атакент，Абая街');
  });

  test('the administrative centre of a rural okrug reads in each language',
      () async {
    final place = _place(
      label: 'Акимат Жанажолского сельского округа',
      city: 'Жана Жол',
      placeKind: 'district_centre',
    );
    expect(localizedAddressSubtitle(await load('ru'), place),
        'Жана Жол, административный центр округа');
    expect(localizedAddressSubtitle(await load('kk'), place),
        'Жана Жол, ауылдық округ орталығы');
    expect(localizedAddressSubtitle(await load('uz'), place),
        'Жана Жол, qishloq okrugi markazi');
    expect(localizedAddressSubtitle(await load('zh'), place),
        'Жана Жол，乡区行政中心');
  });

  test('a place whose label already names it shows only the town', () async {
    // «Центральная районная больница» и так сказано в заголовке — подпись
    // отвечает только на вопрос «где», и одинаково на всех языках.
    final place = _place(
      label: 'Автовокзал Жетысай',
      city: 'Жетысай',
      placeKind: 'settlement',
    );
    for (final code in const ['ru', 'kk', 'uz', 'zh']) {
      expect(localizedAddressSubtitle(await load(code), place), 'Жетысай');
    }
  });

  test('a result from an outside geocoder keeps the sentence the server sent',
      () async {
    // У MapTiler и Photon типа места нет. Своей фразы тут не собрать, и
    // чужая строка честнее пустой подписи.
    final place = _place(
      label: 'Районная больница, Шимкентская трасса',
      subtitle: 'Атакент, Түркістан облысы',
    );
    expect(localizedAddressSubtitle(await load('kk'), place), isNull);
  });

  test('a street with no street name does not print a dangling word',
      () async {
    final place = _place(
      label: 'Где-то в Достыке',
      city: 'Достык',
      placeKind: 'street',
    );
    expect(localizedAddressSubtitle(await load('kk'), place), 'Достык');
  });
}
