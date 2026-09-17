import React, { useState } from 'react';
import { Money } from '../../core/ui.jsx';
import PriceOfferForm from '../shared/PriceOfferForm.jsx';
import { pendingPriceOffer } from '../shared/priceNegotiation.js';

export default function DriverPriceOffer({ order, driverId, loading, onOffer, onCounter }) {
  const [editing, setEditing] = useState(false);
  const [queued, setQueued] = useState(false);
  const offer = pendingPriceOffer(order, driverId);
  const mine = offer?.mine;
  if (mine && offer.author === 'CLIENT') return <section className="negotiation-panel" aria-label="Встречная цена пассажира">
    <strong>Пассажир предлагает <Money value={offer.price} /></strong>
    <p>При согласии поездка будет назначена вам по этой цене.</p>
    <div className="negotiation-actions">
      <button disabled={Boolean(loading)} onClick={() => onCounter(order, false)}>Отклонить</button>
      <button className="negotiation-primary" disabled={Boolean(loading)} onClick={() => onCounter(order, true)}>Согласиться</button>
    </div>
  </section>;
  return <section className="negotiation-panel" aria-label="Ваша цена поездки">
    {mine ? <p role="status">Ваша цена — <Money value={offer.price} />. Ждём ответа пассажира.</p>
      : queued ? <p role="status">Предложение отправлено. Ждём выбора пассажира.</p>
        : <p>Можете предложить свою цену за поездку.</p>}
    {editing ? <PriceOfferForm price={order.price ?? order.estimatedPrice} busy={Boolean(loading)}
      onCancel={() => setEditing(false)} onSubmit={async price => {
        const result = await onOffer(order, price);
        if (result) { setQueued(Boolean(result.queued)); setEditing(false); }
      }} />
      : <button disabled={Boolean(loading)} onClick={() => setEditing(true)}>{mine || queued ? 'Изменить цену' : 'Предложить цену'}</button>}
  </section>;
}
