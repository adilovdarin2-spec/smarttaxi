import React, { useState } from "react";
import { Badge, PageHeader, SegmentedFilter, StatePanel } from "./adminUi.jsx";

// Every cancellation that reached a driver lands here with the facts the
// server could observe and no verdict of its own. The owner decides; nothing
// on this screen moves money.

const REASON_LABELS = {
  CLIENT_NO_SHOW: "Пассажир не вышел",
  CLIENT_ASKED: "Пассажир попросил отменить",
  WRONG_ADDRESS: "Неверный адрес",
  CAR_PROBLEM: "Поломка машины",
  TOO_FAR: "Слишком далеко",
  CHANGED_MIND: "Передумал",
  DRIVER_ASKED_TO_CANCEL: "Водитель попросил отменить",
  WAITED_TOO_LONG: "Долго ждал",
  FOUND_ANOTHER_CAR: "Нашёл другую машину",
  OTHER: "Другое"
};

const BY_LABELS = { DRIVER: "Водитель", CLIENT: "Пассажир", OPERATOR: "Оператор", SYSTEM: "Система" };

const STATUS_LABELS = {
  PENDING: "На разборе",
  CLEARED: "Без нарушений",
  CONFIRMED_FRAUD: "Подтверждено",
  DISMISSED: "Отклонено"
};

function riskTone(score) {
  if (score >= 60) return "danger";
  if (score >= 40) return "warning";
  return "muted";
}

function minutes(seconds) {
  if (seconds == null) return "—";
  if (seconds < 60) return `${seconds} сек`;
  return `${Math.round(seconds / 60)} мин`;
}

function AuditCard({ audit, onDecide, onOpenDriver, busy }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const decided = audit.reviewStatus !== "PENDING";

  return (
    <article className={`cancellation-card${open ? " open" : ""}`}>
      <button type="button" className="cancellation-card-head" onClick={() => setOpen((value) => !value)}>
        <span className="cancellation-risk">
          <Badge tone={riskTone(audit.riskScore)}>{audit.riskScore}</Badge>
        </span>
        <span className="cancellation-summary">
          <strong>{audit.driverName || "Без водителя"}</strong>
          <span>
            {BY_LABELS[audit.cancelledBy] || audit.cancelledBy}
            {" · "}
            {audit.reasonCode ? REASON_LABELS[audit.reasonCode] || audit.reasonCode : "причина не указана"}
          </span>
        </span>
        <span className="cancellation-meta">
          <span>{audit.orderShortId ? `Заказ ${audit.orderShortId}` : ""}</span>
          <span>{audit.regionName || ""}</span>
          <Badge tone={decided ? (audit.reviewStatus === "CONFIRMED_FRAUD" ? "danger" : "muted") : "warning"}>
            {STATUS_LABELS[audit.reviewStatus] || audit.reviewStatus}
          </Badge>
        </span>
      </button>

      {open && (
        <div className="cancellation-card-body">
          <ul className="cancellation-signals">
            {audit.signals.length === 0 && <li className="muted">Особенностей не обнаружено.</li>}
            {audit.signals.map((signal) => (
              <li key={signal.code} className={Number(signal.weight) < 0 ? "positive" : ""}>
                <span>{signal.label}</span>
                <em>{Number(signal.weight) > 0 ? `+${signal.weight}` : signal.weight}</em>
              </li>
            ))}
          </ul>

          <dl className="cancellation-facts">
            <div><dt>Пассажир</dt><dd>{audit.clientName || "—"}{audit.clientPhone ? ` · ${audit.clientPhone}` : ""}</dd></div>
            <div><dt>Телефон водителя</dt><dd>{audit.driverPhone || "—"}</dd></div>
            <div><dt>Статус до отмены</dt><dd>{audit.fromStatus}</dd></div>
            <div><dt>После принятия</dt><dd>{minutes(audit.secondsSinceAccept)}</dd></div>
            <div><dt>После подачи</dt><dd>{minutes(audit.secondsSinceArrival)}</dd></div>
            <div><dt>Машина от точки подачи</dt><dd>{audit.driverDistanceToPickupM == null ? "—" : `${audit.driverDistanceToPickupM} м`}</dd></div>
            <div><dt>Стоимость / комиссия</dt><dd>{audit.orderPrice == null ? "—" : `${audit.orderPrice} ₸ / ${audit.serviceCommission ?? 0} ₸`}</dd></div>
            <div>
              <dt>Куда уехала машина</dt>
              <dd>
                {audit.followUpStatus === "OBSERVED"
                  ? `${audit.followUpDistanceFromPickupM ?? "—"} м от подачи, ${audit.followUpDistanceToDropoffM ?? "—"} м до адреса заказа`
                  : audit.followUpStatus === "SKIPPED" ? "не отслеживалось" : "проверяется"}
              </dd>
            </div>
          </dl>

          {audit.reasonNote && <p className="cancellation-note">«{audit.reasonNote}»</p>}
          {audit.reviewNote && <p className="cancellation-note muted">Решение: {audit.reviewNote}</p>}

          {!decided && (
            <div className="cancellation-decision">
              <label className="admin-field wide">
                <span>Комментарий к решению</span>
                <input
                  value={note}
                  maxLength={500}
                  placeholder="Что выяснили"
                  onChange={(event) => setNote(event.target.value)}
                />
              </label>
              <div className="cancellation-decision-actions">
                <button
                  type="button"
                  className="admin-secondary-button compact"
                  disabled={busy}
                  onClick={() => onDecide(audit.id, { reviewStatus: "CLEARED", reviewNote: note })}
                >
                  Всё в порядке
                </button>
                <button
                  type="button"
                  className="admin-secondary-button compact"
                  disabled={busy}
                  onClick={() => onDecide(audit.id, { reviewStatus: "DISMISSED", reviewNote: note })}
                >
                  Не рассматривать
                </button>
                <button
                  type="button"
                  className="admin-primary-button compact"
                  disabled={busy}
                  onClick={() => onDecide(audit.id, { reviewStatus: "CONFIRMED_FRAUD", reviewNote: note })}
                >
                  Нарушение подтверждено
                </button>
              </div>
              <p className="cancellation-hint">
                Подтверждение не списывает деньги. Штраф или блокировку водителя проводите на страницах «Финансы» и «Водители».
                {audit.driverId && onOpenDriver && (
                  <>
                    {" "}
                    <button
                      type="button"
                      className="cancellation-open-driver"
                      onClick={() => onOpenDriver(audit)}
                    >
                      Открыть водителя
                    </button>
                  </>
                )}
              </p>
            </div>
          )}
        </div>
      )}
    </article>
  );
}

