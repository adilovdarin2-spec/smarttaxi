import '../shared/models.dart';
import '../../l10n/app_localizations.dart';

/// Подпись под найденным адресом на языке приложения.
///
/// Сервер присылает название места и его тип, а не готовую фразу. Раньше он
/// присылал фразу — русскую, всегда: под каждым адресом на казахском экране
/// стояло «Атакент, улица Абая». Сами названия посёлка и улицы не переводятся,
/// а слова вокруг них — «центр», «улица», «административный центр округа» —
/// переводятся, поэтому фразу собираем здесь.
///
/// Возвращает null, когда собрать не из чего: у внешних геокодеров типа места
/// нет, и для них остаётся серверная строка — чужой язык лучше пустоты.
String? localizedAddressSubtitle(AppLocalizations l10n, AddressSuggestion item) {
  final city = (item.city ?? '').trim();
  final kind = (item.placeKind ?? '').trim();
  if (city.isEmpty || kind.isEmpty) return null;
  switch (kind) {
    case 'settlement_centre':
      return l10n.addressKindSettlementCentre(city);
    case 'district_centre':
      return l10n.addressKindDistrictCentre(city);
    case 'street':
      final street = (item.street ?? '').trim();
      // Тип «улица» без названия улицы — неполные данные, а не повод
      // напечатать «Атакент, улица » с оборванным хвостом.
      if (street.isEmpty) return city;
      return l10n.addressKindStreet(city, street);
    case 'settlement':
      return city;
    default:
      return null;
  }
}
