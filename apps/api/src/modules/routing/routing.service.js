import https from "node:https";
import { env } from "../../config/env.js";
import { AppError } from "../../common/errors.js";
import { redis } from "../../db/redis.js";
import { query as defaultQuery } from "../../db/pool.js";
import { orderRoom, dispatchRegionRoom, ACTIVE_ORDER_STATUSES, TO_PICKUP_ORDER_STATUSES, TO_DROPOFF_ORDER_STATUSES } from "../orders/order-dispatch.service.js";
import { prepareOrderPricing } from "../orders/order-pricing.service.js";
import { assertDriverDispatchReady } from "../driver-region-approvals/driver-region-approvals.service.js";
import { listActiveRegions, normalizePoint, pointInPolygon, publicRegion } from "../regions/regions.service.js";

function run(executor, sql, params = []) {
  return executor.query ? executor.query(sql, params) : executor(sql, params);
}

function toNullableNumber(value, min, max, code) {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) throw new AppError("Invalid location metric", 400, code);
  return parsed;
}

function routeUnavailable(message = "Routing provider is unavailable") {
  return new AppError(message, 503, "ROUTE_UNAVAILABLE");
}

function addressSearchUnavailable(message = "Address search provider is unavailable") {
  return new AppError(message, 503, "ADDRESS_SEARCH_UNAVAILABLE");
}

function nominatimHeaders() {
  return {
    "User-Agent": "SmartTaxi/1.0 support@smarttaxi.local",
    "Accept": "application/json"
  };
}

