import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Money } from '../../core/ui.jsx';
import { getClientActiveOrder, getQueuedPriceOffers, getToken, promoteQueuedPriceOffer, respondPriceOffer, submitClientCounterOffer } from '../../lib/mvpApi.js';
import { sessionGuard } from '../../lib/sessionGuard.js';
import { assignmentErrorMessage } from '../shared/assignmentError.mjs';
import { pendingPriceOffer, priceOfferErrorMessage } from '../shared/priceNegotiation.js';
import PriceOfferForm from '../shared/PriceOfferForm.jsx';

export default function PriceOfferCard({ order, onOrderUpdate }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(false);
  const [queued, setQueued] = useState([]);
  const [queueError, setQueueError] = useState(false);
  const queueRead = useRef(0);
  const flight = useRef(false);
  const mounted = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const offer = pendingPriceOffer(order);
  const token = getToken();
  const refreshQueue = useCallback(async () => {
    const isCurrent = sessionGuard(token, getToken, () => mounted.current);
    const revision = ++queueRead.current;
    if (!isCurrent()) return;
    try {
      const data = await getQueuedPriceOffers(order.id);
      if (!isCurrent() || revision !== queueRead.current) return;
      setQueued(Array.isArray(data.offers) ? data.offers : []);
      setQueueError(false);
    } catch {
      if (isCurrent() && revision === queueRead.current) setQueueError(true);
    }
  }, [order.id, token]);
  useEffect(() => {
    refreshQueue();
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible' && !flight.current) refreshQueue();
    }, 7000);
    return () => { window.clearInterval(timer); queueRead.current++; };
  }, [refreshQueue, order.offerQueueRevision, order.driver_offer_status, order.driver_offer_by_driver_id]);
  async function act(operation) {
    if (flight.current) return;
    const isCurrent = sessionGuard(getToken(), getToken, () => mounted.current);
    if (!isCurrent()) return;
    flight.current = true;
    queueRead.current++;
    setBusy(true);
    setError('');
    try {
      const data = await operation();
      if (!isCurrent()) return;
      if (data?.order?.id === order.id) onOrderUpdate?.(data.order);
      setEditing(false);
    } catch (failure) {
      if (!isCurrent()) return;
      setError(assignmentErrorMessage(failure?.code) || priceOfferErrorMessage(failure)
        || 'Не удалось подтвердить действие. Обновите данные заказа перед повтором.');
      // Recover a committed write if its acknowledgement was lost. Reading
      // must not repeat acceptance or replace a different order/session.
      try {
        const data = await getClientActiveOrder();
        if (isCurrent() && data?.order?.id === order.id) onOrderUpdate?.(data.order);
      } catch { /* The error remains visible; never invent a successful offer. */ }
    } finally {
      flight.current = false;
      if (isCurrent()) { setBusy(false); refreshQueue(); }
    }
  }
  const alternatives = <>
    {queueError && <div className="negotiation-panel" role="alert">
      <p>Не удалось обновить предложения других водителей.</p>
      <button disabled={busy} onClick={refreshQueue}>Обновить предложения</button>
    </div>}
    {queued.length > 0 && <section className="negotiation-panel" aria-label="Другие предложения">
      <strong>Другие предложения</strong>
      <p>Выберите предложение для просмотра. Это ещё не принятие заказа.</p>
      {queued.map(item => <div className="negotiation-queued" key={item.id}>
        <strong>{item.driverName || 'Водитель'}</strong>
        {item.driverCarModel && <p>{item.driverCarModel}</p>}
        <button disabled={busy || queueError} onClick={() => act(() => promoteQueuedPriceOffer(order.id, item.id))}>Рассмотреть за <Money value={item.priceKzt} /></button>
      </div>)}
    </section>}
  </>;
  if (!offer) return <>{error && <p className="state-note danger" role="alert">{error}</p>}{alternatives}</>;
  if (offer.author === 'CLIENT') return <><section className="price-offer-card" aria-label="Ваша встречная цена">
    <strong>Вы предложили <span className="price-offer-amount"><Money value={offer.price} /></span></strong>
    <span role="status">Ждём ответа водителя. Поездка ещё не назначена.</span>
    {error && <p className="state-note danger" role="alert">{error}</p>}
  </section>{alternatives}</>;
  return <><section className="price-offer-card" aria-label="Предложение водителя по цене">
    {order.offer_driver_name && <span>{order.offer_driver_name}</span>}
    <strong>Водитель предлагает <span className="price-offer-amount"><Money value={offer.price} /></span></strong>
    <span>Вместо <Money value={order.price} /> за поездку</span>
    {error && <p className="state-note danger" role="alert">{error}</p>}
    {editing ? <PriceOfferForm price={order.price} busy={busy} onCancel={() => setEditing(false)}
      onSubmit={price => act(() => submitClientCounterOffer(order.id, price))} />
      : <>
        <div className="price-offer-actions">
          <button type="button" className="price-offer-decline" disabled={busy} onClick={() => act(() => respondPriceOffer(order.id, false))}>Отказаться</button>
          <button type="button" className="price-offer-accept" disabled={busy} onClick={() => act(() => respondPriceOffer(order.id, true))}>{busy ? 'Отправляем…' : 'Согласиться'}</button>
        </div>
        <button type="button" className="negotiation-toggle" disabled={busy} onClick={() => setEditing(true)}>Предложить свою цену</button>
      </>}
  </section>{alternatives}</>;
}
