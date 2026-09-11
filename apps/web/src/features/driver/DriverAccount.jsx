import React, { useCallback, useEffect, useRef, useState } from "react";
import { Button, Money, PhoneFrame } from "../../core/ui.jsx";
import { Icon } from "../../core/icons.jsx";
import { getToken } from "../../lib/api.js";
import { sessionGuard } from "../../lib/sessionGuard.js";
import { driverAccountApi } from "./driverAccountApi.js";
import { createDriverAccountAction } from "./driverAccountAction.js";
import {
  DRIVER_ACCOUNT_SECTIONS,
  DRIVER_DOCUMENT_TYPES,
  accountStatus,
  accountDate,
  documentFileError,
  latestDriverDocuments,
  walletAmountError,
  walletEntryLabel,
  walletEntryAmount,
  recurringDays,
  accountError,
} from "./driverAccountModel.js";
import "./driverAccount.css";
import AppModeButton from "../../components/ui/AppModeButton.jsx";

// Each request belongs to one mounted section AND one authenticated session.
// Closing a page or logging in elsewhere invalidates all late UI callbacks.
function useAccountResource(section, accountApi) {
  const [state, setState] = useState({ loading: true, data: null, error: "" });
  const generation = useRef(0);
  const reload = useCallback(async () => {
    const request = ++generation.current;
    const isCurrent = sessionGuard(
      getToken(),
      getToken,
      () => generation.current === request,
    );
    setState({ loading: true, data: null, error: "" });
    try {
      const data = await accountApi[section]();
      if (isCurrent()) setState({ loading: false, data, error: "" });
    } catch (error) {
      if (isCurrent())
        setState({ loading: false, data: null, error: accountError(error) });
    }
  }, [section, accountApi]);
  useEffect(() => {
    reload();
    return () => {
      generation.current++;
    };
  }, [reload]);
  return { ...state, reload };
}

function useAccountAction() {
  const [state, setState] = useState({ busy: false, error: "", message: "" });
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const run = useRef(null);
  if (!run.current)
    run.current = createDriverAccountAction({
      readToken: getToken,
      isAlive: () => alive.current,
      onChange: setState,
    });
  return { ...state, run: run.current };
}

export function AccountEmpty({ icon = "document", title, children }) {
  return (
    <section className="da-empty">
      <span className="da-icon">
        <Icon name={icon} size={28} />
      </span>
      <h2>{title}</h2>
      <p>{children}</p>
    </section>
  );
}
function ActionFeedback({ action }) {
  return (
    <>
      {action.error && (
        <p className="da-error" role="alert">
          {action.error}
        </p>
      )}
      {action.message && (
        <p className="da-success" role="status">
          {action.message}
        </p>
      )}
    </>
  );
}
function Status({ value }) {
  return (
    <span
      className={`da-status ${["REJECTED", "CANCELLED"].includes(value) ? "muted" : ""}`}
    >
      {accountStatus(value)}
    </span>
  );
}
function Detail({ label, children }) {
  return (
    <div className="da-detail">
      <dt>{label}</dt>
      <dd>{children || "Не указано"}</dd>
    </div>
  );
}
function AddressPair({ pickup, dropoff }) {
  return (
    <div className="da-addresses">
      <div>
        <i />
        <span>
          <small>Откуда</small>
          {pickup || "Адрес подачи не указан"}
        </span>
      </div>
      <div>
        <i />
        <span>
          <small>Куда</small>
          {dropoff || "Адрес назначения не указан"}
        </span>
      </div>
    </div>
  );
}

export function DriverAccountHome({
  driver,
  onSelect,
  onLogout,
  activeOrder,
  onTrip,
}) {
  return (
    <>
      <section className="da-identity">
        <span className="da-avatar">
          <Icon name="user" size={30} />
        </span>
        <div>
          <p>SmartTaxi · водитель</p>
          <h1>{driver?.name || "Личный кабинет"}</h1>
          <span>{driver?.phone || "Телефон не указан"}</span>
        </div>
      </section>
      {activeOrder && (
        <button className="da-active" onClick={onTrip}>
          <Icon name="route" />
          <span>
            Вернуться к текущей поездке
            <small>Заказ продолжает выполняться</small>
          </span>
          <Icon name="chevron" />
        </button>
      )}
      <nav className="da-menu" aria-label="Разделы кабинета">
        {DRIVER_ACCOUNT_SECTIONS.map(([key, label, icon, text]) => (
          <button key={key} onClick={() => onSelect(key)}>
            <span className="da-icon">
              <Icon name={icon} />
            </span>
            <span>
              <b>{label}</b>
              <small>{text}</small>
            </span>
            <Icon name="chevron" size={18} />
          </button>
        ))}
      </nav>
      <AppModeButton mode="passenger" />
      <Button variant="secondary" onClick={onLogout}>
        Выйти из аккаунта
      </Button>
    </>
  );
}

