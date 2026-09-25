import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { TRANSITION_RULES, ACTIVE_ORDER_STATUSES, CLIENT_ACTIVE_ORDER_STATUSES, OPEN_ORDER_STATUSES, STALLABLE_ORDER_STATUSES } from "../modules/orders/order-dispatch.service.js";

// У начатой поездки должен быть выход.
//
// Завершить её мог только водитель. Если его телефон сел, приложение снесли
// или он просто больше его не открыл, заказ оставался живым навсегда: пассажир
// отменить не может, владелец не мог тоже. А пока заказ не закрыт, человек не
// может заказать машину вообще — незакрытый заказ считается активным.
//
// Отменять идущую поездку плохо. Заказ, который нельзя закрыть никогда, хуже:
// владелец хотя бы может позвонить обеим сторонам, а «нельзя» не может ничего.

const root = fileURLToPath(new URL("../", import.meta.url));

// --- Выход есть, и он у владельца ---
for (const status of ["TRIP_STARTED", "IN_PROGRESS"]) {
  assert(
    TRANSITION_RULES.CANCELLED_BY_OPERATOR.includes(status),
    `из ${status} владелец не может закрыть заказ — значит его не закроет никто`
  );
}

// --- Но не у остальных: пассажир не закрывает поездку, в которой едет ---
for (const status of ["TRIP_STARTED", "IN_PROGRESS"]) {
  assert(
    !TRANSITION_RULES.CANCELLED_BY_CLIENT.includes(status),
    `пассажир не должен закрывать начатую поездку из ${status}`
  );
}

// --- Почему это вообще важно: незакрытый заказ блокирует человека ---
assert(
  ACTIVE_ORDER_STATUSES.every(status => CLIENT_ACTIVE_ORDER_STATUSES.includes(status)),
  "если активный заказ перестал блокировать новый, смысл этой проверки изменился — перечитайте её"
);

// --- Владелец такие поездки видит ---
{
  const admin = readFileSync(`${root}modules/admin/admin.routes.js`, "utf8");
  assert.match(admin, /stalledTrips: orders\.rows\[0\]\.stalled/, "дашборд не считает зависшие поездки");
  assert.match(
    admin,
    /status = ANY\(\$4::text\[\]\)\s+AND COALESCE\(accepted_at, created_at\) < NOW\(\) - INTERVAL '3 hours'/,
    "счёт зависших поездок должен идти по времени без изменений, а не по чему-то ещё"
  );
  // Считать надо по всем состояниям, где пассажир заблокирован и само ничего
  // не сдвинется. Раньше считались только семь состояний самой поездки, и
  // заказ, доехавший до TRIP_COMPLETED без отметки об оплате, не попадал в
  // счёт вовсе -- а это самый вероятный случай: для водителя поездка
  // кончилась, деньги у него в руках, и последнее касание проще всего не
  // сделать.
  assert(
    admin.includes("STALLABLE_ORDER_STATUSES"),
    "зависшим считается всё, из-за чего пассажир не может заказать машину, а не только сама поездка"
  );
  for (const status of ["TRIP_COMPLETED", "PAYMENT_PENDING"]) {
    assert(
      STALLABLE_ORDER_STATUSES.includes(status),
      `${status} блокирует пассажира и сам не закроется — он должен попадать в счёт зависших`
    );
    assert(
      CLIENT_ACTIVE_ORDER_STATUSES.includes(status),
      `${status} перестал блокировать пассажира — смысл этой проверки изменился, перечитайте её`
    );
  }
  assert(
    !STALLABLE_ORDER_STATUSES.some(status => OPEN_ORDER_STATUSES.includes(status)),
    "поиск сюда не входит: его закрывает сама система через пятнадцать минут"
  );

  const adminApp = `${root}../../web/src/features/admin/AdminApp.jsx`;
  if (existsSync(adminApp)) {
    // Читаем как строку и сравниваем через includes: файл хранится с CRLF, и
    // совпадение по \n молча не сработало бы. И сообщение об ошибке говорит про
    // факт: assert.match на файле такого размера печатает его целиком.
    const source = readFileSync(adminApp, "utf8").replace(/\r\n/g, "\n");
    assert(source.includes("Поездки без движения"), "карточки о зависших поездках нет на главной панели");
    assert(
      /CANCELLABLE_ORDER_STATUSES = \[[\s\S]*?"TRIP_STARTED"[\s\S]*?"IN_PROGRESS"[\s\S]*?\]/.test(source),
      "панель должна разрешать закрытие начатой поездки"
    );
    assert(
      source.includes("Закрыть поездку"),
      "кнопка для начатой поездки должна называться иначе: это не отмена заказа"
    );
  }
}

console.log(
  "Stalled trip checks ok: the owner can close a trip that stopped moving, the rider still cannot, and the dashboard shows them"
);