function compactText(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function normalizedText(value) {
  return compactText(value).toLocaleLowerCase("ru-KZ").replace(/ё/g, "е");
}

function buildAddressSearchQuery(query, region) {
  const cleanQuery = compactText(query);
  const cleanRegion = compactText(region || env.CITY);
  const lowerQuery = normalizedText(cleanQuery);
  const parts = [cleanQuery];
  if (cleanRegion && !lowerQuery.includes(normalizedText(cleanRegion))) {
    parts.push(cleanRegion);
  }
  if (!lowerQuery.includes("kazakhstan") && !lowerQuery.includes("казахстан")) {
    parts.push("Kazakhstan");
  }
  return parts.join(" ");
}

const LEGACY_LOCAL_ADDRESS_HINTS = [
  {
    label: "Атакент (Ильич)",
    subtitle: "Центр посёлка",
    city: "Атакент",
    region: "Туркестанская область",
    lat: 40.844435,
    lng: 68.509021,
    keywords: ["атакент", "atakent", "ильич", "ilich", "ilyich", "старый ильич", "центр атакент", "центр ильич"]
  },
  {
    label: "ул. Абая, Атакент (Ильич)",
    subtitle: "Атакент, Туркестанская область",
    city: "Атакент",
    region: "Туркестанская область",
    lat: 40.84803,
    lng: 68.50768,
    keywords: ["абая", "абаi", "abai", "абай", "улица абая", "ул абая", "атакент абая", "ильич абая"]
  },
  {
    label: "ул. Жамбыла, Атакент (Ильич)",
    subtitle: "Атакент, Туркестанская область",
    city: "Атакент",
    region: "Туркестанская область",
    lat: 40.84536,
    lng: 68.51574,
    keywords: ["жамбыла", "zhambyl", "жамбыл", "улица жамбыла", "ул жамбыла", "атакент жамбыла", "ильич жамбыла"]
  },
  {
    label: "ул. Сатпаева, Атакент (Ильич)",
    subtitle: "Атакент, Туркестанская область",
    city: "Атакент",
    region: "Туркестанская область",
    lat: 40.83995,
    lng: 68.50884,
    keywords: ["сатпаева", "satpayev", "сатпаев", "улица сатпаева", "ул сатпаева", "атакент сатпаева", "ильич сатпаева"]
  },
  {
    label: "ул. Толе би, Атакент (Ильич)",
    subtitle: "Атакент, Туркестанская область",
    city: "Атакент",
    region: "Туркестанская область",
    lat: 40.85072,
    lng: 68.51212,
    keywords: ["толе би", "төлеби", "tole bi", "толе", "улица толе би", "атакент толе би", "ильич толе би"]
  },
  {
    label: "Атакент автовокзал",
    subtitle: "Ориентир, Атакент (Ильич)",
    city: "Атакент",
    region: "Туркестанская область",
    lat: 40.84621,
    lng: 68.50486,
    keywords: ["автовокзал", "вокзал", "остановка", "атакент автовокзал", "ильич автовокзал"]
  },
  {
    label: "Атакент базар",
    subtitle: "Ориентир, Атакент (Ильич)",
    city: "Атакент",
    region: "Туркестанская область",
    lat: 40.84473,
    lng: 68.51162,
    keywords: ["базар", "рынок", "атакент базар", "ильич базар", "центральный рынок"]
  },
  {
    label: "Атакент школа",
    subtitle: "Ориентир, Атакент (Ильич)",
    city: "Атакент",
    region: "Туркестанская область",
    lat: 40.84276,
    lng: 68.51344,
    keywords: ["школа", "мектеп", "атакент школа", "ильич школа"]
  },
  {
    label: "Мырзакент",
    subtitle: "Центр региона",
    city: "Мырзакент",
    region: "Туркестанская область",
    lat: 40.666108,
    lng: 68.54309,
    keywords: ["мырзакент", "myrzakent", "мирзакент", "центр мырзакент"]
  },
  {
    label: "Жетысай",
    subtitle: "Центр города",
    city: "Жетысай",
    region: "Туркестанская область",
    lat: 40.884303,
    lng: 68.212621,
    keywords: ["жетысай", "zhetysay", "жетисай", "центр жетысай"]
  },
  {
    label: "Шымкент",
    subtitle: "Центр города",
    city: "Шымкент",
    region: "Шымкент",
    lat: 42.314696,
    lng: 69.588328,
    keywords: ["шымкент", "shymkent", "чимкент", "центр шымкент"]
  },
  {
    label: "Киров",
    subtitle: "Киров (Кирово), центр",
    city: "Киров",
    region: "Туркестанская область",
    lat: 40.7869,
    lng: 68.5344,
    keywords: ["киров", "кирово", "kirov", "центр киров", "базар киров", "школа киров"]
  },
  {
    label: "Асыката",
    subtitle: "Асыката (Асықата), центр",
    city: "Асыката",
    region: "Туркестанская область",
    lat: 40.8947,
    lng: 68.3635,
    keywords: ["асыката", "асықата", "asykata", "центр асыката", "базар асыката"]
  },
  {
    label: "Достык",
    subtitle: "Достык (Достық), центр",
    city: "Достык",
    region: "Туркестанская область",
    lat: 40.8072,
    lng: 68.4592,
    keywords: ["достык", "достық", "dostyk", "центр достык", "базар достык"]
  },
  {
    label: "Ынтымак",
    subtitle: "Ынтымак (Ынтымақ), центр",
    city: "Ынтымак",
    region: "Туркестанская область",
    lat: 40.7606,
    lng: 68.4979,
    keywords: ["ынтымак", "ынтымақ", "yntymak", "центр ынтымак", "базар ынтымак"]
  },
  {
    label: "Бирлик",
    subtitle: "Бирлик (Бірлік), центр",
    city: "Бирлик",
    region: "Туркестанская область",
    lat: 40.8225,
    lng: 68.4018,
    keywords: ["бирлик", "бірлік", "birlik", "центр бирлик", "базар бирлик"]
  },
  {
    label: "Фирдоуси",
    subtitle: "Фирдоуси, центр",
    city: "Фирдоуси",
    region: "Туркестанская область",
    lat: 40.7231,
    lng: 68.5016,
    keywords: ["фирдоуси", "фердоуси", "firdousi", "центр фирдоуси"]
  },
  {
    label: "Жана Жол",
    subtitle: "Жана Жол (Жаңа жол), центр",
    city: "Жана Жол",
    region: "Туркестанская область",
    lat: 40.7567,
    lng: 68.5661,
    keywords: ["жана жол", "жаңа жол", "жанажол", "zhana zhol", "центр жана жол"]
  },
  {
    label: "Мақтаарал",
    subtitle: "Мақтаарал (Мактаарал), центр",
    city: "Мақтаарал",
    region: "Туркестанская область",
    lat: 40.7358,
    lng: 68.5364,
    keywords: ["мақтаарал", "мактаарал", "maktaaral", "центр мактаарал"]
  },
  {
    label: "Атамекен",
    subtitle: "Атамекен, центр",
    city: "Атамекен",
    region: "Туркестанская область",
    lat: 40.8121,
    lng: 68.5839,
    keywords: ["атамекен", "ата мекен", "atameken", "центр атамекен"]
  }
];

const LOCAL_ADDRESS_HINTS = [
  {
    label: "Атакент (Ильич)",
    subtitle: "Центр посёлка",
    city: "Атакент",
    region: "Туркестанская область",
    lat: 40.844435,
    lng: 68.509021,
    keywords: ["атакент", "atakent", "ильич", "ilich", "ilyich", "центр атакент", "центр ильич"]
  },
  {
    label: "ул. Абая, Атакент",
    subtitle: "Атакент, улица Абая",
    city: "Атакент",
    region: "Туркестанская область",
    lat: 40.84803,
    lng: 68.50768,
    keywords: ["абая", "abai", "абай", "улица абая", "ул абая", "атакент абая"]
  },
  {
    label: "ул. Жамбыла, Атакент",
    subtitle: "Атакент, улица Жамбыла",
    city: "Атакент",
    region: "Туркестанская область",
    lat: 40.84536,
    lng: 68.51574,
    keywords: ["жамбыла", "zhambyl", "жамбыл", "улица жамбыла", "ул жамбыла"]
  },
  {
    label: "ул. Сатпаева, Атакент",
    subtitle: "Атакент, улица Сатпаева",
    city: "Атакент",
    region: "Туркестанская область",
    lat: 40.83995,
    lng: 68.50884,
    keywords: ["сатпаева", "satpayev", "сатпаев", "улица сатпаева", "ул сатпаева"]
  },
  {
    label: "ул. Толе би, Атакент",
    subtitle: "Атакент, улица Толе би",
    city: "Атакент",
    region: "Туркестанская область",
    lat: 40.85072,
    lng: 68.51212,
    keywords: ["толе би", "төле би", "tole bi", "улица толе би", "ул толе би"]
  },
  {
    label: "Атакент базар",
    subtitle: "Центральный рынок, Атакент",
    city: "Атакент",
    region: "Туркестанская область",
    lat: 40.84473,
    lng: 68.51162,
    keywords: ["базар", "рынок", "центральный рынок", "atakent bazar", "market"]
  },
  {
    label: "Атакент автовокзал",
    subtitle: "Ориентир, Атакент",
    city: "Атакент",
    region: "Туркестанская область",
    lat: 40.84621,
    lng: 68.50486,
    keywords: ["автовокзал", "вокзал", "остановка", "станция", "bus station"]
  },
  {
    label: "Районная больница «Атакент»",
    subtitle: "Атакент, ул. Ж. Ибраева",
    city: "Атакент",
    region: "Туркестанская область",
    lat: 40.84210,
    lng: 68.51190,
    keywords: ["больница", "поликлиника", "hospital", "ибраева", "районная больница"]
  },
  {
    label: "ЖД станция Мактаарал",
    subtitle: "Атакент, железнодорожная станция",
    city: "Атакент",
    region: "Туркестанская область",
    lat: 40.83980,
    lng: 68.49820,
    keywords: ["жд станция", "вокзал жд", "станция мактаарал", "railway", "поезд"]
  },
  {
    label: "Акимат посёлка Атакент",
    subtitle: "Атакент, здание акимата",
    city: "Атакент",
    region: "Туркестанская область",
    lat: 40.84550,
    lng: 68.50750,
    keywords: ["акимат", "акимшилик", "администрация", "atakent akimat"]
  },
  {
    label: "Мырзакент (Славянка)",
    subtitle: "Центр Мырзакента",
    city: "Мырзакент",
    region: "Туркестанская область",
    lat: 40.665495,
    lng: 68.549994,
    keywords: ["мырзакент", "myrzakent", "мирзакент", "славянка", "славян", "slavyanka", "центр мырзакент"]
  },
  {
    label: "Акимат Мактааральского района",
    subtitle: "Мырзакент, районный акимат",
    city: "Мырзакент",
    region: "Туркестанская область",
    lat: 40.66690,
    lng: 68.55210,
    keywords: ["акимат", "администрация района", "мактаарал акимат", "district administration"]
  },
  {
    label: "Мырзакент базар",
    subtitle: "Центральный рынок, Мырзакент",
    city: "Мырзакент",
    region: "Туркестанская область",
    lat: 40.66492,
    lng: 68.54464,
    keywords: ["базар", "рынок", "центральный рынок", "myrzakent bazar", "market"]
  },
  {
    label: "Автовокзал Мырзакент",
    subtitle: "Ориентир, Мырзакент",
    city: "Мырзакент",
    region: "Туркестанская область",
    lat: 40.66848,
    lng: 68.53928,
    keywords: ["автовокзал", "вокзал", "остановка", "станция", "bus station"]
  },
  {
    label: "Центральная районная больница",
    subtitle: "Мырзакент, ЦРБ Мактааральского района",
    city: "Мырзакент",
    region: "Туркестанская область",
    lat: 40.66978,
    lng: 68.54742,
    keywords: ["больница", "црб", "поликлиника", "hospital", "районная больница"]
  },
  {
    label: "Жетысай (Джетысай)",
    subtitle: "Центр города",
    city: "Жетысай",
    region: "Туркестанская область",
    lat: 40.777134,
    lng: 68.324677,
    keywords: ["жетысай", "жетісай", "zhetysay", "жетисай", "джетысай", "джетисай", "центр жетысай"]
  },
  {
    label: "Центральный базар Жетысай",
    subtitle: "Жетысай, центральный рынок",
    city: "Жетысай",
    region: "Туркестанская область",
    lat: 40.77980,
    lng: 68.32190,
    keywords: ["базар", "рынок", "центральный рынок", "zhetysay bazar", "market"]
  },
  {
    label: "Акимат Жетысайского района",
    subtitle: "Жетысай, городской сквер",
    city: "Жетысай",
    region: "Туркестанская область",
    lat: 40.77650,
    lng: 68.32710,
    keywords: ["акимат", "администрация", "городской сквер", "district administration"]
  },
  {
    label: "Мечеть «Нур»",
    subtitle: "Жетысай",
    city: "Жетысай",
    region: "Туркестанская область",
    lat: 40.77420,
    lng: 68.32990,
    keywords: ["мечеть", "нур", "mosque", "nur mosque"]
  },
  {
    label: "Автовокзал Жетысай",
    subtitle: "Ориентир, Жетысай",
    city: "Жетысай",
    region: "Туркестанская область",
    lat: 40.78191,
    lng: 68.31951,
    keywords: ["автовокзал", "вокзал", "остановка", "станция", "bus station"]
  },
  {
    label: "ул. Мухтара Ауезова, Жетысай",
    subtitle: "Жетысай, улица Ауезова",
    city: "Жетысай",
    region: "Туркестанская область",
    lat: 40.77860,
    lng: 68.32860,
    keywords: ["ауезова", "auezov", "мухтара ауезова", "улица ауезова", "ул ауезова"]
  },
  {
    label: "Киров (Оргебас)",
    subtitle: "Кирово, центр",
    city: "Киров",
    region: "Туркестанская область",
    lat: 40.7869,
    lng: 68.5344,
    // Официальное современное название села — Оргебас (переименовано
    // с "Кирово" в 2000 г., см. ru.wikipedia.org/wiki/Оргебас). city и
    // координаты оставлены как "Киров" — под этим именем/кодом KIROV
    // заведена зона диспетчеризации в apps/api/src/db/migrations.js,
    // переименование сломало бы привязку заказов к региону.
    keywords: ["киров", "кирово", "kirov", "kirovo", "оргебас", "orgebas", "центр киров", "базар киров"]
  },
  {
    label: "Асыката (Кировский)",
    subtitle: "Асыката, центр",
    city: "Асыката",
    region: "Туркестанская область",
    lat: 40.8947,
    lng: 68.3635,
    // До переименования — посёлок Кировский (ru.wikipedia.org/wiki/Асыката).
    keywords: ["асыката", "асықата", "asykata", "кировский", "kirovskiy", "центр асыката"]
  },
  {
    label: "Аппарат акима Асыкатинского сельского округа",
    subtitle: "Асыката — административный центр округа",
    city: "Асыката",
    region: "Туркестанская область",
    lat: 40.8955,
    lng: 68.362,
    // Асыката подтверждена Wikipedia как административный центр
    // Асыкатинской сельской администрации; точный адрес здания акимата
    // не подтверждён — координата приблизительная, смещена от центра села.
    keywords: ["акимат", "аппарат акима", "администрация", "asykata akimat"]
  },
  {
    label: "Хлопкоперерабатывающий завод «Ак-Алтын»",
    subtitle: "Асыката",
    city: "Асыката",
    region: "Туркестанская область",
    lat: 40.893,
    lng: 68.366,
    // Завод подтверждён Wikipedia (статья "Асыката"); точный адрес не
    // подтверждён — координата приблизительная, смещена от центра села.
    keywords: ["ак-алтын", "ак алтын", "ak-altyn", "завод", "хлопкозавод", "хлопкоперерабатывающий"]
  },
  {
    label: "Достык (Ждановское)",
    subtitle: "Достык, центр",
    city: "Достык",
    region: "Туркестанская область",
    lat: 40.8072,
    lng: 68.4592,
    // До 1995 г. — село Ждановское (ru.wikipedia.org/wiki/Достык_(Достыкский_сельский_округ)).
    keywords: ["достык", "достық", "dostyk", "ждановское", "zhdanovskoe", "центр достык"]
  },
  {
    label: "Акимат Достыкского сельского округа",
    subtitle: "Достык, ул. Абая, 25а",
    city: "Достык",
    region: "Туркестанская область",
    lat: 40.8085,
    lng: 68.461,
    // Адрес подтверждён (2ГИС: "Акимат Достыкского сельского округа,
    // улица Абая, 25а, с. Достык"); координата приблизительная —
    // смещена от центра села, точную геопривязку дома не проверял.
    keywords: ["акимат", "администрация", "абая", "абай", "dostyk akimat"]
  },
  {
    label: "ул. Кантореев, Достык",
    subtitle: "Достык, улица Кантореев",
    city: "Достык",
    region: "Туркестанская область",
    lat: 40.806,
    lng: 68.457,
    // Улица подтверждена (postaldb.net, почтовый индекс X53D0A9, дом 45,
    // улица Кантореев, с. Достык); координата приблизительная.
    keywords: ["кантореев", "kantoreev", "улица кантореев", "ул кантореев"]
  },
  {
    label: "Ынтымак (Микоян)",
    subtitle: "Ынтымак, центр",
    city: "Ынтымак",
    region: "Туркестанская область",
    lat: 40.7606,
    lng: 68.4979,
    // До 1993 г. — село Микоян (ru.wikipedia.org/wiki/Ынтымак_(Мактааральский_район)).
    keywords: ["ынтымак", "ынтымақ", "yntymak", "микоян", "mikoyan", "центр ынтымак"]
  },
  {
    label: "Бирлик",
    subtitle: "Бірлік, центр",
    city: "Бирлик",
    region: "Туркестанская область",
    lat: 40.8225,
    lng: 68.4018,
    // Историческое название по документам — "отделение №3 совхоза
    // «Большевик»" (ru.wikipedia.org/wiki/Бирлик_(Мактааральский_район));
    // это формальное обозначение, а не разговорный топоним, поэтому в
    // label не выносим, только в keywords для поиска.
    keywords: ["бирлик", "бірлік", "birlik", "большевик", "bolshevik", "отделение 3", "центр бирлик"]
  },
  {
    label: "Фирдоуси (Таджиккишлак)",
    subtitle: "Фирдоуси, центр",
    city: "Фирдоуси",
    region: "Туркестанская область",
    lat: 40.7231,
    lng: 68.5016,
    // Прежние названия — Таджиккишлак, позднее Рохи нав
    // (ru.wikipedia.org/wiki/Фирдоуси_(село)).
    keywords: ["фирдоуси", "фердоуси", "firdousi", "таджиккишлак", "tajikkishlak", "рохи нав", "rohi nav"]
  },
  {
    label: "ул. Макталы, Фирдоуси",
    subtitle: "Фирдоуси, улица Макталы",
    city: "Фирдоуси",
    region: "Туркестанская область",
    lat: 40.7245,
    lng: 68.5035,
    // Улица подтверждена (postaldb.net, почтовый индекс X53H0M0, дом 43,
    // улица Макталы, с. Фирдоуси); координата приблизительная.
    keywords: ["макталы", "maktaly", "улица макталы", "ул макталы"]
  },
  {
    label: "Жана Жол",
    subtitle: "Жаңа жол, центр",
    city: "Жана Жол",
    region: "Туркестанская область",
    lat: 40.7567,
    lng: 68.5661,
    // До 2000 г. называлось "30 лет Казахской ССР"
    // (ru.wikipedia.org/wiki/Жанажол_(Мактааральский_район)); громоздкое
    // советское название не выносим в label, только в keywords.
    keywords: ["жана жол", "жаңа жол", "жанажол", "zhana zhol", "30 лет казсср", "тридцать лет казсср"]
  },
  {
    label: "Акимат Жанажолского сельского округа",
    subtitle: "Жана Жол — административный центр округа",
    city: "Жана Жол",
    region: "Туркестанская область",
    lat: 40.758,
    lng: 68.5675,
    // Средняя уверенность: статьи Wikipedia о соседних сёлах (Оргебас,
    // Фирдоуси, Достык) указывают, что все они входят в "Жанажолский
    // сельский округ", что обычно означает Жана Жол — его центр; прямого
    // подтверждения точного адреса акимата не нашёл, координата
    // приблизительная.
    keywords: ["акимат", "администрация", "zhanazhol akimat"]
  },
  {
    label: "Мактаарал",
    subtitle: "Мақтаарал, центр",
    city: "Мактаарал",
    region: "Туркестанская область",
    lat: 40.7358,
    lng: 68.5364,
    keywords: ["мактаарал", "мақтаарал", "maktaaral"]
  },
  {
    label: "Атамекен (Куйбышево)",
    subtitle: "Атамекен, центр",
    city: "Атамекен",
    region: "Туркестанская область",
    lat: 40.8121,
    lng: 68.5839,
    // До 2000 г. — село Куйбышево (ru.wikipedia.org/wiki/Атамекен_(Мактааральский_район)).
    keywords: ["атамекен", "ата мекен", "atameken", "куйбышево", "kuybyshevo"]
  },
  {
    label: "Акимат Атамекенского сельского округа",
    subtitle: "Атамекен — административный центр округа",
    city: "Атамекен",
    region: "Туркестанская область",
    lat: 40.811,
    lng: 68.585,
    // Атамекен подтверждён Wikipedia как административный центр
    // Атамекенского сельского округа; точный адрес здания акимата не
    // подтверждён, координата приблизительная.
    keywords: ["акимат", "администрация", "atameken akimat"]
  }
];

function searchLocalAddressHints(query, regionHint, limit = 8) {
  const normalizedQuery = normalizedText(query);
  if (normalizedQuery.length < 2) return [];
  // Resolve to the canonical town key (e.g. "atakent" -> "атакент") instead
  // of a raw substring check against regionHint directly — regionHint can
  // arrive in Latin script (env.CITY defaults to "Atakent") while the hint
  // list itself is written in Cyrillic. Matching is then done against each
  // item's own `city` field specifically, NOT the full alias list: every
  // hint's `region` field is the same shared oblast string ("Туркестанская
  // область"), and that oblast name is itself one of every town's aliases —
  // so alias-list matching could never actually isolate one town from
  // another (a Zhetysay hint would match an Atakent search because both
  // share the "туркестан" alias). City-field matching doesn't have that leak.
  const resolvedKey = findRegionAliasEntry(regionHint)?.[0] || normalizedText(regionHint || env.CITY);

  const matches = LOCAL_ADDRESS_HINTS.filter(item => {
    const haystack = normalizedText(
      [item.label, item.subtitle, item.city, item.region, ...(item.keywords || [])].join(" ")
    );
    const itemCity = normalizedText(item.city || "");
    const regionMatches = !resolvedKey || itemCity === resolvedKey ||
      itemCity.includes(resolvedKey) || resolvedKey.includes(itemCity);
    const queryMatches = haystack.includes(normalizedQuery) ||
      normalizedQuery.split(/\s+/).some(part => part.length >= 2 && haystack.includes(part));
    return queryMatches && regionMatches;
  }).map(({ keywords, ...item }) => item);

  return matches.slice(0, Math.min(Math.max(Number(limit) || 8, 1), 12));
}

export function listLocalGeoCatalog({ region, limit = 100 } = {}) {
  const normalizedRegion = normalizedText(region || "");
  const max = Math.min(Math.max(Number(limit) || 100, 1), 500);
  return LOCAL_ADDRESS_HINTS
    .filter(item => {
      if (!normalizedRegion) return true;
      return normalizedText([item.label, item.subtitle, item.city, item.region, ...(item.keywords || [])].join(" ")).includes(normalizedRegion);
    })
    .slice(0, max)
    .map(({ keywords, ...item }) => item);
}

function suggestionText(item) {
  return normalizedText([item.label, item.subtitle, item.city, item.region].filter(Boolean).join(" "));
}

function addressQueryScore(item, query) {
  const normalizedQuery = normalizedText(query);
  if (!normalizedQuery) return 20;
  const label = normalizedText(item.label);
  const text = suggestionText(item);
  if (label === normalizedQuery) return 0;
  if (label.startsWith(normalizedQuery)) return 1;
  if (label.includes(normalizedQuery)) return 2;
  if (text.includes(normalizedQuery)) return 3;
  return 20;
}

function dedupeAddressSuggestions(addresses) {
  const seen = new Set();
  return addresses.filter(item => {
    const key = [
      normalizedText(item.label),
      Number(item.lat).toFixed(5),
      Number(item.lng).toFixed(5)
    ].join("|");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function sortAddressSuggestions(addresses, regionHint, query = "") {
  const hint = normalizedText(regionHint || env.CITY);
  if (!hint && !query) return addresses;
  return [...addresses].sort((left, right) => {
    const leftQuery = addressQueryScore(left, query);
    const rightQuery = addressQueryScore(right, query);
    if (leftQuery !== rightQuery) return leftQuery - rightQuery;
    const leftText = suggestionText(left);
    const rightText = suggestionText(right);
    const leftLocal = leftText.includes(hint) ? 0 : 1;
    const rightLocal = rightText.includes(hint) ? 0 : 1;
    return leftLocal - rightLocal;
  });
}

const LEGACY_REGION_SEARCH_ALIASES = {
  "атакент": ["атакент", "atakent", "мақтаарал", "maktaaral", "туркістан", "туркестан", "turkistan"],
  "мырзакент": ["мырзакент", "myrzakent", "мирзакент", "мақтаарал", "maktaaral", "туркістан", "туркестан", "turkistan"],
  "жетысай": ["жетысай", "жетісай", "zhetysay", "жетыcай", "туркістан", "туркестан", "turkistan"],
  "шымкент": ["шымкент", "shymkent", "чимкент"],
  "киров": ["киров", "кирово", "kirov", "мақтаарал", "maktaaral"],
  "асыката": ["асыката", "асықата", "asykata", "жетысай", "zhetysay"],
  "достык": ["достык", "достық", "dostyk", "мақтаарал", "maktaaral"],
  "ынтымак": ["ынтымак", "ынтымақ", "yntymak", "мақтаарал", "maktaaral"],
  "бирлик": ["бирлик", "бірлік", "birlik", "мақтаарал", "maktaaral"],
  "фирдоуси": ["фирдоуси", "фердоуси", "firdousi", "мақтаарал", "maktaaral"],
  "жана жол": ["жана жол", "жаңа жол", "жанажол", "zhana zhol", "мақтаарал", "maktaaral"],
  "мактаарал": ["мактаарал", "мақтаарал", "maktaaral"],
  "атамекен": ["атамекен", "ата мекен", "atameken", "мақтаарал", "maktaaral"]
};

const LEGACY_REGION_SEARCH_CENTERS = {
  "атакент": { lat: 40.844435, lng: 68.509021, radiusKm: 18 },
  "мырзакент": { lat: 40.666108, lng: 68.54309, radiusKm: 22 },
  "жетысай": { lat: 40.884303, lng: 68.212621, radiusKm: 70 },
  "шымкент": { lat: 42.314696, lng: 69.588328, radiusKm: 80 },
  "киров": { lat: 40.7869, lng: 68.5344, radiusKm: 12 },
  "асыката": { lat: 40.8947, lng: 68.3635, radiusKm: 12 },
  "достык": { lat: 40.8072, lng: 68.4592, radiusKm: 12 },
  "ынтымак": { lat: 40.7606, lng: 68.4979, radiusKm: 12 },
  "бирлик": { lat: 40.8225, lng: 68.4018, radiusKm: 12 },
  "фирдоуси": { lat: 40.7231, lng: 68.5016, radiusKm: 12 },
  "жана жол": { lat: 40.7567, lng: 68.5661, radiusKm: 12 },
  "мактаарал": { lat: 40.7358, lng: 68.5364, radiusKm: 12 },
  "атамекен": { lat: 40.8121, lng: 68.5839, radiusKm: 12 }
};

const REGION_SEARCH_ALIASES = {
  "атакент": ["атакент", "atakent", "ильич", "ilich", "ilyich", "мактаарал", "maktaaral", "туркестан", "turkistan"],
  "мырзакент": ["мырзакент", "myrzakent", "мирзакент", "славянка", "славян", "slavyanka", "мактаарал", "maktaaral", "туркестан", "turkistan"],
  "жетысай": ["жетысай", "жетісай", "zhetysay", "жетисай", "джетысай", "джетисай", "туркестан", "turkistan"],
  "киров": ["киров", "кирово", "kirov", "kirovo", "оргебас", "orgebas", "мактаарал", "maktaaral"],
  "асыката": ["асыката", "асықата", "asykata", "кировский", "kirovskiy", "жетысай", "zhetysay"],
  "достык": ["достык", "достық", "dostyk", "ждановское", "zhdanovskoe", "мактаарал", "maktaaral"],
  "ынтымак": ["ынтымак", "ынтымақ", "yntymak", "микоян", "mikoyan", "мактаарал", "maktaaral"],
  "бирлик": ["бирлик", "бірлік", "birlik", "большевик", "bolshevik", "мактаарал", "maktaaral"],
  "фирдоуси": ["фирдоуси", "фердоуси", "firdousi", "таджиккишлак", "tajikkishlak", "рохи нав", "мактаарал", "maktaaral"],
  "жана жол": ["жана жол", "жаңа жол", "жанажол", "zhana zhol", "мактаарал", "maktaaral"],
  "мактаарал": ["мактаарал", "мақтаарал", "maktaaral"],
  "атамекен": ["атамекен", "ата мекен", "atameken", "куйбышево", "kuybyshevo", "мактаарал", "maktaaral"]
};

const REGION_SEARCH_CENTERS = {
  "атакент": { lat: 40.844435, lng: 68.509021, radiusKm: 14 },
  "мырзакент": { lat: 40.665495, lng: 68.549994, radiusKm: 22 },
  "жетысай": { lat: 40.777134, lng: 68.324677, radiusKm: 14 },
  "киров": { lat: 40.7869, lng: 68.5344, radiusKm: 12 },
  "асыката": { lat: 40.8947, lng: 68.3635, radiusKm: 12 },
  "достык": { lat: 40.8072, lng: 68.4592, radiusKm: 12 },
  "ынтымак": { lat: 40.7606, lng: 68.4979, radiusKm: 12 },
  "бирлик": { lat: 40.8225, lng: 68.4018, radiusKm: 12 },
  "фирдоуси": { lat: 40.7231, lng: 68.5016, radiusKm: 12 },
  "жана жол": { lat: 40.7567, lng: 68.5661, radiusKm: 12 },
  "мактаарал": { lat: 40.7358, lng: 68.5364, radiusKm: 12 },
  "атамекен": { lat: 40.8121, lng: 68.5839, radiusKm: 12 }
};

// REGION_SEARCH_ALIASES keys are Cyrillic, but region hints can arrive in
// Latin script too (e.g. env.CITY defaults to "Atakent"). Matching only
// against the object key missed that — "atakent" never matches the key
// "атакент" as a substring — even though "atakent" is right there in that
// entry's own alias *values*. Check both.
function findRegionAliasEntry(regionHint) {
  const hint = normalizedText(regionHint || env.CITY);
  if (!hint) return null;
  return Object.entries(REGION_SEARCH_ALIASES).find(([key, values]) => {
    if (hint.includes(key) || key.includes(hint)) return true;
    return (values || []).some(value => {
      const v = normalizedText(value);
      return v && (hint.includes(v) || v.includes(hint));
    });
  }) || null;
}

function regionAliases(regionHint) {
  const hint = normalizedText(regionHint || env.CITY);
  if (!hint) return [];
  const direct = findRegionAliasEntry(regionHint);
  return [hint, ...(direct?.[1] || [])].map(normalizedText).filter(Boolean);
}

function regionCenterRule(regionHint) {
  const hint = normalizedText(regionHint || env.CITY);
  if (!hint) return null;
  const direct = findRegionAliasEntry(regionHint);
  return (direct && REGION_SEARCH_CENTERS[direct[0]]) || null;
}

function distanceKmBetween(left, right) {
  const lat1 = Number(left?.lat);
  const lng1 = Number(left?.lng);
  const lat2 = Number(right?.lat);
  const lng2 = Number(right?.lng);
  if (![lat1, lng1, lat2, lng2].every(Number.isFinite)) return Number.POSITIVE_INFINITY;
  const toRad = value => (value * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function nearestLocalPlace(point, maxKm = 30) {
  const candidates = LOCAL_ADDRESS_HINTS
    .map(item => ({ ...item, distanceKm: distanceKmBetween(point, item) }))
    .filter(item => Number.isFinite(item.distanceKm))
    .sort((left, right) => left.distanceKm - right.distanceKm);
  const nearest = candidates[0];
  return nearest && nearest.distanceKm <= maxKm ? nearest : null;
}

function filterRegionAddressSuggestions(addresses, regionHint, limit = 8, query = "") {
  const sorted = sortAddressSuggestions(addresses, regionHint, query);
  const aliases = regionAliases(regionHint);
  const centerRule = regionCenterRule(regionHint);
  const max = Math.min(Math.max(Number(limit) || 8, 1), 12);
  if (!aliases.length) return sorted.slice(0, max);
  const local = sorted.filter(item => {
    if (centerRule && distanceKmBetween(centerRule, item) <= centerRule.radiusKm) return true;
    const text = suggestionText(item);
    const textLooksLocal = aliases.some(alias => text.includes(alias));
    return textLooksLocal && !centerRule;
  });
  if (local.length) return sortAddressSuggestions(local, regionHint, query).slice(0, max);
  // We know exactly where this region is (centerRule) but nothing the
  // geocoder returned is actually near it — showing the unfiltered list
  // here would mean a search in Atakent surfacing a kindergarten in Almaty.
  // Better to come back empty than country-wide noise.
  return centerRule ? [] : sorted.slice(0, max);
}

function shouldUseDevCertificateFallback(error) {
  if (env.NODE_ENV === "production") return false;
  const code = error?.cause?.code || error?.code || "";
  const message = `${error?.cause?.message || ""} ${error?.message || ""}`;
  return /CERT|VERIFY|TLS|UNABLE_TO_VERIFY|SELF_SIGNED|LEAF_SIGNATURE/i.test(`${code} ${message}`);
}

function getJsonViaHttps(url, { headers = {}, rejectUnauthorized = true } = {}) {
  return new Promise((resolve, reject) => {
    const request = https.get(url, {
      headers,
      rejectUnauthorized,
      timeout: 20_000
    }, response => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", chunk => { body += chunk; });
      response.on("end", () => {
        if (response.statusCode < 200 || response.statusCode >= 300) {
          resolve({ ok: false, status: response.statusCode, data: null });
          return;
        }
        try {
          resolve({ ok: true, status: response.statusCode, data: JSON.parse(body) });
        } catch (error) {
          reject(error);
        }
      });
    });
    request.on("timeout", () => {
      request.destroy(new Error("HTTPS request timeout"));
    });
    request.on("error", reject);
  });
}

async function getJson(url, { headers = {}, fetchImpl = fetch, timeoutMs = null } = {}) {
  // A dead-but-still-accepting-connections upstream (OSRM stuck, not just
  // down) would otherwise hang this call — and the request handling it —
  // indefinitely instead of failing fast into the existing fallback chain.
  const signal = timeoutMs ? AbortSignal.timeout(timeoutMs) : undefined;
  if (fetchImpl !== fetch) {
    const response = await fetchImpl(url, { headers });
    return {
      ok: response.ok,
      status: response.status,
      data: response.ok ? await response.json().catch(() => null) : null
    };
  }
  try {
    const response = await fetchImpl(url, signal ? { headers, signal } : { headers });
    return {
      ok: response.ok,
      status: response.status,
      data: response.ok ? await response.json().catch(() => null) : null
    };
  } catch (error) {
    if (!shouldUseDevCertificateFallback(error)) throw error;
    return getJsonViaHttps(url, { headers, rejectUnauthorized: false });
  }
}

async function cacheGetJson(key) {
  if (!redis.isOpen) return null;
  try {
    const value = await redis.get(key);
    return value ? JSON.parse(value) : null;
  } catch {
    return null;
  }
}

async function cacheSetJson(key, value, ttlSeconds) {
  if (!redis.isOpen) return;
  try {
    await redis.set(key, JSON.stringify(value), { EX: ttlSeconds });
  } catch {}
}

function roundedPointKey({ lat, lng }, precision = 4) {
  return `${Number(lat).toFixed(precision)},${Number(lng).toFixed(precision)}`;
}

function publicAddressSuggestion(item) {
  const lat = Number(item?.lat);
  const lng = Number(item?.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const address = item.address || {};
  const city = address.city || address.town || address.village || address.county || "";
  const region = address.state || address.region || "";
  const shortParts = [
    address.road || address.pedestrian || address.neighbourhood || address.suburb,
    address.house_number,
    city
  ].filter(Boolean);
  const label = shortParts.length
    ? shortParts.join(address.house_number ? ", " : " ")
    : String(item.display_name || "Точка на карте").split(",").slice(0, 3).join(",").trim();
  return {
    label,
    subtitle: String(item.display_name || "").split(",").slice(1, 5).join(",").trim(),
    city,
    region,
    lat,
    lng
  };
}

function publicPhotonAddressSuggestion(feature) {
  const coordinates = feature?.geometry?.coordinates;
  if (!Array.isArray(coordinates) || coordinates.length < 2) return null;
  const lng = Number(coordinates[0]);
  const lat = Number(coordinates[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const properties = feature.properties || {};
  if (properties.countrycode && String(properties.countrycode).toUpperCase() !== "KZ") return null;
  const city = properties.city || properties.town || properties.village || properties.district || properties.county || "";
  const region = properties.state || "";
  const name = properties.name || properties.street || properties.osm_value || "Точка на карте";
  const house = properties.housenumber || properties.house_number || "";
  const label = [name, house].filter(Boolean).join(", ");
  const subtitle = [
    properties.district,
    city,
    region,
    properties.country
  ].filter(Boolean).join(", ");
  return {
    label,
    subtitle,
    city,
    region,
    lat,
    lng
  };
}

function readableAddressTitle({ name, street, houseNumber, locality }) {
  const streetTitle = [street, houseNumber].filter(Boolean).join(", ");
  return compactText(streetTitle || name || locality || "Точка на карте");
}

function publicMapTilerAddressSuggestion(feature) {
  const coordinates = feature?.center || feature?.geometry?.coordinates;
  if (!Array.isArray(coordinates) || coordinates.length < 2) return null;
  const lng = Number(coordinates[0]);
  const lat = Number(coordinates[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const properties = feature.properties || {};
  const context = Array.isArray(feature.context) ? feature.context : [];
  const contextText = context.map(item => item?.text || item?.text_ru || item?.text_en || "").filter(Boolean);
  const street = properties.street || properties.road || properties.address || properties.name || "";
  const houseNumber = properties.housenumber || properties.house_number || properties.houseNumber || "";
  const locality = properties.city || properties.town || properties.village || properties.locality || contextText[0] || "";
  const region = properties.region || properties.state || contextText.find(item => /область|region|turkistan|түркістан/i.test(item)) || "";
  const name = feature.text_ru || feature.text || feature.place_name_ru || feature.place_name || properties.name || "";
  const title = readableAddressTitle({ name, street, houseNumber, locality });
  const subtitle = compactText([
    locality && title !== locality ? locality : "",
    region,
    "Казахстан"
  ].filter(Boolean).join(", "));
  return {
    label: title,
    title,
    subtitle,
    city: locality,
    region,
    lat,
    lng,
    source: "maptiler",
    confidence: Number(properties.confidence ?? feature.relevance ?? 0.8)
  };
}

async function searchAddressesWithMapTiler({ q, region, limit = 8 }, fetchImpl = fetch) {
  if (!env.MAPTILER_API_KEY) return [];
  const query = compactText(q);
  if (query.length < 2) return [];
  const cacheKey = `geo:maptiler:search:${normalizedText(region || env.CITY)}:${normalizedText(query)}:${limit}`;
  const cached = await cacheGetJson(cacheKey);
  if (cached) return cached;
  const url = new URL(`${env.MAPTILER_GEOCODING_URL.replace(/\/$/, "")}/${encodeURIComponent(buildAddressSearchQuery(query, region))}.json`);
  url.searchParams.set("key", env.MAPTILER_API_KEY);
  url.searchParams.set("limit", String(Math.min(Math.max(Number(limit) || 8, 1), 12)));
  url.searchParams.set("language", "ru");
  url.searchParams.set("country", "kz");
  const response = await getJson(url, { fetchImpl });
  if (!response.ok) {
    await cacheSetJson(`${cacheKey}:failure`, { failed: true, status: response.status }, 30);
    return [];
  }
  const features = Array.isArray(response.data?.features) ? response.data.features : [];
  const suggestions = filterRegionAddressSuggestions(
    features.map(publicMapTilerAddressSuggestion).filter(Boolean),
    region,
    limit,
    query
  );
  await cacheSetJson(cacheKey, suggestions, 300);
  return suggestions;
}

async function reverseAddressWithMapTiler({ lat, lng }, fetchImpl = fetch) {
  if (!env.MAPTILER_API_KEY) return null;
  const point = normalizePoint({ lat, lng });
  const cacheKey = `geo:maptiler:reverse:${roundedPointKey(point, 5)}`;
  const cached = await cacheGetJson(cacheKey);
  if (cached) return cached;
  const url = new URL(`${env.MAPTILER_GEOCODING_URL.replace(/\/$/, "")}/${point.lng},${point.lat}.json`);
  url.searchParams.set("key", env.MAPTILER_API_KEY);
  url.searchParams.set("language", "ru");
  url.searchParams.set("limit", "5");
  const response = await getJson(url, { fetchImpl });
  if (!response.ok) {
    await cacheSetJson(`${cacheKey}:failure`, { failed: true, status: response.status }, 30);
    return null;
  }
  const features = Array.isArray(response.data?.features) ? response.data.features : [];
  const suggestion = features.map(publicMapTilerAddressSuggestion).filter(Boolean)[0] || null;
  if (suggestion) await cacheSetJson(cacheKey, suggestion, 600);
  return suggestion;
}

async function searchAddressesWithPhoton({ q, region, limit = 8 }, fetchImpl = fetch) {
  const query = String(q || "").trim();
  if (query.length < 2) return [];
  const url = new URL("https://photon.komoot.io/api/");
  url.searchParams.set("q", buildAddressSearchQuery(query, region));
  url.searchParams.set("limit", String(Math.min(Math.max(Number(limit) || 8, 1), 12)));
  const response = await getJson(url, { fetchImpl });
  if (!response.ok) return [];
  const features = response.data?.features;
  if (!Array.isArray(features)) return [];
  return filterRegionAddressSuggestions(
    features.map(publicPhotonAddressSuggestion).filter(Boolean),
    region,
    limit,
    query
  );
}

async function reverseAddressWithPhoton({ lat, lng }, fetchImpl = fetch) {
  const point = normalizePoint({ lat, lng });
  const url = new URL("https://photon.komoot.io/reverse");
  url.searchParams.set("lat", String(point.lat));
  url.searchParams.set("lon", String(point.lng));
  const response = await getJson(url, { fetchImpl });
  if (!response.ok) return null;
  const features = response.data?.features;
  if (!Array.isArray(features) || features.length === 0) return null;
  return publicPhotonAddressSuggestion(features[0]);
}

export async function searchAddresses({ q, region, limit = 8, countrycodes = "kz" }, fetchImpl = fetch) {
  const query = String(q || "").trim();
  if (query.length < 2) return [];
  const explicitRegion = compactText(region);
  const localFallback = searchLocalAddressHints(query, explicitRegion || env.CITY, limit);
  const mapTilerFirst = await searchAddressesWithMapTiler({ q: query, region: explicitRegion || env.CITY, limit }, fetchImpl).catch(() => []);
  if (mapTilerFirst.length > 0) {
    return filterRegionAddressSuggestions(
      dedupeAddressSuggestions([...localFallback, ...mapTilerFirst]),
      region,
      limit,
      query
    );
  }
  if (localFallback.length > 0) return sortAddressSuggestions(localFallback, region, query);
  const photonFirst = await searchAddressesWithPhoton({ q: query, region, limit }, fetchImpl).catch(() => []);
  if (photonFirst.length > 0) {
    return filterRegionAddressSuggestions(
      dedupeAddressSuggestions([...localFallback, ...photonFirst]),
      region,
      limit,
      query
    );
  }
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("limit", String(Math.min(Math.max(Number(limit) || 8, 1), 12)));
  url.searchParams.set("q", buildAddressSearchQuery(query, region));
  if (countrycodes) url.searchParams.set("countrycodes", countrycodes);
  let response;
  try {
    response = await getJson(url, { headers: nominatimHeaders(), fetchImpl });
  } catch {
    const fallback = await searchAddressesWithPhoton({ q: query, region, limit }, fetchImpl).catch(() => []);
    if (fallback.length > 0) return fallback;
    if (localFallback.length > 0) return localFallback;
    throw addressSearchUnavailable();
  }
  if (!response.ok) {
    const fallback = await searchAddressesWithPhoton({ q: query, region, limit }, fetchImpl).catch(() => []);
    if (fallback.length > 0) return fallback;
    if (localFallback.length > 0) return localFallback;
    throw addressSearchUnavailable();
  }
  const data = response.data;
  if (!Array.isArray(data)) {
    const fallback = await searchAddressesWithPhoton({ q: query, region, limit }, fetchImpl).catch(() => []);
    if (fallback.length > 0) return fallback;
    if (localFallback.length > 0) return localFallback;
    throw addressSearchUnavailable();
  }
  const addresses = filterRegionAddressSuggestions(
    data.map(publicAddressSuggestion).filter(Boolean),
    region,
    limit,
    query
  );
  if (addresses.length > 0) {
    return filterRegionAddressSuggestions(
      dedupeAddressSuggestions([...localFallback, ...addresses]),
      region,
      limit,
      query
    );
  }
  const fallback = await searchAddressesWithPhoton({ q: query, region, limit }, fetchImpl).catch(() => []);
  if (fallback.length > 0) {
    return filterRegionAddressSuggestions(
      dedupeAddressSuggestions([...localFallback, ...fallback]),
      region,
      limit,
      query
    );
  }
  return sortAddressSuggestions(localFallback, region, query);
}

export async function reverseAddress({ lat, lng }, fetchImpl = fetch) {
  const point = normalizePoint({ lat, lng });
  const fallbackPoint = {
    label: "Точка на карте",
    title: "Точка на карте",
    subtitle: nearestLocalPlace(point)?.city || env.CITY || "Казахстан",
    city: nearestLocalPlace(point)?.city || env.CITY || "",
    region: nearestLocalPlace(point)?.region || "",
    lat: point.lat,
    lng: point.lng,
    source: "fallback",
    fallback: true,
    confidence: 0.2
  };
  const mapTiler = await reverseAddressWithMapTiler(point, fetchImpl).catch(() => null);
  if (mapTiler) return { ...mapTiler, fallback: false };
  const url = new URL("https://nominatim.openstreetmap.org/reverse");
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("lat", String(point.lat));
  url.searchParams.set("lon", String(point.lng));
  let response;
  try {
    response = await getJson(url, { headers: nominatimHeaders(), fetchImpl });
  } catch {
    const fallback = await reverseAddressWithPhoton(point, fetchImpl).catch(() => null);
    if (fallback) return fallback;
    return fallbackPoint;
  }
  if (!response.ok) {
    const fallback = await reverseAddressWithPhoton(point, fetchImpl).catch(() => null);
    if (fallback) return fallback;
    return fallbackPoint;
  }
  const data = response.data;
  const suggestion = publicAddressSuggestion(data);
  if (!suggestion) {
    const fallback = await reverseAddressWithPhoton(point, fetchImpl).catch(() => null);
    if (fallback) return fallback;
    return fallbackPoint;
  }
  return { ...suggestion, source: "nominatim", fallback: false };
}

async function resolveActiveRegionForPoint(pointInput, failureCode, executor) {
  const point = normalizePoint(pointInput);
  const matches = (await listActiveRegions(executor)).filter(region => pointInPolygon(point, region.boundary));
  if (matches.length === 0) throw new AppError("Point is outside active service regions", 403, failureCode);
  if (matches.length > 1) throw new AppError("Point matches multiple active service regions", 409, "REGION_AMBIGUOUS");
  return matches[0];
}

export async function resolveTripRegion(input, executor = defaultQuery) {
  const pickup = normalizePoint({ lat: input.pickupLat, lng: input.pickupLng });
  const dropoff = normalizePoint({ lat: input.dropoffLat, lng: input.dropoffLng });
  const pickupRegion = await resolveActiveRegionForPoint(pickup, "PICKUP_REGION_INACTIVE", executor);
  const dropoffRegion = await resolveActiveRegionForPoint(dropoff, "DROPOFF_REGION_INACTIVE", executor);
  if (pickupRegion.id !== dropoffRegion.id) throw new AppError("Intercity trips are not supported", 409, "INTERCITY_NOT_SUPPORTED");
  return { region: pickupRegion, pickup, dropoff };
}

// OSRM's own maneuver vocabulary (turn/roundabout/merge/fork/depart/arrive,
// each with an optional left-right modifier) — kept as OSRM's raw strings
// rather than translated here, so the client can pick icon + Russian label
// per platform-appropriate wording instead of this shared backend baking in
// one fixed phrasing for every consumer.
function parseSteps(route) {
  const steps = route?.legs?.[0]?.steps;
  if (!Array.isArray(steps)) return [];
  return steps
    .map(step => {
      const location = step?.maneuver?.location;
      if (!Array.isArray(location) || location.length < 2) return null;
      return {
        type: step.maneuver?.type || "turn",
        modifier: step.maneuver?.modifier || null,
        // OSRM leaves `name` as "" for unnamed ways (alleys, parking-lot
        // links, etc.) — honest gap, not a parsing bug; the client shows a
        // generic label instead of an empty street name in that case.
        streetName: typeof step.name === "string" ? step.name : "",
        distanceMeters: Math.round(Number(step.distance) || 0),
        lat: Number(location[1]),
        lng: Number(location[0]),
        // Only present on a roundabout/rotary maneuver (which exit to take,
        // counting from 1) — undefined for every other type, and the client
        // treats a missing/non-numeric value as "no exit info" rather than
        // guessing one.
        exit: Number.isFinite(Number(step.maneuver?.exit)) ? Number(step.maneuver.exit) : null
      };
    })
    .filter(Boolean);
}

export async function requestRoute({ from, to, fetchImpl = fetch }) {
  if (!env.ROUTING_BASE_URL) throw routeUnavailable("ROUTING_BASE_URL is not configured");
  const base = env.ROUTING_BASE_URL.replace(/\/$/, "");
  const cacheKey = `route:osrm:steps:${roundedPointKey(from, 5)}:${roundedPointKey(to, 5)}`;
  const cached = await cacheGetJson(cacheKey);
  if (cached) return cached;
  // A hung/misbehaving OSRM would otherwise be re-hit on every single poll
  // (live driver routes re-fetch every ~8s) — a short negative cache keeps
  // repeat callers failing fast instead of each waiting out the 10s timeout.
  const failureKey = `${cacheKey}:failure`;
  if (await cacheGetJson(failureKey)) throw routeUnavailable();
  // steps=true so the client can show a real next-turn instruction (street
  // name + actual maneuver type) instead of guessing one from bearing
  // changes in the plain geometry — see parseSteps above.
  const url = `${base}/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson&steps=true`;
  let response;
  try {
    response = await getJson(url, { fetchImpl, timeoutMs: 10_000 });
  } catch {
    await cacheSetJson(failureKey, { failed: true }, 20);
    throw routeUnavailable();
  }
  if (!response.ok) {
    await cacheSetJson(failureKey, { failed: true }, 20);
    throw routeUnavailable();
  }
  const data = response.data;
  const route = data?.routes?.[0];
  if (!route || !Number.isFinite(Number(route.distance)) || !Number.isFinite(Number(route.duration)) || !route.geometry) {
    await cacheSetJson(failureKey, { failed: true }, 20);
    throw routeUnavailable();
  }
  const routePayload = {
    distanceMeters: Math.round(Number(route.distance)),
    durationSeconds: Math.round(Number(route.duration)),
    geometry: route.geometry,
    steps: parseSteps(route),
    providerStatus: data.code || "Ok"
  };
  await cacheSetJson(cacheKey, routePayload, 120);
  return routePayload;
}

// Straight-line stand-in for the *live tracking* routes only (never for
// buildRoutePreview/pricing, which must keep failing hard — a trip's price
// must never be silently computed from a guess). Road distance is padded
// over the great-circle distance since real streets are never perfectly
// straight, and duration assumes a modest mixed urban/rural speed typical
// for these small-town service regions.
const FALLBACK_ROAD_DISTANCE_FACTOR = 1.3;
const FALLBACK_AVERAGE_SPEED_KMH = 28;

function straightLineRouteFallback(from, to) {
  const straightKm = distanceKmBetween(from, to);
  const roadKm = Number.isFinite(straightKm) ? straightKm * FALLBACK_ROAD_DISTANCE_FACTOR : 0;
  return {
    distanceMeters: Math.round(roadKm * 1000),
    durationSeconds: Math.round((roadKm / FALLBACK_AVERAGE_SPEED_KMH) * 3600),
    geometry: {
      type: "LineString",
      coordinates: [[Number(from.lng), Number(from.lat)], [Number(to.lng), Number(to.lat)]]
    },
    // No real OSRM steps exist for a straight-line guess — the client falls
    // back to its own bearing-based heuristic when steps is empty, same as
    // it always did before this field existed.
    steps: [],
    providerStatus: "Fallback",
    fallback: true
  };
}

async function requestRouteWithFallback({ from, to, fetchImpl }) {
  try {
    return await requestRoute({ from, to, fetchImpl });
  } catch (error) {
    if (error instanceof AppError && error.code === "ROUTE_UNAVAILABLE") {
      return straightLineRouteFallback(from, to);
    }
    throw error;
  }
}

// Which physical leg the driver is on for a given order — pickup before the
// trip starts, dropoff once the client is on board. Shared by the
// authenticated driver-to-pickup route and the public trip-tracking route.
export function resolveActiveLeg(order) {
  if (TO_DROPOFF_ORDER_STATUSES.includes(order.status)) {
    return { phase: "to_dropoff", targetLat: Number(order.dropoff_lat), targetLng: Number(order.dropoff_lng) };
  }
  if (TO_PICKUP_ORDER_STATUSES.includes(order.status)) {
    return { phase: "to_pickup", targetLat: Number(order.pickup_lat), targetLng: Number(order.pickup_lng) };
  }
  throw new AppError("Order has no active driving leg", 409, "ORDER_NOT_ACTIVE");
}

// Live leg route from a driver's current position to wherever they're
// headed right now. Falls back to a straight-line estimate when the routing
// provider is unavailable so the map/ETA keeps working (degraded but live)
// instead of going blank — safe here because this never feeds pricing.
export async function buildActiveLegRoute({ order, driverLat, driverLng, fetchImpl = fetch }) {
  const { phase, targetLat, targetLng } = resolveActiveLeg(order);
  const route = await requestRouteWithFallback({
    from: { lat: driverLat, lng: driverLng },
    to: { lat: targetLat, lng: targetLng },
    fetchImpl
  });
  return {
    phase,
    distanceMeters: route.distanceMeters,
    durationSeconds: route.durationSeconds,
    geometry: route.geometry,
    steps: route.steps || [],
    providerStatus: route.providerStatus,
    fallback: Boolean(route.fallback),
    driverLat,
    driverLng,
    targetLat,
    targetLng
  };
}

export async function buildRoutePreview(input, executor = defaultQuery, fetchImpl = fetch) {
  const { region, pickup, dropoff } = await resolveTripRegion(input, executor);
  const route = await requestRoute({ from: pickup, to: dropoff, fetchImpl });
  let estimate = null;
  if (input.tariffId || input.tariff || input.tariffName) {
    const pricing = await prepareOrderPricing({
      pickupLat: pickup.lat,
      pickupLng: pickup.lng,
      dropoffLat: dropoff.lat,
      dropoffLng: dropoff.lng,
      tariffId: input.tariffId,
      tariff: input.tariff,
      tariffName: input.tariffName,
      distanceKm: Math.max(0.1, route.distanceMeters / 1000),
      durationMin: Math.max(1, Math.ceil(route.durationSeconds / 60))
    }, executor);
    estimate = pricing.publicEstimate;
  }
  return {
    regionId: region.id,
    region: publicRegion(region),
    distanceMeters: route.distanceMeters,
    durationSeconds: route.durationSeconds,
    geometry: route.geometry,
    estimate,
    providerStatus: route.providerStatus
  };
}

export async function updateDriverLocation({ userId, location, io = null, executor = defaultQuery }) {
  const lat = Number(location.lat);
  const lng = Number(location.lng);
  const point = normalizePoint({ lat, lng });
  const heading = toNullableNumber(location.heading, 0, 360, "INVALID_HEADING");
  const speed = toNullableNumber(location.speed, 0, 120, "INVALID_SPEED");
  const accuracy = toNullableNumber(location.accuracy, 0, 5000, "INVALID_ACCURACY");
  const source = String(location.source || "mobile").slice(0, 40);

  const driver = (await run(executor, "SELECT * FROM drivers WHERE user_id=$1", [userId])).rows[0];
  if (!driver) throw new AppError("Driver profile not found", 404, "DRIVER_NOT_FOUND");
  if (!["FREE", "BUSY"].includes(driver.status)) throw new AppError("Driver must be online", 409, "DRIVER_OFFLINE");
  await assertDriverDispatchReady(driver, executor);

  const region = (await run(executor, "SELECT * FROM regions WHERE id=$1", [driver.current_region_id])).rows[0];
  if (!region?.is_active) throw new AppError("Region is inactive", 403, "DRIVER_REGION_INACTIVE");
  if (!pointInPolygon(point, region.boundary)) throw new AppError("Driver location is outside selected region", 403, "DRIVER_LOCATION_OUTSIDE_REGION");

  const result = await run(executor, `
    INSERT INTO driver_locations(driver_id, region_id, lat, lng, heading, speed, accuracy, source)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8)
    ON CONFLICT (driver_id) DO UPDATE
    SET region_id=EXCLUDED.region_id,
        lat=EXCLUDED.lat,
        lng=EXCLUDED.lng,
        heading=EXCLUDED.heading,
        speed=EXCLUDED.speed,
        accuracy=EXCLUDED.accuracy,
        source=EXCLUDED.source,
        updated_at=NOW()
    RETURNING *
  `, [driver.id, driver.current_region_id, point.lat, point.lng, heading, speed, accuracy, source]);
  await run(executor, "UPDATE drivers SET lat=$1, lng=$2, last_seen_at=NOW() WHERE id=$3", [point.lat, point.lng, driver.id]);

  const activeOrder = (await run(executor, `
    SELECT id
    FROM orders
    WHERE driver_id=$1 AND status = ANY($2::text[])
    ORDER BY created_at DESC
    LIMIT 1
  `, [driver.id, ACTIVE_ORDER_STATUSES])).rows[0] || null;

  const publicLocation = {
    orderId: activeOrder?.id || null,
    driverId: driver.id,
    regionId: driver.current_region_id,
    lat: Number(result.rows[0].lat),
    lng: Number(result.rows[0].lng),
    heading: result.rows[0].heading === null ? null : Number(result.rows[0].heading),
    speed: result.rows[0].speed === null ? null : Number(result.rows[0].speed),
    accuracy: result.rows[0].accuracy === null ? null : Number(result.rows[0].accuracy),
    updatedAt: result.rows[0].updated_at
  };

  if (io) {
    io.to(dispatchRegionRoom(driver.current_region_id)).emit("driver_location_updated", publicLocation);
    if (activeOrder?.id) io.to(orderRoom(activeOrder.id)).emit("driver_location_updated", publicLocation);
  }

  return { driver, location: publicLocation };
}

export async function assertCanAccessOrderLocation({ user, order, executor = defaultQuery }) {
  if (["OWNER", "OPERATOR"].includes(user.role)) return true;
  if (user.role === "DRIVER") {
    const driver = (await run(executor, "SELECT id FROM drivers WHERE user_id=$1", [user.id])).rows[0];
    if (driver?.id === order.driver_id) return true;
  }
  if (user.role === "CLIENT") {
    const client = (await run(executor, "SELECT id FROM clients WHERE user_id=$1", [user.id])).rows[0];
    if (client?.id === order.client_id) return true;
  }
  throw new AppError("Forbidden order", 403, "FORBIDDEN_ORDER");
}

// Routes the driver's current position to wherever they're actually headed
// right now: the pickup point before the trip starts, or the dropoff point
// once the client is on board. Callers no longer need to know which leg
// they're on — the order status alone decides it, so the map/ETA shown to
// both driver and passenger always tracks the real next stop. Kept the name
// buildDriverToPickupRoute (and the /driver-to-pickup route) for backward
// compatibility with existing tests/tools that reference them by name.
export async function buildDriverToPickupRoute({ orderId, user, executor = defaultQuery, fetchImpl = fetch }) {
  const order = (await run(executor, "SELECT * FROM orders WHERE id=$1", [orderId])).rows[0];
  if (!order) throw new AppError("Order not found", 404, "ORDER_NOT_FOUND");
  await assertCanAccessOrderLocation({ user, order, executor });
  if (!order.driver_id) throw new AppError("Driver is not assigned", 409, "DRIVER_NOT_ASSIGNED");

  const { phase, targetLat, targetLng } = resolveActiveLeg(order);

  const location = (await run(executor, "SELECT * FROM driver_locations WHERE driver_id=$1 ORDER BY updated_at DESC LIMIT 1", [order.driver_id])).rows[0];
  if (!location) throw new AppError("Driver location is unavailable", 409, "DRIVER_LOCATION_UNAVAILABLE");
  const route = await requestRouteWithFallback({
    from: { lat: Number(location.lat), lng: Number(location.lng) },
    to: { lat: targetLat, lng: targetLng },
    fetchImpl
  });
  return {
    phase,
    distanceMeters: route.distanceMeters,
    durationSeconds: route.durationSeconds,
    geometry: route.geometry,
    steps: route.steps || [],
    providerStatus: route.providerStatus,
    fallback: Boolean(route.fallback),
    driverLat: Number(location.lat),
    driverLng: Number(location.lng),
    targetLat,
    targetLng,
    pickupLat: Number(order.pickup_lat),
    pickupLng: Number(order.pickup_lng)
  };
}
