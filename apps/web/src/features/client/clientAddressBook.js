export const extraClientRegionPresets = [
  {
    id: "LOCAL_KIROV",
    code: "KIROV",
    name: "Киров",
    displayName: "Киров",
    alias: "Кирово",
    subtitle: "Мақтааральский район",
    centerLat: 40.7869,
    centerLng: 68.5344,
    currency: "KZT"
  },
  {
    id: "LOCAL_ASYKATA",
    code: "ASYKATA",
    name: "Асыката",
    displayName: "Асыката",
    alias: "Асықата",
    subtitle: "Жетысайский район",
    centerLat: 40.8947,
    centerLng: 68.3635,
    currency: "KZT"
  },
  {
    id: "LOCAL_DOSTYK",
    code: "DOSTYK",
    name: "Достык",
    displayName: "Достык",
    alias: "Достық",
    subtitle: "Мақтааральский район",
    centerLat: 40.8072,
    centerLng: 68.4592,
    currency: "KZT"
  },
  {
    id: "LOCAL_YNTYMAK",
    code: "YNTYMAK",
    name: "Ынтымак",
    displayName: "Ынтымак",
    alias: "Ынтымақ",
    subtitle: "Мақтааральский район",
    centerLat: 40.7606,
    centerLng: 68.4979,
    currency: "KZT"
  },
  {
    id: "LOCAL_BIRLIK",
    code: "BIRLIK",
    name: "Бирлик",
    displayName: "Бирлик",
    alias: "Бірлік",
    subtitle: "Мақтааральский район",
    centerLat: 40.8225,
    centerLng: 68.4018,
    currency: "KZT"
  },
  {
    id: "LOCAL_FIRDOUSI",
    code: "FIRDOUSI",
    name: "Фирдоуси",
    displayName: "Фирдоуси",
    alias: "Фердоуси",
    subtitle: "Мақтааральский район",
    centerLat: 40.7231,
    centerLng: 68.5016,
    currency: "KZT"
  },
  {
    id: "LOCAL_ZHANA_ZHOL",
    code: "ZHANA_ZHOL",
    name: "Жана Жол",
    displayName: "Жана Жол",
    alias: "Жаңа жол",
    subtitle: "Мақтааральский район",
    centerLat: 40.7567,
    centerLng: 68.5661,
    currency: "KZT"
  },
  {
    id: "LOCAL_MAKTAARAL",
    code: "MAKTAARAL",
    name: "Мақтаарал",
    displayName: "Мақтаарал",
    alias: "Мактаарал",
    subtitle: "Мақтааральский район",
    centerLat: 40.7358,
    centerLng: 68.5364,
    currency: "KZT"
  },
  {
    id: "LOCAL_ATAMEKEN",
    code: "ATAMEKEN",
    name: "Атамекен",
    displayName: "Атамекен",
    alias: "Ата мекен",
    subtitle: "Мақтааральский район",
    centerLat: 40.8121,
    centerLng: 68.5839,
    currency: "KZT"
  },
  {
    id: "LOCAL_TURKISTAN",
    code: "TURKISTAN",
    name: "Туркестан",
    displayName: "Туркестан",
    alias: "Түркістан",
    subtitle: "Туркестанская область",
    centerLat: 43.2973,
    centerLng: 68.2518,
    currency: "KZT"
  },
  {
    id: "LOCAL_SARYAGASH",
    code: "SARYAGASH",
    name: "Сарыагаш",
    displayName: "Сарыагаш",
    alias: "Сарыағаш",
    subtitle: "Туркестанская область",
    centerLat: 41.4604,
    centerLng: 69.1679,
    currency: "KZT"
  }
];

const localLandmarkTypes = [
  { suffix: "центр", subtitle: "центральная точка", icon: "target", tags: ["центр", "центральный", "площадь"] },
  { suffix: "базар", subtitle: "рынок и торговые ряды", icon: "trips", tags: ["базар", "рынок", "сауда", "магазин"] },
  { suffix: "акимат", subtitle: "администрация и центр услуг", icon: "work", tags: ["акимат", "администрация", "цон", "қызмет"] },
  { suffix: "мечеть", subtitle: "местная мечеть", icon: "pin", tags: ["мечеть", "мешіт", "намаз"] },
  { suffix: "школа", subtitle: "школа и учебная зона", icon: "home", tags: ["школа", "мектеп", "учеба"] },
  { suffix: "поликлиника", subtitle: "медпункт и аптеки рядом", icon: "work", tags: ["больница", "поликлиника", "медпункт", "аптека"] },
  { suffix: "остановка", subtitle: "автобусная остановка", icon: "trips", tags: ["остановка", "автобус", "маршрутка"] }
];

