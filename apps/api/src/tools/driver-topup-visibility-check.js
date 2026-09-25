import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// У кнопки «я пополнил» должен быть адресат.
//
// Водитель переводит деньги на Kaspi и жмёт эту кнопку. Заявка ложилась в
// driver_topup_requests со статусом PENDING — и не показывалась нигде: ни
// списка в панели, ни уведомления владельцу, ни способа её закрыть.
// Комментарий в коде обещал, что «владелец применит её через правку долга в
// финансах», но узнать о заявке он мог только если водитель позвонит сам.
//
// Проверка держит всю цепочку: заявка доходит, её видно, её можно закрыть — и
// закрытие двигает долг ровно один раз, в той же транзакции.

const root = fileURLToPath(new URL("../", import.meta.url));
const repoRoot = fileURLToPath(new URL("../../../../", import.meta.url));
const read = (...parts) => readFileSync(join(...parts), "utf8").replace(/\r\n/g, "\n");

const walletService = read(root, "modules", "wallet", "wallet.service.js");
const walletRoutes = read(root, "modules", "wallet", "wallet.routes.js");
const adminRoutes = read(root, "modules", "admin", "admin.routes.js");
const migrations = read(root, "db", "migrations.js");
const messages = read(root, "modules", "notifications", "notification-messages.js");

// --- Заявка доходит до человека ---------------------------------------------
assert(
  walletRoutes.includes('key: "topupRequested"'),
  "о новой заявке должен узнать владелец: без уведомления она снова ляжет в базу и будет ждать звонка"
);
assert(
  /role IN \('OWNER','FINANCE'\)/.test(walletRoutes),
  "уведомление о заявке должно уходить тем, кто может её закрыть"
);
for (const key of ["topupRequested", "topupApplied", "topupRejected"]) {
  assert(messages.includes(`${key}: {`), `нет текста уведомления ${key}`);
}

// --- Её видно и её можно закрыть --------------------------------------------
assert(
  adminRoutes.includes('router.get("/driver-topup-requests"'),
  "в панели должен быть список заявок на пополнение"
);
assert(
  adminRoutes.includes('router.patch("/driver-topup-requests/:id"'),
  "заявку должно быть чем закрыть"
);
assert(
  walletService.includes("export async function listDriverTopupRequestsForReview"),
  "список заявок для панели пропал"
);

// --- Открытая заявка одна ---------------------------------------------------
assert(
  walletService.includes("TOPUP_REQUEST_ALREADY_PENDING"),
  "вторая открытая заявка не должна создаваться: владелец увидел бы две на одну сумму и мог списать долг дважды"
);
assert(
  /CREATE UNIQUE INDEX IF NOT EXISTS uniq_driver_topup_pending[^`]*WHERE status='PENDING'/s.test(migrations),
  "правило «одна открытая заявка» должно держаться и в базе — два одновременных нажатия проходят мимо проверки в коде"
);
assert(
  migrations.indexOf("UPDATE driver_topup_requests t") < migrations.indexOf("uniq_driver_topup_pending"),
  "накопившиеся заявки надо схлопнуть до создания уникального индекса, иначе миграция упадёт и API не поднимется"
);

// --- Заплатить свой долг можно всегда ---------------------------------------
//
// Минимум пополнения существует, чтобы не гонять переводы на мелочь. Но
// зачесть больше долга нельзя, и водитель, задолжавший меньше минимума,
// оказывался заперт между двумя отказами: меньше 500 не принимают, 500 не
// зачитывают. Кнопка для него мертва, а два отказа противоречат друг другу.
{
  const at = walletService.indexOf("export async function createDriverTopupRequest");
  const body = walletService.slice(at, walletService.indexOf(String.fromCharCode(10) + "export ", at + 1));
  assert(
    body.includes("Math.min(MIN_TOPUP_KZT"),
    "нижняя граница пополнения должна опускаться до размера долга, иначе мелкий долг погасить нечем"
  );
  assert(
    body.indexOf("SELECT debt FROM drivers") < body.indexOf("TOPUP_BELOW_MINIMUM"),
    "долг надо прочитать до отказа по минимуму: именно он задаёт границу"
  );
}

// --- Подтверждение и долг — одно действие -----------------------------------
const reviewAt = walletService.indexOf("export async function reviewDriverTopupRequest");
assert(reviewAt >= 0, "пропало подтверждение заявки");
const reviewBody = walletService.slice(reviewAt, walletService.indexOf("\nexport ", reviewAt + 1));
assert(
  reviewBody.includes("FOR UPDATE"),
  "заявку надо заблокировать: два владельца могут открыть панель одновременно"
);
assert(
  reviewBody.includes("TOPUP_REQUEST_NOT_PENDING"),
  "закрытую заявку нельзя подтверждать второй раз"
);
assert(
  reviewBody.includes("adjustDriverDebt"),
  "подтверждение должно само двигать долг: два шага — это шаг, который забывают, и шаг, который делают дважды"
);
assert(
  reviewBody.includes("amount: -appliedKzt"),
  "долг должен уменьшаться, а не расти"
);
assert(
  reviewBody.includes("amountKzt ?? request.amount_kzt"),
  "списывается подтверждённая сумма: перевод мог прийти не тот, что записан в заявке"
);
// Долг не уходит ниже нуля, поэтому зачесть больше долга -- значит записать в
// книгу минус, которого у водителя не случится.
assert(
  reviewBody.includes("TOPUP_EXCEEDS_DEBT"),
  "зачесть больше текущего долга нельзя: лишнее растворилось бы между книгой и водителем"
);
assert(
  reviewBody.indexOf("TOPUP_EXCEEDS_DEBT") < reviewBody.indexOf("adjustDriverDebt"),
  "отказ должен случиться до проводки"
);

// И сама проводка должна говорить то, что произошло: раньше списание было
// GREATEST(0, debt + delta), а в книгу писалась исходная сумма.
{
  const finance = read(root, "modules", "finance", "finance.service.js");
  const at = finance.indexOf("export async function adjustDriverDebt");
  const body = finance.slice(at, finance.indexOf(String.fromCharCode(10) + "export ", at + 1));
  assert(
    body.includes("appliedDelta"),
    "в книгу должна писаться применённая разница, а не запрошенная"
  );
  assert(
    body.includes("[appliedDelta, driverId]"),
    "списание должно идти от применённой разницы"
  );
  assert(
    !body.includes("    numericAmount," ),
    "в проводку больше не должна попадать запрошенная сумма: она расходится со списанием"
  );
}

// --- Отказ ничего не двигает ------------------------------------------------
const applyAt = reviewBody.indexOf("adjustDriverDebt");
assert(
  reviewBody.lastIndexOf('if (status === "COMPLETED")', applyAt) >= 0,
  "проводка должна создаваться только при подтверждении"
);

// --- Панель показывает это владельцу ----------------------------------------
const adminApp = join(repoRoot, "apps", "web", "src", "features", "admin", "AdminApp.jsx");
if (existsSync(adminApp)) {
  const panel = read(adminApp);
  assert(
    panel.includes("getAdminDriverTopupRequests"),
    "панель должна запрашивать заявки на пополнение"
  );
  assert(
    panel.includes("TopupConfirmPanel") && panel.includes("TopupDeclinePanel"),
    "в панели должно быть чем зачесть заявку и чем закрыть её без зачисления"
  );
} else {
  console.warn("Driver topup panel check skipped: apps/web is not present in this runtime image");
}

console.log("Driver topup visibility checks ok: the request reaches someone, one at a time, and confirming it moves the debt once");
