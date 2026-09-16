import assert from 'node:assert/strict';
import test from 'node:test';
import { priceOfferBounds, pendingPriceOffer, validOfferPrice, priceOfferSnapshot, queuedOfferSnapshot, priceOfferErrorMessage } from '../src/features/shared/priceNegotiation.js';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';

test('negotiation amount bounds match the API, without accepting fractions or exponent strings', async () => {
  process.env.DATABASE_URL ||= 'postgresql://unused:unused@localhost:1/unused';
  process.env.JWT_SECRET ||= 'test_only_price_negotiation_secret_1234567890';
  const { offeredPriceBounds } = await import('../../api/src/modules/orders/order-pricing.service.js');
  for (const price of [0, 200, 399, 700, 1001, 25000, 999999, 1000000]) {
    const expected = offeredPriceBounds(price);
    const bounds = priceOfferBounds(price);
    assert.deepEqual(bounds, { min: expected.minAllowed, max: expected.maxAllowed });
    for (const input of [bounds.min, bounds.max, String(bounds.min)]) assert(validOfferPrice(input, bounds));
    for (const input of ['', ' ', '1e3', '700.5', '700,5', Infinity, bounds.min - 1, bounds.max + 1]) assert(!validOfferPrice(input, bounds));
  }
});

test('pending offers distinguish counterpart, owner and invalid payloads', () => {
  const order = { driver_offer_status: 'PENDING', driver_offer_by_driver_id: 'driver-a', driver_offer_price_kzt: 900, driver_offer_proposed_by: 'CLIENT' };
  assert.equal(pendingPriceOffer(order, 'driver-a').mine, true);
  assert.equal(pendingPriceOffer(order, 'driver-b').mine, false);
  assert.equal(pendingPriceOffer(order).author, 'CLIENT');
  assert.equal(pendingPriceOffer({ ...order, driver_offer_status: 'DECLINED' }), null);
  assert.equal(pendingPriceOffer({ ...order, driver_offer_price_kzt: null }), null);
  assert.equal(pendingPriceOffer({ ...order, driver_offer_by_driver_id: '' }), null);
});

test('consent snapshots preserve displayed terms independently of later updates', () => {
  const order = { driver_offer_status: 'PENDING', driver_offer_by_driver_id: 'a', driver_offer_price_kzt: 800, driver_offer_proposed_by: 'DRIVER' };
  const expected = priceOfferSnapshot(order);
  order.driver_offer_price_kzt = 900;
  order.driver_offer_proposed_by = 'CLIENT';
  assert.deepEqual(expected, { driverId: 'a', priceKzt: 800, proposedBy: 'DRIVER' });
  assert.deepEqual(priceOfferSnapshot(order), { driverId: 'a', priceKzt: 900, proposedBy: 'CLIENT' });
  assert.deepEqual(queuedOfferSnapshot({ driverId: 'b', priceKzt: '750' }), { driverId: 'b', priceKzt: 750, proposedBy: 'DRIVER' });
  assert.equal(priceOfferSnapshot({}), null);
  for (const code of ['PRICE_OFFER_CHANGED', 'PRICE_OFFER_CONFIRMATION_REQUIRED']) assert.match(priceOfferErrorMessage({ code }), /подтвердите/);
});

test('rider cannot accept their own counter; only its named driver can answer', async () => {
  const previousWindow = globalThis.window;
  const previousStorage = globalThis.localStorage;
  globalThis.localStorage = { getItem: () => null };
  globalThis.window = { location: { hostname: '127.0.0.1' } };
  const server = await createServer({ root: fileURLToPath(new URL('..', import.meta.url)), server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', optimizeDeps: { noDiscovery: true } });
  try {
    const { default: Rider } = await server.ssrLoadModule('/src/features/client/PriceOfferCard.jsx');
    const { IncomingOrderCard } = await server.ssrLoadModule('/src/features/driver/DriverApp.jsx');
    const order = { id: 'order', price: 700, estimatedPrice: 700, driver_offer_status: 'PENDING', driver_offer_by_driver_id: 'a', driver_offer_price_kzt: 800, driver_offer_proposed_by: 'CLIENT' };
    const rider = renderToStaticMarkup(h(Rider, { order }));
    assert.match(rider, /Вы предложили/);
    assert.doesNotMatch(rider, /Согласиться|Отказаться|Водитель предлагает/);
    const props = { order, driverId: 'a', onOffer: () => {}, onCounter: () => {} };
    const driver = renderToStaticMarkup(h(IncomingOrderCard, props));
    assert.match(driver, /Пассажир предлагает/);
    assert.match(driver, /Согласиться/);
    assert.doesNotMatch(driver, /Пропустить|>Принять</);
    const foreign = renderToStaticMarkup(h(IncomingOrderCard, { ...props, driverId: 'b' }));
    assert.doesNotMatch(foreign, /Пассажир предлагает|Согласиться/);
    assert.match(foreign, /Предложить цену/);
    const waiting = renderToStaticMarkup(h(IncomingOrderCard, { ...props, order: { ...order, driver_offer_proposed_by: 'DRIVER' } }));
    assert.match(waiting, /Ждём ответа пассажира/);
    assert.match(waiting, /Принять за/);
  } finally {
    await server.close();
    if (previousWindow === undefined) delete globalThis.window; else globalThis.window = previousWindow;
    if (previousStorage === undefined) delete globalThis.localStorage; else globalThis.localStorage = previousStorage;
  }
});
