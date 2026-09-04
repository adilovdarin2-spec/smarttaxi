import https from "node:https";
import { env } from "../../config/env.js";
import { AppError } from "../../common/errors.js";
import { redis } from "../../db/redis.js";
import { query as defaultQuery } from "../../db/pool.js";
import { regionRadiusKmByName } from "./region-geo.js";
import { orderRoom, dispatchRegionRoom, ACTIVE_ORDER_STATUSES, TO_PICKUP_ORDER_STATUSES, TO_DROPOFF_ORDER_STATUSES } from "../orders/order-dispatch.service.js";
import { prepareOrderPricing } from "../orders/order-pricing.service.js";
import { publicIntercityRoute, resolveIntercityRoute } from "../intercity/intercity-routes.service.js";
import { assertDriverDispatchReady } from "../driver-region-approvals/driver-region-approvals.service.js";
import { findActiveRegionForPoint, listActiveRegions, normalizePoint, pointInPolygon, publicRegion } from "../regions/regions.service.js";

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
  // Only append a region the caller actually gave us -- do NOT fall back to
  // env.CITY here. Callers that want that default already pass it in
  // explicitly (see searchAddresses's `explicitRegion || env.CITY`). Baking
  // env.CITY ("Atakent", a single tiny test town) into every search whose
  // caller passed no region silently corrupted queries like "Magnum
  // Shymkent" into "Magnum Shymkent Atakent Kazakhstan" -- self-contradictory
  // text no real place matches, so Photon/Nominatim returned nothing and
  // only MapTiler's generic guess survived (confirmed live). Without a real
  // region, letting these providers search all of Kazakhstan unbiased is
  // strictly better than forcing in the wrong town.
  const cleanRegion = compactText(region);
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
    // Every word of a multi-word query must appear somewhere in the hint,
    // not just one of them — with .some(), a business-name search like
    // "Magnum Атакент" matched purely on the town-name word (present in
    // every hint for that town via city/region/keywords), returning the
    // town's akimat/market/center hints for a query about a shop that has
    // nothing to do with any of them. This list is a curated fallback of
    // town-level landmarks, not a business directory — it should only ever
    // fire for queries that are actually about one of those landmarks.
    const queryParts = normalizedQuery.split(/\s+/).filter(part => part.length >= 2);
    const queryMatches = haystack.includes(normalizedQuery) ||
      (queryParts.length > 0 && queryParts.every(part => haystack.includes(part)));
    return queryMatches && regionMatches;
  }).map(({ keywords, ...item }) => ({ ...item, source: "local" }));

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
  const exact = addresses.filter(item => {
    const key = [
      normalizedText(item.label),
      Number(item.lat).toFixed(5),
      Number(item.lng).toFixed(5)
    ].join("|");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  // Different providers often return the same real place with slightly
  // different coordinates -- e.g. a real geocoder and MapTiler both
  // matching "улица Абая, Атакент" a few hundred metres apart, which the
  // exact-key pass above doesn't catch (it only merges literal duplicates).
  // Merge same-label results that are genuinely close together too.
  // Callers already build `addresses` with local hints and real-provider
  // results listed before mapTilerFirst (see searchAddresses), so keeping
  // whichever copy of a near-duplicate is seen first naturally keeps the
  // higher-priority source without re-deriving it here. Left alone on
  // purpose when two same-label results are km apart -- different towns
  // can each have their own real street of the same name, and merging
  // those would wrongly hide one instead of letting the subtitle
  // disambiguate them.
  const NEAR_DUPLICATE_KM = 0.6;
  const merged = [];
  exact.forEach(item => {
    const label = normalizedText(item.label);
    const isNearDuplicate = merged.some(other =>
      normalizedText(other.label) === label &&
      distanceKmBetween(item, other) <= NEAR_DUPLICATE_KM
    );
    if (!isNearDuplicate) merged.push(item);
  });
  return merged;
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
  // No env.CITY fallback here (see buildAddressSearchQuery above for the
  // same reasoning): a caller that passed no region has no regional intent
  // to filter by, so this must return [] (no filtering) rather than
  // silently narrowing every unscoped search to Atakent -- regionCenterRule
  // below then also skips its hard "discard anything not near this point"
  // filter, so real results (e.g. Photon's genuine Shymkent matches) aren't
  // thrown away just because they're far from a region nobody asked for.
  const hint = normalizedText(regionHint);
  if (!hint) return [];
  const direct = findRegionAliasEntry(regionHint);
  return [hint, ...(direct?.[1] || [])].map(normalizedText).filter(Boolean);
}

function regionCenterRule(regionHint) {
  const hint = normalizedText(regionHint);
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
  // A provider like MapTiler always returns its "closest guess" even when
  // nothing it found actually matches the query text anywhere (label/
  // subtitle/city/region) -- addressQueryScore's worst tier (20) marks
  // exactly these. When at least one result genuinely contains the query,
  // that guess is pure noise diluting the real matches (e.g. searching
  // "абая" surfacing an unrelated village called "Абай"/"Абат" purely by
  // string similarity, or three near-identical "улица Абая" copies from
  // different providers crowding out everything else). If EVERY result is
  // a 20, there's nothing better to show, so keep them rather than
  // returning an empty list for a genuinely obscure query.
  const hasRealMatch = Boolean(query) && sorted.some(item => addressQueryScore(item, query) < 20);
  const relevant = hasRealMatch
    ? sorted.filter(item => addressQueryScore(item, query) < 20)
    : sorted;
  const aliases = regionAliases(regionHint);
  const centerRule = regionCenterRule(regionHint);
  const max = Math.min(Math.max(Number(limit) || 8, 1), 12);
  if (!aliases.length) return relevant.slice(0, max);
  const local = relevant.filter(item => {
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
  return centerRule ? [] : relevant.slice(0, max);
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
      // Collect raw bytes and decode once at the end -- setEncoding("utf8")
      // decodes each TCP chunk independently, so a multi-byte character
      // (e.g. Cyrillic) split across a chunk boundary gets corrupted into
      // U+FFFD replacement characters in the middle of an address string.
      const chunks = [];
      response.on("data", chunk => { chunks.push(chunk); });
      response.on("end", () => {
        if (response.statusCode < 200 || response.statusCode >= 300) {
          resolve({ ok: false, status: response.statusCode, data: null });
          return;
        }
        try {
          resolve({ ok: true, status: response.statusCode, data: JSON.parse(Buffer.concat(chunks).toString("utf8")) });
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

// Rural Kazakhstan OSM data frequently mistags a farm/plot id (e.g. "КХ-100",
// "КХМR-13") as the road name itself, and Nominatim's display_name leads with
// the same kind of code when no road is tagged at all — strip that pattern
// before ever showing it to a user, wherever it appears.
const CODE_LIKE_TOKEN = /^[a-zа-яёіғқңөұүh]{1,4}[-\s]?№?\d+[a-zа-яё]?$/i;

function isCodeLikeToken(value) {
  return Boolean(value) && CODE_LIKE_TOKEN.test(compactText(value));
}

function cleanDisplayNameSegments(displayName) {
  const segments = String(displayName || "")
    .split(",")
    .map(segment => compactText(segment))
    .filter(Boolean);
  while (segments.length > 1 && isCodeLikeToken(segments[0])) {
    segments.shift();
  }
  return segments;
}

function publicAddressSuggestion(item) {
  const lat = Number(item?.lat);
  const lng = Number(item?.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const address = item.address || {};
  // Kazakhstan OSM data often tags "city" as the broader rural administrative
  // wrapper ("...ауылдық округі" / "...кенттік әкімдігі") while "town"/"village"
  // holds the actual settlement name — prefer the more specific one for display.
  const city = address.town || address.village || address.city || address.hamlet || address.county || "";
  const region = address.state || address.region || "";
  const rawRoad = address.road || address.pedestrian || address.footway || address.cycleway;
  const road = isCodeLikeToken(rawRoad) ? null : rawRoad;
  const locality = address.neighbourhood || address.suburb || address.city_district || address.residential;
  // Nominatim's top-level `name` is the POI's own name (shop/café/business)
  // whenever the result IS a named place -- e.g. reverse-geocoding a point
  // sitting on a "Magnum" store returns name:"Magnum" alongside the plain
  // street address in `address`. Previously this was read nowhere, so a
  // shop's address showed only its street+house number, with no way to tell
  // it apart from any other building on that street.
  const rawPoiName = compactText(item.name);
  const poiName = rawPoiName && rawPoiName !== road && !isCodeLikeToken(rawPoiName) ? rawPoiName : null;

  let label;
  if (road) {
    const streetPart = [road, address.house_number].filter(Boolean).join(", ");
    const withCity = city && !streetPart.includes(city) ? `${streetPart}, ${city}` : streetPart;
    label = poiName ? `${poiName}, ${withCity}` : withCity;
  } else if (poiName) {
    label = [poiName, locality || city].filter(Boolean).join(", ");
  } else if (locality) {
    label = [locality, city].filter(Boolean).join(", ");
  } else if (city) {
    label = city;
  } else {
    const segments = cleanDisplayNameSegments(item.display_name);
    label = compactText(segments.slice(0, 2).join(", ")) || "Точка на карте";
  }

  // `display_name` is useful as a last-resort source for the title, but it
  // also contains OSM way references (KZ-12, Р-29, etc.). Never mirror it
  // straight into the passenger UI: build that line from named fields.
  const subtitle = [locality, city, region, address.country]
    .map(compactText)
    .filter((part, index, values) => part && !isCodeLikeToken(part) && values.indexOf(part) === index)
    .join(", ");
  return {
    label,
    title: label,
    subtitle,
    city,
    region,
    lat,
    lng,
    source: "nominatim"
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
  const rawStreet = properties.street || "";
  const street = isCodeLikeToken(rawStreet) ? "" : rawStreet;
  const house = properties.housenumber || properties.house_number || "";
  const streetPart = [street, house].filter(Boolean).join(", ");
  // Photon tags a POI's own name (shop/café/business) separately from the
  // street it's on -- a bare street address has no `name` at all. Combining
  // both ("Magnum, Уалиханова көшесі, 217") instead of picking just one lets
  // people recognize the actual place, not only its bare house number, and
  // keeps the street visible instead of dropping it whenever a POI name
  // exists (the previous name-OR-street behavior did exactly that).
  const rawPoiName = compactText(properties.name);
  const poiName = rawPoiName && rawPoiName !== street && !isCodeLikeToken(rawPoiName) ? rawPoiName : null;
  const label = poiName
    ? (streetPart ? `${poiName}, ${streetPart}` : poiName)
    : (streetPart || (isCodeLikeToken(properties.osm_value) ? "Точка на карте" : properties.osm_value) || "Точка на карте");
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
    lng,
    source: "photon"
  };
}

function readableAddressTitle({ name, street, houseNumber, locality }) {
  const streetTitle = [street, houseNumber].filter(Boolean).join(", ");
  // `name` is the POI's own name (shop/café/business) when the feature is a
  // named place, distinct from `street` -- previously dropped whenever a
  // street existed, showing only the bare street+house number.
  const poiName = name && name !== street ? name : null;
  if (poiName && streetTitle) return compactText(`${poiName}, ${streetTitle}`);
  return compactText(poiName || streetTitle || locality || "Точка на карте");
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
  const rawStreet = properties.street || properties.road || properties.address || properties.name || "";
  const rawAddress = compactText(properties.address);
  // MapTiler sometimes puts a complete civic address ("Street, 15") into
  // `address` instead of splitting it into `street` and `housenumber`.
  // Split only a final house-number part so it renders once, consistently.
  const combinedAddress = !properties.street && !properties.road
    ? rawAddress.match(/^(.+?),\s*(\d+[\p{L}\-/]*)$/u)
    : null;
  const rawStreetName = combinedAddress ? combinedAddress[1] : rawStreet;
  const street = isCodeLikeToken(rawStreetName) ? "" : rawStreetName;
  // MapTiler places the civic number in `address` for many Kazakhstan
  // features instead of `housenumber`. Treat a numeric address field as the
  // house number, otherwise a pin on "Бектасова, 15" degraded to only the
  // street name in the passenger app.
  const addressHouseNumber = combinedAddress?.[2] || (/\d/.test(rawAddress) && rawAddress !== compactText(rawStreet)
    ? rawAddress
    : "");
  const houseNumber = properties.housenumber || properties.house_number || properties.houseNumber || addressHouseNumber;
  // context isn't ordered by semantic type -- for a street/address feature
  // contextText[0] is often the postal code entry (no place_designation of
  // its own), not the city, so a bare positional fallback showed "050013,
  // Казахстан" instead of "Алматы, Казахстан" (confirmed live against
  // MapTiler's raw response for a real Алматы street). The actual
  // city/town is the context entry explicitly tagged with a locality-level
  // place_designation; only fall back to position 0 if none carries one.
  const localityEntry = context.find(item =>
    ["city", "town", "village", "municipality"].includes(item?.place_designation)
  );
  const localityText = localityEntry?.text || localityEntry?.text_ru || localityEntry?.text_en || "";
  const locality = properties.city || properties.town || properties.village || properties.locality || localityText || contextText[0] || "";
  const region = properties.region || properties.state || contextText.find(item => /область|region|turkistan|түркістан/i.test(item)) || "";
  const rawName = feature.text_ru || feature.text || feature.place_name_ru || feature.place_name || properties.name || "";
  const name = isCodeLikeToken(rawName) ? "" : rawName;
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
  // MapTiler's reverse endpoint rejects `limit` unless it's paired with a
  // single `type` filter ("ERR_VALIDATION: Parameter limit must be combined
  // with a single type parameter when reverse geocoding") — confirmed live.
  // Forward search's `limit` (searchAddressesWithMapTiler above) has no such
  // restriction; only reverse does. Only features[0] is ever used here
  // anyway, so there's nothing to gain from limiting result count.
  const response = await getJson(url, { fetchImpl });
  if (!response.ok) {
    await cacheSetJson(`${cacheKey}:failure`, { failed: true, status: response.status }, 30);
    return null;
  }
  const features = Array.isArray(response.data?.features) ? response.data.features : [];
  const suggestion = features.map(publicMapTilerAddressSuggestion).filter(Boolean)[0] || null;
  // Reverse geocoding already knows the true location -- it's the point we
  // asked about -- so the queried coordinates always win over whatever the
  // matched feature itself carries. This matters because MapTiler's top
  // match for a point can be a "road" kind feature representing an entire
  // multi-country route relation (e.g. "Азиатский маршрут AH5", OSM
  // r176922, spanning TM/UZ/CN/KG/TR/KZ) whose own `center` is that route's
  // geometric centroid -- hundreds of km from the actual point queried
  // (confirmed live: reverse-geocoding a point near the Uzbek border
  // returned coordinates near Almaty). The label/name is still correct and
  // useful ("you're on AH5"); only the coordinates need pinning back down.
  if (suggestion) {
    suggestion.lat = point.lat;
    suggestion.lng = point.lng;
    await cacheSetJson(cacheKey, suggestion, 600);
  }
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

// Looks the query up in the locally harvested OSM gazetteer (see
// tools/import-addresses.js). Deliberately consulted before any external
// geocoder: for the towns we operate in, OSM already holds the house
// numbers, streets, named buildings and POIs riders actually type —
// Атакент ~2 914 house numbers, Шымкент ~99 386 — so answering from our
// own table is both more complete than what the remote geocoders return
// for these places and free of their rate limits and latency. Returns []
// while the table is still empty (before the first import run), leaving
// the existing remote cascade untouched.
// The harvest uses overlapping circles around nearby settlements so that no
// local streets get missed. That is deliberately more generous than the
// actual service areas, though, and can include points across the border.
// Keep the circles as a cheap SQL pre-filter, then enforce the real booking
// boundary before returning anything to a rider.
export function filterGazetteerRowsToServiceArea(rows, regions, regionName) {
  const activeRegions = Array.isArray(regions)
    ? regions.filter((region) => region?.is_active !== false && region?.boundary)
    : [];
  if (!activeRegions.length) return [];

  const requestedName = normalizedText(regionName);
  const requestedRegions = requestedName
    ? activeRegions.filter((region) => normalizedText(region.name) === requestedName)
    : [];
  // An unknown/renamed hint must not turn a useful unscoped search into an
  // empty result page. In that case still return only service-area points.
  const allowedRegions = requestedRegions.length ? requestedRegions : activeRegions;

  return rows.filter((row) => {
    const lat = Number(row.lat);
    const lng = Number(row.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
    return allowedRegions.some((region) => pointInPolygon({ lat, lng }, region.boundary));
  });
}

async function filterAddressSuggestionsToServiceArea(addresses, regionName) {
  const requestedRegion = compactText(regionName);
  // With no user-selected town the existing provider behaviour is preserved:
  // an unscoped search may intentionally look outside the launch catalogue.
  if (!requestedRegion) return addresses;
  try {
    return filterGazetteerRowsToServiceArea(
      addresses,
      await listActiveRegions(),
      requestedRegion
    );
  } catch (error) {
    // Address search must remain available during a transient database outage.
    // The providers still enforce Kazakhstan and the usual regional radius;
    // the hard polygon filter is restored as soon as the DB is reachable.
    return addresses;
  }
}

async function searchGazetteer(text, regionName, limit, executor = defaultQuery) {
  // Scoped by distance from the region's centre, NOT by `r.name = $2`.
  //
  // Every address row belongs to exactly one region — the nearest settlement
  // (see region-geo.js). These settlements are 4-6 km apart, so the streets
  // physically around a rider in Ынтымак are very often filed under Киров or
  // Жана жол. Under name equality that rider saw 9 rows in total and none of
  // their own neighbourhood. What a rider means by "near me" is a distance,
  // not an administrative label, so that is what this asks for.
  const radiusKm = regionName ? regionRadiusKmByName(regionName) : null;
  // A degree of latitude is ~111 km; longitude shrinks with the cosine of
  // the latitude (~0.76 at 40.7°N), so the box has to be wider than it is
  // tall or it clips the east and west edges of the region.
  const latDelta = radiusKm == null ? null : radiusKm / 111;
  const lngDelta = radiusKm == null ? null : radiusKm / (111 * Math.cos((40.7 * Math.PI) / 180));
  // Ask for more than one page. Some harvested candidates can be outside the
  // polygon and must be discarded after the SQL pre-filter.
  const candidateLimit = Math.min(Math.max(Number(limit) * 8, Number(limit)), 96);
  const { rows } = await executor(
    `SELECT a.label, a.lat, a.lng, a.kind, r.name AS region_name
       FROM addresses a
       JOIN regions r ON r.id = a.region_id
       -- Bring the requested service area into the query once.  We need its
       -- centre not only to clip the broad harvest box, but also to rank the
       -- candidates *before* LIMIT.  Otherwise a common label such as
       -- "Школа" fills the first page with objects from neighbouring towns
       -- and the polygon check below never gets to the rider's real result.
       LEFT JOIN regions scope ON scope.name = $2
      -- search_text, not label: it carries the label plus every name
      -- spelling the harvest found, so "Бектасова" and "Бектасов көшесі"
      -- both reach the same street — riders here use either form. COALESCE
      -- keeps rows written before that column existed searchable.
      WHERE COALESCE(a.search_text, a.label) ILIKE $1
        AND ($2::text IS NULL OR (
              scope.id IS NOT NULL
              AND a.lat BETWEEN scope.center_lat - $5 AND scope.center_lat + $5
              AND a.lng BETWEEN scope.center_lng - $6 AND scope.center_lng + $6
            ))
      ORDER BY
        -- Prefix matches first: someone typing "Бекта" wants the street
        -- itself above every shop that merely mentions it.
        (COALESCE(a.search_text, a.label) ILIKE $3) DESC,
        -- Keep the first candidate page local to the selected region.  The
        -- exact polygon filter below remains authoritative; this only makes
        -- sure it receives enough local candidates to do its job.
        CASE WHEN scope.id IS NULL THEN 0
             ELSE power(a.lat - scope.center_lat, 2) + power(a.lng - scope.center_lng, 2)
        END,
        -- Then the classes in the order a rider most likely means.
        CASE a.kind WHEN 'housenumber' THEN 0 WHEN 'poi' THEN 1
                    WHEN 'building' THEN 2 ELSE 3 END,
        length(a.label)
      LIMIT $4`,
    [`%${text}%`, regionName || null, `${text}%`, candidateLimit, latDelta, lngDelta]
  );
  if (!rows.length) return [];

  const regions = await listActiveRegions(executor);
  const matchingRegion = regionName
    ? regions.find((region) => normalizedText(region.name) === normalizedText(regionName))
    : null;
  return filterGazetteerRowsToServiceArea(rows, regions, regionName).slice(0, limit).map((row) => ({
    label: row.label,
    lat: Number(row.lat),
    lng: Number(row.lng),
    // Rows are stored under the nearest harvest centre. Show the selected
    // real service area instead, otherwise a valid border-street can look as
    // if it belongs to a neighbouring town.
    region: matchingRegion?.name || row.region_name,
    source: "gazetteer"
  }));
}

export async function searchAddresses({ q, region, limit = 8, countrycodes = "kz" }, fetchImpl = fetch) {
  const trimmed = String(q || "").trim();
  if (trimmed.length < 2) return [];
  // Local first; fall through to the remote cascade only when the
  // gazetteer cannot fill the page, so a rider searching a street we do
  // hold never waits on a slower, thinner remote answer.
  try {
    // compactText returns "" (not null) for a missing region, and an empty
    // string is not NULL in SQL — so passing it straight through made the
    // region filter compare r.name against '', matching nothing and
    // silently emptying every unscoped search. Normalise to null here.
    const regionFilter = compactText(region) || null;
    // Do not let a dense local catalogue consume the entire result page.
    // A rider searching a well-covered street still needs to see at least one
    // independent provider result (POI, building entrance or a neighbouring
    // town) rather than a page of nearly identical road segments.
    const localLimit = limit > 1 ? limit - 1 : 1;
    const local = await searchGazetteer(trimmed, regionFilter, localLimit);
    if (local.length) {
      const remote = await filterAddressSuggestionsToServiceArea(
        await searchAddressesRemote(
          { q, region, limit, countrycodes }, fetchImpl
        ),
        regionFilter
      );
      const seen = new Set(local.map((item) => item.label.toLowerCase()));
      const deduped = dedupeAddressSuggestions([
        ...local,
        ...remote.filter((item) => !seen.has(String(item.label).toLowerCase()))
      ]);
      const merged = sortAddressSuggestions(deduped, regionFilter, trimmed).slice(0, limit);
      const hasProviderResult = merged.some((item) =>
        ["nominatim", "photon", "maptiler"].includes(item.source)
      );
      const firstProviderResult = deduped.find((item) =>
        ["nominatim", "photon", "maptiler"].includes(item.source)
      );
      // Keep an independently geocoded address visible on a short result
      // page. The local gazetteer is intentionally exhaustive and otherwise
      // crowds out POIs and building-level results from real providers.
      if (!hasProviderResult && firstProviderResult && limit > 1) {
        return [...merged.slice(0, limit - 1), firstProviderResult];
      }
      return merged;
    }
  } catch (error) {
    // A gazetteer problem must never take address search down with it —
    // the remote cascade below is a complete implementation on its own.
    console.error("[addresses] gazetteer lookup failed", error);
  }
  return filterAddressSuggestionsToServiceArea(
    await searchAddressesRemote({ q, region, limit, countrycodes }, fetchImpl),
    compactText(region) || null
  );
}

async function searchAddressesRemote({ q, region, limit = 8, countrycodes = "kz" }, fetchImpl = fetch) {
  const query = String(q || "").trim();
  if (query.length < 2) return [];
  const explicitRegion = compactText(region);
  const localFallback = searchLocalAddressHints(query, explicitRegion || env.CITY, limit);
  // MapTiler's forward search is a place/address geocoder, not a free-text
  // POI/business-name search: given "аптека Атакент" or "Magnum Shymkent" it
  // silently drops the business-name word and returns a generic town-level
  // match instead of an empty result (confirmed live by querying MapTiler's
  // API directly — it ignores "аптека"/"Magnum" entirely and matches only
  // the town name, with mediocre relevance ~0.5-0.6). Treating that as a
  // satisfying first hit would permanently shadow Photon/Nominatim below,
  // which do match business names — so mapTilerFirst is never used to
  // return early by itself, only merged into whichever provider's results
  // end up being returned (same philosophy as localFallback below).
  const mapTilerFirst = await searchAddressesWithMapTiler({ q: query, region: explicitRegion || env.CITY, limit }, fetchImpl).catch(() => []);
  // Deliberately does NOT return localFallback here even when it has
  // matches: this list only covers a handful of curated town-level
  // landmarks (a settlement's akimat/market/center), never real businesses.
  // Returning early on any match meant a genuine business-name search whose
  // query happened to also contain the town name (e.g. "Magnum Атакент")
  // matched the town's landmark hints via searchLocalAddressHints and never
  // reached Photon/Nominatim at all — the actual shop was never searched
  // for. Every other branch below already merges localFallback alongside
  // the real provider's results (dedupeAddressSuggestions([...localFallback,
  // ...X])); this just lets execution reach one of those instead of
  // stopping here. localFallback is still returned alone at the very end,
  // but only once every real provider has genuinely come back empty.
  const photonFirst = await searchAddressesWithPhoton({ q: query, region, limit }, fetchImpl).catch(() => []);
  // Genuine free-text search-engine results (Photon/Nominatim) are listed
  // before mapTilerFirst in every merge below, not after: MapTiler's forward
  // search matches almost anything (it drops words it can't place, see
  // above), so on a tie in sortAddressSuggestions's relevance score a
  // MapTiler generic-town hit would otherwise sit above a real, specifically
  // named business match purely by array position. Putting the real search
  // results first means ties resolve in their favor instead.
  if (photonFirst.length > 0) {
    return filterRegionAddressSuggestions(
      dedupeAddressSuggestions([...localFallback, ...photonFirst, ...mapTilerFirst]),
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
    if (fallback.length > 0 || mapTilerFirst.length > 0) {
      return filterRegionAddressSuggestions(
        dedupeAddressSuggestions([...localFallback, ...fallback, ...mapTilerFirst]),
        region,
        limit,
        query
      );
    }
    if (localFallback.length > 0) return localFallback;
    throw addressSearchUnavailable();
  }
  if (!response.ok) {
    const fallback = await searchAddressesWithPhoton({ q: query, region, limit }, fetchImpl).catch(() => []);
    if (fallback.length > 0 || mapTilerFirst.length > 0) {
      return filterRegionAddressSuggestions(
        dedupeAddressSuggestions([...localFallback, ...fallback, ...mapTilerFirst]),
        region,
        limit,
        query
      );
    }
    if (localFallback.length > 0) return localFallback;
    throw addressSearchUnavailable();
  }
  const data = response.data;
  if (!Array.isArray(data)) {
    const fallback = await searchAddressesWithPhoton({ q: query, region, limit }, fetchImpl).catch(() => []);
    if (fallback.length > 0 || mapTilerFirst.length > 0) {
      return filterRegionAddressSuggestions(
        dedupeAddressSuggestions([...localFallback, ...fallback, ...mapTilerFirst]),
        region,
        limit,
        query
      );
    }
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
      dedupeAddressSuggestions([...localFallback, ...addresses, ...mapTilerFirst]),
      region,
      limit,
      query
    );
  }
  const fallback = await searchAddressesWithPhoton({ q: query, region, limit }, fetchImpl).catch(() => []);
  if (fallback.length > 0 || mapTilerFirst.length > 0) {
    return filterRegionAddressSuggestions(
      dedupeAddressSuggestions([...localFallback, ...fallback, ...mapTilerFirst]),
      region,
      limit,
      query
    );
  }
  return sortAddressSuggestions(localFallback, region, query);
}

// "KZ13-01", "Р29", "А-2", "M32": a road's reference number, which is what
// every geocoder falls back to when the way it matched has no name. It is a
// correct answer and a useless one — no rider in Мырзакент tells a driver to
// meet them at KZ13-01.
const ROAD_CODE = /^(kz[\s-]?\d|ah\d|[a-zа-я]{1,2}[\s-]?\d{1,4})(\s*[-–]\s*\d+)?$/i;

function looksLikeRoadCode(label) {
  const text = String(label || "").trim();
  if (!text) return true;
  // "Р29, 14" is a house on that road — a usable address, unlike "Р29" alone.
  const head = text.split(",")[0].trim();
  if (text.includes(",") && /\d/.test(text.split(",").slice(1).join(","))) return false;
  return ROAD_CODE.test(head);
}

/// The nearest harvested address to a point, for when the geocoders answer
/// with a road number. Reads from the same gazetteer the search box uses, so
/// a dropped pin gets named the way a rider would name it.
async function nearestGazetteerAddress(
  point,
  maxMeters = 400,
  executor = defaultQuery,
  { requireHouseNumber = false } = {}
) {
  // ~111 km per degree of latitude; longitude shrinks by cos(latitude).
  const latDelta = maxMeters / 111000;
  const lngDelta = maxMeters / (111000 * Math.cos((point.lat * Math.PI) / 180));
  const { rows } = await executor(
    `SELECT label, lat, lng, kind,
            (lat - $1) * (lat - $1) + (lng - $2) * (lng - $2) AS distance_squared
      FROM addresses
      WHERE lat BETWEEN $1 - $3 AND $1 + $3
        AND lng BETWEEN $2 - $4 AND $2 + $4
        AND ($5::boolean = false OR kind = 'housenumber')
      ORDER BY
        CASE WHEN $5 THEN CASE kind WHEN 'housenumber' THEN 0 ELSE 1 END ELSE 0 END,
        -- Physical proximity comes first: a named shop twenty metres from
        -- the pin is more truthful than a house number 170 metres away.
        (lat - $1) * (lat - $1) + (lng - $2) * (lng - $2),
        CASE kind WHEN 'housenumber' THEN 0 WHEN 'building' THEN 1
                  WHEN 'poi' THEN 2 ELSE 3 END
      LIMIT 1`,
    [point.lat, point.lng, latDelta, lngDelta, requireHouseNumber]
  );
  const row = rows[0];
  if (!row) return null;
  const label = String(row.label || "").trim();
  if (!label || looksLikeRoadCode(label)) return null;
  return {
    label,
    title: label,
    kind: row.kind || "address",
    lat: Number(row.lat),
    lng: Number(row.lng)
  };
}

// `executor` is threaded through to the local-gazetteer step below so the
// whole map-pick path can be exercised against fixtures instead of a live
// database. It had no seam at all before, which is why the flag bug fixed in
// this function survived: routing-location-check.js could assert the label a
// rider sees but never the flag the client is told to gate on.
export async function reverseAddress({ lat, lng }, fetchImpl = fetch, executor = defaultQuery) {
  const point = normalizePoint({ lat, lng });
  const fallbackPoint = {
    // This is deliberately not an address. Clients treat it as a failed
    // resolution and keep confirmation disabled, rather than saving raw
    // coordinates or a made-up road reference into an order.
    label: "Адрес не определён",
    title: "Адрес не определён",
    subtitle: nearestLocalPlace(point)?.city || env.CITY || "Казахстан",
    city: nearestLocalPlace(point)?.city || env.CITY || "",
    region: nearestLocalPlace(point)?.region || "",
    lat: point.lat,
    lng: point.lng,
    source: "fallback",
    fallback: true,
    confidence: 0.2
  };
  // Every provider below can answer with a road code; rather than repeat the
  // check three times, each result passes through here first.
  const named = async (suggestion) => {
    if (!suggestion) return null;
    const label = compactText(suggestion.label);
    const city = compactText(suggestion.city);
    // A settlement name alone is still not a pickup address. It commonly
    // appears after stripping a KZ-12 road code from a weak provider result.
    const generic = !label || looksLikeRoadCode(label) || label === city ||
      /^(точка на карте|адрес не определ[её]н)$/i.test(label);
    // A street with no house number is not something a rider can give a
    // driver, and both clients already refuse it: passenger_shell.dart's
    // _isUsablePassengerAddressLabel and ClientApp.jsx's technicalAddress
    // both reject a street label containing no digit. So the nearby house is
    // not merely preferable here, it is the only usable answer.
    //
    // Kept in step with those two guards, бульвар and шоссе included —
    // returning a label the client is about to reject is how the rider ended
    // up looking at "улица Абая" on the card with the confirm button dead and
    // nothing on screen explaining why.
    const bareStreet = !/\d/.test(label) &&
      /^(?:ул\.?|улица|проспект|переулок|бульвар|шоссе|көшесі|даңғылы|көше)/i.test(label);
    const local = generic || bareStreet
      ? await nearestGazetteerAddress(
        point,
        400,
        executor,
        { requireHouseNumber: bareStreet }
      ).catch(() => null)
      : null;
    if (local) {
      return {
        ...suggestion,
        label: local.label,
        title: local.title,
        subtitle: suggestion.subtitle || nearestLocalPlace(point)?.city || "",
        source: "gazetteer_reverse"
      };
    }
    // A bare street that found no house falls through to the guidance state
    // rather than being handed back: an honest "move the pin" beats a label
    // the client will silently refuse.
    if (!generic && !bareStreet) return suggestion;
    // Nothing harvested within walking distance — much of Мақтаарал district
    // is fields. "Точка на карте" tells the rider exactly as much as the road
    // number did, without pretending to be an address they could give a
    // driver over the phone.
    const place = suggestion.city || nearestLocalPlace(point)?.city || env.CITY || "";
    return {
      ...suggestion,
      label: "Адрес не определён",
      title: "Адрес не определён",
      subtitle: place ? `Попробуйте передвинуть точку в пределах ${place}` : "Передвиньте точку к ближайшему зданию",
      source: "point_on_map",
      fallback: true,
      confidence: 0
    };
  };
  const mapTiler = await named(
    await reverseAddressWithMapTiler(point, fetchImpl).catch(() => null)
  );
  // fallback first, so a point_on_map result keeps its own `fallback: true`.
  // Stamping it last overwrote exactly the flag the fallbackPoint comment
  // above promises clients can gate confirmation on — the response said
  // "Адрес не определён", source "point_on_map", confidence 0, and
  // fallback false all at once.
  if (mapTiler) return { fallback: false, ...mapTiler };
  const url = new URL("https://nominatim.openstreetmap.org/reverse");
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("lat", String(point.lat));
  url.searchParams.set("lon", String(point.lng));
  let response;
  try {
    response = await getJson(url, { headers: nominatimHeaders(), fetchImpl });
  } catch {
    const fallback = await named(
      await reverseAddressWithPhoton(point, fetchImpl).catch(() => null)
    );
    if (fallback) return fallback;
    return fallbackPoint;
  }
  if (!response.ok) {
    const fallback = await named(
      await reverseAddressWithPhoton(point, fetchImpl).catch(() => null)
    );
    if (fallback) return fallback;
    return fallbackPoint;
  }
  const data = response.data;
  const suggestion = await named(publicAddressSuggestion(data));
  if (!suggestion) {
    const fallback = await named(
      await reverseAddressWithPhoton(point, fetchImpl).catch(() => null)
    );
    if (fallback) return fallback;
    return fallbackPoint;
  }
  return { source: "nominatim", fallback: false, ...suggestion };
}

async function resolveActiveRegionForPoint(pointInput, failureCode, executor) {
  const point = normalizePoint(pointInput);
  // Delegates the actual matching to regions.service.js's
  // findActiveRegionForPoint, which resolves overlapping region boundaries
  // by nearest center instead of erroring out -- this used to hard-fail
  // every pickup/dropoff whose point fell in one of the many overlap zones
  // among the 12 towns clustered in Мақтаарал district (confirmed live: 18
  // overlapping boundary pairs), blocking those riders from booking at all.
  const region = await findActiveRegionForPoint(point, executor);
  if (!region) throw new AppError("Point is outside active service regions", 403, failureCode);
  return region;
}

export async function resolveTripRegion(input, executor = defaultQuery) {
  const pickup = normalizePoint({ lat: input.pickupLat, lng: input.pickupLng });
  const dropoff = normalizePoint({ lat: input.dropoffLat, lng: input.dropoffLng });
  const pickupRegion = await resolveActiveRegionForPoint(pickup, "PICKUP_REGION_INACTIVE", executor);
  const dropoffRegion = await resolveActiveRegionForPoint(dropoff, "DROPOFF_REGION_INACTIVE", executor);
  const intercityRoute = await resolveIntercityRoute({
    originRegionId: pickupRegion.id,
    destinationRegionId: dropoffRegion.id
  }, executor);
  return {
    region: pickupRegion,
    pickupRegion,
    dropoffRegion,
    intercityRoute,
    isIntercity: Boolean(intercityRoute),
    pickup,
    dropoff
  };
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

function hasUsableRouteGeometry(geometry) {
  if (geometry?.type !== "LineString" || !Array.isArray(geometry.coordinates) || geometry.coordinates.length < 2) return false;
  return geometry.coordinates.every((coordinate) => {
    if (!Array.isArray(coordinate) || coordinate.length < 2) return false;
    const lng = Number(coordinate[0]);
    const lat = Number(coordinate[1]);
    return Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
  });
}

function isUsableRoutePayload(route) {
  return Number.isFinite(Number(route?.distanceMeters)) && Number(route.distanceMeters) >= 0 &&
    Number.isFinite(Number(route?.durationSeconds)) && Number(route.durationSeconds) >= 0 &&
    hasUsableRouteGeometry(route?.geometry);
}

export async function requestRoute({ from, to, fetchImpl = fetch }) {
  const origin = normalizePoint(from);
  const destination = normalizePoint(to);
  if (!env.ROUTING_BASE_URL) throw routeUnavailable("ROUTING_BASE_URL is not configured");
  const base = env.ROUTING_BASE_URL.replace(/\/$/, "");
  const cacheKey = `route:osrm:steps:${roundedPointKey(origin, 5)}:${roundedPointKey(destination, 5)}`;
  const cached = await cacheGetJson(cacheKey);
  if (isUsableRoutePayload(cached)) return cached;
  // A hung/misbehaving OSRM would otherwise be re-hit on every single poll
  // (live driver routes re-fetch every ~8s) — a short negative cache keeps
  // repeat callers failing fast instead of each waiting out the 10s timeout.
  const failureKey = `${cacheKey}:failure`;
  if (await cacheGetJson(failureKey)) throw routeUnavailable();
  // steps=true so the client can show a real next-turn instruction (street
  // name + actual maneuver type) instead of guessing one from bearing
  // changes in the plain geometry — see parseSteps above.
  const url = `${base}/route/v1/driving/${origin.lng},${origin.lat};${destination.lng},${destination.lat}?overview=full&geometries=geojson&steps=true`;
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
  if (!route || !Number.isFinite(Number(route.distance)) || Number(route.distance) < 0 ||
    !Number.isFinite(Number(route.duration)) || Number(route.duration) < 0 ||
    !hasUsableRouteGeometry(route.geometry)) {
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
  const { region, pickupRegion, dropoffRegion, intercityRoute, isIntercity, pickup, dropoff } = await resolveTripRegion(input, executor);
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
    destinationRegionId: dropoffRegion.id,
    destinationRegion: publicRegion(dropoffRegion),
    isIntercity,
    intercity: publicIntercityRoute(intercityRoute),
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
  let activeOrder = null;
  if (!pointInPolygon(point, region.boundary)) {
    // A driver legitimately leaves the pickup region while carrying an
    // intercity rider.  Keep accepting their live GPS pings for that active
    // trip; without this exception the passenger map freezes exactly when
    // the car crosses the regional boundary.  No other out-of-region ping is
    // accepted, so a free/off-route driver cannot spoof a new work area.
    activeOrder = (await run(executor, `
      SELECT id, status, distance_traveled_m, is_intercity
      FROM orders
      WHERE driver_id=$1 AND status = ANY($2::text[])
      ORDER BY created_at DESC
      LIMIT 1
    `, [driver.id, ACTIVE_ORDER_STATUSES])).rows[0] || null;
    if (!activeOrder?.is_intercity) {
      throw new AppError("Driver location is outside selected region", 403, "DRIVER_LOCATION_OUTSIDE_REGION");
    }
  }

  // Captured before the upsert below overwrites it — the only way to know
  // how far the driver has actually moved since their last ping, for the
  // live "distance traveled" trip counter further down.
  const previousLocation = (await run(executor, "SELECT * FROM driver_locations WHERE driver_id=$1", [driver.id])).rows[0] || null;

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

  activeOrder = activeOrder || (await run(executor, `
    SELECT id, status, distance_traveled_m, is_intercity
    FROM orders
    WHERE driver_id=$1 AND status = ANY($2::text[])
    ORDER BY created_at DESC
    LIMIT 1
  `, [driver.id, ACTIVE_ORDER_STATUSES])).rows[0] || null;

  // Live, purely informational "km driven so far" counter for the trip in
  // progress (pickup -> dropoff only, not the drive/wait to reach the
  // client) — every tariff today is fixed-price, so this never feeds
  // pricing, only the on-screen counter. Accumulated from real consecutive
  // GPS pings rather than derived from the pre-trip route estimate, which
  // never changes once the trip actually starts. Two guards against GPS
  // noise: a floor so jitter while stationary (red light, waiting) doesn't
  // silently rack up fake distance, and a ceiling so one bad/cold fix can't
  // teleport the total (pings arrive roughly every 8-10s, so even a
  // generous few-times-normal gap can't legitimately cover more than this).
  const MIN_TRIP_PING_DELTA_KM = 0.005;
  const MAX_TRIP_PING_DELTA_KM = 1.5;
  let tripDistanceM = null;
  if (activeOrder && TO_DROPOFF_ORDER_STATUSES.includes(activeOrder.status)) {
    tripDistanceM = Number(activeOrder.distance_traveled_m) || 0;
    if (previousLocation) {
      const deltaKm = distanceKmBetween(previousLocation, point);
      if (Number.isFinite(deltaKm) && deltaKm >= MIN_TRIP_PING_DELTA_KM && deltaKm <= MAX_TRIP_PING_DELTA_KM) {
        tripDistanceM += Math.round(deltaKm * 1000);
        await run(executor, "UPDATE orders SET distance_traveled_m=$1 WHERE id=$2", [tripDistanceM, activeOrder.id]);
      }
    }
  }

  const publicLocation = {
    orderId: activeOrder?.id || null,
    driverId: driver.id,
    regionId: driver.current_region_id,
    lat: Number(result.rows[0].lat),
    lng: Number(result.rows[0].lng),
    heading: result.rows[0].heading === null ? null : Number(result.rows[0].heading),
    speed: result.rows[0].speed === null ? null : Number(result.rows[0].speed),
    accuracy: result.rows[0].accuracy === null ? null : Number(result.rows[0].accuracy),
    tripDistanceM,
    updatedAt: result.rows[0].updated_at
  };

  if (io) {
    io.to(dispatchRegionRoom(driver.current_region_id)).emit("driver_location_updated", publicLocation);
    if (activeOrder?.id) io.to(orderRoom(activeOrder.id)).emit("driver_location_updated", publicLocation);
  }

  return { driver, location: publicLocation };
}

export async function assertCanAccessOrderLocation({ user, order, executor = defaultQuery }) {
  if (user.role === "OWNER") return true;
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