const localRegionCenters = [
  { region: "KIROV", title: "Киров (Кирово)", subtitle: "Мақтааральский район", lat: 40.7869, lng: 68.5344, aliases: ["киров", "кирово", "kirov"] },
  { region: "ASYKATA", title: "Асыката (Асықата)", subtitle: "Жетысайский район", lat: 40.8947, lng: 68.3635, aliases: ["асыката", "асықата", "asykata"] },
  { region: "DOSTYK", title: "Достык (Достық)", subtitle: "Мақтааральский район", lat: 40.8072, lng: 68.4592, aliases: ["достык", "достық", "dostyk"] },
  { region: "YNTYMAK", title: "Ынтымак (Ынтымақ)", subtitle: "Мақтааральский район", lat: 40.7606, lng: 68.4979, aliases: ["ынтымак", "ынтымақ", "yntymak"] },
  { region: "BIRLIK", title: "Бирлик (Бірлік)", subtitle: "Мақтааральский район", lat: 40.8225, lng: 68.4018, aliases: ["бирлик", "бірлік", "birlik"] },
  { region: "FIRDOUSI", title: "Фирдоуси", subtitle: "Мақтааральский район", lat: 40.7231, lng: 68.5016, aliases: ["фирдоуси", "фердоуси", "firdousi"] },
  { region: "ZHANA_ZHOL", title: "Жана Жол (Жаңа жол)", subtitle: "Мақтааральский район", lat: 40.7567, lng: 68.5661, aliases: ["жана жол", "жаңа жол", "жанажол", "zhana zhol"] },
  { region: "MAKTAARAL", title: "Мақтаарал (Мактаарал)", subtitle: "Мақтааральский район", lat: 40.7358, lng: 68.5364, aliases: ["мақтаарал", "мактаарал", "maktaaral"] },
  { region: "ATAMEKEN", title: "Атамекен", subtitle: "Мақтааральский район", lat: 40.8121, lng: 68.5839, aliases: ["атамекен", "ата мекен", "atameken"] }
];

function around(point, index) {
  const latStep = [0, 0.0012, -0.0011, 0.0008, -0.0009, 0.0016, -0.0015][index] || 0;
  const lngStep = [0, 0.0014, -0.0013, -0.001, 0.0011, -0.0017, 0.0018][index] || 0;
  return {
    lat: Number((point.lat + latStep).toFixed(6)),
    lng: Number((point.lng + lngStep).toFixed(6))
  };
}

function buildLocalLandmarks() {
  return localRegionCenters.flatMap(center => [
    {
      region: center.region,
      title: center.title,
      subtitle: `${center.subtitle}, центр`,
      lat: center.lat,
      lng: center.lng,
      icon: "target",
      tags: [...center.aliases, "центр", "центр поселка", "орталық"]
    },
    ...localLandmarkTypes.slice(1).map((type, index) => ({
      region: center.region,
      title: `${type.suffix[0].toUpperCase()}${type.suffix.slice(1)} ${center.title.split(" ")[0]}`,
      subtitle: `${center.title}, ${type.subtitle}`,
      ...around(center, index + 1),
      icon: type.icon,
      tags: [...center.aliases, ...type.tags, type.suffix]
    }))
  ]);
}