export default function CancellationReviewsPage({
  audits,
  summary,
  cancellationStatus,
  setCancellationStatus,
  onDecideCancellation,
  onOpenDriver,
  busy
}) {
  return (
    <div className="admin-page-stack">
      <PageHeader
        title="Разбор отмен"
        subtitle="Отмены после подачи машины — с фактами, которые видел сервер"
      >
        <SegmentedFilter
          value={cancellationStatus}
          onChange={setCancellationStatus}
          items={[
            ["PENDING", "На разборе"],
            ["CONFIRMED_FRAUD", "Подтверждены"],
            ["CLEARED", "Без нарушений"],
            ["all", "Все"]
          ]}
        />
      </PageHeader>

      {summary && (
        <div className="cancellation-summary-row">
          <div><strong>{summary.pending}</strong><span>ждут разбора</span></div>
          <div className={summary.highRisk ? "danger" : ""}><strong>{summary.highRisk}</strong><span>высокий риск</span></div>
          <div><strong>{summary.confirmed}</strong><span>подтверждено нарушений</span></div>
          <div><strong>{summary.lastWeek}</strong><span>отмен за неделю</span></div>
        </div>
      )}

      {!audits.length ? (
        <StatePanel
          title="Отмен для разбора нет"
          text="Сюда попадают отмены после того, как водитель уже принял заказ."
        />
      ) : (
        <div className="cancellation-list">
          {audits.map((audit) => (
            <AuditCard key={audit.id} audit={audit} onDecide={onDecideCancellation} onOpenDriver={onOpenDriver} busy={busy} />
          ))}
        </div>
      )}
    </div>
  );
}