export function DriverAccountProfile({ data, onSelect }) {
  const driver = data.driver;
  if (!driver)
    return (
      <AccountEmpty title="Профиль не найден">
        Обратитесь в поддержку.
      </AccountEmpty>
    );
  return (
    <>
      <section className="da-card">
        <span className="da-section-label">Личные данные</span>
        <dl>
          <Detail label="Имя">{driver.name}</Detail>
          <Detail label="Телефон">{driver.phone}</Detail>
          <Detail label="Статус">
            {driver.isBlocked
              ? "Профиль заблокирован"
              : driver.publicStatus === "BUSY"
                ? "В поездке"
                : driver.publicStatus === "ONLINE"
                  ? "На линии"
                  : "Не на линии"}
          </Detail>
        </dl>
      </section>
      <section className="da-card">
        <span className="da-section-label">Автомобиль</span>
        <dl>
          <Detail label="Модель">{driver.vehicleModel}</Detail>
          <Detail label="Цвет">{driver.vehicleColor}</Detail>
          <Detail label="Госномер">
            <span className="da-plate">
              {driver.plateNumber || "Не указан"}
            </span>
          </Detail>
          <Detail label="Тариф">
            {{ Economy: "Эконом", Delivery: "Доставка" }[driver.tariff] ||
              driver.tariff}
          </Detail>
        </dl>
      </section>
      <p className="da-hint">
        Изменение автомобиля и данных профиля проверяет оператор. Напишите, что
        нужно обновить, и приложите документы в разделе «Документы».
      </p>
      <Button variant="secondary" onClick={() => onSelect("support")}>
        Изменить данные через поддержку
      </Button>
    </>
  );
}

export function DriverAccountHistory({ data }) {
  const orders = Array.isArray(data) ? data : data.orders || [];
  if (!orders.length)
    return (
      <AccountEmpty icon="history" title="Поездок пока нет">
        После первого заказа здесь появятся маршрут, стоимость и статус оплаты.
      </AccountEmpty>
    );
  return (
    <>
      <p className="da-hint">
        Последние {orders.length} поездок. Стоимость и статусы получены от
        сервиса.
      </p>
      {orders.map((order) => (
        <article className="da-card" key={order.id}>
          <div className="da-card-head">
            <span>№ {order.short_id || order.shortId || "—"}</span>
            <Status
              value={order.public_status || order.publicStatus || order.status}
            />
          </div>
          <p className="da-hint">
            {accountDate(order.created_at || order.createdAt)}
          </p>
          <AddressPair
            pickup={order.pickup_text || order.pickupText}
            dropoff={order.dropoff_text || order.dropoffText}
          />
          <div className="da-card-foot">
            <strong>
              <Money value={order.price ?? order.estimated_price} />
            </strong>
            <span>
              {{
                CASH: "Наличные",
                KASPI: "Kaspi перевод",
                CARD: "Карта",
                CASHBACK: "Бонусы",
                MIXED: "Бонусы + карта",
              }[order.payment_method || order.paymentMethod] ||
                "Способ оплаты уточняется"}
            </span>
          </div>
        </article>
      ))}
    </>
  );
}

