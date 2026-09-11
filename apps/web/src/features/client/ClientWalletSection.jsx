import React, { useEffect, useRef, useState } from "react";
import { Button } from "../../core/ui.jsx";
import { Icon } from "../../core/icons.jsx";
import { api, getToken } from "../../lib/api.js";
import {
  createClientWalletController,
  savedCardLabel,
  topupStatus,
  walletDate,
  walletMoney,
  walletUnavailableText,
} from "./clientWalletState.js";
import "./clientWallet.css";

export const clientWalletApi = {
  load: () =>
    Promise.all([
      api("/api/clients/me/wallet"),
      api("/api/clients/me/wallet/cards"),
      api("/api/clients/me/wallet/topup-requests"),
    ]).then(([summary, cards, topups]) => ({
      summary,
      cards: cards.cards,
      topups: topups.topupRequests,
    })),
  remove: (id) =>
    api(`/api/clients/me/wallet/cards/${encodeURIComponent(id)}`, {
      method: "DELETE",
    }),
};

export function ClientWalletView({ state, onReload, onRemove }) {
  const { loading, error, data, removingId, uncertain, notice } = state;
  return (
    <section className="client-wallet-screen">
      <header className="cw-heading">
        <div>
          <h1>Кошелёк</h1>
          <p>Кешбэк за ваши поездки</p>
        </div>
        <button
          type="button"
          aria-label="Обновить кошелёк"
          className="cw-refresh"
          onClick={onReload}
          disabled={loading || Boolean(removingId)}
        >
          <Icon name="refresh" size={21} />
        </button>
      </header>
      {loading ? (
        <div className="cw-card cw-loading" role="status">
          <span />
          <p>Загружаем кошелёк…</p>
        </div>
      ) : !data ? (
        <section className="cw-card cw-load-error">
          <Icon name="wallet" size={30} />
          <h2>Кошелёк недоступен</h2>
          <p role="alert">{error}</p>
          <Button onClick={onReload}>Повторить</Button>
        </section>
      ) : (
        <>
          <section className="cw-balance">
            <span>
              <Icon name="wallet" size={20} /> Доступный кешбэк
            </span>
            <strong>{walletMoney(data.summary.balanceKzt)}</strong>
            <p>Можно использовать при оплате поездки</p>
          </section>
          <section className="cw-availability">
            <span className="cw-icon">
              <Icon name="shield" size={22} />
            </span>
            <div>
              <h2>Без неожиданных списаний</h2>
              <p>{walletUnavailableText}</p>
            </div>
          </section>
          {notice && (
            <p className="cw-notice" role="status">
              {notice}
            </p>
          )}
          {error && (
            <p className="cw-error" role="alert">
              {error}
            </p>
          )}
          <section className="cw-card">
            <div className="cw-section-title">
              <span className="cw-icon">
                <Icon name="clock" size={21} />
              </span>
              <div>
                <h2>Заявки на пополнение</h2>
                <p>История запросов, а не новые списания</p>
              </div>
            </div>
            {!data.topups.length ? (
              <div className="cw-empty">
                <p>Заявок пока нет</p>
                <small>
                  Когда пополнение будет подключено, здесь появится история
                  операций.
                </small>
              </div>
            ) : (
              <>
                <p className="cw-hint">
                  Ожидающие заявки не пополняют баланс и не будут оплачены
                  автоматически.
                </p>
                <ol className="cw-topups">
                  {data.topups.map((item) => (
                    <li key={item.id}>
                      <div>
                        <b>{walletMoney(item.amountKzt)}</b>
                        <small>{walletDate(item.createdAt)}</small>
                      </div>
                      <span
                        className={`cw-status status-${item.status?.toLowerCase()}`}
                      >
                        {topupStatus(item.status)}
                      </span>
                    </li>
                  ))}
                </ol>
              </>
            )}
          </section>
          <section className="cw-card">
            <div className="cw-section-title">
              <span className="cw-icon">
                <Icon name="card" size={21} />
              </span>
              <div>
                <h2>Сохранённые записи карт</h2>
                <p>Не привязаны к платёжному сервису</p>
              </div>
            </div>
            {!data.cards.length ? (
              <div className="cw-empty">
                <p>Нет сохранённых карт</p>
                <small>
                  Номер карты вводить не нужно. Банковская привязка пока
                  недоступна.
                </small>
              </div>
            ) : (
              <>
                <p className="cw-hint">
                  Эти записи не позволяют оплачивать поездки. Можно удалить
                  ранее сохранённую запись.
                </p>
                <ul className="cw-cards">
                  {data.cards.map((card) => (
                    <li key={card.id}>
                      <div>
                        <b>{savedCardLabel(card.maskedCardNumber)}</b>
                        {card.holderName && <small>{card.holderName}</small>}
                      </div>
                      <button
                        type="button"
                        disabled={Boolean(removingId) || uncertain}
                        onClick={() => onRemove(card)}
                        aria-label={`Удалить запись карты ${savedCardLabel(card.maskedCardNumber)}`}
                      >
                        {removingId === card.id ? "Удаляем…" : "Удалить"}
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>
        </>
      )}
    </section>
  );
}

export default function ClientWalletSection({
  authenticated,
  onLogin,
  walletApi = clientWalletApi,
}) {
  const [state, setState] = useState({
    loading: true,
    error: "",
    data: null,
    removingId: "",
    uncertain: false,
    notice: "",
  });
  const controller = useRef(null);
  useEffect(() => {
    if (!authenticated) return;
    const resource = createClientWalletController({
      api: walletApi,
      readToken: getToken,
      onChange: setState,
    });
    controller.current = resource;
    resource.load();
    return () => {
      resource.dispose();
      if (controller.current === resource) controller.current = null;
    };
  }, [authenticated, walletApi]);
  if (!authenticated)
    return (
      <section className="client-wallet-screen">
        <header className="cw-heading">
          <div>
            <h1>Кошелёк</h1>
            <p>Кешбэк за ваши поездки</p>
          </div>
        </header>
        <section className="cw-card cw-load-error">
          <Icon name="wallet" size={30} />
          <h2>Войдите в аккаунт</h2>
          <p>Баланс и история доступны только владельцу аккаунта.</p>
          <Button onClick={onLogin}>Войти</Button>
        </section>
      </section>
    );
  return (
    <ClientWalletView
      state={state}
      onReload={() => controller.current?.load()}
      onRemove={(card) => {
        if (
          window.confirm(
            `Удалить сохранённую запись карты ${savedCardLabel(card.maskedCardNumber)}? Это не отменяет поездку и не списывает деньги.`,
          )
        )
          controller.current?.remove(card.id);
      }}
    />
  );
}
