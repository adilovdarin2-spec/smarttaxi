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
  }
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

// Only the verified settlement center is listed for these smaller regions —
// no sub-landmarks (bazaar/akimat/mosque/school/clinic/stop), because unlike
// Atakent/Myrzakent/Zhetysay we have no confirmed source for specific places
// inside them. Showing a single honest center point beats inventing ones.
function buildLocalLandmarks() {
  return localRegionCenters.map(center => ({
    region: center.region,
    title: center.title,
    subtitle: `${center.subtitle}, центр`,
    lat: center.lat,
    lng: center.lng,
    icon: "target",
    // A settlement center only frames the map. It is deliberately excluded
    // from bookable suggestions until a verified house-number/POI registry
    // for the region is available.
    selectionKind: "region-center",
    tags: [...center.aliases, "центр", "центр поселка", "орталық", "center", "centre", "ortalyk"]
  }));
}

export const extraClientAddressCatalog = [
  ...buildLocalLandmarks()
];
