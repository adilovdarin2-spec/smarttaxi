import { query as defaultQuery } from "../../db/pool.js";
import { ACTIVE_ORDER_STATUSES, OPEN_ORDER_STATUSES } from "../orders/order-dispatch.service.js";

// Что происходит с ценой на самом деле.
//
// Панель показывала деньги — сколько заработано и сколько должны. Но на
// вопрос «не дорого ли пассажиру и не дёшево ли водителю» деньги не отвечают:
// обе стороны уходят молча и не пишут в поддержку. Уходят они по двум разным
// причинам, и у каждой есть свой след в базе.
//
// Водителю дёшево — заказ висит и не находит машину. След: заказ закрылся,
// так и не дойдя до назначения, или водитель отменил с причиной «слишком
// далеко».
//
// Пассажиру дорого — он предлагает свою цену и получает отказ, либо не
// дожидается и уходит. След: отклонённые предложения цены и отмены с
// причинами «долго ждал» и «нашёл другую машину».
//
// Здесь не выводится «правильная цена» — её не существует в отрыве от спроса.
// Здесь показаны те несколько чисел, по которым владелец может двигать цену
// осознанно, а не на ощупь.

function run(executor, sql, params = []) {
  const target = executor || defaultQuery;
  return target.query ? target.query(sql, params) : target(sql, params);
}

function ratio(part, whole) {
  const top = Number(part || 0);
  const bottom = Number(whole || 0);
  if (bottom <= 0) return null;
  return Math.round((top / bottom) * 1000) / 10;
}

// Диапазон дат приходит из панели как две даты; конец включительно.
export function resolveDemandDateRange({ dateFrom, dateTo } = {}) {
  const to = dateTo ? new Date(`${dateTo}T23:59:59.999Z`) : new Date();
  const from = dateFrom
    ? new Date(`${dateFrom}T00:00:00.000Z`)
    : new Date(to.getTime() - 29 * 24 * 60 * 60 * 1000);
  return { dateFrom: from.toISOString(), dateTo: to.toISOString() };
}