export function DriverAccountRating({ data }) {
  if (!data.reviewCount)
    return (
      <AccountEmpty icon="star" title="Первые оценки ещё впереди">
        Пассажиры смогут оценить вас после завершённых поездок.
      </AccountEmpty>
    );
  return (
    <>
      <section className="da-rating-hero">
        <span className="da-section-label">Оценка пассажиров</span>
        <strong>
          {Number(data.rating).toLocaleString("ru-RU", {
            maximumFractionDigits: 2,
          })}
          <Icon name="star" size={28} />
        </strong>
        <p>{data.reviewCount} оценок</p>
        <div className="da-rating-bars">
          {[5, 4, 3, 2, 1].map((star) => (
            <div key={star}>
              <span>
                {star}
                <Icon name="star" size={12} />
              </span>
              <progress
                aria-label={`${star} звёзд`}
                max={data.reviewCount}
                value={data.breakdown?.[star] || 0}
              />
              <span>{data.breakdown?.[star] || 0}</span>
            </div>
          ))}
        </div>
      </section>
      <h2>Последние отзывы</h2>
      {(data.recent || []).map((review, index) => (
        <article className="da-card" key={`${review.createdAt}-${index}`}>
          <div className="da-card-head">
            <b>{review.rating} / 5</b>
            <small>{accountDate(review.createdAt)}</small>
          </div>
          <p>{review.comment || "Оценка без комментария"}</p>
        </article>
      ))}
    </>
  );
}

