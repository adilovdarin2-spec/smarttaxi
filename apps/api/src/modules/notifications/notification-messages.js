// Тексты уведомлений на языке получателя.
//
// Push показывает операционная система, часто когда приложение закрыто, —
// перевести его на клиенте нельзя, как это сделано с подписями под адресами.
// Поэтому текст собирается здесь, а язык берётся из users.locale, куда
// приложение его сообщает.
//
// Свободный текст человека — причина блокировки, ответ поддержки, комментарий
// владельца — не переводится: он написан живым человеком и остаётся как есть.

export const SUPPORTED_LOCALES = ["ru", "kk", "uz", "zh"];
export const DEFAULT_LOCALE = "ru";

export function normalizeLocale(value) {
  const code = String(value || "").trim().toLowerCase().split(/[-_]/)[0];
  return SUPPORTED_LOCALES.includes(code) ? code : DEFAULT_LOCALE;
}

// {name} подставляется из params. Отсутствующий параметр остаётся пустым, а не
// печатает "undefined" на экране человека.
function fill(template, params) {
  return String(template).replace(/\{(\w+)\}/g, (_, key) => {
    const value = params[key];
    return value === undefined || value === null ? "" : String(value);
  }).replace(/\s{2,}/g, " ").trim();
}

const MESSAGES = {
  regionApproved: {
    ru: { title: "Регион одобрен", body: "Вам одобрен доступ к региону «{region}» — можно выходить на линию" },
    kk: { title: "Аймақ мақұлданды", body: "«{region}» аймағына рұқсат берілді — желіге шыға аласыз" },
    uz: { title: "Hudud tasdiqlandi", body: "«{region}» hududiga ruxsat berildi — liniyaga chiqishingiz mumkin" },
    zh: { title: "区域已批准", body: "您已获得「{region}」区域的权限，可以上线了" }
  },
  regionBlocked: {
    ru: { title: "Регион заблокирован", body: "Доступ к региону «{region}» заблокирован" },
    kk: { title: "Аймақ бұғатталды", body: "«{region}» аймағына рұқсат бұғатталды" },
    uz: { title: "Hudud bloklandi", body: "«{region}» hududiga ruxsat bloklandi" },
    zh: { title: "区域已封禁", body: "「{region}」区域的权限已被封禁" }
  },
  documentApproved: {
    ru: { title: "Документ проверен", body: "Ваш документ прошёл проверку" },
    kk: { title: "Құжат тексерілді", body: "Құжатыңыз тексеруден өтті" },
    uz: { title: "Hujjat tekshirildi", body: "Hujjatingiz tekshiruvdan o'tdi" },
    zh: { title: "证件已审核", body: "您的证件已通过审核" }
  },
  documentRejected: {
    ru: { title: "Документ отклонён", body: "Документ отклонён. Загрузите его заново" },
    kk: { title: "Құжат қабылданбады", body: "Құжат қабылданбады. Қайта жүктеңіз" },
    uz: { title: "Hujjat rad etildi", body: "Hujjat rad etildi. Qaytadan yuklang" },
    zh: { title: "证件被退回", body: "证件未通过审核，请重新上传" }
  },
  payoutApproved: {
    ru: { title: "Выплата одобрена", body: "Заявка на {amount} ₸ одобрена" },
    kk: { title: "Төлем мақұлданды", body: "{amount} ₸ өтінімі мақұлданды" },
    uz: { title: "To'lov tasdiqlandi", body: "{amount} ₸ arizasi tasdiqlandi" },
    zh: { title: "提现已批准", body: "{amount} ₸ 的申请已获批准" }
  },
  payoutPaid: {
    ru: { title: "Выплата отправлена", body: "{amount} ₸ переведены на ваши реквизиты" },
    kk: { title: "Төлем жіберілді", body: "{amount} ₸ деректемелеріңізге аударылды" },
    uz: { title: "To'lov yuborildi", body: "{amount} ₸ rekvizitlaringizga o'tkazildi" },
    zh: { title: "提现已发出", body: "{amount} ₸ 已转入您的账户" }
  },
  payoutRejected: {
    ru: { title: "Выплата отклонена", body: "Заявка на выплату отклонена. Подробности — в поддержке" },
    kk: { title: "Төлем қабылданбады", body: "Төлем өтінімі қабылданбады. Егжей-тегжейі қолдау қызметінде" },
    uz: { title: "To'lov rad etildi", body: "To'lov arizasi rad etildi. Tafsilotlar qo'llab-quvvatlashda" },
    zh: { title: "提现被拒绝", body: "提现申请被拒绝，详情请联系客服" }
  },
  clientBlocked: {
    ru: { title: "Доступ к заказам приостановлен", body: "Свяжитесь с поддержкой OneDriver" },
    kk: { title: "Тапсырыс беру уақытша тоқтатылды", body: "OneDriver қолдау қызметіне хабарласыңыз" },
    uz: { title: "Buyurtma berish vaqtincha to'xtatildi", body: "OneDriver qo'llab-quvvatlash xizmatiga murojaat qiling" },
    zh: { title: "下单已暂停", body: "请联系 OneDriver 客服" }
  },
  clientUnblocked: {
    ru: { title: "Доступ восстановлен", body: "Можно снова заказывать поездки" },
    kk: { title: "Қолжетімділік қалпына келтірілді", body: "Қайтадан сапарға тапсырыс беруге болады" },
    uz: { title: "Kirish tiklandi", body: "Yana safarga buyurtma berishingiz mumkin" },
    zh: { title: "访问已恢复", body: "您可以重新下单了" }
  },
  topupApplied: {
    ru: { title: "Пополнение зачтено", body: "{amount} ₸ списано с вашего долга" },
    kk: { title: "Толықтыру есепке алынды", body: "Қарызыңыздан {amount} ₸ шегерілді" },
    uz: { title: "To'ldirish hisobga olindi", body: "Qarzingizdan {amount} ₸ yechildi" },
    zh: { title: "充值已入账", body: "已从您的欠款中扣除 {amount} ₸" }
  },
  topupRejected: {
    ru: { title: "Пополнение не подтверждено", body: "Заявка закрыта без зачисления. Подробности — в поддержке" },
    kk: { title: "Толықтыру расталмады", body: "Өтінім есепке алынбай жабылды. Егжей-тегжейі қолдау қызметінде" },
    uz: { title: "To'ldirish tasdiqlanmadi", body: "Ariza hisobga olinmasdan yopildi. Tafsilotlar qo'llab-quvvatlashda" },
    zh: { title: "充值未确认", body: "申请已关闭且未入账，详情请联系客服" }
  },
  topupRequested: {
    ru: { title: "Водитель сообщил о пополнении", body: "{name} перевёл(а) {amount} ₸ — подтвердите в панели" },
    kk: { title: "Жүргізуші толықтыру туралы хабарлады", body: "{name} {amount} ₸ аударды — панельде растаңыз" },
    uz: { title: "Haydovchi to'ldirish haqida xabar berdi", body: "{name} {amount} ₸ o'tkazdi — panelda tasdiqlang" },
    zh: { title: "司机报告已充值", body: "{name} 转账 {amount} ₸，请在后台确认" }
  },
  accountBlockedRating: {
    ru: { title: "Аккаунт временно заблокирован", body: "Средний рейтинг опустился ниже минимального. Обратитесь в поддержку OneDriver." },
    kk: { title: "Аккаунт уақытша бұғатталды", body: "Орташа рейтинг ең төменгі деңгейден түсті. OneDriver қолдау қызметіне хабарласыңыз." },
    uz: { title: "Akkaunt vaqtincha bloklandi", body: "O'rtacha reyting eng past darajadan tushdi. OneDriver qo'llab-quvvatlash xizmatiga murojaat qiling." },
    zh: { title: "账户已临时封禁", body: "平均评分低于最低要求，请联系 OneDriver 客服。" }
  },
  driverFound: {
    ru: { title: "Водитель найден", body: "Водитель уже в пути к вам" },
    kk: { title: "Жүргізуші табылды", body: "Жүргізуші сізге қарай жолда" },
    uz: { title: "Haydovchi topildi", body: "Haydovchi siz tomon yo'lda" },
    zh: { title: "已找到司机", body: "司机正在赶来" }
  },
  driverFoundNamed: {
    ru: { title: "Водитель найден", body: "{name} едет за вами" },
    kk: { title: "Жүргізуші табылды", body: "{name} сізге келе жатыр" },
    uz: { title: "Haydovchi topildi", body: "{name} siz tomon kelmoqda" },
    zh: { title: "已找到司机", body: "{name} 正在来接您" }
  },
  driverOfferedPrice: {
    ru: { title: "Водитель предложил свою цену", body: "Новая цена поездки: {price} ₸" },
    kk: { title: "Жүргізуші өз бағасын ұсынды", body: "Сапардың жаңа бағасы: {price} ₸" },
    uz: { title: "Haydovchi o'z narxini taklif qildi", body: "Safarning yangi narxi: {price} ₸" },
    zh: { title: "司机出价了", body: "新的行程价格：{price} ₸" }
  },
  anotherDriverOfferedPrice: {
    ru: { title: "Ещё один водитель предложил цену", body: "Новое предложение: {price} ₸" },
    kk: { title: "Тағы бір жүргізуші баға ұсынды", body: "Жаңа ұсыныс: {price} ₸" },
    uz: { title: "Yana bir haydovchi narx taklif qildi", body: "Yangi taklif: {price} ₸" },
    zh: { title: "又有司机出价", body: "新的报价：{price} ₸" }
  },
  clientDeclinedYourPrice: {
    ru: { title: "Клиент отклонил вашу цену", body: "Можете предложить другую цену или взять другой заказ" },
    kk: { title: "Клиент бағаңызды қабылдамады", body: "Басқа баға ұсынуға немесе басқа тапсырыс алуға болады" },
    uz: { title: "Mijoz narxingizni rad etdi", body: "Boshqa narx taklif qilishingiz yoki boshqa buyurtma olishingiz mumkin" },
    zh: { title: "乘客拒绝了您的报价", body: "您可以重新出价，或接别的订单" }
  },
  clientChoseYourPrice: {
    ru: { title: "Клиент выбрал вашу цену", body: "Клиент готов принять вашу цену: {price} ₸" },
    kk: { title: "Клиент бағаңызды таңдады", body: "Клиент бағаңызға келісуге дайын: {price} ₸" },
    uz: { title: "Mijoz narxingizni tanladi", body: "Mijoz narxingizga rozi: {price} ₸" },
    zh: { title: "乘客选择了您的报价", body: "乘客同意您的价格：{price} ₸" }
  },
  clientAcceptedYourPrice: {
    ru: { title: "Клиент принял вашу цену", body: "Поездка назначена вам" },
    kk: { title: "Клиент бағаңызды қабылдады", body: "Сапар сізге тағайындалды" },
    uz: { title: "Mijoz narxingizni qabul qildi", body: "Safar sizga tayinlandi" },
    zh: { title: "乘客接受了您的报价", body: "行程已分配给您" }
  },
  clientOfferedPrice: {
    ru: { title: "Клиент предложил свою цену", body: "Новая цена поездки: {price} ₸" },
    kk: { title: "Клиент өз бағасын ұсынды", body: "Сапардың жаңа бағасы: {price} ₸" },
    uz: { title: "Mijoz o'z narxini taklif qildi", body: "Safarning yangi narxi: {price} ₸" },
    zh: { title: "乘客出价了", body: "新的行程价格：{price} ₸" }
  },
  driverAcceptedYourPrice: {
    ru: { title: "Водитель принял вашу цену", body: "Водитель уже едет к вам" },
    kk: { title: "Жүргізуші бағаңызды қабылдады", body: "Жүргізуші сізге қарай жолда" },
    uz: { title: "Haydovchi narxingizni qabul qildi", body: "Haydovchi siz tomon yo'lda" },
    zh: { title: "司机接受了您的价格", body: "司机正在赶来" }
  },
  driverDeclinedYourPrice: {
    ru: { title: "Водитель отклонил вашу цену", body: "Можете предложить другую цену" },
    kk: { title: "Жүргізуші бағаңызды қабылдамады", body: "Басқа баға ұсынуға болады" },
    uz: { title: "Haydovchi narxingizni rad etdi", body: "Boshqa narx taklif qilishingiz mumkin" },
    zh: { title: "司机拒绝了您的价格", body: "您可以重新出价" }
  },
  driverArrived: {
    ru: { title: "Водитель приехал", body: "Ваш водитель на месте и ждёт вас" },
    kk: { title: "Жүргізуші келді", body: "Жүргізушіңіз орнында, сізді күтіп тұр" },
    uz: { title: "Haydovchi yetib keldi", body: "Haydovchingiz joyida, sizni kutmoqda" },
    zh: { title: "司机已到达", body: "司机已在上车点等您" }
  },
  // Заказ, на который за отведённое время никто не поехал. Человеку говорят
  // словами, что машины не нашлось, а не оставляют экран крутиться до утра.
  searchExpired: {
    ru: { title: "Машину не нашли", body: "За {minutes} мин никто не принял заказ. Попробуйте заказать снова" },
    kk: { title: "Көлік табылмады", body: "{minutes} мин ішінде тапсырысты ешкім қабылдамады. Қайта тапсырыс беріп көріңіз" },
    uz: { title: "Mashina topilmadi", body: "{minutes} daqiqada buyurtmani hech kim qabul qilmadi. Qaytadan buyurtma bering" },
    zh: { title: "未找到车辆", body: "{minutes} 分钟内无人接单，请重新下单" }
  },
  tripCompleted: {
    ru: { title: "Поездка завершена", body: "Стоимость поездки: {price} ₸" },
    kk: { title: "Сапар аяқталды", body: "Сапардың құны: {price} ₸" },
    uz: { title: "Safar yakunlandi", body: "Safar narxi: {price} ₸" },
    zh: { title: "行程已结束", body: "行程费用：{price} ₸" }
  },
  tripCompletedNoPrice: {
    ru: { title: "Поездка завершена", body: "Спасибо, что выбрали OneDriver" },
    kk: { title: "Сапар аяқталды", body: "OneDriver-ды таңдағаныңызға рахмет" },
    uz: { title: "Safar yakunlandi", body: "OneDriver'ni tanlaganingiz uchun rahmat" },
    zh: { title: "行程已结束", body: "感谢您选择 OneDriver" }
  },
  cashbackEarned: {
    ru: { title: "Начислен кешбэк", body: "+{amount} ₸ за поездку — спишется на следующей оплате" },
    kk: { title: "Кешбэк есептелді", body: "Сапар үшін +{amount} ₸ — келесі төлемде есептеледі" },
    uz: { title: "Keshbek hisoblandi", body: "Safar uchun +{amount} ₸ — keyingi to'lovda hisobga olinadi" },
    zh: { title: "已返现", body: "本次行程 +{amount} ₸，可在下次付款时抵扣" }
  },
  referralBonusCredited: {
    ru: { title: "Бонус за приглашение", body: "+{amount} ₸ начислено на баланс" },
    kk: { title: "Шақыру бонусы", body: "Балансқа +{amount} ₸ есептелді" },
    uz: { title: "Taklif bonusi", body: "Balansga +{amount} ₸ hisoblandi" },
    zh: { title: "邀请奖励", body: "+{amount} ₸ 已计入余额" }
  },
  referralFriendFirstTrip: {
    ru: { title: "Бонус за приглашение", body: "+{amount} ₸ — приглашённый друг совершил первую поездку" },
    kk: { title: "Шақыру бонусы", body: "+{amount} ₸ — шақырған досыңыз алғашқы сапарын жасады" },
    uz: { title: "Taklif bonusi", body: "+{amount} ₸ — taklif qilgan do'stingiz birinchi safarini qildi" },
    zh: { title: "邀请奖励", body: "+{amount} ₸ —— 您邀请的朋友完成了首次行程" }
  },
  driverChanged: {
    ru: { title: "Водитель сменился", body: "Водитель отменил поездку — ищем для вас другого" },
    kk: { title: "Жүргізуші ауысты", body: "Жүргізуші сапардан бас тартты — сізге басқасын іздеп жатырмыз" },
    uz: { title: "Haydovchi o'zgardi", body: "Haydovchi safardan voz kechdi — sizga boshqasini qidiryapmiz" },
    zh: { title: "司机已更换", body: "司机取消了行程，正在为您重新寻找" }
  },
  recurringNew: {
    ru: { title: "Новый регулярный маршрут", body: "Клиент предлагает регулярную поездку: {from} → {to}" },
    kk: { title: "Жаңа тұрақты бағыт", body: "Клиент тұрақты сапар ұсынады: {from} → {to}" },
    uz: { title: "Yangi doimiy yo'nalish", body: "Mijoz doimiy safar taklif qilmoqda: {from} → {to}" },
    zh: { title: "新的固定路线", body: "乘客提议固定行程：{from} → {to}" }
  },
  recurringAccepted: {
    ru: { title: "Водитель принял маршрут", body: "Регулярная поездка активирована" },
    kk: { title: "Жүргізуші бағытты қабылдады", body: "Тұрақты сапар іске қосылды" },
    uz: { title: "Haydovchi yo'nalishni qabul qildi", body: "Doimiy safar faollashtirildi" },
    zh: { title: "司机已接受路线", body: "固定行程已启用" }
  },
  recurringDeclined: {
    ru: { title: "Водитель отклонил маршрут", body: "Попробуйте предложить маршрут другому водителю" },
    kk: { title: "Жүргізуші бағытты қабылдамады", body: "Бағытты басқа жүргізушіге ұсынып көріңіз" },
    uz: { title: "Haydovchi yo'nalishni rad etdi", body: "Yo'nalishni boshqa haydovchiga taklif qilib ko'ring" },
    zh: { title: "司机拒绝了路线", body: "可以把路线提议给其他司机" }
  },
  recurringNoDriver: {
    ru: { title: "Регулярная поездка сегодня не состоится", body: "Не удалось найти свободного водителя по вашему регулярному маршруту. Мы попробуем снова в следующий раз." },
    kk: { title: "Тұрақты сапар бүгін болмайды", body: "Тұрақты бағытыңызға бос жүргізуші табылмады. Келесі жолы қайта көреміз." },
    uz: { title: "Doimiy safar bugun bo'lmaydi", body: "Doimiy yo'nalishingiz uchun bo'sh haydovchi topilmadi. Keyingi safar qayta urinamiz." },
    zh: { title: "今天的固定行程无法进行", body: "没有找到可承接您固定路线的司机，下次会再试。" }
  },
  recurringStarted: {
    ru: { title: "Регулярная поездка началась", body: "Водитель {name} едет по вашему регулярному маршруту" },
    kk: { title: "Тұрақты сапар басталды", body: "{name} жүргізуші тұрақты бағытыңызбен келе жатыр" },
    uz: { title: "Doimiy safar boshlandi", body: "Haydovchi {name} doimiy yo'nalishingiz bo'ylab kelmoqda" },
    zh: { title: "固定行程已开始", body: "司机 {name} 正沿您的固定路线前来" }
  },
  recurringRoute: {
    ru: { title: "Регулярная поездка", body: "{from} → {to}" },
    kk: { title: "Тұрақты сапар", body: "{from} → {to}" },
    uz: { title: "Doimiy safar", body: "{from} → {to}" },
    zh: { title: "固定行程", body: "{from} → {to}" }
  },
  standYourTurn: {
    ru: { title: "Ваша очередь", body: "Вы первый на стоянке «{stand}». Можно набирать пассажиров." },
    kk: { title: "Сіздің кезегіңіз", body: "«{stand}» тұрағында бірінші тұрсыз. Жолаушы ала бересіз." },
    uz: { title: "Sizning navbatingiz", body: "«{stand}» to'xtash joyida birinchisiz. Yo'lovchi olishingiz mumkin." },
    zh: { title: "轮到您了", body: "您在「{stand}」停车点排在第一位，可以开始上客。" }
  },
  standClosed: {
    ru: { title: "Стоянка закрыта", body: "Стоянку закрыли, бронь снята. Закажите машину обычным заказом." },
    kk: { title: "Тұрақ жабылды", body: "Тұрақ жабылды, брондау алынды. Әдеттегідей тапсырыс беріңіз." },
    uz: { title: "To'xtash joyi yopildi", body: "To'xtash joyi yopildi, bron bekor qilindi. Oddiy buyurtma bering." },
    zh: { title: "停车点已关闭", body: "停车点已关闭，预订已取消。请改用普通叫车。" }
  },
  standReservationCancelled: {
    ru: { title: "Бронь на стоянке снята", body: "Машина уехала. Выберите другую машину на стоянке." },
    kk: { title: "Тұрақтағы брондау алынды", body: "Көлік кетіп қалды. Тұрақтан басқа көлік таңдаңыз." },
    uz: { title: "To'xtash joyidagi bron bekor qilindi", body: "Mashina ketdi. To'xtash joyidan boshqa mashina tanlang." },
    zh: { title: "停车点预订已取消", body: "车辆已离开，请在停车点另选一辆。" }
  },
  standSeatRequest: {
    ru: { title: "Бронь места на стоянке", body: "{name}: {seats} мест(о). Подтвердите в приложении." },
    kk: { title: "Тұрақтан орын брондау", body: "{name}: {seats} орын. Қосымшада растаңыз." },
    uz: { title: "To'xtash joyida joy broni", body: "{name}: {seats} joy. Ilovada tasdiqlang." },
    zh: { title: "停车点座位预订", body: "{name}：{seats} 个座位。请在应用内确认。" }
  },
  standTurnHandedOver: {
    ru: { title: "Вам передали очередь", body: "{name} уступил вам место на стоянке «{stand}»." },
    kk: { title: "Сізге кезек берілді", body: "{name} «{stand}» тұрағындағы орнын сізге берді." },
    uz: { title: "Sizga navbat berildi", body: "{name} «{stand}» to'xtash joyidagi o'rnini sizga berdi." },
    zh: { title: "有人把排队位置让给您", body: "{name} 把「{stand}」停车点的位置让给了您。" }
  },
  lostItem: {
    ru: { title: "Пассажир забыл вещь в машине", body: "Проверьте салон — клиент оставил заявку в поддержку" },
    kk: { title: "Жолаушы көлікте зат ұмытып кеткен", body: "Салонды тексеріңіз — клиент қолдау қызметіне өтініш қалдырды" },
    uz: { title: "Yo'lovchi mashinada narsa unutib qoldirgan", body: "Salonni tekshiring — mijoz qo'llab-quvvatlashga murojaat qoldirdi" },
    zh: { title: "乘客把东西落在车上了", body: "请检查车厢——乘客已向客服提交了寻物申请" }
  },
  supportReply: {
    ru: { title: "Ответ от поддержки", body: "{text}" },
    kk: { title: "Қолдау қызметінің жауабы", body: "{text}" },
    uz: { title: "Qo'llab-quvvatlash javobi", body: "{text}" },
    zh: { title: "客服回复", body: "{text}" }
  }
};

export function notificationMessage(key, locale, params = {}) {
  const entry = MESSAGES[key];
  if (!entry) return null;
  const text = entry[normalizeLocale(locale)] || entry[DEFAULT_LOCALE];
  return { title: fill(text.title, params), body: fill(text.body, params) };
}

export const NOTIFICATION_KEYS = Object.keys(MESSAGES);
export { MESSAGES as NOTIFICATION_MESSAGES };
