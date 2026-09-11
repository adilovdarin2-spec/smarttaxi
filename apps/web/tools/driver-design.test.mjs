import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';

test('driver surfaces keep addresses, action hierarchy and payment gates', async () => {
  // The API module reads the host at import time; these pure surfaces never
  // log in or issue requests. Keep that browser input explicit in this test.
  const previousWindow = globalThis.window;
  globalThis.window = { location: { hostname: '127.0.0.1' } };
  const server = await createServer({ root: fileURLToPath(new URL('..', import.meta.url)), server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', optimizeDeps: { noDiscovery: true } });
  try {
    const { IncomingOrderCard, ActiveOrderPanel, DriverShiftPanel, DriverEmptyState, DriverErrorNotice, DriverLoadUnavailable } = await server.ssrLoadModule('/src/features/driver/DriverApp.jsx');
    const order = { id: 'design-fixture', status: 'SEARCHING_DRIVER', tariff: 'Economy',
      estimatedPrice: 700, paymentMethod: 'CASH', distanceKm: 3.5, durationMin: 12,
      pickup: 'улица Бектасова, 12, главный вход со стороны двора', dropoff: 'улица Кожанова, 34' };
    const incoming = renderToStaticMarkup(h(IncomingOrderCard, {order}));
    assert.match(incoming, /улица Бектасова, 12, главный вход со стороны двора/);
    assert.match(incoming, /class="app-button secondary [^"]*"[^>]*>Пропустить/);
    assert.match(incoming, /class="app-button primary [^"]*"[^>]*>Принять/);
    assert.match(incoming, /700/); assert.match(incoming, /₸/);
    const busy = renderToStaticMarkup(h(IncomingOrderCard, {order, loading: 'accept'}));
    assert.equal((busy.match(/disabled=""/g) || []).length, 2);
    const unknown = renderToStaticMarkup(h(IncomingOrderCard, {order:{...order,distanceKm:0,durationMin:0}}));
    assert.match(unknown,/Маршрут уточняется/); assert.doesNotMatch(unknown,/>ETA</);
    const active = changes => renderToStaticMarkup(h(ActiveOrderPanel, {order:{...order,...changes}}));
    assert.match(active({status:'DRIVER_GOING_TO_CLIENT'}), /Я приехал/);
    assert.doesNotMatch(active({status:'DRIVER_GOING_TO_CLIENT'}), /driver-core-call/);
    assert.match(active({status:'WAITING_CLIENT',rider_phone:'+77000000001'}), /tel:\+77000000001/);
    assert.match(active({status:'TRIP_COMPLETED'}), /Подтвердить оплату/);
    assert.doesNotMatch(active({status:'TRIP_COMPLETED',paymentMethod:'CARD'}), /Подтвердить оплату/);
    assert.doesNotMatch(active({status:'PAID'}), /Подтвердить оплату|Отменить/);
    const shift = renderToStaticMarkup(h(DriverShiftPanel, { title:'На линии', description:'Заказы появятся автоматически.', regions:[{id:'local',name:'Мырзакент'}],selectedRegionId:'local',earnings:{todayGrossKzt:9800,completedOrders:14},isWorking:true }));
    assert.match(shift, /aria-label="Рабочий регион"/);
    assert.match(shift, /class="app-button secondary [^"]*"[^>]*>Уйти с линии/);
    const empty = renderToStaticMarkup(h(DriverEmptyState, {
      title: 'No active trip',
      text: 'Accept an order to start.',
      action: 'See orders',
      onAction: () => {},
    }));
    assert.match(empty, /driver-core-empty-rich/);
    assert.match(empty, /No active trip/);
    assert.match(empty, /class="app-button secondary [^"]*"[^>]*>See orders/);
    const recovery = renderToStaticMarkup(h(DriverErrorNotice, {
      error: 'Не удалось подключиться. Проверьте интернет и попробуйте ещё раз.',
      onRetry: () => {},
    }));
    assert.match(recovery, /role="alert"/);
    assert.match(recovery, />Повторить</);
    assert.match(
      renderToStaticMarkup(h(DriverErrorNotice, {
        error: 'Не удалось подключиться.', loading: true, onRetry: () => {},
      })),
      /disabled=""[^>]*>Проверяем…</,
    );
    const unavailable = renderToStaticMarkup(h(DriverLoadUnavailable));
    assert.match(unavailable, /Не удалось загрузить смену/);
    assert.match(unavailable, /суммы и заказы не показываются/);
    assert.doesNotMatch(unavailable, /0(?:&nbsp;|\s)*₸|>0</);
  } finally {
    await server.close();
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
});
