import fs from "node:fs";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function read(path) {
  return fs.readFileSync(new URL(path, import.meta.url), "utf8");
}

const schema = read("../db/schema.sql");
const migrations = read("../db/migrations.js");
const financeService = read("../modules/finance/finance.service.js");
const ordersRoutes = read("../modules/orders/orders.routes.js");
const adminRoutes = read("../modules/admin/admin.routes.js");
const adminApp = read("../../../web/src/features/admin/AdminApp.jsx");
const adminApi = read("../../../web/src/lib/mvpApi.js");

[
  "CREATE TABLE IF NOT EXISTS financial_transactions",
  "order_id UUID REFERENCES orders(id) ON DELETE SET NULL",
  "driver_id UUID REFERENCES drivers(id) ON DELETE SET NULL",
  "client_user_id UUID REFERENCES users(id) ON DELETE SET NULL",
  "region_id UUID REFERENCES regions(id) ON DELETE SET NULL",
  "tariff_id UUID REFERENCES tariffs(id) ON DELETE SET NULL",
  "ORDER_COMPLETED",
  "ORDER_CANCELLED",
  "DRIVER_DEBT_CREATED",
  "DRIVER_DEBT_ADJUSTED",
  "MANUAL_ADJUSTMENT",
  "KASPI_TRANSFER",
  "driver_debt_delta",
  "metadata JSONB NOT NULL DEFAULT '{}'::jsonb",
  "idx_financial_transactions_order_completed_once"
].forEach(token => assert(schema.includes(token), `Finance schema missing ${token}`));

[
  "CREATE TABLE IF NOT EXISTS financial_transactions",
  "idx_financial_transactions_order_id",
  "idx_financial_transactions_driver_id",
  "idx_financial_transactions_region_id",
  "idx_financial_transactions_tariff_id",
  "idx_financial_transactions_type",
  "idx_financial_transactions_created_at",
  "idx_financial_transactions_status",
  "idx_financial_transactions_order_completed_once"
].forEach(token => assert(migrations.includes(token), `Finance migration missing ${token}`));

[
  "createOrderCompletedTransaction",
  "createOrderCancelledTransaction",
  "getFinanceSummary",
  "getDriverDebts",
  "getTransactions",
  "pricing_snapshot",
  "driver_debt_delta",
  "paymentNeedsReview",
  "ON CONFLICT DO NOTHING"
].forEach(token => assert(financeService.includes(token), `Finance service missing ${token}`));

[
  "createOrderCompletedTransaction",
  "createOrderCancelledTransaction",
  "SELECT * FROM tariffs WHERE region_id=$1 AND name=$2"
].forEach(token => assert(ordersRoutes.includes(token), `Order finance integration missing ${token}`));

[
  'router.get("/finance/summary"',
  'router.get("/finance/driver-debts"',
  'router.get("/finance/transactions"',
  "getFinanceSummary",
  "getDriverDebts",
  "getTransactions"
].forEach(token => assert(adminRoutes.includes(token), `Admin finance endpoint missing ${token}`));

[
  "getAdminFinanceSummary",
  "getAdminFinanceDriverDebts",
  "getAdminFinanceTransactions"
].forEach(fn => assert(adminApi.includes(`function ${fn}`), `Admin finance API wrapper missing ${fn}`));

[
  "Финансы",
  "Выручка, комиссия сервиса и задолженность водителей",
  "Общая выручка",
  "Комиссия сервиса",
  "Доход водителей",
  "Долг водителей",
  "Финансовых операций пока нет",
  "Данные появятся после завершённых поездок",
  "finance-debt",
  "finance-transaction"
].forEach(copy => assert(adminApp.includes(copy), `Admin finance UI missing ${copy}`));

console.log("Finance ledger checks ok");
