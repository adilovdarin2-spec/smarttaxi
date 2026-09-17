import { AppError } from '../../common/errors.js';

// Compare the terms the person actually saw, not a price fetched by the client
// after the tap. Call only after ownership checks and while the order/queue row
// is locked. Identical terms may remain valid; changed price/person/side may not.
export function assertPriceOfferConsent(actual, expected) {
  if (!expected || typeof expected.driverId !== 'string' || !expected.driverId ||
      !Number.isInteger(expected.priceKzt) || expected.priceKzt <= 0 ||
      !['DRIVER', 'CLIENT'].includes(expected.proposedBy)) {
    throw new AppError('Refresh the application and confirm the displayed offer', 409, 'PRICE_OFFER_CONFIRMATION_REQUIRED');
  }
  if (actual.driverId !== expected.driverId || Number(actual.priceKzt) !== expected.priceKzt ||
      actual.proposedBy !== expected.proposedBy) {
    throw new AppError('Price offer changed; review the current offer', 409, 'PRICE_OFFER_CHANGED');
  }
}

export function assertOrderPriceOfferConsent(order, expected) {
  assertPriceOfferConsent({ driverId: order.driver_offer_by_driver_id,
    priceKzt: order.driver_offer_price_kzt, proposedBy: order.driver_offer_proposed_by }, expected);
}