export const extraClientAddressCatalog = [
  { region: "ATAKENT", title: "Атакент (Ильич)", subtitle: "Центр посёлка, местное название Ильич", lat: 40.844435, lng: 68.509021, icon: "target", tags: ["ильич", "илич", "атакент", "центр", "поселок"] },
  { region: "ATAKENT", title: "Нижний базар", subtitle: "Атакент, рынок у нижней части", lat: 40.84392, lng: 68.51243, icon: "trips", tags: ["нижний", "базар", "рынок", "төменгі базар"] },
  { region: "ATAKENT", title: "Верхний базар", subtitle: "Атакент, торговые ряды", lat: 40.84608, lng: 68.51081, icon: "trips", tags: ["верхний", "базар", "рынок", "жоғарғы базар"] },
  { region: "ATAKENT", title: "Старый центр", subtitle: "Атакент, старый центр", lat: 40.84495, lng: 68.50782, icon: "pin", tags: ["старый", "центр", "старый центр"] },
  { region: "ATAKENT", title: "Новая улица", subtitle: "Атакент, новый квартал", lat: 40.84188, lng: 68.51638, icon: "pin", tags: ["новая", "новый район", "квартал"] },
  { region: "ATAKENT", title: "Улица Абая 1А", subtitle: "Атакент, ориентир ТРЦ Атакент Молл", lat: 40.84803, lng: 68.50768, icon: "work", tags: ["абая 1а", "абая", "abai", "трц", "молл"] },
  { region: "ATAKENT", title: "Улица Абая 10", subtitle: "Атакент, район центральной улицы", lat: 40.84742, lng: 68.50862, icon: "pin", tags: ["абая 10", "абай 10", "abai 10"] },
  { region: "ATAKENT", title: "Улица Абая 25", subtitle: "Атакент, центральная улица", lat: 40.84671, lng: 68.51013, icon: "pin", tags: ["абая 25", "абай 25", "abai 25"] },
  { region: "ATAKENT", title: "Улица Школьная", subtitle: "Атакент, рядом со школами", lat: 40.84276, lng: 68.51344, icon: "home", tags: ["школьная", "school", "школа", "мектеп"] },
  { region: "ATAKENT", title: "Улица Школьная 12", subtitle: "Атакент, школа №3", lat: 40.84276, lng: 68.51344, icon: "home", tags: ["школьная 12", "школа 3", "мектеп 3"] },
  { region: "ATAKENT", title: "Улица Жамбыла 5", subtitle: "Атакент, район Жамбыла", lat: 40.84536, lng: 68.51574, icon: "pin", tags: ["жамбыла 5", "жамбыл 5", "zhambyl"] },
  { region: "ATAKENT", title: "Улица Жамбыла 18", subtitle: "Атакент, район Жамбыла", lat: 40.84464, lng: 68.51671, icon: "pin", tags: ["жамбыла 18", "жамбыл 18"] },
  { region: "ATAKENT", title: "Улица Сатпаева 7", subtitle: "Атакент, район Сатпаева", lat: 40.83995, lng: 68.50884, icon: "pin", tags: ["сатпаева 7", "сатпаев 7", "satpayev"] },
  { region: "ATAKENT", title: "Улица Сатпаева 20", subtitle: "Атакент, район Сатпаева", lat: 40.84043, lng: 68.51002, icon: "pin", tags: ["сатпаева 20", "сатпаев 20"] },
  { region: "ATAKENT", title: "Улица Толе би 4", subtitle: "Атакент, район Толе би", lat: 40.85072, lng: 68.51212, icon: "pin", tags: ["толе би 4", "төле би 4", "tole bi"] },
  { region: "ATAKENT", title: "Улица Толе би 17", subtitle: "Атакент, район Толе би", lat: 40.84977, lng: 68.51346, icon: "pin", tags: ["толе би 17", "төле би 17"] },
  { region: "ATAKENT", title: "Детский сад Атакент", subtitle: "Атакент, рядом с центром", lat: 40.84659, lng: 68.51127, icon: "home", tags: ["садик", "детсад", "балабақша", "детский сад"] },
  { region: "ATAKENT", title: "Аптека у центра", subtitle: "Атакент, центральная аптека", lat: 40.84573, lng: 68.50968, icon: "work", tags: ["аптека", "дәріхана", "центр"] },
  { region: "ATAKENT", title: "АЗС Атакент", subtitle: "Атакент, заправка у трассы", lat: 40.84792, lng: 68.50274, icon: "trips", tags: ["азс", "заправка", "бензин", "газ"] },
  { region: "ATAKENT", title: "Кафе у базара", subtitle: "Атакент, рядом с рынком", lat: 40.84481, lng: 68.51204, icon: "favorite", tags: ["кафе", "еда", "базар", "рынок"] },
  { region: "ATAKENT", title: "Свадебный зал Атакент", subtitle: "Атакент, банкетный зал", lat: 40.84129, lng: 68.51137, icon: "favorite", tags: ["свадебный", "зал", "тойхана", "банкет"] },
  { region: "ATAKENT", title: "Почта Атакент", subtitle: "Атакент, отделение Казпочты", lat: 40.84552, lng: 68.50894, icon: "work", tags: ["почта", "казпочта", "post"] },
  { region: "ATAKENT", title: "Стадион Атакент", subtitle: "Атакент, спортивная площадка", lat: 40.84092, lng: 68.51492, icon: "favorite", tags: ["стадион", "спорт", "поле"] },
  { region: "ATAKENT", title: "Магазин у остановки", subtitle: "Атакент, центральная остановка", lat: 40.84544, lng: 68.50872, icon: "work", tags: ["магазин", "остановка", "центр"] },
  { region: "ATAKENT", title: "Рынок одежды", subtitle: "Атакент, торговые ряды", lat: 40.84431, lng: 68.51122, icon: "trips", tags: ["одежда", "рынок", "базар", "вещевой"] },
  { region: "ATAKENT", title: "Мойка Атакент", subtitle: "Атакент, автомойка", lat: 40.84712, lng: 68.50573, icon: "trips", tags: ["мойка", "автомойка", "машина"] },
  { region: "ATAKENT", title: "Таксопарк SmartTaxi", subtitle: "Атакент, рабочая точка водителей", lat: 40.84506, lng: 68.50818, icon: "trips", tags: ["таксопарк", "смарттакси", "водители"] },

  ...buildLocalLandmarks(),

  { region: "TURKISTAN", title: "Туркестан центр", subtitle: "Туркестан, городской центр", lat: 43.2973, lng: 68.2518, icon: "target", tags: ["туркестан", "түркістан", "центр"] },
  { region: "TURKISTAN", title: "Караван Сарай", subtitle: "Туркестан, туристическая зона", lat: 43.304, lng: 68.2704, icon: "favorite", tags: ["караван", "сарай", "туризм"] },
  { region: "SARYAGASH", title: "Сарыагаш центр", subtitle: "Сарыагаш, городской центр", lat: 41.4604, lng: 69.1679, icon: "target", tags: ["сарыагаш", "сарыағаш", "центр"] },
  { region: "SARYAGASH", title: "Вокзал Сарыагаш", subtitle: "Сарыагаш, железнодорожный вокзал", lat: 41.4591, lng: 69.1691, icon: "trips", tags: ["вокзал", "поезд", "жд"] }
];
