import React, { useId, useRef, useState } from 'react';
import { priceOfferBounds, validOfferPrice } from './priceNegotiation.js';
import './priceNegotiation.css';

export default function PriceOfferForm({ price, busy, onSubmit, onCancel }) {
  const bounds = priceOfferBounds(price);
  const [value, setValue] = useState(String(Math.max(bounds.min, Math.min(bounds.max, Math.round(Number(price) || 0)))));
  const [invalid, setInvalid] = useState(false);
  const submitting = useRef(false);
  const id = useId();
  async function submit(event) {
    event.preventDefault();
    if (busy || submitting.current) return;
    if (!validOfferPrice(value, bounds)) { setInvalid(true); return; }
    submitting.current = true;
    try { await onSubmit(Number(value)); }
    finally { submitting.current = false; }
  }
  return <form className="negotiation-form" onSubmit={submit}>
    <label htmlFor={id}>Ваша цена, ₸</label>
    <input id={id} type="text" inputMode="numeric" autoComplete="off" value={value}
      aria-describedby={`${id}-hint`} aria-invalid={invalid} disabled={busy}
      onChange={event => { setValue(event.target.value); setInvalid(false); }} />
    <small id={`${id}-hint`}>От {bounds.min.toLocaleString('ru-RU')} до {bounds.max.toLocaleString('ru-RU')} ₸</small>
    {invalid && <p role="alert">Введите целую сумму в указанном диапазоне.</p>}
    <div className="negotiation-actions">
      <button type="button" onClick={onCancel} disabled={busy}>Отмена</button>
      <button type="submit" className="negotiation-primary" disabled={busy}>{busy ? 'Отправляем…' : 'Предложить'}</button>
    </div>
  </form>;
}
