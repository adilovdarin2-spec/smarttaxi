// Dev-server-only UI fixture. Not imported into the production app/build.
// Real road geometry/steps, explicit simulated sensor input, no account/API writes.
import React, { useCallback, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import DriverNavigator from '../src/features/driver/DriverNavigator.jsx';
import MapView from '../src/features/map/MapView.jsx';
import '../src/styles.css';
import '../src/presentation.css';

function Preview() {
  const [route, setRoute] = useState(null);
  const [now, setNow] = useState(Date.now);
  const [closed, setClosed] = useState(false);
  const close = useCallback(() => setClosed(true), []);
  const [state, setState] = useState(new URLSearchParams(location.search).get('state') || 'live');
  useEffect(() => {
    fetch('https://router.project-osrm.org/route/v1/driving/68.509497,40.844343;68.5105,40.8505?overview=full&geometries=geojson&steps=true&alternatives=true&radiuses=60;250&bearings=3,45;')
      .then(r => r.json()).then(data => {
        if (data.code !== 'Ok') throw Error('Real QA route unavailable');
        const r = data.routes.sort((a,b) => a.duration-b.duration || a.distance-b.distance)[0];
        setRoute({ phase: 'to_pickup', providerStatus: 'Ok', distanceMeters: r.distance, durationSeconds: r.duration, geometry: r.geometry,
          steps: r.legs[0].steps.map(s => ({ type: s.maneuver.type, modifier: s.maneuver.modifier, exit: s.maneuver.exit, streetName: s.name, distanceMeters: s.distance, lng: s.maneuver.location[0], lat: s.maneuver.location[1] })) });
      }).catch(e => setState('route-error'));
    const timer = setInterval(() => setNow(Date.now()), 2000);
    return () => clearInterval(timer);
  }, []);
  const position = { lat: state === 'off-route' ? 40.84 : 40.844343, lng: 68.509497, timestamp: state === 'stale' ? now - 20000 : now, heading: 3, speed: 9, accuracy: 8 };
  return <><div style={{textAlign:'center',fontSize:11,height:24,lineHeight:'24px'}}>QA · тестовый GPS · реальная геометрия OSRM</div>
    <main className="phone-frame driver-navigation-phone" style={{height:'calc(100svh - 24px)'}}>
      {closed ? <button onClick={() => setClosed(false)}>Открыть навигатор</button> : <DriverNavigator
        order={{ id: 'qa-only', status: 'DRIVER_GOING_TO_CLIENT', pickup: 'улица Аль-Фараби, 29 · центральный вход со стороны улицы', pickupPoint: {lat:40.8505,lng:68.5105}, dropoff:'Базар Атакент' }}
        route={state === 'fallback' ? {...route,fallback:true} : state === 'route-error' ? null : route}
        routeUnavailable={state === 'route-error'}
        position={position} error={state === 'action-error' ? 'Не удалось сохранить статус. Попробуйте ещё раз.' : ''}
        onRetryGPS={() => setState('live')} onClose={close} onNext={close}
        nextAction={{label:'Я приехал'}} MapComponent={MapView} />}
    </main></>;
}
const root = createRoot(document.getElementById('root'));
root.render(<Preview/>);
if (import.meta.hot) import.meta.hot.dispose(() => root.unmount());
