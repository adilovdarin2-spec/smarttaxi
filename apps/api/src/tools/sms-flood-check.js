import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Номер защищён от засыпания кодами, а не только сервер.
//
// Ограничитель на маршруте считает запросы по адресу. У мобильного интернета
// адрес меняется сам, а с десятка устройств потолок в шесть штук в минуту не
// значит ничего. Тогда получаются две беды сразу: человеку, которому решили
// насолить, коды идут всю ночь — он их не заказывал и выключить не может, — а
// платит за каждое сообщение владелец. Шесть в минуту с одного адреса это
// триста шестьдесят в час; кончится баланс у оператора — зарегистрироваться
// не сможет уже никто.
//
// Пределы считаются в базе: она одна на все серверы, а память процесса — нет.

const root = fileURLToPath(new URL("../", import.meta.url));
const source = readFileSync(`${root}modules/auth/auth.routes.js`, "utf8");

// --- Пределы существуют и разумны ---
const cooldown = /SMS_RESEND_COOLDOWN_SECONDS\s*=\s*(\d+)/.exec(source);
const daily = /SMS_DAILY_LIMIT_PER_PHONE\s*=\s*(\d+)/.exec(source);
assert(cooldown, "пауза между кодами на один номер исчезла");
assert(daily, "суточный предел кодов на один номер исчез");

const cooldownSeconds = Number(cooldown[1]);
const dailyLimit = Number(daily[1]);
assert(
  cooldownSeconds >= 30 && cooldownSeconds <= 300,
  `пауза ${cooldownSeconds} с: слишком коротко, чтобы мешать рассылке, или слишком долго для живого человека`
);
assert(
  dailyLimit >= 3 && dailyLimit <= 30,
  `суточный предел ${dailyLimit}: столько кодов человеку не нужно, а рассылке не помешает`
);

// --- Проверка стоит ДО отправки, а не после ---
const sendHandler = source.slice(source.indexOf('router.post("/sms/send"'));
const guardAt = sendHandler.indexOf("assertSmsAllowedForPhone");
const sendAt = sendHandler.indexOf("sendSmsCode(");
assert(guardAt > 0, "обработчик не спрашивает разрешения перед отправкой");
assert(sendAt > 0, "обработчик больше не отправляет код");
assert(
  guardAt < sendAt,
  "разрешение проверяется после отправки — сообщение уже ушло и уже оплачено"
);

// --- Счёт ведётся по номеру и в базе ---
assert.match(
  source,
  /FROM auth_sms_codes\s+WHERE phone = \$1/,
  "пределы должны считаться по номеру в базе: память одного процесса не знает про остальные серверы"
);
assert.match(source, /INTERVAL '24 hours'/, "суточное окно потерялось");

// --- Человеку сказано, сколько ждать ---
assert.match(
  source,
  /"SMS_CODE_TOO_SOON", \{ retryAfterSeconds \}/,
  "отказ должен называть, через сколько пробовать, иначе человек жмёт кнопку вслепую"
);

// --- И сказано на его языке ---
const messages = readFileSync(
  `${root}../../mobile/smarttaxi_app/lib/features/shared/api_error_messages.dart`,
  "utf8"
);
for (const code of ["SMS_CODE_TOO_SOON", "SMS_DAILY_LIMIT_REACHED"]) {
  assert(
    messages.includes(`'${code}'`),
    `${code} превратится в «что-то пошло не так» — человек не поймёт, что просто подождать`
  );
}

console.log(
  `SMS flood checks ok: ${cooldownSeconds}s between codes, ${dailyLimit} per number per day, counted in the database, refusal says how long to wait`
);