export function DriverAccountDocuments({ data, api, reload }) {
  const [type, setType] = useState("DRIVER_LICENSE_FRONT");
  const [file, setFile] = useState(null);
  const [validation, setValidation] = useState("");
  const input = useRef(null);
  const action = useAccountAction();
  const latest = latestDriverDocuments(data.documents);
  const submit = (event) => {
    event.preventDefault();
    const error = documentFileError(file);
    setValidation(error);
    if (!error)
      action.run(
        () => api.uploadDocument(type, file),
        () => {
          setFile(null);
          if (input.current) input.current.value = "";
          reload();
        },
        "Документ отправлен на проверку.",
      );
  };
  return (
    <>
      <form className="da-card da-form" onSubmit={submit}>
        <h2>Добавить документ</h2>
        <p className="da-hint">
          JPG, PNG или PDF до 8 МБ. Данные доступны вам и уполномоченному
          оператору.
        </p>
        <label>
          Тип документа
          <select
            value={type}
            onChange={(event) => setType(event.target.value)}
            disabled={action.busy}
          >
            {Object.entries(DRIVER_DOCUMENT_TYPES).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="da-file">
          Файл документа
          <input
            ref={input}
            type="file"
            accept="image/jpeg,image/png,application/pdf"
            disabled={action.busy}
            onChange={(event) => {
              setFile(event.target.files?.[0] || null);
              setValidation("");
            }}
          />
        </label>
        {validation && (
          <p className="da-error" role="alert">
            {validation}
          </p>
        )}
        <ActionFeedback action={action} />
        <Button type="submit" disabled={action.busy || !file}>
          {action.busy ? "Отправляем…" : "Отправить на проверку"}
        </Button>
      </form>
      <h2>Статусы документов</h2>
      <p className="da-hint">
        Показана последняя загрузка каждого типа. Отправка файла не означает
        одобрение.
      </p>
      {Object.entries(DRIVER_DOCUMENT_TYPES).map(([key, label]) => {
        const doc = latest.get(key);
        return (
          <article className="da-card" key={key}>
            <div className="da-card-head">
              <b>{label}</b>
              {doc ? (
                <Status value={doc.status} />
              ) : (
                <span className="da-status muted">Не загружен</span>
              )}
            </div>
            {doc && (
              <>
                <small>{accountDate(doc.createdAt)}</small>
                {doc.rejectionReason && (
                  <p className="da-error">{doc.rejectionReason}</p>
                )}
              </>
            )}
          </article>
        );
      })}
    </>
  );
}

export function DriverAccountNotifications({ data, api, reload }) {
  const action = useAccountAction();
  const items = data.notifications || [];
  return (
    <>
      <ActionFeedback action={action} />
      {data.unreadCount > 0 && (
        <Button
          variant="secondary"
          disabled={action.busy}
          onClick={() =>
            action.run(
              api.markAllRead,
              reload,
              "Уведомления отмечены прочитанными.",
            )
          }
        >
          Прочитать все · {data.unreadCount}
        </Button>
      )}
      {!items.length ? (
        <AccountEmpty icon="bell" title="Всё спокойно">
          Здесь будут статусы заказов и сообщения сервиса.
        </AccountEmpty>
      ) : (
        items.map((item) => (
          <article
            className={`da-card ${item.read_at ? "" : "da-unread"}`}
            key={item.id}
          >
            <div className="da-card-head">
              <h2>{item.title}</h2>
              {!item.read_at && <span className="da-status">Новое</span>}
            </div>
            <p>{item.body}</p>
            <small>{accountDate(item.created_at)}</small>
            {!item.read_at && (
              <Button
                variant="secondary"
                disabled={action.busy}
                onClick={() =>
                  action.run(() => api.markRead(item.id), reload, "Прочитано")
                }
              >
                Отметить прочитанным
              </Button>
            )}
          </article>
        ))
      )}
    </>
  );
}

export function DriverAccountSupport({ data, api, reload, activeOrderId }) {
  const [topic, setTopic] = useState("Вопрос по поездке");
  const [message, setMessage] = useState("");
  const [attachOrder, setAttachOrder] = useState(Boolean(activeOrderId));
  const action = useAccountAction();
  const submit = (event) => {
    event.preventDefault();
    if (message.trim().length < 8) return;
    action.run(
      () =>
        api.sendSupport({
          topic,
          message: message.trim(),
          ...(attachOrder && activeOrderId ? { orderId: activeOrderId } : {}),
        }),
      () => {
        setMessage("");
        reload();
      },
      "Обращение отправлено. Ответ появится здесь.",
    );
  };
  return (
    <>
      <form className="da-card da-form" onSubmit={submit}>
        <span className="da-icon">
          <Icon name="support" size={28} />
        </span>
        <h2>Мы на связи</h2>
        <p className="da-hint">
          Опишите вопрос — оператор увидит обращение в кабинете поддержки.
        </p>
        <label>
          Тема
          <select
            value={topic}
            disabled={action.busy}
            onChange={(event) => setTopic(event.target.value)}
          >
            {[
              "Вопрос по поездке",
              "Баланс и выплаты",
              "Данные профиля",
              "Документы",
              "Работа приложения",
              "Другое",
            ].map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
        <label>
          Сообщение
          <textarea
            value={message}
            minLength={8}
            maxLength={2000}
            rows={5}
            required
            disabled={action.busy}
            onChange={(event) => setMessage(event.target.value)}
            placeholder="Что произошло и как мы можем помочь?"
          />
        </label>
        <small>{message.length} / 2000 · не менее 8 символов</small>
        {activeOrderId && (
          <label className="da-check">
            <input
              type="checkbox"
              checked={attachOrder}
              disabled={action.busy}
              onChange={(event) => setAttachOrder(event.target.checked)}
            />
            Связать с текущей поездкой
          </label>
        )}
        <ActionFeedback action={action} />
        <Button
          type="submit"
          disabled={action.busy || message.trim().length < 8}
        >
          {action.busy ? "Отправляем…" : "Отправить обращение"}
        </Button>
      </form>
      <h2>Мои обращения</h2>
      {!(data.messages || []).length ? (
        <p className="da-hint">
          Отправленные обращения и ответы оператора появятся здесь.
        </p>
      ) : (
        data.messages.map((item) => (
          <article className="da-card" key={item.id}>
            <div className="da-card-head">
              <b>{item.topic}</b>
              <Status value={item.status} />
            </div>
            <p className="da-message">{item.message}</p>
            <small>{accountDate(item.createdAt)}</small>
            {item.adminResponse && (
              <div className="da-reply">
                <b>Ответ поддержки</b>
                <p className="da-message">{item.adminResponse}</p>
                <small>{accountDate(item.respondedAt)}</small>
              </div>
            )}
          </article>
        ))
      )}
    </>
  );
}

export function DriverAccountRecurring({ data, api, reload }) {
  const action = useAccountAction();
  const change = (booking, status) => {
    if (
      status === "CANCELLED" &&
      !window.confirm(
        "Отменить регулярный маршрут? Новые поездки по расписанию создаваться не будут.",
      )
    )
      return;
    action.run(
      () => api.updateRecurring(booking.id, status),
      reload,
      "Расписание обновлено.",
    );
  };
  return (
    <>
      <ActionFeedback action={action} />
      {!(data.bookings || []).length ? (
        <AccountEmpty icon="clock" title="Расписание свободно">
          Когда постоянный клиент предложит регулярный маршрут, вы сможете
          принять его здесь.
        </AccountEmpty>
      ) : (
        data.bookings.map((booking) => (
          <article className="da-card" key={booking.id}>
            <div className="da-card-head">
              <h2>{booking.timeOfDay || "Время не указано"}</h2>
              <Status value={booking.status} />
            </div>
            <p>{recurringDays(booking.daysOfWeek)}</p>
            <AddressPair
              pickup={booking.pickupText}
              dropoff={booking.dropoffText}
            />
            <div className="da-card-foot">
              <strong>
                <Money value={booking.priceKzt} />
              </strong>
              <span>{booking.clientName || "Пассажир"}</span>
            </div>
            {booking.notes && <p>{booking.notes}</p>}
            {booking.skippedToday && (
              <p className="da-error">
                Сегодня поездка по расписанию не создана.{" "}
                {booking.lastSkipReason === "DRIVER_OFFLINE"
                  ? "Водитель был не на линии."
                  : "Проверьте доступность и расписание."}
              </p>
            )}
            {booking.status === "PENDING_DRIVER" ? (
              <div className="da-actions">
                <Button
                  variant="secondary"
                  disabled={action.busy}
                  onClick={() => {
                    if (
                      window.confirm("Отклонить запрос на регулярный маршрут?")
                    )
                      action.run(
                        () => api.respondRecurring(booking.id, false),
                        reload,
                      );
                  }}
                >
                  Отклонить
                </Button>
                <Button
                  disabled={action.busy}
                  onClick={() =>
                    action.run(
                      () => api.respondRecurring(booking.id, true),
                      reload,
                      "Маршрут принят.",
                    )
                  }
                >
                  Принять маршрут
                </Button>
              </div>
            ) : (
              ["ACTIVE", "PAUSED"].includes(booking.status) && (
                <div className="da-actions">
                  <Button
                    variant="secondary"
                    disabled={action.busy}
                    onClick={() =>
                      change(
                        booking,
                        booking.status === "ACTIVE" ? "PAUSED" : "ACTIVE",
                      )
                    }
                  >
                    {booking.status === "ACTIVE"
                      ? "Приостановить"
                      : "Возобновить"}
                  </Button>
                  <Button
                    variant="secondary"
                    disabled={action.busy}
                    onClick={() => change(booking, "CANCELLED")}
                  >
                    Отменить
                  </Button>
                </div>
              )
            )}
          </article>
        ))
      )}
    </>
  );
}

export function DriverAccountWallet({ data, api, reload }) {
  const [form, setForm] = useState(null);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("KASPI_TRANSFER");
  const [phone, setPhone] = useState("");
  const [validation, setValidation] = useState("");
  const [transactions, setTransactions] = useState(data.transactions);
  const [loadingMore, setLoadingMore] = useState(false);
  const action = useAccountAction();
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const { summary } = data;
  const available = Math.max(
    0,
    Number(summary.balanceKzt) - Number(summary.debtKzt),
  );
  const openForm = (next) => {
    setForm(next);
    setAmount("");
    setValidation("");
  };
  const submit = (event) => {
    event.preventDefault();
    const error = walletAmountError(amount, {
      minimum: form === "payout" ? summary.minPayoutKzt : 500,
      ...(form === "payout" ? { available } : {}),
    });
    const digits = phone.replace(/\D/g, "");
    if (error) {
      setValidation(error);
      return;
    }
    if (
      form === "payout" &&
      method === "KASPI_TRANSFER" &&
      !/^7\d{10}$/.test(digits)
    ) {
      setValidation("Введите номер Kaspi: +7 и ещё 10 цифр.");
      return;
    }
    setValidation("");
    const operation =
      form === "payout"
        ? () =>
            api.requestPayout({
              amountKzt: Number(amount),
              method,
              details:
                method === "KASPI_TRANSFER" ? { phone: `+${digits}` } : {},
            })
        : () => api.requestTopup(Number(amount));
    action.run(
      operation,
      () => {
        setForm(null);
        reload();
      },
      "Заявка создана. Это не подтверждение перевода денег.",
    );
  };
  const loadMore = async () => {
    if (loadingMore) return;
    const isCurrent = sessionGuard(getToken(), getToken, () => alive.current);
    setLoadingMore(true);
    setValidation("");
    try {
      const next = await api.transactions(transactions.items.length);
      if (isCurrent())
        setTransactions((prev) => ({
          ...next,
          items: [
            ...new Map(
              [...prev.items, ...next.items].map((item) => [item.id, item]),
            ).values(),
          ],
        }));
    } catch (error) {
      if (isCurrent()) setValidation(accountError(error));
    } finally {
      if (isCurrent()) setLoadingMore(false);
    }
  };
  return (
    <>
      <section className="da-wallet-hero">
        <span>Баланс кошелька</span>
        <strong>
          <Money value={summary.balanceKzt} />
        </strong>
        <div>
          <span>
            Долг по комиссии
            <b>
              <Money value={summary.debtKzt} />
            </b>
          </span>
          <span>
            В заявках на выплату
            <b>
              <Money value={summary.pendingPayoutKzt} />
            </b>
          </span>
        </div>
      </section>
      <p className="da-hint">
        Наличные за поездку остаются у вас; комиссия учитывается в долге. Заявки
        на пополнение и выплату обрабатывает оператор — это не онлайн-оплата.
      </p>
      <ActionFeedback action={action} />
      {!form ? (
        <div className="da-actions">
          <Button
            variant="secondary"
            onClick={() => openForm("topup")}
            disabled={action.busy}
          >
            Пополнить
          </Button>
          <Button
            onClick={() => openForm("payout")}
            disabled={action.busy || available < summary.minPayoutKzt}
          >
            Вывести
          </Button>
        </div>
      ) : (
        <form className="da-card da-form" onSubmit={submit}>
          <h2>
            {form === "payout" ? "Заявка на выплату" : "Заявка на пополнение"}
          </h2>
          <label>
            Сумма, ₸
            <input
              inputMode="numeric"
              required
              value={amount}
              disabled={action.busy}
              onChange={(event) => setAmount(event.target.value)}
            />
          </label>
          {form === "payout" && (
            <>
              <label>
                Способ получения
                <select
                  value={method}
                  disabled={action.busy}
                  onChange={(event) => setMethod(event.target.value)}
                >
                  <option value="KASPI_TRANSFER">Перевод на Kaspi</option>
                  <option value="CASH">Наличными через оператора</option>
                </select>
              </label>
              {method === "KASPI_TRANSFER" && (
                <label>
                  Телефон Kaspi
                  <input
                    type="tel"
                    autoComplete="tel"
                    value={phone}
                    disabled={action.busy}
                    onChange={(event) => setPhone(event.target.value)}
                    placeholder="+7 7XX XXX XX XX"
                    required
                  />
                </label>
              )}
            </>
          )}
          <p className="da-hint">
            {form === "payout"
              ? "Сумма будет зарезервирована до обработки заявки. Перевод подтверждает оператор."
              : "Заявка сама по себе не пополняет баланс. Дождитесь инструкций оператора."}
          </p>
          <div className="da-actions">
            <Button
              variant="secondary"
              disabled={action.busy}
              onClick={() => setForm(null)}
            >
              Назад
            </Button>
            <Button type="submit" disabled={action.busy}>
              {action.busy ? "Отправляем…" : "Создать заявку"}
            </Button>
          </div>
        </form>
      )}
      {validation && (
        <p className="da-error" role="alert">
          {validation}
        </p>
      )}
      <p className="da-hint">
        Минимальная выплата — <Money value={summary.minPayoutKzt} />. Доступно с
        учётом долга: <Money value={available} />.
      </p>
      {((data.payouts.payoutRequests || []).length > 0 ||
        (data.topups.topupRequests || []).length > 0) && (
        <>
          <h2>Заявки</h2>
          {(data.payouts.payoutRequests || []).map((item) => (
            <article className="da-card" key={item.id}>
              <div className="da-card-head">
                <b>
                  Выплата · <Money value={item.amountKzt} />
                </b>
                <Status value={item.status} />
              </div>
              <small>{accountDate(item.createdAt)}</small>
              {item.rejectionReason && <p>{item.rejectionReason}</p>}
              {item.status === "PENDING" && (
                <Button
                  variant="secondary"
                  disabled={action.busy}
                  onClick={() => {
                    if (
                      window.confirm(
                        "Отменить заявку? Зарезервированная сумма вернётся в кошелёк.",
                      )
                    )
                      action.run(
                        () => api.cancelPayout(item.id),
                        reload,
                        "Заявка отменена.",
                      );
                  }}
                >
                  Отменить заявку
                </Button>
              )}
            </article>
          ))}
          {(data.topups.topupRequests || []).map((item) => (
            <article className="da-card" key={item.id}>
              <div className="da-card-head">
                <b>
                  Пополнение · <Money value={item.amountKzt} />
                </b>
                <Status value={item.status} />
              </div>
              <small>{accountDate(item.createdAt)}</small>
            </article>
          ))}
        </>
      )}
      <h2>Операции</h2>
      {!transactions.items.length ? (
        <p className="da-hint">Проведённых операций пока нет.</p>
      ) : (
        transactions.items.map((item) => (
          <article className="da-transaction" key={item.id}>
            <span className="da-icon">
              <Icon name={item.kind === "EARNING" ? "cash" : "document"} />
            </span>
            <div>
              <b>{walletEntryLabel(item.kind)}</b>
              <small>
                {accountDate(item.createdAt)}
                {item.orderShortId ? ` · № ${item.orderShortId}` : ""}
              </small>
            </div>
            <strong>{walletEntryAmount(item)}</strong>
          </article>
        ))
      )}
      {transactions.items.length < transactions.total && (
        <Button variant="secondary" disabled={loadingMore} onClick={loadMore}>
          {loadingMore ? "Загружаем…" : "Показать ещё операции"}
        </Button>
      )}
    </>
  );
}

function AccountContent({ section, api, onSelect, activeOrderId }) {
  const resource = useAccountResource(section, api);
  if (resource.loading)
    return (
      <section className="da-loading" role="status">
        <span className="da-skeleton" />
        <span className="da-skeleton" />
        <p>Загружаем данные…</p>
      </section>
    );
  if (resource.error)
    return (
      <section className="da-empty">
        <span className="da-icon">
          <Icon name="support" />
        </span>
        <h2>Не удалось загрузить раздел</h2>
        <p role="alert">{resource.error}</p>
        <Button onClick={resource.reload}>Повторить</Button>
      </section>
    );
  const Component = {
    profile: DriverAccountProfile,
    history: DriverAccountHistory,
    rating: DriverAccountRating,
    documents: DriverAccountDocuments,
    notifications: DriverAccountNotifications,
    support: DriverAccountSupport,
    recurring: DriverAccountRecurring,
    wallet: DriverAccountWallet,
  }[section];
  return (
    <>
      <button className="da-refresh" onClick={resource.reload}>
        Обновить данные
      </button>
      <Component
        data={resource.data}
        api={api}
        reload={resource.reload}
        onSelect={onSelect}
        activeOrderId={activeOrderId}
      />
    </>
  );
}

export default function DriverAccount({
  driver,
  activeOrder,
  incomingCount = 0,
  initialSection = "home",
  onClose,
  onLogout,
  onTrip,
  onOrders,
  api = driverAccountApi,
}) {
  const [section, setSection] = useState(initialSection);
  const title =
    DRIVER_ACCOUNT_SECTIONS.find(([key]) => key === section)?.[1] ||
    "Кабинет водителя";
  const heading = useRef(null);
  useEffect(() => {
    heading.current?.focus();
  }, [section]);
  return (
    <PhoneFrame className="driver-account-phone">
      <header className="da-header">
        <button
          type="button"
          aria-label={
            section === "home" ? "Вернуться на линию" : "Назад в кабинет"
          }
          onClick={() => (section === "home" ? onClose() : setSection("home"))}
        >
          <Icon name="back" />
        </button>
        <h1 ref={heading} tabIndex={-1}>
          {title}
        </h1>
        {section !== "home" ? (
          <button type="button" aria-label="Закрыть кабинет" onClick={onClose}>
            <Icon name="close" />
          </button>
        ) : (
          <span />
        )}
      </header>
      {(activeOrder || incomingCount > 0) && (
        <button
          className="da-active da-live-order"
          onClick={activeOrder ? onTrip : onOrders}
        >
          <Icon name="route" />
          <span>
            {activeOrder
              ? "Вернуться к текущей поездке"
              : `Новые заказы · ${incomingCount}`}
          </span>
          <Icon name="chevron" />
        </button>
      )}
      <div className="da-content" key={section}>
        {section === "home" ? (
          <DriverAccountHome
            driver={driver}
            onSelect={setSection}
            onLogout={() => {
              if (
                window.confirm(
                  "Выйти из аккаунта? Для работы потребуется снова войти.",
                )
              )
                onLogout();
            }}
          />
        ) : (
          <AccountContent
            section={section}
            api={api}
            onSelect={setSection}
            activeOrderId={activeOrder?.id}
          />
        )}
      </div>
    </PhoneFrame>
  );
}
