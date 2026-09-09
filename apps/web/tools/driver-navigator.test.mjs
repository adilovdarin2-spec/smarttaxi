import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';

test('production navigator renders real instructions and prioritizes GPS/route failures', async () => {
  const server = await createServer({ root: fileURLToPath(new URL('..', import.meta.url)), server: { middlewareMode: true }, appType: 'custom' });
  try {
    const { default: Navigator } = await server.ssrLoadModule('/src/features/driver/DriverNavigator.jsx');
    const r = { phase: 'to_pickup', distanceMeters: 200, durationSeconds: 120,
      geometry: { type:'LineString', coordinates:[[0,0],[.001,0],[.001,.001]] },
      steps: [{type:'depart',lat:0,lng:0,distanceMeters:100}, {type:'turn',modifier:'left',lat:0,lng:.001,distanceMeters:100,streetName:'Улица'}, {type:'arrive',lat:.001,lng:.001,distanceMeters:0}]
    };
    const props = { order: {status:'DRIVER_GOING_TO_CLIENT',pickup:'улица Мира, 29'}, route:r,
      position: {lat:0,lng:.0005,timestamp:Date.now(),accuracy:8,speed:10,heading:90},
      nextAction: {label:'Я приехал'}, onClose(){}, onNext(){}, onRetryGPS(){},
      MapComponent: props => h('div', {'data-road-route':Boolean(props.route), 'data-driver':Boolean(props.driver)})
    };
    const render = changes => renderToStaticMarkup(h(Navigator,{...props,...changes}));
    const active = render({});
    assert.match(active,/Поверните налево/); assert.match(active,/50 м/); assert.match(active,/36/);
    assert.match(active,/улица Мира, 29/); assert.match(active,/Я приехал/);
    const stale = render({position:{...props.position,timestamp:Date.now()-20000}});
    assert.match(stale,/Нет свежего GPS/); assert.doesNotMatch(stale,/driver-navigator-maneuver/);
    assert.match(stale,/data-driver="false"/); assert.doesNotMatch(stale,/>36</);
    const lost = render({locationIssue:{title:'GPS отключён',description:'Повторите GPS'}});
    assert.match(lost,/GPS отключён/); assert.doesNotMatch(lost,/Поверните налево/);
    const fallback = render({route:{...r,fallback:true}});
    assert.match(fallback,/Маршрут недоступен/); assert.match(fallback,/data-road-route="false"/);
    assert.doesNotMatch(fallback,/driver-navigator-maneuver/);
    const routeError = render({route:null,routeUnavailable:true});
    assert.match(routeError,/Маршрут недоступен/); assert.match(routeError,/повторяем запрос автоматически/);
    assert.doesNotMatch(routeError,/Строим маршрут/);
    const refreshError = render({routeUnavailable:true});
    assert.match(refreshError,/Показан последний полученный путь/); assert.match(refreshError,/Поверните налево/);
    const offRoute = render({position:{...props.position,lat:1,lng:1}});
    assert.match(offRoute,/Перестраиваем маршрут/); assert.doesNotMatch(offRoute,/Поверните налево/);
    const saving = render({loading:'next',error:'Ошибка сохранения'});
    assert.match(saving,/Сохраняем…/); assert.match(saving,/role="alert"/); assert.match(saving,/disabled/);
  } finally { await server.close(); }
});