export async function getPricingDemand({ regionId = null, dateFrom, dateTo } = {}, executor) {
  const range = resolveDemandDateRange({ dateFrom, dateTo });
  const params = [range.dateFrom, range.dateTo, regionId];
  const scope = "o.created_at >= $1 AND o.created_at <= $2 AND ($3::uuid IS NULL OR o.region_id = $3)";

  // --- Сколько заказов вообще было и сколько дошло до машины ---
  //
  // «Ещё ищет» считается отдельно: заказ, созданный минуту назад, ещё не
  // провал, и складывать его с брошенными — значит пугать владельца цифрой,
  // которая сама себя исправит через две минуты.
  const totals = (await run(executor, `
    SELECT
      COUNT(*)::int AS created,
      COUNT(*) FILTER (WHERE o.accepted_at IS NOT NULL)::int AS assigned,
      COUNT(*) FILTER (WHERE o.status IN ('PAID','RATED','COMPLETED'))::int AS completed,
      COUNT(*) FILTER (WHERE o.accepted_at IS NULL AND o.status = ANY($4::text[]))::int AS still_searching,
      COUNT(*) FILTER (WHERE o.accepted_at IS NULL AND NOT (o.status = ANY($4::text[])))::int AS never_assigned,
      COUNT(*) FILTER (WHERE o.status = 'CANCELLED_BY_CLIENT')::int AS cancelled_by_client,
      COUNT(*) FILTER (WHERE o.status = 'CANCELLED_BY_DRIVER')::int AS cancelled_by_driver,
      COALESCE(AVG(o.price) FILTER (WHERE o.status IN ('PAID','RATED','COMPLETED')), 0)::int AS average_price,
      COALESCE(SUM(o.price) FILTER (WHERE o.status IN ('PAID','RATED','COMPLETED')), 0)::bigint AS gross,
      COALESCE(SUM(o.service_commission) FILTER (WHERE o.status IN ('PAID','RATED','COMPLETED')), 0)::bigint AS commission
    FROM orders o
    WHERE ${scope}
  `, [...params, [...OPEN_ORDER_STATUSES, ...ACTIVE_ORDER_STATUSES]])).rows[0];

  // --- Сколько человек ждал машину ---
  //
  // Среднее здесь врёт: один заказ, провисевший полчаса, поднимает его так,
  // что остальные становятся не видны. Медиана говорит про обычный день, а
  // девяностая доля — про тот хвост, из-за которого люди и уходят.
  const wait = (await run(executor, `
    SELECT
      COALESCE(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (o.accepted_at - o.created_at))), 0)::int AS median_seconds,
      COALESCE(PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (o.accepted_at - o.created_at))), 0)::int AS p90_seconds
    FROM orders o
    WHERE ${scope} AND o.accepted_at IS NOT NULL
  `, params)).rows[0];

  // --- Торг о цене ---
  //
  // Пассажир предлагает свою цену, водитель отвечает своей. Много отказов со
  // стороны водителей — предложенная цена ниже той, за которую вообще едут.
  const riderOffers = (await run(executor, `
    SELECT
      COUNT(*)::int AS made,
      COUNT(*) FILTER (WHERE q.status = 'ACCEPTED')::int AS accepted,
      COUNT(*) FILTER (WHERE q.status IN ('DECLINED','EXPIRED'))::int AS refused,
      COALESCE(AVG(q.price_kzt), 0)::int AS average_price
    FROM order_price_offer_queue q
    JOIN orders o ON o.id = q.order_id
    WHERE ${scope}
  `, params)).rows[0];

  const driverOffers = (await run(executor, `
    SELECT
      COUNT(*) FILTER (WHERE o.driver_offer_status IS NOT NULL)::int AS made,
      COUNT(*) FILTER (WHERE o.driver_offer_status = 'ACCEPTED')::int AS accepted,
      COUNT(*) FILTER (WHERE o.driver_offer_status IN ('DECLINED','EXPIRED'))::int AS refused,
      COALESCE(AVG(o.driver_offer_price_kzt) FILTER (WHERE o.driver_offer_price_kzt IS NOT NULL), 0)::int AS average_price
    FROM orders o
    WHERE ${scope}
  `, params)).rows[0];

  // Насколько предложенная цена отличается от названной сервисом. Ниже ста
  // процентов — люди торгуются вниз, и фиксированная цена им велика.
  //
  // Сравнивать надо с оценкой, а не с ценой заказа. Когда пассажир называет
  // свою цену, она и становится ценой заказа — деление давало ровно 100 у
  // каждого такого заказа, и панель уверенно отвечала «никто не торгуется»
  // на вопрос, ради которого она написана. На тех же трёх заказах против
  // оценки выходит 91, 93 и 97: торговались все трое.
  //
  // Заказы без сохранённой оценки в счёт не идут вовсе: подставить туда
  // цену — значит вернуть ту же сотню и развести среднее обратно к неправде.
  const offeredVsFixed = (await run(executor, `
    SELECT COALESCE(AVG(
             o.offered_price_kzt::numeric
             / NULLIF((o.pricing_snapshot->>'estimatedPrice')::numeric, 0)
           ) * 100, 0)::int AS percent,
           COUNT(*)::int AS orders
    FROM orders o
    WHERE ${scope}
      AND o.offered_price_kzt IS NOT NULL AND o.offered_price_kzt > 0
      AND (o.pricing_snapshot->>'estimatedPrice') IS NOT NULL
      AND (o.pricing_snapshot->>'estimatedPrice')::numeric > 0
  `, params)).rows[0];

  // --- Почему отменяли ---
  const reasons = (await run(executor, `
    SELECT o.last_cancel_reason_code AS code,
           CASE WHEN o.status = 'CANCELLED_BY_DRIVER' THEN 'driver' ELSE 'client' END AS side,
           COUNT(*)::int AS count
    FROM orders o
    WHERE ${scope}
      AND o.last_cancel_reason_code IS NOT NULL
      AND o.status IN ('CANCELLED_BY_CLIENT','CANCELLED_BY_DRIVER')
    GROUP BY 1, 2
    ORDER BY 3 DESC
  `, params)).rows;

  // --- Сколько водители стояли на линии и что за это получили ---
  //
  // Заработок за поездку ничего не говорит: водитель, который возит за 700 и
  // потом сорок минут стоит, зарабатывает меньше того, кто возит за 600 без
  // простоя. Смены пишутся с того дня, как это включили, — за более ранний
  // период часов просто нет, и панель об этом говорит прямо, а не показывает
  // ноль как факт.
  const line = (await run(executor, `
    SELECT
      COALESCE(SUM(EXTRACT(EPOCH FROM (LEAST(COALESCE(s.ended_at, NOW()), $2::timestamptz) - GREATEST(s.started_at, $1::timestamptz)))), 0)::bigint AS seconds,
      COUNT(DISTINCT s.driver_id)::int AS drivers
    FROM driver_shifts s
    WHERE s.started_at <= $2::timestamptz
      AND COALESCE(s.ended_at, NOW()) >= $1::timestamptz
      AND ($3::uuid IS NULL OR s.region_id = $3)
  `, params)).rows[0];

  const lineHours = Math.round((Number(line.seconds) / 3600) * 10) / 10;
  const driverEarnings = Number(totals.gross) - Number(totals.commission);

  return {
    dateRange: range,
    orders: {
      created: totals.created,
      assigned: totals.assigned,
      completed: totals.completed,
      stillSearching: totals.still_searching,
      neverAssigned: totals.never_assigned,
      cancelledByClient: totals.cancelled_by_client,
      cancelledByDriver: totals.cancelled_by_driver,
      // Доля считается от тех, чья судьба уже решена: заказ, который ищет
      // машину прямо сейчас, ещё никуда не делся.
      fillRatePercent: ratio(totals.assigned, totals.created - totals.still_searching)
    },
    wait: {
      medianSeconds: wait.median_seconds,
      p90Seconds: wait.p90_seconds
    },
    offers: {
      fromRider: {
        made: riderOffers.made,
        accepted: riderOffers.accepted,
        refused: riderOffers.refused,
        refusedPercent: ratio(riderOffers.refused, riderOffers.made),
        averagePriceKzt: riderOffers.average_price
      },
      fromDriver: {
        made: driverOffers.made,
        accepted: driverOffers.accepted,
        refused: driverOffers.refused,
        refusedPercent: ratio(driverOffers.refused, driverOffers.made),
        averagePriceKzt: driverOffers.average_price
      },
      offeredVsFixedPercent: offeredVsFixed.orders > 0 ? offeredVsFixed.percent : null,
      offeredOrders: offeredVsFixed.orders
    },
    cancelReasons: reasons.map(row => ({ code: row.code, side: row.side, count: row.count })),
    money: {
      averagePriceKzt: totals.average_price,
      grossKzt: Number(totals.gross),
      commissionKzt: Number(totals.commission),
      driverEarningsKzt: driverEarnings
    },
    line: {
      hours: lineHours,
      drivers: line.drivers,
      // Ноль часов — это «ещё не измеряли», а не «водители не работали».
      earningsPerHourKzt: lineHours > 0 ? Math.round(driverEarnings / lineHours) : null
    }
  };
}
