export function priceOfferBounds(price) {
  const base = Math.max(0, Math.round(Number(price) || 0));
  const min = Math.max(200, Math.ceil(base * 0.7 / 50) * 50);
  return { min, max: Math.max(min, Math.min(1_000_000, Math.floor(base * 1.5 / 50) * 50)) };
}

export function validOfferPrice(value, bounds) {
  if (!/^\d+$/.test(String(value).trim())) return false;
  const price = Number(value);
  return Number.isSafeInteger(price) && price >= bounds.min && price <= bounds.max;
}

export function pendingPriceOffer(order, driverId = null) {
  const price = Number(order?.driver_offer_price_kzt ?? order?.driverOfferPriceKzt);
  const status = order?.driver_offer_status ?? order?.driverOfferStatus;
  const owner = order?.driver_offer_by_driver_id ?? order?.driverOfferByDriverId;
  const author = order?.driver_offer_proposed_by ?? order?.driverOfferProposedBy;
  if (status !== 'PENDING' || !owner || !Number.isFinite(price) || price <= 0) return null;
  return { price, driverId: owner, author: author || 'DRIVER', mine: Boolean(driverId && owner === driverId) };
}

export function priceOfferSnapshot(order) {
  const offer = pendingPriceOffer(order);
  return offer ? { driverId: offer.driverId, priceKzt: offer.price, proposedBy: offer.author } : null;
}

export function queuedOfferSnapshot(offer) {
  return { driverId: offer.driverId, priceKzt: Number(offer.priceKzt), proposedBy: 'DRIVER' };
}

export function priceOfferErrorMessage(error) {
  const messages = {
    PRICE_OFFER_CHANGED: 'Предложение изменилось. Проверьте новую цену и подтвердите её отдельно.',
    PRICE_OFFER_CONFIRMATION_REQUIRED: 'Обновите приложение и подтвердите показанную цену заново.',
    NO_PENDING_PRICE_OFFER: 'Предложение уже изменилось. Обновите данные заказа.',
    NO_PENDING_CLIENT_COUNTER_OFFER: 'Встречное предложение уже изменилось. Обновите данные заказа.',
    OFFERED_PRICE_OUT_OF_BOUNDS: 'Цена вне допустимого диапазона. Проверьте сумму.',
    QUEUED_PRICE_OFFER_NOT_FOUND: 'Предложение больше недоступно. Обновите данные заказа.',
  };
  return Object.hasOwn(messages, error?.code) ? messages[error.code] : null;
}
