import React, { useState } from 'react';
import { Icon } from '../../core/icons.jsx';
import { API_URL } from '../../lib/api.js';
import { tripIdentity } from './tripPresentation.mjs';

export default function TripDriverCard({ order, canContact = true }) {
  const driver = tripIdentity(order);
  const [failedAvatar, setFailedAvatar] = useState('');
  let avatar = '';
  try {
    const url = new URL(driver.avatar, API_URL);
    if (driver.avatar && ['http:', 'https:'].includes(url.protocol)) avatar = url.href;
  } catch { /* Missing/invalid photos use the neutral person icon. */ }
  return (
    <section className="driver-found-driver-card trip-driver-identity" aria-label="Водитель">
      <div className="trip-driver-person">
        <span className="trip-driver-avatar" aria-hidden="true">
          {avatar && failedAvatar !== avatar
            ? <img src={avatar} alt="" onError={() => setFailedAvatar(avatar)} />
            : <Icon name="user" size={27} />}
        </span>
        <div className="driver-found-driver-copy">
          <strong>{driver.name}</strong>
          {driver.rating && <span className="trip-driver-rating"><Icon name="star" size={14} />{driver.rating}</span>}
        </div>
        {canContact && driver.phone && <a className="driver-found-call-round" href={`tel:${driver.phone}`} aria-label="Позвонить водителю"><Icon name="phone" size={21} /></a>}
      </div>
      <div className="trip-driver-vehicle" aria-label="Ваш автомобиль">
        <span>{driver.vehicle}</span>
        {driver.plate ? <b>{driver.plate}</b> : <small>Номер уточняется</small>}
      </div>
    </section>
  );
}
