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
const financeRoutes = read("../modules/finance/finance.routes.js");
const ordersRoutes = read("../modules/orders/orders.routes.js");
const adminRoutes = read("../modules/admin/admin.routes.js");
const adminAppUrl = new URL("../../../web/src/features/admin/AdminApp.jsx", import.meta.url);
const adminApiUrl = new URL("../../../web/src/lib/mvpApi.js", import.meta.url);
const hasWebSource = fs.existsSync(adminAppUrl) && fs.existsSync(adminApiUrl);
const adminApp = hasWebSource ? fs.readFileSync(adminAppUrl, "utf8") : "";
const adminApi = hasWebSource ? fs.readFileSync(adminApiUrl, "utf8") : "";

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
  "adjustDriverDebt",
  "getFinanceReports",
  "exportFinanceTransactionsCsv",
  "validateFinanceDateRange",
  "pricing_snapshot",
  "driver_debt_delta",
  "paymentNeedsReview",
  "ON CONFLICT DO NOTHING",
  "ADMIN_MANUAL_ADJUSTMENT",
  "ORDER_COMPLETED",
  "ORDER_CANCELLED"
].forEach(token => assert(financeService.includes(token), `Finance service missing ${token}`));

[
  "createOrderCompletedTransaction",
  "createOrderCancelledTransaction",
  "SELECT * FROM tariffs WHERE region_id=$1 AND name=$2"
].forEach(token => assert(ordersRoutes.includes(token), `Order finance integration missing ${token}`));

[
  'router.get("/finance/summary"',
  'router.get("/finance/driver-debts"',
  'router.post("/finance/driver-debts/:driverId/adjust"',
  'router.get("/finance/reports"',
  'router.get("/finance/transactions.csv"',
  'router.get("/finance/transactions"',
  'requireRole("OWNER", "FINANCE")',
  'groupBy: z.enum(["day", "region", "driver", "tariff", "paymentMethod"])',
  "FinanceDebtAdjustment",
  "reason: z.string().trim().min(3)",
  "driver_debt_adjusted",
  "getFinanceSummary",
  "getDriverDebts",
  "adjustDriverDebt",
  "getFinanceReports",
  "exportFinanceTransactionsCsv",
  "getTransactions"
].forEach(token => assert(adminRoutes.includes(token), `Admin finance endpoint missing ${token}`));

if (hasWebSource) {
[
  "getAdminFinanceSummary",
  "getAdminFinanceDriverDebts",
  "getAdminFinanceTransactions",
  "getAdminFinanceReports",
  "adjustAdminDriverDebt",
  "exportAdminFinanceTransactionsCsv"
].forEach(fn => assert(adminApi.includes(`function ${fn}`), `Admin finance API wrapper missing ${fn}`));

[
  "financeSection",
  "overview",
  "reports",
  "debts",
  "transactions",
  "finance-report",
  "finance-debt",
  "finance-transaction",
  "DebtAdjustmentPanel",
  "Корректировка долга",
  "Экспорт CSV",
  "groupBy",
  "paymentMethod",
  "driverDebtDelta"
].forEach(token => assert(adminApp.includes(token), `Admin finance UI missing ${token}`));
} else {
  console.warn("Finance admin web-source checks skipped: apps/web is not present in this runtime image");
}

// GET /finance/stats queries orders.status directly (not the
// financial_transactions ledger checked above) -- it must use the real
// lifecycle statuses (order-dispatch.service.js), not the pre-lifecycle-
// expansion values ('COMPLETED'/'NEW'/'DRIVER_ASSIGNED' alone), which
// current orders never reach and left every number reading ~0.
assert(financeRoutes.includes('import { OPEN_ORDER_STATUSES, ACTIVE_ORDER_STATUSES } from "../orders/order-dispatch.service.js"'), "finance.routes.js must import the real order-lifecycle status sets, not hardcode legacy-only statuses");
assert(financeRoutes.includes('const SETTLED_WITH_PAYMENT_STATUSES = ["COMPLETED", "PAID", "RATED"];'), "finance stats revenue/commission/cashback must count PAID/RATED orders, not just the legacy 'COMPLETED' status");
assert(!/status='COMPLETED'|status='NEW'|status IN \('DRIVER_ASSIGNED','DRIVER_ARRIVED','IN_PROGRESS'\)/.test(financeRoutes), "finance stats must not filter on the old legacy-only status literals directly");

console.log("Finance ledger checks ok");
